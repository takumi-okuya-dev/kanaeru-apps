// アプリの切り替え・すべてのアプリ・設定・アプリの台帳（core-005。構成の決めごと AD-15・AD-16）。
// E2E の API は、テストだけの見本のアプリ（apps/api/test/helpers/suite.ts。key は demo・名前は「見本のアプリ」）を足して立ち上がり、
// 立ち上げのときに見本のアプリを切に、受付アプリを公開に戻す（apps/api/test/e2e-server.ts）。このファイルのテストも、
// 変えた台帳を終わりに戻す（ほかの E2E の画面を変えない）。どの画面も axe にかけ、画面の CSP の違反がないことを確かめる。
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** 見本のアプリ（テストだけ）の key と名前。 */
const DEMO_KEY = "demo";
const DEMO_NAME = "見本のアプリ";

/**
 * この回だけの LINE のユーザー ID（U と16進の32文字）。
 * @param tag 見分け（16進の文字）
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
 * 運営者として、アプリの公開の状態を変える（窓口で。画面の確かめのあとに戻すときにも使う）。
 * @param request 運営者の要求の道具
 * @param key アプリの key
 * @param visibility 公開の状態
 */
async function setVisibility(
  request: APIRequestContext,
  key: string,
  visibility: "off" | "operator_only" | "public",
): Promise<void> {
  const response = await request.put(`/api/v1/suite/app-settings/${key}`, {
    data: { visibility },
    headers: ORIGIN,
  });
  expect(response.status()).toBe(200);
}

/**
 * 運営者のブラウザの入れ物を作り、ログインする（台帳を戻すため。画面を開くページとは別）。
 * @param page 今の画面（同じ入れ物の要求の道具を使う）
 * @returns 要求の道具
 */
async function operatorRequest(page: Page): Promise<APIRequestContext> {
  await login(page.request, E2E_ORGANIZER_LINE_USER_ID, "E2E の運営者");
  return page.request;
}

/**
 * アプリの切り替えのボタン（PC はサイドバー、スマホは上の帯。見えているほう）。
 * @param page Playwright の画面
 * @returns ボタン
 */
function switcher(page: Page) {
  return page.getByRole("button", { name: /切り替える）$/ });
}

test("見えるアプリが1つなら切り替えを出さず、設定の入口を出す", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await operatorRequest(page);
  await page.goto("/admin/events");
  await expect(page.getByRole("heading", { level: 1, name: "交流会の一覧" })).toBeVisible();
  await expect(switcher(page)).toHaveCount(0);
  await expect(page.getByRole("banner").getByRole("link", { name: "設定" })).toBeVisible();
  await expectNoA11yViolations(page, "見えるアプリが1つの外枠");
  expect(await violations()).toEqual([]);
});

