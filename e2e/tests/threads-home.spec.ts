// Threads の運用のホームと切り替え（threads-012）：入口（/threads）は、まだ開いたアカウントがなければ一覧へ、開いたことがあれば
// 最後に開いたアカウントのホームへ移る。一覧の名前からホームへ移り、はじめに読んでほしいこと・未接続の帯・次にやること・
// 材料のカードを出す。ページの題の上の切り替えから別のアカウントへ移る。一覧の「登録済み n/上限件」。両方の幅で axe・CSP・
// 横のスクロールを確かめる。ログインは account の試験用のログイン。始めに運営者として Threads のアプリを「公開」にし、終わりに「切」に戻す。
import { expect, test } from "@playwright/test";
import type { APIRequest, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/**
 * 画面を確かめる（axe と横のスクロール）。
 * @param page Playwright の画面
 * @param label 画面の名前
 */
async function checkPage(page: Page, label: string): Promise<void> {
  await expectNoA11yViolations(page, label);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} が横に動きます`).toBeLessThanOrEqual(0);
}

/**
 * 運営者として、Threads のアプリの公開の状態を変える。
 * @param requests 要求の入れ物を作る道具（Playwright の request）
 * @param visibility 公開の状態
 */
async function setThreadsVisibility(
  requests: APIRequest,
  visibility: "off" | "public",
): Promise<void> {
  const request = await requests.newContext({ baseURL: E2E_WEB_URL });
  try {
    const login = await request.post("/api/v1/auth/test-login", {
      data: { lineUserId: E2E_ORGANIZER_LINE_USER_ID, displayName: "E2E の運営者" },
      headers: ORIGIN,
    });
    expect(login.status()).toBe(200);
    const response = await request.put("/api/v1/suite/app-settings/threads", {
      data: { visibility },
      headers: ORIGIN,
    });
    expect(response.status()).toBe(200);
  } finally {
    await request.dispose();
  }
}

test.beforeAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "off");
});

test("ホームで次にやることを見て、切り替えで別のアカウントへ移る（threads-012）", async ({
  page,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "c02" : "c01";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `ホームの確かめ（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  for (const name of ["ホーム部", "切り替え部"]) {
    const created = await page.request.post("/api/v1/threads/accounts", {
      data: { name },
      headers: ORIGIN,
    });
    expect(created.status()).toBe(201);
  }

  // 入口：まだ開いたアカウントがないので一覧へ。1つ以上あるので「登録済み 2/10件」
  await page.goto("/threads");
  await expect(page.getByRole("heading", { level: 1, name: "Threads のアカウント" })).toBeVisible();
  await expect(page.getByText("登録済み 2/10件")).toBeVisible();
  await expect(page.getByText("未接続").first()).toBeVisible();

  // 一覧の名前からホームへ
  await page.getByRole("link", { name: "ホーム部" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ホーム" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "はじめに読んでほしいこと" })).toBeVisible();
  await expect(page.getByText("SNS の運用は地道です。", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Threads への接続" })).toContainText("未接続");
  await expect(page.getByRole("heading", { name: "まずは「戦略」から埋めましょう" })).toBeVisible();
  const materials = page.getByRole("navigation", { name: "投稿の材料" });
  await expect(materials.getByRole("link", { name: /戦略\s*0\/\d+ 入力済み/ })).toBeVisible();
  await expect(materials.getByRole("link", { name: /宣伝の対象 0件/ })).toBeVisible();
  await expect(materials.getByRole("link", { name: /参考の投稿 0件/ })).toBeVisible();
  await checkPage(page, "ホーム");

  // はじめに読んでほしいこと：閉じると見出しだけになり、開き直すまで閉じたまま
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByText("SNS の運用は地道です。", { exact: false })).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "ホーム" })).toBeVisible();
  await expect(page.getByRole("button", { name: "開く" })).toBeVisible();
  await page.getByRole("button", { name: "開く" }).click();
  await expect(page.getByText("SNS の運用は地道です。", { exact: false })).toBeVisible();

  // 次にやることのボタンで戦略へ（切り替えはどの画面にも出る）
  await page.getByRole("link", { name: "戦略を書く" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "戦略" })).toBeVisible();

  // 切り替え：別のアカウント（未接続・承認待ち 0件）へ
  await page.getByRole("button", { name: /^アカウント ホーム部\s*（切り替える）/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /ホーム部.*表示中/ })).toBeVisible();
  const other = menu.getByRole("menuitem", { name: /切り替え部/ });
  await expect(other).toContainText("未接続");
  await expect(other).toContainText("承認待ち 0件");
  await expect(menu.getByRole("menuitem", { name: "アカウントを作る" })).toBeVisible();
  // 開いたことを API に知らせ終えてから、入口の行き先を確かめる
  const opened = page.waitForResponse((response) => response.url().endsWith("/open"));
  await other.click();
  expect((await opened).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "ホーム" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^アカウント 切り替え部\s*（切り替える）/ }),
  ).toBeVisible();
  await checkPage(page, "ホーム（切り替えたあと）");

  // 入口：最後に開いたアカウントのホームへ
  await page.goto("/threads");
  await expect(page.getByRole("heading", { level: 1, name: "ホーム" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^アカウント 切り替え部\s*（切り替える）/ }),
  ).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
});
