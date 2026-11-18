// キーボードだけで使える（EXPERIENCE.md 5）：追加・開く・削除をキーボードだけで行い、道が変わると h1 にフォーカスが移り、
// 確かめの枠は開いたらキャンセルにフォーカスを置き、Esc で閉じたら開いたボタンへ戻る。
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resetNotes } from "../helpers/db.ts";

/**
 * 名前の要素にフォーカスが来るまで Tab を押す。
 * @param page Playwright の画面
 * @param name 探す要素の見える名前（textContent か aria-label）
 * @param key 押すキー（後ろへ戻るときは Shift+Tab）
 * @param limit 押す回数の上限
 */
async function tabTo(
  page: Page,
  name: string,
  key: "Tab" | "Shift+Tab" = "Tab",
  limit = 30,
): Promise<void> {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(key);
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return (element?.getAttribute("aria-label") ?? element?.textContent ?? "").trim();
    });
    if (focused === name) return;
  }
  throw new Error(`Tab で「${name}」にたどり着けませんでした。`);
}

/**
 * 今フォーカスしている要素の、タグの名前と文字。
 * @param page Playwright の画面
 * @returns タグの名前と文字
 */
async function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return { tag: element?.tagName ?? "", text: (element?.textContent ?? "").trim() };
  });
}

test("キーボードだけで、追加・開く・削除ができる", async ({ page }) => {
  await resetNotes();
  await page.goto("/notes");

  // 先頭の「本文へ移る」
  await page.keyboard.press("Tab");
  expect(await focused(page)).toEqual({ tag: "A", text: "本文へ移る" });

  await tabTo(page, "メモを追加");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/notes/new");
  await expect.poll(() => focused(page)).toEqual({ tag: "H1", text: "メモを追加" });

  await page.keyboard.press("Tab");
  await page.keyboard.type("キーボードのメモ");
  await page.keyboard.press("Tab");
  await page.keyboard.type("本文");
  await tabTo(page, "追加");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/notes");
  await expect.poll(() => focused(page)).toEqual({ tag: "H1", text: "メモ" });

  await tabTo(page, "キーボードのメモ");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect.poll(() => focused(page)).toEqual({ tag: "H1", text: "メモの編集" });

  // 確かめの枠：開くとキャンセル、Esc で閉じると開いたボタンへ戻る
  await tabTo(page, "削除");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "メモを削除しますか" });
  await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "削除" })).toBeFocused();

  // もう一度開き、枠の中の「削除」で消す
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "削除" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/notes");
  await expect.poll(() => focused(page)).toEqual({ tag: "H1", text: "メモ" });
});
