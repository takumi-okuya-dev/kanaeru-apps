// キーボードだけで使える（EXPERIENCE.md 5）：先頭の「本文へ移る」と、道が変わると h1 にフォーカスが移ること。
// 確かめの枠のフォーカスは packages/ui の部品のテストが確かめる。領域の画面を足したら、その流れをここに足す。
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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

test("キーボードだけで、本文へ移り、リンクで道を変えると h1 にフォーカスが移る", async ({
  page,
}) => {
  await page.goto("/no/such/page");

  // 先頭の「本文へ移る」
  await page.keyboard.press("Tab");
  expect(await focused(page)).toEqual({ tag: "A", text: "本文へ移る" });

  await tabTo(page, "はじめの画面へ戻る");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/");
  await expect.poll(() => focused(page)).toEqual({ tag: "H1", text: "ページが見つかりません" });
});
