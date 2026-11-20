// 外枠のナビの項目を押す（PC はサイドバー、スマホは下のタブバー）。
// スマホのタブバーは、項目が6つ以上なら最初の4つと「その他」だけを並べ、残りは「その他」を押すと出る下からの枠に入る（core-009）。
// 見えている項目があればそれを押し、なければ「その他」を開いてから押す。
import type { Page } from "@playwright/test";

/**
 * 外枠のナビの項目を押す。
 * @param page Playwright の画面
 * @param name 項目の名前
 * @param exact 名前をそのまま比べるか（既定は true）
 */
export async function clickNavLink(page: Page, name: string, exact = true): Promise<void> {
  const nav = page.getByRole("navigation", { name: "メイン" });
  const link = nav.getByRole("link", { name, exact });
  if ((await link.count()) > 0) {
    await link.first().click();
    return;
  }
  await nav.getByRole("button", { name: /その他/ }).click();
  await page
    .getByRole("dialog", { name: "その他のメニュー" })
    .getByRole("link", { name, exact })
    .click();
}
