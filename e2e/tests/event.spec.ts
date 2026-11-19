// 交流会（event-001）：主催者が交流会を作り、準備の画面で受付QR・アンケートQRを出し、アンケートを開く。
// 受付係は招待のリンクから受け、交流会の一覧でその交流会を見るが、準備の画面は使えない。両方の幅で axe にかける。
// ログインは account の試験用のログイン（主催者は e2e/env.ts の E2E_ORGANIZER_LINE_USER_ID）。
// DB は消さない（名前に幅と時刻を入れて、前の回の交流会と見分ける）。
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/**
 * ページが横に動かない（横のスクロールが出ない）ことを確かめる。
 * @param page Playwright の画面
 * @param label 失敗したときに出す、画面の名前
 */
async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} が横に動きます`).toBeLessThanOrEqual(0);
}

/**
 * 試験用のログインでセッションを作る（画面と同じクッキーの入れ物）。
 * @param request 画面の要求の道具（page.request か、新しい要求の入れ物）
 * @param lineUserId LINE のユーザー ID
 * @param displayName 表示名
 */
async function login(
  request: APIRequestContext,
  lineUserId: string,
  displayName: string,
): Promise<void> {
  const response = await request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName },
    headers: { origin: E2E_WEB_URL },
  });
  expect(response.status()).toBe(200);
}

/**
 * 明日の日本時間の日付（YYYY-MM-DD）。招待のリンクの期限が切れない日。
 * @returns 日付
 */
function tomorrowInJst(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
}

test("主催者が交流会を作り、受付QR・アンケートQRを出して、アンケートを開く", async ({
  page,
}, testInfo) => {
  const violations = await collectCspViolations(page);
  const name = `E2E の交流会（${testInfo.project.name}）${Date.now()}`;
  await login(page.request, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");

  await page.goto("/admin/events");
  await expect(page.getByRole("heading", { level: 1, name: "交流会の一覧" })).toBeVisible();
  await expectNoA11yViolations(page, "交流会の一覧");

  await page.getByRole("link", { name: "交流会を追加" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "交流会を追加" })).toBeVisible();
  // 誤りは欄のそばに出る
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByText("交流会の名前を入れてください。")).toBeVisible();
  await expectNoA11yViolations(page, "交流会を追加（誤り）");

  await page.getByRole("textbox", { name: /交流会の名前/ }).fill(name);
  await page.getByLabel(/日付/).fill(tomorrowInJst());
  await page.getByLabel(/時刻/).fill("19:00");
  await page.getByRole("textbox", { name: /会場/ }).fill("E2E の会場");
  await page.getByRole("textbox", { name: /参加費/ }).fill("1000");
  await page.getByRole("button", { name: "作る" }).click();

  // 準備の画面：受付QRとアンケートQRが、どちらかをことばで書いて並ぶ
  await expect(page.getByRole("heading", { level: 1, name: "準備" })).toBeVisible();
  await expect(page.getByText("交流会を作りました。")).toBeVisible();
  const eventId = /\/admin\/events\/([^/]+)\/setup$/.exec(new URL(page.url()).pathname)?.[1] ?? "";
  expect(eventId).not.toBe("");
  const checkinQr = page.getByRole("img", { name: `受付QR：${name}` });
  const surveyQr = page.getByRole("img", { name: `アンケートQR：${name}` });
  await expect(checkinQr).toBeVisible();
  await expect(surveyQr).toBeVisible();
  // LIFF ID のない E2E は、画面の源＋参加者の道（本番はミニアプリの URL。links.test.ts）
  expect(await checkinQr.getAttribute("data-qr-value")).toBe(`${E2E_WEB_URL}/e/${eventId}/checkin`);
  expect(await surveyQr.getAttribute("data-qr-value")).toBe(`${E2E_WEB_URL}/e/${eventId}/survey`);
  expect((await checkinQr.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(240);
  await expectNoA11yViolations(page, "準備");
  await expectNoHorizontalScroll(page, "準備");

  // アンケートを開く → 要約が開いているになる
  await expect(page.getByText("アンケートは閉じています")).toBeVisible();
  await page.getByRole("button", { name: "アンケートを開く" }).click();
  await expect(page.getByText("アンケートは開いています")).toBeVisible();
  await expect(page.getByRole("button", { name: "アンケートを閉じる" })).toBeVisible();
  const summary = await page.request.get(`/api/v1/events/${eventId}/summary`);
  expect(await summary.json()).toMatchObject({ name, surveyOpen: true, fee: 1000 });

  // 印刷の画面：1つの QR を大きく
  await page.getByRole("link", { name: "受付QRを印刷する" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "受付QR" })).toBeVisible();
  await expect(page.getByRole("img", { name: `受付QR：${name}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "印刷する" })).toBeVisible();
  await expectNoA11yViolations(page, "受付QRの印刷");
  await expectNoHorizontalScroll(page, "受付QRの印刷");

  // 一覧に、名前・日時・会場・参加費が出る
  await page.goto("/admin/events");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
  await expect(row).toContainText("E2E の会場");
  await expect(row).toContainText("1,000円");
  await expect(row).toContainText("19:00");
  expect(await violations()).toEqual([]);
});

