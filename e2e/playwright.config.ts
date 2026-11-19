// 通しのテスト（Playwright）。
// 画面は先に vite build しておき（ルートの pnpm e2e）、API を webServer で立ち上げる。API が組み立てた画面と /api を同じ源で返す（本番と同じ形）。
// DB は E2E 専用の名前（<DB名>_e2e）。Chromium で、パソコンの幅（1440px）とスマホの幅（375px）の2つ。
// テストは DB を空にしてから始めるので、1つずつ順に流す（workers: 1）。
import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_WEB_URL } from "./env.ts";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./playwright-report" }]],
  use: {
    baseURL: E2E_WEB_URL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: [
    {
      // DB の変更を当てて（DB がなければ作って）から、API を立ち上げる（組み立てた画面も API が返す）。
      // API は本番と同じ NODE_ENV=production で動かす（ふるまいは設定の値で決め、NODE_ENV に頼らない）。
      // 立ち上げは本番と同じ手順（src/server.ts）に、テストだけの見本のアプリを足したもの（apps/api/test/e2e-server.ts。core-005）
      command: "pnpm --filter api db:migrate && pnpm --filter api exec tsx test/e2e-server.ts",
      cwd: "..",
      env: { ...E2E_ENV, NODE_ENV: "production" },
      url: `${E2E_WEB_URL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
