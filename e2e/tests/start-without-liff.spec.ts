// LIFF を始めずに開く道（core-013。構成の決めごと AD-4 の例外）：試合表の道（/match/…）は LIFF を始めずにルーターを作り、
// ほかの道は今までどおり LIFF を始めてから開く。
// E2E は LIFF ID がない（仮の LIFF）ので、LIFF の失敗そのものは単体のテスト（lib/liff.test.ts）で確かめ、ここでは
// 組み立てた画面で「試合表の道はルーターが動く」「そこから LIFF の要る道へ移ると、ページを読み直して LIFF を始める」
// 「ほかの道から移るときは読み直さない（今までどおり）」を確かめる。
// 試合表の道はまだないので、見つからない画面（外枠の中。ルーターが描く）で確かめる（道を足さない。spec の 【仮決め】）。
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { collectCspViolations } from "../helpers/csp.ts";

/** ページを読み直したかを見分ける印（画面の中の window に置く）。 */
type MarkedWindow = Window & { __sameDocument?: boolean };

/**
 * 今のページに印を置く（ページを読み直すと消える）。
 * @param page Playwright の画面
 */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as MarkedWindow).__sameDocument = true;
  });
}

/**
 * 印が残っているか（同じページのまま移ったか）。
 * @param page Playwright の画面
 * @returns 残っていれば true
 */
async function isSameDocument(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as MarkedWindow).__sameDocument === true);
}

test.describe("LIFF を始めずに開く道", () => {
  test("試合表の見るだけ・受付の道は、LIFF を始めずにルーターが画面を描く", async ({ page }) => {
    const violations = await collectCspViolations(page);
    for (const path of ["/match/view/e2e-view-token", "/match/join/e2e-join-token"]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "読みこめませんでした" })).toHaveCount(0);
    }
    expect(await violations()).toEqual([]);
  });

  test("試合表の道から LIFF の要る道へ移ると、ページを読み直して LIFF を始める", async ({
    page,
  }) => {
    await page.goto("/match/view/e2e-view-token");
    await expect(
      page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
    ).toBeVisible();
    await markDocument(page);
    await page.getByRole("link", { name: "はじめの画面へ戻る" }).click();
    await expect(page).not.toHaveURL(/\/match\//u);
    // ログインが要る画面の「ログインしていません」は getLiff() を読む（LIFF を始めていなければ描けない）
    await expect(
      page.getByRole("heading", { level: 1, name: "ログインしていません" }),
    ).toBeVisible();
    expect(await isSameDocument(page)).toBe(false);
  });

  test("ほかの道から移るときは、今までどおりページを読み直さない", async ({ page }) => {
    await page.goto("/admin/e2e-not-found");
    await expect(
      page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
    ).toBeVisible();
    await markDocument(page);
    await page.getByRole("link", { name: "はじめの画面へ戻る" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "ログインしていません" }),
    ).toBeVisible();
    expect(await isSameDocument(page)).toBe(true);
  });
});