test("受付係が招待のリンクから受け、一覧で交流会を見る。準備の画面は使えない", async ({
  page,
  playwright,
}, testInfo) => {
  const name = `E2E の受付の交流会（${testInfo.project.name}）${Date.now()}`;
  // 主催者は別のクッキーの入れ物で、交流会と招待のリンクを作る
  const organizer = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
  await login(organizer, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  const created = await organizer.post("/api/v1/events", {
    data: {
      name,
      startsAt: `${tomorrowInJst()}T19:00:00+09:00`,
      venue: "E2E の会場",
      fee: 500,
    },
    headers: { origin: E2E_WEB_URL },
  });
  expect(created.status()).toBe(201);
  const { id: eventId } = (await created.json()) as { id: string };
  const invite = await organizer.post(`/api/v1/events/${eventId}/staff-invite`, {
    headers: { origin: E2E_WEB_URL },
  });
  const { token } = (await invite.json()) as { token: string };

  // 受付係（幅ごとに別の利用者）
  const staffId = `U${(testInfo.project.name === "mobile" ? "5aa2" : "5aa1").padStart(32, "0")}`;
  await login(page.request, staffId, `E2E の受付係（${testInfo.project.name}）`);

  // 使えないリンク
  await page.goto(`/invite/${"a".repeat(43)}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "この招待のリンクは使えません" }),
  ).toBeVisible();
  await expectNoA11yViolations(page, "使えない招待のリンク");

  await page.goto(`/invite/${token}`);
  await expect(page.getByRole("heading", { level: 1, name: "受付係の招待" })).toBeVisible();
  await expect(page.getByText(name)).toBeVisible();
  await expectNoA11yViolations(page, "受付係の招待");
  await page.getByRole("button", { name: "受ける" }).click();

  // 一覧画面（reception）がまだないので、交流会の一覧へ移る。その交流会が出て、主催者だけの操作は出ない
  await expect(page.getByRole("heading", { level: 1, name: "交流会の一覧" })).toBeVisible();
  await expect(page.getByText("受付係になりました。")).toBeVisible();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: /準備/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "交流会を追加" })).toHaveCount(0);
  await expectNoA11yViolations(page, "交流会の一覧（受付係）");

  // 準備の画面を開いても使えない
  await page.goto(`/admin/events/${eventId}/setup`);
  await expect(
    page.getByRole("heading", { level: 1, name: "この画面は主催者だけが使えます" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /受付QR/ })).toHaveCount(0);
  await expectNoA11yViolations(page, "準備（受付係）");

  // 主催者が外すと、次に開いたときから交流会を読めない
  const removed = await organizer.delete(`/api/v1/events/${eventId}/staff/${await myId(page)}`, {
    headers: { origin: E2E_WEB_URL },
  });
  expect(removed.status()).toBe(204);
  await page.goto(`/admin/events/${eventId}/setup`);
  await expect(
    page.getByRole("heading", { level: 1, name: "この交流会の一覧画面は使えません" }),
  ).toBeVisible();

  // 外すと招待のリンクも作り直されるので、外された人は前のリンクで受け直せない（SC-004・research R3）
  await page.goto(`/invite/${token}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "この招待のリンクは使えません" }),
  ).toBeVisible();
  const again = await page.request.post(`/api/v1/staff-invites/${token}/accept`, {
    headers: { origin: E2E_WEB_URL },
  });
  expect(again.status()).toBe(404);
  await page.goto(`/admin/events/${eventId}/setup`);
  await expect(
    page.getByRole("heading", { level: 1, name: "この交流会の一覧画面は使えません" }),
  ).toBeVisible();
  await organizer.dispose();
});

/**
 * 今の利用者の account の ID。
 * @param page Playwright の画面（ログイン済み）
 * @returns account の ID
 */
async function myId(page: Page): Promise<string> {
  const me = await page.request.get("/api/v1/accounts/me");
  return ((await me.json()) as { id: string }).id;
}
