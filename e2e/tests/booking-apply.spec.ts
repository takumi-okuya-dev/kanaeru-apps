// 自前の申込みページ（booking-003。PRD 受付アプリの予約 4.4）：主催者が準備の画面で「自前で申込みを受ける」にして受付を開く。
// ログインしていない人がページを見て、参加者がログインして申し込み、名簿に「自前」で入る。自分の申込みで取り消す。
// LINE を使わない人は確認のメール（偽の送り手が覚えたものを開発の窓口から読む）のリンクで確定し、同じリンクで取り消す。
// 部員だけの回は、組織の外の人に「この会は見られません」。E2E は APP_ENV=test なので本物のメールには送らない。
// どの画面も axe にかけ、横に動かないことと、画面の CSP の違反がないことを確かめる。名前・アドレスはどれも架空のもの。
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
 * 交流会を作る（1週間あと）。
 * @param request 要求の道具（主催者）
 * @param name 名前
 * @returns 交流会の ID
 */
async function createEvent(request: APIRequestContext, name: string): Promise<string> {
  const created = await request.post("/api/v1/events", {
    data: {
      name,
      venue: "E2E の体育館",
      startsAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
      fee: 500,
    },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
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

/**
 * 偽の送り手が最後に覚えたメールの、札のページの道（開発の窓口から読む）。
 * @param request 要求の道具（ログインしたもの）
 * @param to 宛先
 * @returns 札のページの道
 */
async function lastEntryPath(request: APIRequestContext, to: string): Promise<string> {
  const response = await request.get("/api/v1/booking/dev/notify-outbox");
  expect(response.status()).toBe(200);
  const { messages } = (await response.json()) as {
    messages: { method: string; to: string; text: string }[];
  };
  const mail = messages.find((message) => message.method === "email" && message.to === to);
  const path = /\/e\/[0-9a-f-]+\/entry\/[A-Za-z0-9_-]+/.exec(mail?.text ?? "")?.[0];
  expect(path, "確認のメールに札のリンクがありません").toBeTruthy();
  return path ?? "";
}

test("主催者が受付を開き、参加者が LINE ログインとメールで申し込み、取り消す（booking-003）", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "d2" : "d1";
  await login(page.request, uniqueLineUserId(`${tag}a`), `主催者${tag}`);
  const eventName = `土曜の練習${tag}`;
  const eventId = await createEvent(page.request, eventName);

  // 準備の画面の「使い方」で、自前で申込みを受けるにする → 申込みページの節（既定は閉じている）→ 受付を開く
  await page.goto(`/admin/events/${eventId}/setup`);
  await page.getByRole("radio", { name: /自前で申込みを受ける/ }).check();
  await page.getByRole("button", { name: "使い方を変える" }).click();
  await expect(page.getByText("自前で申込みを受けるにしました。")).toBeVisible();
  await expect(page.getByText(/受付を閉じています。開くまで/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "部員だけ" })).toBeDisabled();
  await checkPage(page, "準備の画面（申込みページ・閉じている）");
  await page.getByRole("button", { name: "受付を開く" }).click();
  await expect(page.getByText("受付を開きました。")).toBeVisible();
  const pageUrl = (await page.locator("code", { hasText: `/e/${eventId}` }).textContent()) ?? "";
  const applyPath = new URL(pageUrl).pathname;
  expect(applyPath).toBe(`/e/${eventId}`);

  // ログインしていない人がページを見る（LINE でログインして申し込む・LINE を使わずに申し込む）
  const guest = await openContext(browser);
  const readGuestCsp = await collectCspViolations(guest);
  await guest.goto(applyPath);
  await expect(guest.getByRole("heading", { name: eventName, level: 1 })).toBeVisible();
  await expect(guest.getByText("受付中")).toBeVisible();
  await expect(guest.getByRole("link", { name: "LINE でログインして申し込む" })).toBeVisible();
  await checkPage(guest, "申込みページ（ログインなし）");

  // 参加者がログインして申し込む（名前は LINE の表示名が入っている）
  const participant = await openContext(browser);
  const readParticipantCsp = await collectCspViolations(participant);
  await login(participant.request, uniqueLineUserId(`${tag}b`), `中村${tag}`);
  await participant.goto(applyPath);
  await expect(participant.getByLabel(/お名前/)).toHaveValue(`中村${tag}`);
  await checkPage(participant, "申込みページ（ログインしたあと）");
  await participant.getByRole("button", { name: "申し込む" }).click();
  await expect(
    participant.getByRole("heading", { name: "申し込みました", level: 1 }),
  ).toBeVisible();
  await expect(participant.getByRole("link", { name: "Google カレンダー" })).toBeVisible();
  await checkPage(participant, "申込み完了");

  // 主催者の名簿に、入口「自前」で入る
  await page.goto(`/admin/events/${eventId}/roster`);
  const rosterRows = page.locator(
    "table[aria-label='名簿'] tbody tr:visible, ul[aria-label='名簿'] > li:visible",
  );
  await expect(rosterRows.filter({ hasText: `中村${tag}` })).toContainText("自前");

  // 自分の申込みで取り消す
  await participant.getByRole("link", { name: "自分の申込みを見る" }).click();
  await expect(participant.getByRole("heading", { name: "予約", level: 1 })).toBeVisible();
  await expect(participant.getByRole("link", { name: eventName })).toBeVisible();
  await checkPage(participant, "自分の申込み");
  await participant.getByRole("button", { name: "取り消す" }).click();
  await participant.getByRole("alertdialog").getByRole("button", { name: "取り消す" }).click();
  await expect(participant.getByText(`${eventName}の申込みを取り消しました。`)).toBeVisible();
  await participant.getByRole("link", { name: "部の予定" }).click();
  await expect(participant.getByText(/部の予定はありません/)).toBeVisible();
  await checkPage(participant, "部の予定");

  // LINE を使わずに申し込む：確認のメール → リンクで確定 → 同じリンクで取り消す
  const email = `guest-${tag}-${Date.now()}@example.com`;
  await guest.getByRole("button", { name: "LINE を使わずに申し込む" }).click();
  await guest.getByLabel(/お名前/).fill(`小林${tag}`);
  await guest.getByLabel(/メールアドレス/).fill(email);
  await checkPage(guest, "LINE を使わずに申し込む");
  await guest.getByRole("button", { name: "確認のメールを送る" }).click();
  await expect(guest.getByText(/確認のメールを送りました/)).toBeVisible();
  const entryPath = await lastEntryPath(page.request, email);
  await guest.goto(entryPath);
  await expect(guest.getByRole("heading", { name: "申込みを確定する", level: 1 })).toBeVisible();
  await checkPage(guest, "札のページ（確定の前）");
  await guest.getByRole("button", { name: "申込みを確定する" }).click();
  await expect(guest.getByRole("heading", { name: "申し込みました", level: 1 })).toBeVisible();
  await checkPage(guest, "札のページ（確定）");
  await guest.getByRole("button", { name: "この申込みを取り消す" }).click();
  await guest.getByRole("alertdialog").getByRole("button", { name: "取り消す" }).click();
  await expect(guest.getByText(/この申込みは取り消しています/)).toBeVisible();
  // 名簿にはメールアドレスが出ない
  await page.reload();
  await expect(rosterRows.filter({ hasText: `小林${tag}` })).toContainText("自前");
  await expect(page.getByText(email)).toHaveCount(0);

  // 部員だけの回：組織の外の人には「この会は見られません」
  const organization = await page.request.post("/api/v1/suite/organizations", {
    data: { name: `部${tag}` },
    headers: ORIGIN,
  });
  expect(organization.status()).toBe(201);
  const organizationId = ((await organization.json()) as { id: string }).id;
  const membersEventId = await createEvent(page.request, `部員の練習${tag}`);
  expect(
    (
      await page.request.put(`/api/v1/events/${membersEventId}/organization`, {
        data: { organizationId },
        headers: ORIGIN,
      })
    ).status(),
  ).toBe(200);
  const base = `/api/v1/booking/events/${membersEventId}`;
  await page.request.put(`${base}/setting`, { data: { mode: "self_page" }, headers: ORIGIN });
  const members = await page.request.put(`${base}/self-page`, {
    data: { accepting: true, visibility: "members" },
    headers: ORIGIN,
  });
  expect(members.status()).toBe(200);
  await participant.goto(`/e/${membersEventId}`);
  await expect(participant.getByRole("heading", { name: "この会は見られません" })).toBeVisible();
  await expect(participant.getByText(`部員の練習${tag}`)).toHaveCount(0);
  await checkPage(participant, "部員だけの回（組織の外の人）");

  expect(await readCspViolations()).toEqual([]);
  expect(await readGuestCsp()).toEqual([]);
  expect(await readParticipantCsp()).toEqual([]);
  await guest.context().close();
  await participant.context().close();
});
