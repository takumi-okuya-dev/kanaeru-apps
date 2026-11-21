// 定員とキャンセル待ち（booking-004。PRD 受付アプリの予約 4.5・4.6）：主催者が準備の画面で定員を1にする → 参加者 B が申し込む（確定）
// → C が申し込む（キャンセル待ちの1番目）→ 主催者の画面に「満員です」→ B が取り消す → C の自分の申込みに打診中 → 参加する → 確定
// → 名簿の「送った知らせ」→ 交流会の日時を直して変更の帯で知らせる → 予約を中止する → ページは中止。E2E は APP_ENV=test なので
// 本物の LINE とメールには送らない。どの画面も axe にかけ、横に動かないことと、画面の CSP の違反がないことを確かめる。
// 名前はどれも架空のもの。
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * この回だけの LINE のユーザー ID（幅と時刻で分ける）。
 * @param tag 見分け（16進の文字）
 * @returns LINE のユーザー ID
 */
function uniqueLineUserId(tag: string): string {
  return `U${(tag + Date.now().toString(16)).padStart(32, "0").slice(-32)}`;
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
 * 別の人のブラウザの入れ物を作る（ログインはしない）。
 * @param browser ブラウザ
 * @returns 画面
 */
async function openContext(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: E2E_WEB_URL, locale: "ja-JP" });
  return context.newPage();
}

/**
 * 今の画面を確かめる（アクセシビリティと、横に動かないこと）。
 * @param page Playwright の画面
 * @param label 失敗したときに出す、画面の名前
 */
async function checkPage(page: Page, label: string): Promise<void> {
  await expectNoA11yViolations(page, label);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} が横に動きます`).toBeLessThanOrEqual(0);
}

test("定員1でキャンセル待ちに入り、取り消しで打診が届いて参加し、変更と中止を知らせる（booking-004）", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "f2" : "f1";
  await login(page.request, uniqueLineUserId(`${tag}a`), `主催者${tag}`);
  const eventName = `日曜の練習${tag}`;
  const startsAt = new Date(Date.now() + 7 * DAY_MS).toISOString();
  const created = await page.request.post("/api/v1/events", {
    data: { name: eventName, venue: "E2E の体育館", startsAt, fee: 500 },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const eventId = ((await created.json()) as { id: string }).id;
  const base = `/api/v1/booking/events/${eventId}`;
  await page.request.put(`${base}/setting`, { data: { mode: "self_page" }, headers: ORIGIN });
  await page.request.put(`${base}/self-page`, {
    data: { accepting: true, visibility: "public" },
    headers: ORIGIN,
  });

  // 準備の画面の「定員とキャンセル待ち」で定員を1にする
  await page.goto(`/admin/events/${eventId}/setup`);
  await expect(page.getByRole("heading", { name: "定員とキャンセル待ち" })).toBeVisible();
  await page.getByLabel("定員", { exact: true }).fill("1");
  await page.getByRole("button", { name: "定員を保存する" }).click();
  await expect(page.getByText("定員を保存しました。")).toBeVisible();
  await checkPage(page, "準備の画面（定員）");

  // B が申し込む（確定）→ C が申し込む（キャンセル待ちの1番目）
  const first = await openContext(browser);
  const readFirstCsp = await collectCspViolations(first);
  await login(first.request, uniqueLineUserId(`${tag}b`), `中村${tag}`);
  await first.goto(`/e/${eventId}`);
  await expect(first.getByText("残り1席")).toBeVisible();
  await first.getByRole("button", { name: "申し込む" }).click();
  await expect(first.getByRole("heading", { name: "申し込みました", level: 1 })).toBeVisible();

  const second = await openContext(browser);
  const readSecondCsp = await collectCspViolations(second);
  await login(second.request, uniqueLineUserId(`${tag}c`), `森${tag}`);
  await second.goto(`/e/${eventId}`);
  await expect(second.getByText("満員です（キャンセル待ち0人）。")).toBeVisible();
  await checkPage(second, "申込みページ（満員）");
  await second.getByRole("button", { name: "キャンセル待ちに申し込む" }).click();
  await expect(
    second.getByRole("heading", { name: "キャンセル待ちに入りました", level: 1 }),
  ).toBeVisible();
  await expect(second.getByText("キャンセル待ち（1番目）")).toBeVisible();
  await checkPage(second, "申込み完了（キャンセル待ち）");

  // 主催者の画面に「満員です」
  await page.reload();
  await expect(page.getByText("満員です", { exact: true })).toBeVisible();

  // B が取り消す → C に打診 → 参加する
  await first.goto("/my-bookings");
  await first.getByRole("button", { name: "取り消す" }).click();
  await first.getByRole("alertdialog").getByRole("button", { name: "取り消す" }).click();
  await expect(first.getByText(`${eventName}の申込みを取り消しました。`)).toBeVisible();
  await second.goto("/my-bookings");
  await expect(second.getByText("打診中")).toBeVisible();
  await expect(second.getByText(/までに、参加するかを答えてください/)).toBeVisible();
  await checkPage(second, "自分の申込み（打診中）");
  await second.getByRole("button", { name: "参加する" }).click();
  await expect(second.getByText(`${eventName}に参加することにしました（確定）。`)).toBeVisible();
  await expect(second.getByText("確定", { exact: true })).toBeVisible();

  // 名簿の「送った知らせ」
  await page.goto(`/admin/events/${eventId}/roster`);
  const rows = page.locator(
    "table[aria-label='名簿'] tbody tr:visible, ul[aria-label='名簿'] > li:visible",
  );
  const row = rows.filter({ hasText: `森${tag}` });
  await row.getByRole("button", { name: `森${tag}さんに送った知らせ` }).click();
  await expect(row.getByText(/打診・なし・送り先がない/)).toBeVisible();
  await checkPage(page, "名簿（送った知らせ）");

  // 交流会の日時を直す → 変更の帯で知らせる
  const moved = await page.request.put(`/api/v1/events/${eventId}`, {
    data: {
      name: eventName,
      venue: "E2E の体育館",
      startsAt: new Date(Date.parse(startsAt) + DAY_MS).toISOString(),
      fee: 500,
    },
    headers: ORIGIN,
  });
  expect(moved.status()).toBe(200);
  await page.goto(`/admin/events/${eventId}/setup`);
  await expect(page.getByRole("heading", { name: "日時や場所が変わりました" })).toBeVisible();
  await checkPage(page, "準備の画面（変更の帯）");
  await page.getByRole("button", { name: "変更を知らせる" }).click();
  await expect(page.getByText("申し込んだ人に変更を知らせました。")).toBeVisible();

  // 予約を中止する → ページは中止
  await page.getByRole("button", { name: "予約を中止する" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "中止する" }).click();
  await expect(page.getByText(/予約を中止しました。/)).toBeVisible();
  const guest = await openContext(browser);
  const readGuestCsp = await collectCspViolations(guest);
  await guest.goto(`/e/${eventId}`);
  await expect(guest.getByText("この会は中止になりました")).toBeVisible();
  await checkPage(guest, "申込みページ（中止）");

  expect(await readCspViolations()).toEqual([]);
  expect(await readFirstCsp()).toEqual([]);
  expect(await readSecondCsp()).toEqual([]);
  expect(await readGuestCsp()).toEqual([]);
  await first.context().close();
  await second.context().close();
  await guest.context().close();
});
