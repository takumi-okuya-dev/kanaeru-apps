// 試合表（match-006）：受付の交流会から名簿を入れる（見本の M0・PRD FR-M4）。
// 運営が受付アプリで交流会を作り、参加者が LINE でチェックインし、運営が手で1人チェックインし、予約の名簿に2人を取り込む。
// 試合表を作り、「受付の交流会から」でチェックインした人を入れる（レベルはまだない）→ LINE の人のレベルを選ぶ →
// 次の試合表で同じ交流会から入れると、そのレベルが入る → 申込みの名簿を後ろに足す。両方の幅で axe・CSP を確かめる。
// 入れた交流会は、名簿と設定の題の下（受付アプリで開くリンクつき）と一覧に「受付：… から入れた」と出る（match-007）。
// 名前はどれも架空のもの。試合表のアプリは台帳に行がない間は運営者だけに見えるので、始めに「公開」にし、終わりに「切」に戻す。
import { expect, test } from "@playwright/test";
import type { APIRequest, APIRequestContext, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/**
 * 試験用のログインをする。
 * @param request 要求の入れ物
 * @param lineUserId LINE のユーザー ID
 * @param displayName 表示名
 */
async function login(request: APIRequestContext, lineUserId: string, displayName: string) {
  const response = await request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName },
    headers: ORIGIN,
  });
  expect(response.status()).toBe(200);
}

/**
 * 運営者として、試合表のアプリの公開の状態を変える。
 * @param requests 要求の入れ物を作る道具（Playwright の request）
 * @param visibility 公開の状態
 */
async function setMatchVisibility(requests: APIRequest, visibility: "off" | "public") {
  const request = await requests.newContext({ baseURL: E2E_WEB_URL });
  try {
    await login(request, E2E_ORGANIZER_LINE_USER_ID, "E2E の運営者");
    const response = await request.put("/api/v1/suite/app-settings/match", {
      data: { visibility },
      headers: ORIGIN,
    });
    expect(response.status()).toBe(200);
  } finally {
    await request.dispose();
  }
}

/**
 * 保存が終わるのを待つ（「保存しています…」が消える）。
 * @param page Playwright の画面
 */
async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByText("保存しています…")).toHaveCount(0);
  await expect(page.getByText("保存できませんでした")).toHaveCount(0);
}

/**
 * 操作をして、試合表の中身の送り（PUT）がサーバーに届くまで待つ（「保存しています…」が出る前に通り過ぎないように）。
 * @param page Playwright の画面
 * @param action 中身を変える操作
 */
async function savedAfter(page: Page, action: () => Promise<void>): Promise<void> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /\/api\/v1\/match\/tables\/[0-9a-f-]+$/u.test(new URL(response.url()).pathname) &&
      response.ok(),
  );
  await action();
  await saved;
  await waitSaved(page);
}

/**
 * 試合表を作り、名簿と設定の画面を開く。
 * @param page Playwright の画面
 * @param name 試合表の名前
 */
