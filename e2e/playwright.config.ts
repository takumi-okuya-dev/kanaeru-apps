// 通しのテスト（Playwright）。
// 画面は先に vite build しておき（ルートの pnpm e2e）、API と画面の vite preview を webServer で立ち上げる。
// DB は E2E 専用の名前（<DB名>_e2e）。Chromium で、パソコンの幅（1440px）とスマホの幅（375px）の2つ。
// テストは DB を空にしてから始めるので、1つずつ順に流す（workers: 1）。
import { defineConfig, devices } from "@playwright/test";
import { E2E_API_PORT, E2E_ENV, E2E_WEB_URL } from "./env.ts";

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
      // DB の変更を当てて（DB がなければ作って）から API を立ち上げる。
      // API は本番と同じ NODE_ENV=production で動かす（ふるまいは設定の値で決め、NODE_ENV に頼らない）
      command: "pnpm --filter api db:migrate && pnpm --filter api exec tsx src/index.ts",
      cwd: "..",
      env: { ...E2E_ENV, NODE_ENV: "production" },
      // API は API_HOST（既定 127.0.0.1）だけで受け付ける
      url: `http://127.0.0.1:${E2E_API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter web preview",
      cwd: "..",
      env: E2E_ENV,
      url: E2E_WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
