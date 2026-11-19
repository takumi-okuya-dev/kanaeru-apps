// 外枠のナビ（core-003）：PC はサイドバーをメニューのボタンで隠せて、読みこみ直しても隠れたまま。スマホは下のタブバーで、
// 主催者は4つ・受付係は2つの項目。参加者の画面（チェックイン・アンケート・招待）と手元のログインにはナビが出ない。
// どれも axe にかける。ログインは account の試験用のログイン（主催者は e2e/env.ts の E2E_ORGANIZER_LINE_USER_ID）。
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";

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
 * 主催者として交流会を作る（明日の 19:00）。
 * @param organizer 主催者の要求の入れ物
 * @param name 交流会の名前
 * @returns 交流会の ID
 */
async function createEvent(organizer: APIRequestContext, name: string): Promise<string> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
  const created = await organizer.post("/api/v1/events", {
    data: { name, venue: "E2E の会場", startsAt: `${tomorrow}T19:00:00+09:00`, fee: 1000 },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

/**
 * 見えているナビ（メイン）の項目の名前。
 * @param page Playwright の画面
 * @returns 項目の名前（並びの順）
 */
async function navLabels(page: Page): Promise<string[]> {
  const links = page.getByRole("navigation", { name: "メイン" }).getByRole("link");
  return (await links.allTextContents()).map((text) => text.trim());
}

test("PC：サイドバーをメニューのボタンで隠し、読みこみ直しても隠れたまま", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "サイドバーは PC の幅だけ");
  await login(page.request, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  const eventId = await createEvent(page.request, `E2E の外枠の交流会（PC）${Date.now()}`);

  await page.goto(`/admin/events/${eventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "参加者・合計" })).toBeVisible();
  await expect
    .poll(() => navLabels(page))
    .toEqual(["交流会の一覧", "参加者・合計", "困りごと", "準備"]);
  const sidebar = page.getByRole("navigation", { name: "メイン" });
  await expect(sidebar.getByRole("link", { name: "参加者・合計" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // 画面の上の行き来のタブはない（外枠のナビにまとめた）
  await expect(page.getByRole("navigation")).toHaveCount(1);
  await expectNoA11yViolations(page, "PC のサイドバー");

  const toggle = page.getByRole("button", { name: "メニュー" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("navigation", { name: "メイン" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "参加者・合計" })).toBeVisible();
  await expect(page.getByRole("button", { name: "メニュー" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByRole("navigation", { name: "メイン" })).toHaveCount(0);
  await expectNoA11yViolations(page, "PC のサイドバーを隠した");

  await page.getByRole("button", { name: "メニュー" }).click();
  await expect(page.getByRole("navigation", { name: "メイン" })).toBeVisible();
});

test("スマホ：下のタブバーに、主催者は4つ・受付係は2つの項目", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "タブバーはスマホの幅だけ");
  await login(page.request, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  const eventId = await createEvent(page.request, `E2E の外枠の交流会（スマホ）${Date.now()}`);

  await page.goto(`/admin/events/${eventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "参加者・合計" })).toBeVisible();
  await expect
    .poll(() => navLabels(page))
    .toEqual(["交流会の一覧", "参加者・合計", "困りごと", "準備"]);
  // メニューのボタンはなく、タブバーは画面の下に貼りつく
  await expect(page.getByRole("button", { name: "メニュー" })).toHaveCount(0);
  const tabBar = page.getByRole("navigation", { name: "メイン" });
  const box = await tabBar.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("タブバーの大きさが読めません");
  expect(Math.round(box.y + box.height)).toBe(viewport.height);
  // 窓はスクロールしない（帯と本文の枠だけがスクロールし、本文がタブバーの下に潜らない）
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
  ).toBeLessThanOrEqual(0);
  for (const link of await tabBar.getByRole("link").all()) {
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expectNoA11yViolations(page, "スマホのタブバー（主催者）");

  await tabBar.getByRole("link", { name: "準備" }).click();
  const heading = page.getByRole("heading", { level: 1, name: "準備" });
  await expect(heading).toBeFocused();
  await expect(tabBar.getByRole("link", { name: "準備" })).toHaveAttribute("aria-current", "page");

  // 受付係：交流会の一覧と参加者・合計だけ
  const invite = await page.request.post(`/api/v1/events/${eventId}/staff-invite`, {
    headers: ORIGIN,
  });
  const { token } = (await invite.json()) as { token: string };
  const staffContext = await browser.newContext({
    baseURL: E2E_WEB_URL,
    viewport,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const staffPage = await staffContext.newPage();
  await login(staffPage.request, uniqueLineUserId("5e11"), "E2E の受付係（外枠）");
  const accepted = await staffPage.request.post(`/api/v1/staff-invites/${token}/accept`, {
    headers: ORIGIN,
  });
  expect(accepted.status()).toBe(200);
  await staffPage.goto(`/admin/events/${eventId}`);
  await expect(staffPage.getByRole("heading", { level: 1, name: "参加者・合計" })).toBeVisible();
  await expect.poll(() => navLabels(staffPage)).toEqual(["交流会の一覧", "参加者・合計"]);
  await expectNoA11yViolations(staffPage, "スマホのタブバー（受付係）");
  await staffContext.close();
});

test("参加者の画面と手元のログインには、管理のナビが出ない", async ({
  page,
  browser,
}, testInfo) => {
  const organizer = await browser.newContext({ baseURL: E2E_WEB_URL });
  await login(organizer.request, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  const eventId = await createEvent(
    organizer.request,
    `E2E の参加者の画面（${testInfo.project.name}）${Date.now()}`,
  );
  const invite = await organizer.request.post(`/api/v1/events/${eventId}/staff-invite`, {
    headers: ORIGIN,
  });
  const { token } = (await invite.json()) as { token: string };
  await organizer.close();

  const tag = testInfo.project.name === "mobile" ? "ba2" : "ba1";
  await login(page.request, uniqueLineUserId(tag), "E2E の参加者（外枠）");
  for (const path of [
    `/e/${eventId}/checkin`,
    `/e/${eventId}/survey`,
    `/invite/${token}`,
    "/dev/login",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation"), path).toHaveCount(0);
    await expect(page.getByRole("button", { name: "メニュー" }), path).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link"), path).toHaveCount(0);
    await expectNoA11yViolations(page, `参加者の画面 ${path}`);
  }
});