async function createTable(page: Page, name: string): Promise<void> {
  await page.goto("/match/new");
  await page.getByRole("textbox", { name: /試合表の名前/ }).fill(name);
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test.beforeAll(async ({ playwright }) => {
  await setMatchVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setMatchVisibility(playwright.request, "off");
});

test("受付の交流会からチェックインした人と申込みの名簿を入れ、入れたレベルを次の試合表で使う", async ({
  page,
  playwright,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "e2" : "e1";
  const stamp = Date.now().toString(16);
  const eventName = `E2E の練習会（${testInfo.project.name}）`;

  // 運営（画面と同じクッキー）が交流会を作り、手で1人チェックインし、予約の名簿に2人を取り込む
  await login(page.request, `U${(tag + "a" + stamp).padStart(32, "0")}`, "試合表と受付の運営");
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Tokyo",
  });
  const created = await page.request.post("/api/v1/events", {
    data: {
      name: eventName,
      venue: "E2E の体育館",
      fee: 500,
      startsAt: `${tomorrow}T12:00:00+09:00`,
    },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const eventId = ((await created.json()) as { id: string }).id;
  const checkin = {
    applicationSource: "connpass",
    referral: "friend",
    paymentMethod: "paypay",
  };
  const manual = await page.request.post(`/api/v1/events/${eventId}/checkins`, {
    data: { name: "飛び入り 太郎", ...checkin },
    headers: ORIGIN,
  });
  expect(manual.status()).toBe(201);
  const booking = `/api/v1/booking/events/${eventId}`;
  expect(
    (
      await page.request.put(`${booking}/setting`, { data: { mode: "roster" }, headers: ORIGIN })
    ).status(),
  ).toBe(200);
  const imported = await page.request.post(`${booking}/entries/import`, {
    data: {
      applicationSource: "other",
      rows: [
        { line: 2, name: "山田 花子" },
        { line: 3, name: "佐藤 一郎" },
      ],
    },
    headers: ORIGIN,
  });
  expect(imported.status()).toBe(200);

  // 参加者が LINE でチェックインする（表示名のような、空白のない名前）
  const participant = await playwright.request.newContext({ baseURL: E2E_WEB_URL });
  try {
    await login(participant, `U${(tag + "b" + stamp).padStart(32, "0")}`, "さきちゃん");
    const checkedIn = await participant.post(`/api/v1/events/${eventId}/checkins/me`, {
      data: { name: "なかむらさき", ...checkin },
      headers: ORIGIN,
    });
    expect(checkedIn.status()).toBe(201);
  } finally {
    await participant.dispose();
  }

  // M0：試合表を作り、受付の交流会から、チェックインした人を入れる（レベルはまだない）
  await createTable(page, "12/13(日) 練習会");
  await page.getByRole("button", { name: "受付の交流会から" }).click();
  const dialog = page.getByRole("dialog", { name: "受付の交流会から入れる" });
  await dialog
    .getByRole("radio", { name: new RegExp(eventName.replace(/[()（）]/gu, ".")) })
    .click();
  await expect(dialog.getByRole("radio", { name: "チェックインした人（2人）" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "申込みの名簿（2人）" })).toBeVisible();
  await expect(
    dialog.getByText(
      "レベル：0人は前の試合表から入ります。2人はまだないので、名簿で選んでください。",
    ),
  ).toBeVisible();
  await expectNoA11yViolations(page, "受付の交流会から入れる");
  await savedAfter(page, () => dialog.getByRole("button", { name: "2人を名簿に入れる" }).click());
  await expect(page.getByText(/2人を名簿に入れました。/u)).toBeVisible();
  // 呼び名は貼り付けと同じ決まり：姓。空白のない名前は頭の2字で印
  await expect(page.getByRole("textbox", { name: "飛び入りの呼び名" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "なかの呼び名" })).toBeVisible();
  await expect(page.getByText("姓と名の間に空白がありません")).toBeVisible();
  // 名前はこの画面にだけ出す
  await expect(page.getByRole("cell", { name: "なかむらさき" })).toBeVisible();
  // どの交流会から入れたかを題の下に出し、受付アプリで開くリンクを出す（match-007）
  const [year, month, day] = tomorrow.split("-").map(Number);
  const dateText = `${year}/${month}/${day}`;
  const sourceText = new RegExp(
    `受付：${eventName.replace(/[()（）]/gu, ".")}（${dateText}\\(.\\)）から入れた`,
    "u",
  );
  await expect(page.getByText(sourceText)).toBeVisible();
  await expect(page.getByRole("link", { name: "受付アプリで交流会を開く" })).toHaveAttribute(
    "href",
    `/admin/events/${eventId}`,
  );
  // 一覧にも出す（受付アプリへのリンクは題の下だけ）
  await page.goto("/match");
  await expect(page.getByText(sourceText)).toBeVisible();
  await expectNoA11yViolations(page, "試合表の一覧（受付の交流会から入れた）");
  // 名簿と設定に戻ると、名前は出ない（保存しない）が、どの交流会から入れたかは残る
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "12/13(日) 練習会" })).toBeVisible();
  await expect(page.getByText(sourceText)).toBeVisible();
  await expect(page.getByRole("cell", { name: "なかむらさき" })).toHaveCount(0);

  // LINE でチェックインした人のレベルを選ぶ（覚える）。呼び名も直す
  await savedAfter(page, async () => {
    await page.getByRole("combobox", { name: "なかのレベル" }).selectOption("intermediate");
  });
  await page.getByRole("textbox", { name: "なかの呼び名" }).fill("中村");
  await savedAfter(page, () => page.getByRole("textbox", { name: "なかの呼び名" }).press("Enter"));
  await expectNoA11yViolations(page, "名簿（受付の交流会から）");

  // 次の試合表：同じ交流会から入れると、覚えたレベルが入る → 申込みの名簿を後ろに足す
  await createTable(page, "12/20(日) 練習会");
  await page.getByRole("button", { name: "受付の交流会から" }).click();
  await dialog
    .getByRole("radio", { name: new RegExp(eventName.replace(/[()（）]/gu, ".")) })
    .click();
  await expect(
    dialog.getByText(
      "レベル：1人は前の試合表から入ります。1人はまだないので、名簿で選んでください。",
    ),
  ).toBeVisible();
  await savedAfter(page, () => dialog.getByRole("button", { name: "2人を名簿に入れる" }).click());
  await expect(page.getByRole("combobox", { name: "なかのレベル" })).toHaveValue("intermediate");

  await page.getByRole("button", { name: "受付の交流会から" }).click();
  await dialog
    .getByRole("radio", { name: new RegExp(eventName.replace(/[()（）]/gu, ".")) })
    .click();
  await dialog.getByRole("radio", { name: "申込みの名簿（2人）" }).click();
  await dialog.getByRole("radio", { name: "後ろに足す" }).click();
  await savedAfter(page, () => dialog.getByRole("button", { name: "2人を名簿に入れる" }).click());
  await expect(page.getByText(/2人を名簿に入れました。/u)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "山田の呼び名" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "佐藤の呼び名" })).toBeVisible();
  await expect(page.getByText("4人", { exact: true })).toBeVisible();
  expect(await readCspViolations()).toEqual([]);
});
