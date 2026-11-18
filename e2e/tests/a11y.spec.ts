// アクセシビリティ（EXPERIENCE.md 6：WCAG 2.2 AA を下限）。両方の幅（1440px・375px）で axe にかけ、
// 狭い画面でもページが横に動かないことを確かめる。
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { resetNotes } from "../helpers/db.ts";

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

test("空の一覧", async ({ page }) => {
  await resetNotes();
  await page.goto("/notes");
  await expect(page.getByRole("heading", { level: 2, name: "まだメモがありません" })).toBeVisible();
  await expectNoA11yViolations(page, "空の一覧");
  await expectNoHorizontalScroll(page, "空の一覧");
});

test("一覧・追加（誤りつき）・編集・確かめの枠・見つからない", async ({ page }) => {
  await resetNotes(["とても長い題のメモ".repeat(6), "買い物"]);
  await page.goto("/notes");
  await expect(page.getByRole("table")).toBeVisible();
  await expectNoA11yViolations(page, "一覧");
  await expectNoHorizontalScroll(page, "一覧");

  await page.goto("/notes/new");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByRole("textbox", { name: /題/ })).toHaveAttribute("aria-invalid", "true");
  await expectNoA11yViolations(page, "追加（誤りつき）");
  await expectNoHorizontalScroll(page, "追加（誤りつき）");

  await page.goto("/notes");
  await page.getByRole("link", { name: "買い物" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "メモの編集" })).toBeVisible();
  await expectNoA11yViolations(page, "編集");
  await expectNoHorizontalScroll(page, "編集");

  await page.getByRole("button", { name: "削除" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expectNoA11yViolations(page, "確かめの枠");

  await page.goto("/no/such/page");
  await expect(
    page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
  ).toBeVisible();
  await expectNoA11yViolations(page, "見つからない");
});
