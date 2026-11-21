// Threads の設定の画面で、上のタブから区分を開く（threads-019。設定は1区分ずつ見せる）。
import type { Page } from "@playwright/test";

/**
 * 設定の区分を開く。
 * @param page Playwright の画面
 * @param name 区分の名前（接続・自動投稿・投稿のルール・メンション・チーム・記録・アカウント）
 */
export async function openSettingsTab(page: Page, name: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "設定の区分" })
    .getByRole("button", { name, exact: true })
    .click();
}
