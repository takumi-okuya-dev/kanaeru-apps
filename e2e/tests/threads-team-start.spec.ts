// Threads の画面から組織とチームを作る（threads-021）：組織がない人はチームの画面のフォームで組織とチームを作り、
// 自分の運用アカウントを入れてチームの画面へ移る。ホームと切り替えのメニューにチームの印が出る。管理者は一覧の「チームを足す」で
// チームを足せ、ほかのチームに入っている運用アカウントは既定では入れない。両方の幅で axe・CSP・横のスクロールを確かめる。
// ログインは account の試験用のログイン。始めに運営者として Threads のアプリを「公開」にし、終わりに「切」に戻す。
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

test("Threads の画面から組織とチームを作り、チームの印を切り替えとホームで見る（threads-021）", async ({
  page,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const mobile = testInfo.project.name === "mobile";
  const tag = mobile ? "c12" : "c11";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `チームの始め（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  const created = await page.request.post("/api/v1/threads/accounts", {
    data: { name: "スタート部" },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const { id: accountId } = (await created.json()) as { id: string };

  // 組織がない：チームの画面に、組織とチームを作るフォームが出る
  await page.goto("/threads/teams");
  await expect(page.getByRole("heading", { level: 2, name: "チームで運用する" })).toBeVisible();
  const accountBox = page.getByRole("checkbox", { name: "スタート部" });
  await expect(accountBox).toBeChecked();
  await checkPage(page, "チーム（組織を作る前）");
  // 組織の名前が空なら欄のそばに誤り
  await page.getByRole("button", { name: "組織とチームを作る" }).click();
  await expect(page.getByRole("textbox", { name: /組織の名前/ })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByRole("textbox", { name: /組織の名前/ }).fill(`始めの組織${tag}`);
  await page.getByRole("textbox", { name: /チームの名前/ }).fill("渋谷店");
  await page.getByRole("button", { name: "組織とチームを作る" }).click();

  // 作ったチームの画面へ（管理者なので運用状況から開く）。運用アカウントが入っている
  await expect(page.getByRole("heading", { level: 1, name: "渋谷店" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "見るもの" });
  await expect(tabs.getByRole("button", { name: "運用状況" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await tabs.getByRole("button", { name: /^運用アカウント/ }).click();
  await expect(page.getByRole("heading", { level: 3, name: "スタート部" })).toBeVisible();
  await expect(page.getByRole("link", { name: "人を招く・チームに分ける" })).toBeVisible();
  await checkPage(page, "作ったチームの画面");

  // ホームにチームの印。押すとチームの画面
  await page.goto(`/threads/accounts/${accountId}`);
  await expect(page.getByRole("heading", { level: 1, name: "ホーム" })).toBeVisible();
  await expect(page.getByRole("link", { name: "渋谷店" })).toBeVisible();
  // 切り替えのメニューにもチームの名前
  await page.getByRole("button", { name: /^アカウント スタート部\s*（切り替える）/ }).click();
  await expect(page.getByRole("menu").getByRole("menuitem", { name: /スタート部/ })).toContainText(
    "チーム：渋谷店",
  );
  await page.keyboard.press("Escape");
  await checkPage(page, "ホーム（チームの印）");

  // 一覧の「チームを足す」：もう入っている運用アカウントは、既定では入れない（黙って移さない）
  await page.goto("/threads/teams");
  await page.getByText("チームを足す").click();
  await page.getByRole("textbox", { name: /チームの名前/ }).fill("新宿店");
  await expect(page.getByRole("checkbox", { name: /スタート部/ })).not.toBeChecked();
  await expect(page.getByText("（今は「渋谷店」。入れると移ります）")).toBeVisible();
  await checkPage(page, "チームを足す");
  await page.getByRole("button", { name: "チームを作る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "新宿店" })).toBeVisible();
  const placements = (await (await page.request.get("/api/v1/threads/accounts")).json()) as {
    placements: { teamName: string }[];
  };
  expect(placements.placements.map((row) => row.teamName)).toEqual(["渋谷店"]);

  expect(await readCspViolations()).toEqual([]);
});
