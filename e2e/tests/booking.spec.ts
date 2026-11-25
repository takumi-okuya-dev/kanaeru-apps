// 予約の名簿（booking-001）：主催者が準備の画面で「名簿を使う」にし、フォームの CSV を取り込む（もう一度は増えず、列の対応を覚える）。
// 参加者が LINE でチェックインすると、受付係の「名簿に当てる」に候補が出て、当てると名簿の「来た」になる。
// 日の過ぎた交流会では、当たらなかった確定の行が「来なかった」になる。両方の幅で axe にかける。
// ログインは account の試験用のログイン。DB は消さない（交流会ごとに名簿が分かれ、LINE のユーザー ID に幅と時刻を入れる）。
// 名前はどれも架空のもの。
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 取り込む CSV（Google フォームの回答の形。BOM つきの UTF-8）。 */
const FORM_CSV = [
  "タイムスタンプ,お名前,メールアドレス",
  "2026/11/01 10:00,山田 花子,hanako@example.com",
  "2026/11/01 11:00,鈴木 一郎,ichiro@example.com",
  "2026/11/01 12:00,,empty@example.com",
].join("\r\n");

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
 * 交流会を作る（その人が持ち主）。
 * @param request 持ち主の要求の道具
 * @param name 名前
 * @param startsAt 始まりの日時
 * @returns 交流会の ID
 */
