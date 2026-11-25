// 割引・紹介割（reception-002）：主催者が A2 で紹介割 1,000円（紹介者の名前を聞く）を登録 → 参加者が紹介割と紹介者の名前で
// チェックイン → 参加費 5,000円の交流会の合計が 4,000円 → 主催者が内訳と CSV で紹介者を見る。受付係の直す枠と一覧には紹介者が出ない。
// 両方の幅で axe にかける。DB は消さない（名前と LINE のユーザー ID に幅と時刻を入れて、前の回と見分ける）。
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/**
 * この回だけの LINE のユーザー ID（U と16進の32文字）。
 * @param tag 幅などの見分け（16進の文字）
 * @returns LINE のユーザー ID
 */
function uniqueLineUserId(tag: string): string {
  return `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
}

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
 * 試験用のログインでセッションを作る。
 * @param request 要求の道具
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
    headers: ORIGIN,
  });
  expect(response.status()).toBe(200);
}

/**
 * 合計のタブの支払い方法の行。
 * @param page Playwright の画面
 * @param label 支払い方法の言葉か「合計」
 * @returns 行
 */
function totalsRow(page: Page, label: string): Locator {
  return page
    .getByRole("table", { name: "支払い方法ごとの合計" })
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
}

test("主催者が紹介割を登録し、参加者が選んで紹介者の名前を入れると合計が 4,000円になり、主催者だけが紹介者を読める", async ({
  page,
  browser,
}, testInfo) => {
  const violations = await collectCspViolations(page);
  const mobile = testInfo.project.name === "mobile";
  const name = `E2E の割引（${testInfo.project.name}）${Date.now()}`;
  const referrer = `E2E の紹介者（${testInfo.project.name}）`;

  // 主催者：交流会を作り、A2 で紹介割を足す
  await login(page.request, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
  const created = await page.request.post("/api/v1/events", {
    data: { name, venue: "E2E の会場", startsAt: `${tomorrow}T19:00:00+09:00`, fee: 5000 },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const eventId = ((await created.json()) as { id: string }).id;

  await page.goto(`/admin/events/${eventId}/edit`);
  await expect(page.getByRole("heading", { level: 1, name: "交流会を直す" })).toBeVisible();
  await page.getByRole("button", { name: "割引を足す" }).click();
  await page.getByRole("textbox", { name: /割引の名前/ }).fill("紹介割");
  await page.getByRole("textbox", { name: /割引の額/ }).fill("1000");
  await page.getByRole("checkbox", { name: "紹介者の名前を聞く" }).check();
  await expectNoA11yViolations(page, "交流会を直す（割引）");
  await expectNoHorizontalScroll(page, "交流会を直す（割引）");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("交流会を直しました。")).toBeVisible();

  // 参加者：紹介割を選び、紹介者の名前を入れてチェックインする
  const participantContext = await browser.newContext({
    baseURL: E2E_WEB_URL,
    viewport: page.viewportSize(),
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const participant = await participantContext.newPage();
  const person = `E2E の佐藤（${testInfo.project.name}）`;
  await login(participant.request, uniqueLineUserId(mobile ? "d2" : "d1"), person);
  await participant.goto(`/e/${eventId}/checkin`);
  await expect(participant.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(participant.getByRole("radio", { name: "割引なし" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(participant.getByRole("textbox", { name: /紹介してくれた人の名前/ })).toHaveCount(0);
  await participant.getByRole("radio", { name: "connpass", exact: true }).click();
  await participant.getByRole("radio", { name: "知人の紹介" }).click();
  await participant.getByRole("radio", { name: "PayPay" }).click();
  await participant.getByRole("radio", { name: "紹介割（−1,000円）" }).click();
  await participant.getByRole("textbox", { name: /紹介してくれた人の名前/ }).fill(referrer);
  await expectNoA11yViolations(participant, "チェックインの画面（割引）");
  await expectNoHorizontalScroll(participant, "チェックインの画面（割引）");
  await participant.getByRole("button", { name: "チェックインする" }).click();
  await expect(
    participant.getByRole("heading", { level: 2, name: "チェックインしました" }),
  ).toBeVisible();
  await participantContext.close();

  // 主催者：合計が 4,000円・内訳に紹介割と紹介者
  await page.goto(`/admin/events/${eventId}`);
  await expect(
    page.locator("tr:visible, li:visible").filter({ hasText: "PayPay・紹介割" }),
  ).toHaveCount(1);
  await page.getByRole("tab", { name: "合計" }).click();
  await expect(totalsRow(page, "PayPay")).toContainText("4,000円");
  await expect(totalsRow(page, "合計")).toContainText("4,000円");
  const discounts = page.getByRole("table", { name: "割引の内訳" });
  await expect(discounts.getByRole("row").filter({ hasText: "紹介割" })).toContainText("1人");
  await expect(discounts.getByRole("row").filter({ hasText: "紹介割" })).toContainText("1,000円");
  await expect(page.getByRole("table", { name: /紹介者/ })).toContainText(referrer);
  await expectNoA11yViolations(page, "一覧画面（割引の内訳）");
  await expectNoHorizontalScroll(page, "一覧画面（割引の内訳）");

  // 主催者：CSV に割引と紹介者
  await page.goto(`/admin/events/${eventId}/data`);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "参加者をCSVで書き出す" }).click();
  const bytes = await readFile(await (await downloading).path());
  const lines = bytes.subarray(3).toString("utf8").split("\r\n");
  expect(lines[0]).toContain(",金額,割引,割引の額,紹介者,");
  expect(lines[1]).toContain(`,PayPay,4000,紹介割,1000,${referrer},LINE,`);

  // 受付係：一覧にも直す枠にも紹介者は出ない
  const invite = await page.request.post(`/api/v1/events/${eventId}/staff-invite`, {
    headers: ORIGIN,
  });
  const { token } = (await invite.json()) as { token: string };
  const staffContext = await browser.newContext({
    baseURL: E2E_WEB_URL,
    viewport: page.viewportSize(),
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const staff = await staffContext.newPage();
  await login(staff.request, uniqueLineUserId(mobile ? "e2" : "e1"), "E2E の受付係");
  expect(
    (
      await staff.request.post(`/api/v1/staff-invites/${token}/accept`, { headers: ORIGIN })
    ).status(),
  ).toBe(200);
  await staff.goto(`/admin/events/${eventId}`);
  const row = staff.locator("tr:visible, li:visible").filter({ hasText: person });
  await expect(row).toHaveCount(1);
  await expect(staff.getByText(referrer)).toHaveCount(0);
  await row.getByRole("button").click();
  const dialog = staff.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "紹介割（−1,000円）" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(dialog.getByRole("textbox", { name: /紹介してくれた人の名前/ })).toHaveValue("");
  await expectNoA11yViolations(staff, "直す枠（受付係・割引）");
  await staffContext.close();
  expect(await violations()).toEqual([]);
});
