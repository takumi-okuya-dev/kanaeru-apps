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
  // 領域がまだないので、はじめの画面（/）は見つからない画面を外枠の中に出す
  for (const path of ["/", "/no/such/page"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
    ).toBeVisible();
    await expectNoA11yViolations(page, path);
    await expectNoHorizontalScroll(page, path);
  }
});