async function createEvent(
  request: APIRequestContext,
  name: string,
  startsAt: Date,
): Promise<string> {
  const created = await request.post("/api/v1/events", {
    data: { name, venue: "E2E の会場", startsAt: startsAt.toISOString(), fee: 1000 },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
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
 * 今の幅で見えている名簿の行（広い画面は表の行、狭い画面はカード）。
 * @param page Playwright の画面
 * @param text 行に含む文字（なければすべての行）
 * @returns 行
 */
function rosterRows(page: Page, text?: string) {
  const rows = page.locator(
    "table[aria-label='名簿'] tbody tr:visible, ul[aria-label='名簿'] > li:visible",
  );
  return text ? rows.filter({ hasText: text }) : rows;
}

/**
 * CSV のファイルを選ぶ。
 * @param page Playwright の画面
 */
async function chooseCsv(page: Page): Promise<void> {
  await page.getByLabel("1. ファイル").setInputFiles({
    name: "form-answers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`\uFEFF${FORM_CSV}`, "utf8"),
  });
}

test("主催者が名簿を使うにして CSV を取り込み、LINE のチェックインを受付係が名簿に当てる", async ({
  page,
  playwright,
}, testInfo) => {
  const violations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "d2" : "d1";
  const name = `E2E の名簿（${testInfo.project.name}）${Date.now()}`;
  await login(page.request, uniqueLineUserId(`${tag}1`), "E2E の持ち主");
  const eventId = await createEvent(page.request, name, new Date(Date.now() + DAY_MS));

  // 準備の画面の「使い方」で、名簿を使うにする
  await page.goto(`/admin/events/${eventId}/setup`);
  await expect(page.getByRole("heading", { level: 2, name: "使い方" })).toBeVisible();
  await page.getByRole("radio", { name: /名簿を使う/ }).check();
  await expectNoA11yViolations(page, "準備の画面（使い方）");
  await page.getByRole("button", { name: "使い方を変える" }).click();
  await expect(page.getByText("名簿を使うにしました。")).toBeVisible();
  await expectNoHorizontalScroll(page, "準備の画面（使い方）");

  // ナビの「名簿」から名簿を開く
  await page.getByRole("link", { name: "名簿", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "名簿" })).toBeVisible();
  await expect(page.getByText("まだ名簿に誰もいません。")).toBeVisible();
  await expectNoA11yViolations(page, "名簿（空）");

  // CSV を取り込む（ファイルは画面の中で読む）
  await page.getByRole("link", { name: "貼る・CSV で入れる" }).click();
  await page.getByRole("tab", { name: "CSV を取り込む" }).click();
  await chooseCsv(page);
  await page.getByLabel("2. 名前の列").selectOption("お名前");
  await page.getByRole("radio", { name: "その他" }).click();
  const preview = page.getByRole("table", { name: "取り込む前の確かめ" });
  await expect(preview.getByRole("row")).toHaveCount(4);
  await expect(page.getByText("名前が空（入りません）")).toBeVisible();
  await expectNoA11yViolations(page, "名簿に入れる（確かめ）");
  await expectNoHorizontalScroll(page, "名簿に入れる（確かめ）");
  await page.getByRole("button", { name: "2人を取り込む" }).click();
  await expect(page.getByText("2人を名簿に取り込みました。")).toBeVisible();
  await expect(rosterRows(page)).toHaveCount(2);
  await expectNoA11yViolations(page, "名簿（取り込んだ）");
  await expectNoHorizontalScroll(page, "名簿（取り込んだ）");

  // 同じ CSV をもう一度選ぶと、前に選んだ列と媒体が選ばれていて、すべて「すでにある」
  await page.getByRole("link", { name: "貼る・CSV で入れる" }).click();
  await page.getByRole("tab", { name: "CSV を取り込む" }).click();
  await chooseCsv(page);
  await expect(page.getByLabel("2. 名前の列")).toHaveValue("お名前");
  await expect(page.getByRole("button", { name: "0人を取り込む" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByText("2 行 すでにある（入りません）")).toBeVisible();

  // 受付係を招く
  const invite = await page.request.post(`/api/v1/events/${eventId}/staff-invite`, {
    headers: ORIGIN,
  });
  const { token } = (await invite.json()) as { token: string };

  // 参加者が LINE でチェックインする（表示名は空白なし）
  const participant = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
  await login(participant, uniqueLineUserId(`${tag}2`), "山田花子");
  const checkedIn = await participant.post(`/api/v1/events/${eventId}/checkins/me`, {
    data: {
      name: "山田花子",
      applicationSource: "other",
      referral: "friend",
      paymentMethod: "cash",
    },
    headers: ORIGIN,
  });
  expect(checkedIn.status()).toBe(201);
  await participant.dispose();

  // 受付係が一覧画面の「名簿」から、名簿に当てる
  await login(page.request, uniqueLineUserId(`${tag}3`), "E2E の受付係");
  const accepted = await page.request.post(`/api/v1/staff-invites/${token}/accept`, {
    headers: ORIGIN,
  });
  expect(accepted.status()).toBe(200);
  await page.goto(`/admin/events/${eventId}`);
  await page.getByRole("link", { name: "名簿に当てる" }).click();
  const card = page.getByRole("article", { name: "山田花子のチェックイン" });
  await expect(card).toContainText("名簿の候補：山田 花子");
  await expectNoA11yViolations(page, "名簿に当てる（候補）");
  await expectNoHorizontalScroll(page, "名簿に当てる（候補）");
  await card.getByRole("button", { name: "当てる" }).click();
  await expect(page.getByText("山田花子さんを名簿の山田 花子さんに当てました。")).toBeVisible();
  await expect(page.getByRole("list", { name: "さっきのチェックイン" })).toContainText(
    "名簿に当たった（手）",
  );

  // 名簿にいない人を、飛び入りで手でチェックインする
  await page.getByRole("button", { name: "手でチェックイン（名簿から選ぶ）" }).click();
  await page.getByRole("button", { name: "名簿にいない人（飛び入り）" }).click();
  await page.getByRole("textbox", { name: "名前" }).fill("井上 そら");
  await page.getByRole("radio", { name: "直接" }).click();
  await page.getByRole("radio", { name: "SNS" }).click();
  await page.getByRole("radio", { name: "現金" }).click();
  await expectNoA11yViolations(page, "名簿に当てる（飛び入り）");
  await page.getByRole("button", { name: "チェックインする" }).click();
  await expect(page.getByText("井上 そらさんをチェックインしました。")).toBeVisible();

  // 名簿で、山田さんが来た・飛び入りの行がある（受付係には取り込みと書き出しを出さない）
  await page.getByRole("link", { name: "名簿", exact: true }).click();
  await expect(rosterRows(page, "山田 花子")).toContainText("来た");
  await expect(rosterRows(page, "井上 そら")).toContainText("飛び入り");
  await expect(page.getByRole("link", { name: "貼る・CSV で入れる" })).toHaveCount(0);
  await expectNoA11yViolations(page, "名簿（受付係）");
  expect(await violations()).toEqual([]);
});

test("日の過ぎた交流会では、当たらなかった確定の行が来なかったになる", async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name === "mobile" ? "e2" : "e1";
  await login(page.request, uniqueLineUserId(tag), "E2E の持ち主");
  const eventId = await createEvent(
    page.request,
    `E2E の来なかった（${testInfo.project.name}）${Date.now()}`,
    new Date(Date.now() - 2 * DAY_MS),
  );
  const base = `/api/v1/booking/events/${eventId}`;
  expect(
    (
      await page.request.put(`${base}/setting`, { data: { mode: "roster" }, headers: ORIGIN })
    ).status(),
  ).toBe(200);
  const imported = await page.request.post(`${base}/entries/import`, {
    data: {
      applicationSource: "peatix",
      rows: [
        { line: 2, name: "来た 人" },
        { line: 3, name: "来なかった 人" },
      ],
    },
    headers: ORIGIN,
  });
  expect(imported.status()).toBe(200);
  const manual = await page.request.post(`/api/v1/events/${eventId}/checkins`, {
    data: { name: "来た 人", applicationSource: "peatix", referral: "sns", paymentMethod: "cash" },
    headers: ORIGIN,
  });
  const { id: checkinId } = (await manual.json()) as { id: string };
  const board = (await (await page.request.get(`${base}/matches`)).json()) as {
    checkins: { checkinId: string; entry: { id: string } | null }[];
  };
  const entryId = board.checkins.find((item) => item.checkinId === checkinId)?.entry?.id;
  expect(entryId).toBeTruthy();
  await page.request.post(`${base}/checkins/${checkinId}/match`, {
    data: { entryId },
    headers: ORIGIN,
  });

  await page.goto(`/admin/events/${eventId}/roster`);
  const counts = page.getByRole("group", { name: "人数" });
  await expect(counts).toContainText("来なかった1");
  await page.getByRole("radio", { name: "来なかった" }).click();
  await expect(rosterRows(page)).toHaveCount(1);
  await expect(rosterRows(page, "来なかった 人")).toContainText("来なかった");
  await expectNoA11yViolations(page, "名簿（来なかった）");
  await expectNoHorizontalScroll(page, "名簿（来なかった）");
});
