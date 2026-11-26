// 改善点を送る（suite-004）：ログインした人が全体の設定から改善点を送る → 運営者が「届いた改善点」で読み、済みにする。
// 運営者でない人は届いた改善点を開けない。両方の幅で axe・横のスクロール・CSP を確かめる。名前はどれも架空のもの。
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 状態を変える要求に付ける源（CSRF の確かめ）。 */
const ORIGIN = { origin: E2E_WEB_URL };

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

test("改善点を送り、運営者が届いた改善点で読んで済みにする（suite-004）", async ({
  page,
  browser,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "fb2" : "fb1";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const sender = `送る人（${testInfo.project.name}）`;
  const body = `名簿を初めは閉じておいてほしい（${testInfo.project.name}・${Date.now()}）`;
  await login(page.request, lineUserId, sender);

  // 全体の設定から「改善点を送る」を開く
  await page.goto("/settings");
  await page.getByRole("main").getByRole("link", { name: "改善点を送る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "改善点を送る" })).toBeVisible();
  // 空なら欄のそばに誤り
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByText("困ったこと・ほしいことを書いてください。")).toBeVisible();
  await page.getByRole("combobox", { name: /どのアプリについてですか/u }).selectOption("reception");
  await page.getByRole("textbox", { name: "困ったこと・ほしいこと" }).fill(body);
  await checkPage(page, "改善点を送る");
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByText("送りました。ありがとうございます。")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "困ったこと・ほしいこと" })).toHaveValue("");

  // 運営者でない人は、届いた改善点を開けない
  await page.goto("/settings/feedback/inbox");
  await expect(page.getByText("運営者だけが開ける画面です")).toBeVisible();

  // 運営者が読み、済みにする
  const context = await browser.newContext({ baseURL: E2E_WEB_URL, locale: "ja-JP" });
  try {
    const operator = await context.newPage();
    await login(operator.request, E2E_ORGANIZER_LINE_USER_ID, "運営");
    await operator.goto("/settings");
    await operator.getByRole("main").getByRole("link", { name: "届いた改善点" }).click();
    const item = operator.getByRole("listitem").filter({ hasText: body });
    await expect(item).toBeVisible();
    await expect(item).toContainText(sender);
    await expect(item).toContainText("受付");
    await checkPage(operator, "届いた改善点");
    await item.getByRole("button", { name: "済みにする" }).click();
    // まだのものだけを出しているので、済みにすると消える
    await expect(operator.getByRole("listitem").filter({ hasText: body })).toHaveCount(0);
    await operator.getByRole("checkbox", { name: "まだのものだけ" }).uncheck();
    await expect(
      operator.getByRole("listitem").filter({ hasText: body }).getByText("済み", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
  expect(await readCspViolations()).toEqual([]);
});
