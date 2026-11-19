// アンケート（survey-001）：主催者がアンケートを開いたあと、参加者がアンケートの画面で答え、お礼と Googleフォーム・LINE グループの
// ボタンを見る。主催者は手でのチェックインの人の回答を代わりに入れ、困りごとの画面で絞りこみ・並べ替え、CSV を書き出す。
// 受付係は困りごとを開けない。両方の幅で axe にかける。
// ログインは account の試験用のログイン（主催者は e2e/env.ts の E2E_ORGANIZER_LINE_USER_ID）。
// DB は消さない（名前と LINE のユーザー ID に幅と時刻を入れて、前の回と見分ける）。
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** GoogleフォームのURL（E2E の見本）。 */
const GOOGLE_FORM_URL = "https://forms.gle/e2e-survey";

/** LINE グループの招待リンク（E2E の見本）。 */
const LINE_GROUP_URL = "https://line.me/R/ti/g/e2e-survey";

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
 * 主催者として交流会を作る（明日の 19:00。GoogleフォームのURL と LINE グループの招待リンクつき）。
 * @param organizer 主催者の要求の入れ物
 * @param name 交流会の名前
 * @returns 交流会の ID
 */
async function createEvent(organizer: APIRequestContext, name: string): Promise<string> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
  const created = await organizer.post("/api/v1/events", {
    data: {
      name,
      venue: "E2E の会場",
      startsAt: `${tomorrow}T19:00:00+09:00`,
      fee: 1000,
      googleFormUrl: GOOGLE_FORM_URL,
      lineGroupUrl: LINE_GROUP_URL,
    },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

/**
 * アンケートを開く・閉じる（主催者）。
 * @param organizer 主催者の要求の入れ物
 * @param eventId 交流会の ID
 * @param open 開くなら true
 */
async function setSurveyOpen(
  organizer: APIRequestContext,
  eventId: string,
  open: boolean,
): Promise<void> {
  const response = await organizer.put(`/api/v1/events/${eventId}/survey`, {
    data: { open },
    headers: ORIGIN,
  });
  expect(response.status()).toBe(200);
}

/**
 * 自分でチェックインする。
 * @param request 参加者の要求の入れ物
 * @param eventId 交流会の ID
 * @param name 名前
 */
async function checkIn(request: APIRequestContext, eventId: string, name: string): Promise<void> {
  const response = await request.post(`/api/v1/events/${eventId}/checkins/me`, {
    data: { name, applicationSource: "connpass", referral: "friend", paymentMethod: "paypay" },
    headers: ORIGIN,
  });
  expect(response.status()).toBe(201);
}

/**
 * 今の幅で見えている困りごとの行の名前（広い画面は表の行、狭い画面はカード。並びのまま）。
 * @param page Playwright の画面
 * @param names 見分ける名前
 * @returns 見えている行の名前の並び
 */
async function visibleConcernNames(page: Page, names: readonly string[]): Promise<string[]> {
  const texts = await page
    .locator("tbody tr:visible, ul[aria-label='困りごと'] > li:visible")
    .allTextContents();
  return texts.map((text) => names.find((name) => text.includes(name)) ?? text);
}

test("主催者がアンケートを開いたあと、参加者が答えてお礼と Googleフォーム・LINE グループのボタンを見る", async ({
  page,
  playwright,
}, testInfo) => {
  const violations = await collectCspViolations(page);
  const project = testInfo.project.name;
  const name = `E2E のアンケート（${project}）${Date.now()}`;
  const organizer = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
  await login(organizer, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  const eventId = await createEvent(organizer, name);

  const person = `E2E の回答者（${project}）`;
  await login(page.request, uniqueLineUserId(project === "mobile" ? "d2" : "d1"), person);

  // 閉じている間は答えられない
  await page.goto(`/e/${eventId}/survey`);
  await expect(
    page.getByRole("heading", { level: 1, name: "アンケートは閉じています" }),
  ).toBeVisible();
  await expectNoA11yViolations(page, "アンケートの画面（閉じている）");

  // 開いても、チェックインしていなければチェックインの画面へ
  await setSurveyOpen(organizer, eventId, true);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "先にチェックインしてください" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "チェックインの画面へ" })).toHaveAttribute(
    "href",
    `/e/${eventId}/checkin`,
  );
  await expectNoA11yViolations(page, "アンケートの画面（チェックインしていない）");

  // チェックインしたら、チェックインの画面の「アンケートに答える」から開く
  await checkIn(page.request, eventId, person);
  await page.goto(`/e/${eventId}/checkin`);
  await page.getByRole("link", { name: "アンケートに答える" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "仕事の困りごとを聞かせてください" }),
  ).toBeVisible();
  await expect(page.getByText("答えるだけで、実際には払いません")).toBeVisible();
  for (const question of ["実現したら月いくらなら使うか", "テスターになる", "仕事の立場"]) {
    await expect(
      page.getByRole("radiogroup", { name: question }).getByRole("radio", { name: "答えない" }),
    ).toHaveAttribute("aria-checked", "true");
  }
  await expectNoA11yViolations(page, "アンケートの画面");
  await expectNoHorizontalScroll(page, "アンケートの画面");

  await page
    .getByRole("textbox", { name: "困りごと" })
    .fill("部下にAIをどう使わせればいいか分からない");
  await page.getByRole("radio", { name: "1,000円" }).click();
  await page.getByRole("radio", { name: "はい" }).click();
  await page.getByRole("radio", { name: "管理職" }).click();
  await page.getByRole("button", { name: "送る" }).click();
  const thanks = page.getByRole("heading", {
    level: 2,
    name: "あなたの困りごとが、解決する企画やアプリにつながります",
  });
  await expect(thanks).toBeVisible();
  await expect(thanks).toBeFocused();
  await expect(page.getByRole("link", { name: "続けて交流会のアンケートへ" })).toHaveAttribute(
    "href",
    GOOGLE_FORM_URL,
  );
  await expect(page.getByRole("link", { name: "交流会のLINEグループに参加する" })).toHaveAttribute(
    "href",
    LINE_GROUP_URL,
  );
  await expectNoA11yViolations(page, "アンケートの画面（お礼）");
  await expectNoHorizontalScroll(page, "アンケートの画面（お礼）");

  // 開き直すと前の答えが入っていて、送り直せる
  await page.reload();
  await expect(page.getByRole("textbox", { name: "困りごと" })).toHaveValue(
    "部下にAIをどう使わせればいいか分からない",
  );
  await expect(page.getByRole("radio", { name: "1,000円" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radio", { name: "3,000円以上" }).click();
  await page.getByRole("button", { name: "送り直す" }).click();
  await expect(thanks).toBeVisible();

  const listed = await organizer.get(`/api/v1/events/${eventId}/survey-answers`);
  const { answers } = (await listed.json()) as {
    answers: { name: string; monthlyPrice: string; tester: string }[];
  };
  expect(answers).toEqual([
    expect.objectContaining({ name: person, monthlyPrice: "jpy3000plus", tester: "yes" }),
  ]);
  expect(await violations()).toEqual([]);
  await organizer.dispose();
});

test("主催者が代わりに回答を入れ、困りごとを絞りこみ・並べ替え、CSV を書き出す。受付係は困りごとを開けない", async ({
  page,
  browser,
  playwright,
}, testInfo) => {
  const violations = await collectCspViolations(page);
  const project = testInfo.project.name;
  const tag = project === "mobile" ? "e2" : "e1";
  const name = `E2E の困りごと（${project}）${Date.now()}`;
  const organizer = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
  await login(organizer, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  const eventId = await createEvent(organizer, name);
  await setSurveyOpen(organizer, eventId, true);

  // LINE で答えた2人（テスターはい・500円／テスターいいえ・3,000円以上）
  const low = `E2E の低い人（${project}）`;
  const high = `E2E の高い人（${project}）`;
  const proxy = `E2E の手の人（${project}）`;
  for (const [index, person, answer] of [
    [1, low, { concern: "議事録が大変", monthlyPrice: "jpy500", tester: "yes" }],
    [2, high, { concern: "見積もりが大変", monthlyPrice: "jpy3000plus", tester: "no" }],
  ] as const) {
    const participant = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
    await login(participant, uniqueLineUserId(`${tag}${index}`), person);
    await checkIn(participant, eventId, person);
    const sent = await participant.put(`/api/v1/events/${eventId}/survey-answers/me`, {
      data: answer,
      headers: ORIGIN,
    });
    expect(sent.status()).toBe(200);
    await participant.dispose();
  }

  // 手でのチェックイン。アンケートを閉じても、主催者は代わりに入れられる
  const manual = await organizer.post(`/api/v1/events/${eventId}/checkins`, {
    data: { name: proxy, applicationSource: "direct", referral: "sns", paymentMethod: "cash" },
    headers: ORIGIN,
  });
  expect(manual.status()).toBe(201);
  await setSurveyOpen(organizer, eventId, false);

  await login(page.request, E2E_ORGANIZER_LINE_USER_ID, "E2E の主催者");
  await page.goto(`/admin/events/${eventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "参加者・合計" })).toBeVisible();
  await page
    .locator("tr:visible, li:visible")
    .filter({ hasText: proxy })
    .getByRole("button", { name: proxy })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "アンケートの回答" })).toBeVisible();
  await dialog.getByRole("button", { name: "アンケートの回答を入れる" }).click();
  await dialog.getByRole("textbox", { name: "困りごと" }).fill("シフト表づくりが大変");
  await dialog.getByRole("radio", { name: "1,000円" }).click();
  await dialog.getByRole("radio", { name: "はい" }).click();
  await expectNoA11yViolations(page, "直す枠（アンケートの回答を入れる）");
  await dialog.getByRole("button", { name: "回答を保存" }).click();
  await expect(dialog.getByText("アンケートの回答を保存しました。")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "アンケートの回答を直す" })).toBeVisible();
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await expect(dialog).toHaveCount(0);

  // 困りごと：回答の新しい順 → テスターに「はい」だけ → 月いくらの高い順
  await page
    .getByRole("navigation", { name: "メイン" })
    .getByRole("link", { name: "困りごと" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "困りごと" })).toBeVisible();
  const names = [low, high, proxy];
  await expect.poll(() => visibleConcernNames(page, names)).toEqual([proxy, high, low]);
  await expectNoA11yViolations(page, "困りごと");
  await expectNoHorizontalScroll(page, "困りごと");
  await page.getByRole("radio", { name: "テスターに「はい」だけ" }).click();
  await expect.poll(() => visibleConcernNames(page, names)).toEqual([proxy, low]);
  await page.getByRole("radio", { name: "テスターに「はい」だけ" }).press("ArrowLeft");
  await page.getByRole("radio", { name: "月いくらの高い順" }).click();
  await expect.poll(() => visibleConcernNames(page, names)).toEqual([high, proxy, low]);
  await page.getByRole("radio", { name: "テスターに「はい」だけ" }).click();
  await expect.poll(() => visibleConcernNames(page, names)).toEqual([proxy, low]);
  await expectNoA11yViolations(page, "困りごと（絞りこみと並べ替え）");

  // 書き出しと削除で、困りごとの CSV
  await page.getByRole("link", { name: "書き出しと削除" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "困りごとをCSVで書き出す" }),
  ).toBeVisible();
  await expectNoA11yViolations(page, "書き出しと削除（困りごと）");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "困りごとをCSVで書き出す" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^concerns-\d{4}-\d{2}-\d{2}\.csv$/);
  const bytes = await readFile(await download.path());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = bytes.subarray(3).toString("utf8");
  expect(csv.split("\r\n")[0]).toBe(
    "名前,困りごと,月いくら,テスター,仕事の立場,職種,入れ方,回答の時刻",
  );
  expect(csv).toContain(`${proxy},シフト表づくりが大変,"1,000円",はい,,,手,`);
  expect(await violations()).toEqual([]);

  // 受付係：ナビに「困りごと」が出ず、開いても使えない
  const invite = await organizer.post(`/api/v1/events/${eventId}/staff-invite`, {
    headers: ORIGIN,
  });
  const { token } = (await invite.json()) as { token: string };
  const staffContext = await browser.newContext({
    baseURL: E2E_WEB_URL,
    viewport: page.viewportSize(),
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const staffPage = await staffContext.newPage();
  await login(staffPage.request, uniqueLineUserId(`${tag}9`), `E2E の受付係（${project}）`);
  const accepted = await staffPage.request.post(`/api/v1/staff-invites/${token}/accept`, {
    headers: ORIGIN,
  });
  expect(accepted.status()).toBe(200);
  await staffPage.goto(`/admin/events/${eventId}`);
  await expect(staffPage.getByRole("heading", { level: 1, name: "参加者・合計" })).toBeVisible();
  await expect(staffPage.getByRole("link", { name: "困りごと" })).toHaveCount(0);
  await staffPage.goto(`/admin/events/${eventId}/concerns`);
  await expect(
    staffPage.getByRole("heading", { level: 1, name: "この画面は主催者だけが使えます" }),
  ).toBeVisible();
  await expectNoA11yViolations(staffPage, "困りごと（受付係）");
  const forbidden = await staffPage.request.get(`/api/v1/events/${eventId}/survey-answers`);
  expect(forbidden.status()).toBe(403);
  await staffContext.close();
  await organizer.dispose();
});