test("運営者が台帳で見本のアプリを「運営者だけ」にすると、運営者に切り替えが出る（利用者には出ない）", async ({
  page,
  browser,
}, testInfo) => {
  const violations = await collectCspViolations(page);
  const operator = await operatorRequest(page);
  try {
    // 台帳：チップを押すと、その場で保存し、行のそばに結果を出す
    await page.goto("/settings/apps");
    await expect(page.getByRole("heading", { level: 1, name: "アプリの台帳" })).toBeVisible();
    const table = page.getByRole("table", { name: "アプリの台帳" });
    const demoRow = table.getByRole("row").filter({ hasText: DEMO_NAME });
    await expect(demoRow.getByRole("cell").last()).toHaveText("だれにも見えません");
    await demoRow
      .getByRole("radiogroup", { name: `${DEMO_NAME}の公開の状態` })
      .getByRole("radio", { name: "運営者だけ" })
      .click();
    await expect(demoRow.getByRole("status")).toHaveText("「運営者だけ」にしました。");
    await expect(demoRow.getByRole("cell").last()).toHaveText("運営者だけ");
    await expect(table.getByRole("row").filter({ hasText: "受付" })).toContainText(
      "ログインした人すべて",
    );
    await expectNoA11yViolations(page, "アプリの台帳");

    // 切り替え：受付の画面で、使えるアプリ（今のアプリにチェック・見本は運営者だけの札）とすべてのアプリ
    await page.goto("/admin/events");
    await expect(page.getByRole("heading", { level: 1, name: "交流会の一覧" })).toBeVisible();
    await expect(switcher(page)).toHaveAccessibleName(
      testInfo.project.name === "mobile"
        ? "受付（アプリを切り替える）"
        : "アプリ 受付（切り替える）",
    );
    await switcher(page).click();
    const mobile = testInfo.project.name === "mobile";
    const panel = mobile
      ? page.getByRole("dialog", { name: "アプリを切り替える" })
      : page.getByRole("menu");
    await expect(panel).toBeVisible();
    const itemRole = mobile ? "link" : "menuitem";
    await expect(panel.getByRole(itemRole, { name: /受付/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(panel.getByRole(itemRole, { name: new RegExp(DEMO_NAME) })).toContainText(
      "運営者だけ",
    );
    await expect(panel.getByRole(itemRole, { name: "すべてのアプリ" })).toBeVisible();
    if (mobile) await expect(panel.getByRole("link", { name: "設定" })).toBeVisible();
    await expectNoA11yViolations(page, "アプリの切り替えを開いたところ");

    // すべてのアプリ：カード・運営者だけの札・台帳への入口（運営者だけ）
    await panel.getByRole(itemRole, { name: "すべてのアプリ" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "すべてのアプリ" })).toBeVisible();
    const demoCard = page.getByRole("listitem", { name: DEMO_NAME });
    await expect(demoCard.getByText("運営者だけに見えています")).toBeVisible();
    await expect(demoCard.getByRole("link", { name: `開く：${DEMO_NAME}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "開く：受付" })).toBeVisible();
    await expect(page.getByRole("link", { name: "アプリの台帳" })).toBeVisible();
    await expectNoA11yViolations(page, "すべてのアプリ");

    // 見本のアプリの窓口：運営者は通り、利用者は 404
    expect((await operator.get("/api/v1/demo/ping")).status()).toBe(200);
    const member = await browser.newContext({ baseURL: E2E_WEB_URL });
    try {
      await login(member.request, uniqueLineUserId("5a1"), "E2E の利用者（切り替え）");
      expect((await member.request.get("/api/v1/demo/ping")).status()).toBe(404);
      const memberPage = await member.newPage();
      await memberPage.setViewportSize(page.viewportSize() ?? { width: 1440, height: 900 });
      await memberPage.goto("/admin/events");
      await expect(
        memberPage.getByRole("heading", { level: 1, name: "交流会の一覧" }),
      ).toBeVisible();
      await expect(switcher(memberPage)).toHaveCount(0);
    } finally {
      await member.close();
    }
  } finally {
    await setVisibility(operator, DEMO_KEY, "off");
  }
  expect(await violations()).toEqual([]);
});

test("見えないアプリの道は、画面も窓口も「ない」（404）", async ({ page }) => {
  const operator = await operatorRequest(page);
  // 見本のアプリは切（立ち上げのとき）。窓口は運営者にも 404
  expect((await operator.get("/api/v1/demo/ping")).status()).toBe(404);
  try {
    await setVisibility(operator, "reception", "off");
    expect((await operator.get("/api/v1/events")).status()).toBe(404);
    await page.goto("/admin/events");
    await expect(
      page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
    ).toBeVisible();
    await expectNoA11yViolations(page, "見えないアプリの画面");
  } finally {
    await setVisibility(operator, "reception", "public");
  }
  expect((await operator.get("/api/v1/events")).status()).toBe(200);
});

test("設定 › アカウント：ログインしている人を出し、ログアウトできる", async ({
  page,
}, testInfo) => {
  const violations = await collectCspViolations(page);
  await login(page.request, uniqueLineUserId("ac1"), "E2E の利用者（設定）");
  await page.goto("/admin/events");
  await page.getByRole("banner").getByRole("link", { name: "設定" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "設定" })).toBeVisible();
  // 利用者には、運営のまとまりを出さない
  await expect(page.getByRole("heading", { name: "運営（運営者だけ）" })).toHaveCount(0);
  await expectNoA11yViolations(page, "設定の一覧");

  await page.getByRole("main").getByRole("link", { name: "アカウント" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "アカウント" })).toBeVisible();
  const summary = page.getByRole("region", { name: "ログインしている人" });
  await expect(summary).toContainText("E2E の利用者（設定）");
  await expect(summary).toContainText("LINE");
  await expect(summary).toContainText("受付");
  if (testInfo.project.name === "mobile") {
    await expect(page.getByRole("link", { name: "設定の一覧へ" })).toBeVisible();
  }
  await expectNoA11yViolations(page, "設定 › アカウント");

  await summary.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "すべてのアプリ" })).toBeVisible();
  await expect(page.getByText("ログアウトしました。")).toBeVisible();
  expect((await page.request.get("/api/v1/accounts/me")).status()).toBe(401);
  expect(await violations()).toEqual([]);
});

test("設定 › アカウント：退会すると、確かめたあとにアカウントを消す", async ({ page }) => {
  await login(page.request, uniqueLineUserId("de1"), "E2E の退会する人");
  await page.goto("/settings/account");
  await expect(page.getByRole("heading", { level: 1, name: "アカウント" })).toBeVisible();
  await page
    .getByRole("region", { name: "退会する" })
    .getByRole("button", { name: "退会する" })
    .click();
  const dialog = page.getByRole("alertdialog", { name: "退会しますか" });
  await expect(dialog).toContainText("元に戻せません");
  await expect(dialog).toContainText("受付のチェックイン");
  await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused();
  await expectNoA11yViolations(page, "退会の確かめ");
  await dialog.getByRole("button", { name: "退会する" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "すべてのアプリ" })).toBeVisible();
  await expect(page.getByText("退会しました。")).toBeVisible();
  expect((await page.request.get("/api/v1/accounts/me")).status()).toBe(401);
});
