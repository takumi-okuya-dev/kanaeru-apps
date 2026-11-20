// Threads の運用のリサーチ（threads-012）：参考の投稿を枠でためて2件まとめて足し（URL・反応の数・投稿者・メモ）、
// 「なぜ良いか：未入力」から直す枠を開いて1件の解説のプロンプトに反応の数が入るのを見て、手で書いた解説を保存する。
// キーワードを直し（同じものは欄のそばに誤り）、「Threads で検索」のリンクを確かめる。両方の幅で axe・CSP・横のスクロールを確かめる。
// ログインは account の試験用のログイン。Threads のアプリは始めに運営者として「公開」にし、終わりに「切」に戻す（threads.spec.ts と同じ）。
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

test("参考の投稿とキーワードを足して直す（threads-012）", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "c10" : "c0f";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `リサーチの直しの確かめ（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  const created = await page.request.post("/api/v1/threads/accounts", {
    data: { name: "リサーチ直し部" },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/threads/accounts/${id}/research`);
  await expect(page.getByRole("heading", { level: 1, name: "宣伝とリサーチ" })).toBeVisible();

  // 読み物は初めは閉じていて、開ける
  await page.getByRole("button", { name: /伸びる投稿を見つけるリサーチ/ }).click();
  await expect(page.getByRole("region", { name: "伸びる投稿を見つけるリサーチ" })).toBeVisible();

  // 参考の投稿：1件目をためて、2件目と一緒に足す
  await page.getByRole("button", { name: "参考の投稿を足す" }).click();
  const dialog = page.getByRole("dialog", { name: "参考の投稿を足す" });
  await dialog.getByRole("textbox", { name: /^本文/ }).fill("1件目：朝の通勤で考えたこと。");
  await dialog.getByRole("textbox", { name: /投稿の URL/ }).fill("threads.com/x");
  await dialog.getByRole("button", { name: /この投稿をためて/ }).click();
  await expect(dialog.getByText("http:// か https:// で始まる URL にしてください。")).toBeVisible();
  await dialog
    .getByRole("textbox", { name: /投稿の URL/ })
    .fill("https://www.threads.com/@someone/post/1");
  await dialog.getByRole("textbox", { name: /検索したキーワード/ }).fill("通勤");
  await dialog.getByRole("button", { name: /投稿の数字・投稿者を入れる/ }).click();
  await dialog.getByRole("textbox", { name: "閲覧数" }).fill("32000");
  await dialog.getByRole("textbox", { name: "いいね" }).fill("820");
  await dialog.getByRole("textbox", { name: /投稿者（アカウント名）/ }).fill("someone");
  await checkPage(page, "参考の投稿を足す枠");
  await dialog.getByRole("button", { name: /この投稿をためて/ }).click();
  await expect(dialog.getByRole("region", { name: "ためた投稿（1件）" })).toBeVisible();
  // キーワードは次の投稿に残る
  await expect(dialog.getByRole("textbox", { name: /検索したキーワード/ })).toHaveValue("通勤");
  await dialog.getByRole("textbox", { name: /^本文/ }).fill("2件目：帰り道の気づき。");
  await dialog.getByRole("button", { name: "2件を足す" }).click();
  await expect(page.getByText("参考の投稿を2件足しました。")).toBeVisible();
  await expect(page.getByText("閲覧 32,000・いいね 820")).toBeVisible();
  await expect(page.getByRole("link", { name: /投稿を開く/ })).toHaveAttribute(
    "href",
    "https://www.threads.com/@someone/post/1",
  );

  // 「なぜ良いか：未入力」から直す枠を開く。1件の解説のプロンプトに反応の数が入る
  const first = page.getByRole("listitem").filter({ hasText: "1件目：朝の通勤で考えたこと。" });
  await first.getByRole("button", { name: "なぜ良いか：未入力" }).click();
  const edit = page.getByRole("dialog", { name: "参考の投稿を直す" });
  await edit.getByRole("button", { name: "解説のプロンプトを作る" }).click();
  await expect(edit.getByRole("textbox", { name: /解説のプロンプト（1件）/ })).toHaveValue(
    /閲覧数: 32000 ／ いいね: 820/,
  );
  await edit.getByRole("textbox", { name: /AI の解説を貼る/ }).fill("通勤の場面で共感を取っている");
  await edit.getByRole("button", { name: "なぜ良いかに入れる" }).click();
  await expect(edit.getByRole("textbox", { name: /^なぜ良いか/ })).toHaveValue(
    "通勤の場面で共感を取っている",
  );
  await edit.getByRole("textbox", { name: /メモ/ }).fill("書き出しが気になった");
  await checkPage(page, "参考の投稿を直す枠");
  await edit.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("参考の投稿を保存しました。")).toBeVisible();
  await expect(first.getByText("なぜ良いか：通勤の場面で共感を取っている")).toBeVisible();
  await expect(first.getByText("解説あり")).toBeVisible();

  // キーワード：2つ足し、1つを直す（同じものは欄のそば）。Threads で検索のリンク
  await page.getByRole("textbox", { name: /足すキーワード/ }).fill("転職");
  await page.getByRole("button", { name: "キーワードを足す" }).click();
  await expect(page.getByText("「転職」を足しました。")).toBeVisible();
  await page.getByRole("textbox", { name: /足すキーワード/ }).fill("副業");
  await page.getByRole("button", { name: "キーワードを足す" }).click();
  await expect(page.getByText("「副業」を足しました。")).toBeVisible();
  await expect(page.getByRole("link", { name: /「副業」を Threads で検索/ })).toHaveAttribute(
    "href",
    "https://www.threads.com/search?q=%E5%89%AF%E6%A5%AD",
  );
  await page.getByRole("button", { name: "「副業」を直す" }).click();
  const keywordDialog = page.getByRole("dialog", { name: "キーワードを直す" });
  await keywordDialog.getByRole("textbox", { name: /^キーワード/ }).fill("転職");
  await keywordDialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(keywordDialog.getByText(/同じキーワードがあります。/)).toBeVisible();
  await keywordDialog.getByRole("textbox", { name: /^キーワード/ }).fill("副業 始め方");
  await keywordDialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("「副業 始め方」を保存しました。")).toBeVisible();
  await checkPage(page, "宣伝とリサーチ（直したあと）");

  expect(await readCspViolations()).toEqual([]);
});
