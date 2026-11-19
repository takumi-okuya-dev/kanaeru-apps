// 受付（reception-001）：参加者が試験用のログインでチェックインの画面を開き、選ぶだけでチェックインする。
// 受付係が一覧画面で手でチェックインし、支払い方法を直すと合計が変わる。主催者は参加者の CSV を書き出す。両方の幅で axe にかける。
// ログインは account の試験用のログイン（主催者は e2e/env.ts の E2E_ORGANIZER_LINE_USER_ID）。
// DB は消さない（名前と LINE のユーザー ID に幅と時刻を入れて、前の回と見分ける）。
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
 * 試験用のログインでセッションを作る（画面と同じクッキーの入れ物）。
 * @param request 要求の道具（page.request か、新しい要求の入れ物）
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
 * 主催者として交流会を作る（明日の 19:00）。
 * @param organizer 主催者の要求の入れ物
 * @param input 名前・参加費・LINE グループの招待リンク
 * @returns 交流会の ID
 */
async function createEvent(
  organizer: APIRequestContext,
  input: { name: string; fee: number; lineGroupUrl?: string },
): Promise<string> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
  const created = await organizer.post("/api/v1/events", {
    data: { venue: "E2E の会場", startsAt: `${tomorrow}T19:00:00+09:00`, ...input },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

/**
 * 今の幅で見えている、名前と印を含む参加者の行（広い画面は表の行、狭い画面はカード）。
 * @param page Playwright の画面
 * @param text 行に含む文字
 * @returns 行
 */
function participantRow(page: Page, text: string): Locator {
  return page.locator("tr:visible, li:visible").filter({ hasText: text });
}

/**
 * 合計のタブの支払い方法の行（人数と金額）。
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

test("参加者が受付QRの画面からチェックインし、済んだ状態・チェックイン済み・アンケートの案内が出る", async ({
  page,
  playwright,
}, testInfo) => {
  const violations = await collectCspViolations(page);
  const name = `E2E の受付（${testInfo.project.name}）${Date.now()}`;
  const organizer = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
  await login(organizer, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  const eventId = await createEvent(organizer, {
    name,
    fee: 1000,
    lineGroupUrl: "https://line.me/R/ti/g/e2e",
  });

  const displayName = `E2E の参加者（${testInfo.project.name}）`;
  await login(
    page.request,
    uniqueLineUserId(testInfo.project.name === "mobile" ? "b2" : "b1"),
    displayName,
  );
  await page.goto(`/e/${eventId}/checkin`);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "名前" })).toHaveValue(displayName);
  await expect(page.getByText("1,000円")).toBeVisible();
  await expectNoA11yViolations(page, "チェックインの画面");
  await expectNoHorizontalScroll(page, "チェックインの画面");

  // 選ばずに押すと、設問のそばに誤りが出る
  await page.getByRole("button", { name: "チェックインする" }).click();
  await expect(page.getByText("申し込みの媒体を選んでください。")).toBeVisible();
  await expect(page.getByText("支払い方法を選んでください。")).toBeVisible();
  await expect(page.getByRole("radio", { name: "connpass", exact: true })).toBeFocused();
  await expectNoA11yViolations(page, "チェックインの画面（誤り）");

  // 選ぶだけでチェックインする
  await page.getByRole("radio", { name: "connpass", exact: true }).click();
  await page.getByRole("radio", { name: "知人の紹介" }).click();
  await page.getByRole("radio", { name: "PayPay" }).click();
  await expect(page.getByRole("radio", { name: "PayPay" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "チェックインする" }).click();
  const done = page.getByRole("heading", { level: 2, name: "チェックインしました" });
  await expect(done).toBeVisible();
  await expect(done).toBeFocused();
  await expect(page.getByText("受付で紙の名札に名前を書いて、お入りください。")).toBeVisible();
  await expect(page.getByRole("link", { name: "アンケートに答える" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "交流会のLINEグループに参加する" })).toHaveCount(0);
  await expectNoA11yViolations(page, "チェックインの画面（済んだ）");
  await expectNoHorizontalScroll(page, "チェックインの画面（済んだ）");

  // 読み直すと「チェックイン済み」。記録は増えない
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "チェックイン済み" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "名前" })).toHaveCount(0);

  // アンケートが開くと「アンケートに答える」と LINE グループが出る
  const opened = await organizer.put(`/api/v1/events/${eventId}/survey`, {
    data: { open: true },
    headers: ORIGIN,
  });
  expect(opened.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("link", { name: "アンケートに答える" })).toHaveAttribute(
    "href",
    `/e/${eventId}/survey`,
  );
  await expect(page.getByRole("link", { name: "交流会のLINEグループに参加する" })).toHaveAttribute(
    "href",
    "https://line.me/R/ti/g/e2e",
  );
  await expectNoA11yViolations(page, "チェックインの画面（アンケートが開いた）");

  const list = await organizer.get(`/api/v1/events/${eventId}/checkins`);
  const { checkins } = (await list.json()) as { checkins: { name: string; method: string }[] };
  expect(checkins).toEqual([expect.objectContaining({ name: displayName, method: "line" })]);
  expect(await violations()).toEqual([]);
  await organizer.dispose();
});

test("受付係が手でチェックインし、支払い方法を直すと合計が変わる。主催者は CSV を書き出す", async ({
  page,
  browser,
  playwright,
}, testInfo) => {
  const violations = await collectCspViolations(page);
  const name = `E2E の一覧画面（${testInfo.project.name}）${Date.now()}`;
  const organizer = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
  await login(organizer, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  const eventId = await createEvent(organizer, { name, fee: 500 });
  const invite = await organizer.post(`/api/v1/events/${eventId}/staff-invite`, {
    headers: ORIGIN,
  });
  const { token } = (await invite.json()) as { token: string };

  // LINE でチェックインした参加者（別の入れ物）
  const tag = testInfo.project.name === "mobile" ? "c2" : "c1";
  const person = `E2E の田中（${testInfo.project.name}）`;
  const participant = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
  await login(participant, uniqueLineUserId(`${tag}1`), person);
  const checkedIn = await participant.post(`/api/v1/events/${eventId}/checkins/me`, {
    data: {
      name: person,
      applicationSource: "connpass",
      referral: "friend",
      paymentMethod: "paypay",
    },
    headers: ORIGIN,
  });
  expect(checkedIn.status()).toBe(201);

  // 受付係
  const staffName = `E2E の受付係（${testInfo.project.name}）`;
  await login(page.request, uniqueLineUserId(`${tag}2`), staffName);
  const accepted = await page.request.post(`/api/v1/staff-invites/${token}/accept`, {
    headers: ORIGIN,
  });
  expect(accepted.status()).toBe(200);

  await page.goto(`/admin/events/${eventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "参加者・合計" })).toBeVisible();
  await expect(participantRow(page, person)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "書き出しと削除" })).toHaveCount(0);
  await expectNoA11yViolations(page, "一覧画面（受付係）");
  await expectNoHorizontalScroll(page, "一覧画面（受付係）");

  // ほかの端末のチェックインは、開き直さなくても5秒おきの読み直しで出る
  const late = `E2E の遅れて来た人（${testInfo.project.name}）`;
  const another = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
  await login(another, uniqueLineUserId(`${tag}3`), late);
  const lateCheckin = await another.post(`/api/v1/events/${eventId}/checkins/me`, {
    data: { name: late, applicationSource: "other", referral: "other", paymentMethod: "free" },
    headers: ORIGIN,
  });
  expect(lateCheckin.status()).toBe(201);
  await expect(participantRow(page, late)).toHaveCount(1, { timeout: 8000 });
  await another.dispose();

  // 手でチェックイン（同じ名前を入れると、両方に「同じ名前があります」）
  await page.getByRole("button", { name: "手でチェックイン" }).click();
  await page.getByRole("textbox", { name: "名前" }).fill(`${person} `);
  await page.getByRole("radio", { name: "直接" }).click();
  await page.getByRole("radio", { name: "SNS" }).click();
  await page.getByRole("radio", { name: "現金" }).click();
  await expectNoA11yViolations(page, "一覧画面（手でチェックイン）");
  await page.getByRole("button", { name: "チェックインする" }).click();
  await expect(page.getByText(`${person}さんをチェックインしました。`)).toBeVisible();
  const manualRow = participantRow(page, `入れた人：${staffName}`);
  await expect(manualRow).toHaveCount(1);
  await expect(participantRow(page, "同じ名前があります")).toHaveCount(2);
  await expectNoA11yViolations(page, "一覧画面（同じ名前）");

  // 合計：PayPay 1人・現金 1人。受付係には内訳を出さない
  await page.getByRole("tab", { name: "合計" }).click();
  await expect(totalsRow(page, "PayPay")).toContainText("1人");
  await expect(totalsRow(page, "PayPay")).toContainText("500円");
  await expect(totalsRow(page, "現金")).toContainText("500円");
  await expect(totalsRow(page, "無料（招待など）")).toContainText("0円");
  await expect(totalsRow(page, "合計")).toContainText("3人");
  await expect(totalsRow(page, "合計")).toContainText("1,000円");
  await expect(page.getByRole("heading", { name: "内訳" })).toHaveCount(0);
  await expectNoA11yViolations(page, "一覧画面（合計）");

  // 手のほうの支払い方法を PayPay に直すと、合計がすぐ変わる
  await page.getByRole("tab", { name: "参加者" }).click();
  await manualRow.getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("LINEのほうを残し")).toBeVisible();
  await expectNoA11yViolations(page, "直す枠");
  await dialog.getByRole("radio", { name: "PayPay" }).click();
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(`${person}さんのチェックインを直しました。`)).toBeVisible();
  await page.getByRole("tab", { name: "合計" }).click();
  await expect(totalsRow(page, "PayPay")).toContainText("2人");
  await expect(totalsRow(page, "PayPay")).toContainText("1,000円");
  await expect(totalsRow(page, "現金")).toContainText("0人");

  // 手のほうを取り消して1人にまとめる
  await page.getByRole("tab", { name: "参加者" }).click();
  await manualRow.getByRole("button").click();
  await dialog.getByRole("button", { name: "取り消す" }).click();
  await expect(dialog.getByText("アンケートの回答があれば一緒に消えます")).toBeVisible();
  await expectNoA11yViolations(page, "取り消しの確かめ");
  await dialog.getByRole("button", { name: "取り消す" }).click();
  await expect(page.getByText(`${person}さんのチェックインを取り消しました。`)).toBeVisible();
  await expect(participantRow(page, person)).toHaveCount(1);
  await expect(participantRow(page, "同じ名前があります")).toHaveCount(0);

  // 受付係は書き出しと削除を使えない
  await page.goto(`/admin/events/${eventId}/data`);
  await expect(
    page.getByRole("heading", { level: 1, name: "この画面は主催者だけが使えます" }),
  ).toBeVisible();
  expect(await violations()).toEqual([]);

  // 主催者：内訳と、参加者の CSV
  const organizerContext = await browser.newContext({
    baseURL: E2E_WEB_URL,
    viewport: page.viewportSize(),
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const organizerPage = await organizerContext.newPage();
  await login(organizerPage.request, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  await organizerPage.goto(`/admin/events/${eventId}`);
  await organizerPage.getByRole("tab", { name: "合計" }).click();
  await expect(organizerPage.getByRole("heading", { name: "内訳" })).toBeVisible();
  await expect(organizerPage.getByRole("table", { name: "申し込みの媒体の内訳" })).toBeVisible();
  await expectNoA11yViolations(organizerPage, "一覧画面（主催者の合計と内訳）");
  await organizerPage.getByRole("link", { name: "書き出しと削除" }).click();
  await expect(
    organizerPage.getByRole("heading", { level: 1, name: "書き出しと削除" }),
  ).toBeVisible();
  await expectNoA11yViolations(organizerPage, "書き出しと削除");
  await expectNoHorizontalScroll(organizerPage, "書き出しと削除");
  const downloading = organizerPage.waitForEvent("download");
  await organizerPage.getByRole("button", { name: "参加者をCSVで書き出す" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^participants-\d{4}-\d{2}-\d{2}\.csv$/);
  const bytes = await readFile(await download.path());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = bytes.subarray(3).toString("utf8");
  expect(csv.split("\r\n")[0]).toBe(
    "名前,チェックインの時刻,申し込みの媒体,知ったきっかけ,支払い方法,金額,割引,割引の額,紹介者,入れ方,入れた人",
  );
  expect(csv).toContain(`${person},`);
  await organizerContext.close();
  await participant.dispose();
  await organizer.dispose();
});
