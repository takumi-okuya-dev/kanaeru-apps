// 利用規約とプライバシーポリシー（suite-002）：ログインせずに両方のページを開き、題・下書きの帯・運営者が埋める所の印・もう一方へのリンクを確かめる。
// 設定 › アカウントと、Threads の接続の欄（新しいタブ）からのリンクをたどる。両方の幅で axe・CSP・横のスクロールを確かめる。
// Threads のアプリは、台帳に行がない間は運営者だけに見える（AD-16）。始めに運営者として「公開」にし、終わりに「切」に戻す（threads.spec.ts と同じ）。
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

/**
 * この回だけの利用者で、試験用のログインをする。
 * @param page Playwright の画面
 * @param tag 見分けの印（16進）
 * @param name 表示名
 */
async function login(page: Page, tag: string, name: string): Promise<void> {
  const response = await page.request.post("/api/v1/auth/test-login", {
    data: {
      lineUserId: `U${(tag + Date.now().toString(16)).padStart(32, "0")}`,
      displayName: name,
    },
    headers: ORIGIN,
  });
  expect(response.status()).toBe(200);
}

test.beforeAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "off");
});

test("ログインせずに、利用規約とプライバシーポリシーを開く", async ({ page }) => {
  const readCspViolations = await collectCspViolations(page);

  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "利用規約" })).toBeVisible();
  await expect(page).toHaveTitle(/^利用規約｜/);
  await expect(page.getByRole("note", { name: "下書き（公開前）" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: /^\d+\. Threads のアプリ$/ }),
  ).toBeVisible();
  await expect(page.locator("mark[data-placeholder]").first()).toBeVisible();
  // ナビのない外枠（ログインしていないので、管理の入口やナビを出さない）
  await expect(page.getByRole("navigation", { name: "メイン" })).toHaveCount(0);
  await checkPage(page, "利用規約");

  // ほかのページへのリンクから、プライバシーポリシーへ
  await page
    .getByRole("navigation", { name: "ほかのページ" })
    .getByRole("link", { name: "プライバシーポリシー" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "プライバシーポリシー" })).toBeVisible();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("note", { name: "下書き（公開前）" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: /^\d+\. 組織の中で見えるもの$/ }),
  ).toBeVisible();
  await expect(page.getByText(/AES-256-GCM/).first()).toBeVisible();
  await checkPage(page, "プライバシーポリシー");

  // 直に開いても、ログインを求めない
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "プライバシーポリシー" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /ログイン/ })).toHaveCount(0);

  expect(await readCspViolations()).toEqual([]);
});

test("設定 › アカウントから、利用規約を開く", async ({ page }, testInfo) => {
  await login(page, testInfo.project.name === "mobile" ? "1e2" : "1e1", "規約の確かめ");
  await page.goto("/settings/account");
  const section = page.getByRole("region", { name: "規約とポリシー" });
  await expect(section).toBeVisible();
  await section.getByRole("link", { name: "利用規約" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "利用規約" })).toBeVisible();
  await expect(page).toHaveURL(/\/terms$/);
});

test("Threads の接続の欄から、利用規約とプライバシーポリシーを新しいタブで開く", async ({
  page,
  context,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  await login(page, testInfo.project.name === "mobile" ? "1e4" : "1e3", "規約のリンクの確かめ");
  const created = await page.request.post("/api/v1/threads/accounts", {
    data: { name: "規約のリンク" },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  await page.goto(`/threads/accounts/${id}/settings`);
  const connection = page.getByRole("region", { name: "Threads への接続" });
  await expect(connection).toBeVisible();
  await expect(connection.getByText(/どちらも新しいタブで開きます/)).toBeVisible();
  await checkPage(page, "設定（接続の欄と規約のリンク）");

  const [terms] = await Promise.all([
    context.waitForEvent("page"),
    connection.getByRole("link", { name: "利用規約" }).click(),
  ]);
  await expect(terms.getByRole("heading", { level: 1, name: "利用規約" })).toBeVisible();
  await expect(terms).toHaveURL(/\/terms$/);
  await terms.close();

  const [privacy] = await Promise.all([
    context.waitForEvent("page"),
    connection.getByRole("link", { name: "プライバシーポリシー" }).click(),
  ]);
  await expect(
    privacy.getByRole("heading", { level: 1, name: "プライバシーポリシー" }),
  ).toBeVisible();
  await privacy.close();

  // もとの画面（貼りかけのトークンの欄）は、そのまま残る
  await expect(page.getByLabel(/長期のアクセストークン/)).toBeVisible();
  expect(await readCspViolations()).toEqual([]);
});
