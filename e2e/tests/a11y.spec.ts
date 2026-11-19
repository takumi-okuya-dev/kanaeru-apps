// アクセシビリティ（EXPERIENCE.md 6：WCAG 2.2 AA を下限）。両方の幅（1440px・375px）で axe にかけ、
// 狭い画面でもページが横に動かないことを確かめる。
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectNoA11yViolations } from "../helpers/axe.ts";

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

test("はじめの画面・見つからない画面", async ({ page }) => {
  // はじめの画面（/）は、ナビの最初の項目へ移る（ナビを出す領域がなければ見つからない画面）。
  // どの領域の画面になるかは書かない（並行開発の決まり 3-2）。どちらも外枠の中に h1 を出す
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page, "/");
  await expectNoHorizontalScroll(page, "/");

  await page.goto("/no/such/page");
  await expect(
    page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
  ).toBeVisible();
  await expectNoA11yViolations(page, "/no/such/page");
  await expectNoHorizontalScroll(page, "/no/such/page");
});
