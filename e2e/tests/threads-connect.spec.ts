// Threads への接続の案内（threads-012）：トークンの5つの手順と詳しい手順のページ・貼る前の形の確かめ・欄を隠す／表示・
// 自分の別の運用アカウントがつないでいるときの案内と切り替えの手順・Meta のアプリで許可する前の案内・確かめの失敗が続いたときの待ち。
// 両方の幅で axe・CSP・横のスクロールを確かめる。ログインは account の試験用のログイン（LINE のユーザー ID に幅と時刻を入れて見分ける）。
// Threads のアプリは、始めに運営者として「公開」にし、終わりに「切」に戻す（threads.spec.ts と同じ）。
import { expect, test } from "@playwright/test";
import type { APIRequest, Page } from "@playwright/test";
import { E2E_FAKE_THREADS_URL, E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
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
 * 運用アカウントを API で作る。
 * @param page Playwright の画面（ログインしたもの）
 * @param name 名前
 * @returns 運用アカウントの ID
 */
async function createAccount(page: Page, name: string): Promise<string> {
  const response = await page.request.post("/api/v1/threads/accounts", {
    data: { name },
    headers: ORIGIN,
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/**
 * 偽の Threads に利用者とトークンを作る。
 * @param page Playwright の画面
 * @param id Threads のユーザー ID
 * @param username ユーザー名
 * @returns トークン
 */
async function fakeToken(page: Page, id: string, username: string): Promise<string> {
  await page.request.post(`${E2E_FAKE_THREADS_URL}/__control/users`, {
    data: { id, username, name: "E2E" },
  });
  const issued = await page.request.post(`${E2E_FAKE_THREADS_URL}/__control/tokens`, {
    data: { userId: id },
  });
  return ((await issued.json()) as { token: string }).token;
}

test.beforeAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "off");
});

test("トークンの手順と案内を見て、つなぐ（threads-012）", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "c0c" : "c0b";
  const stamp = Date.now().toString(16);
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: {
      lineUserId: `U${(tag + stamp).padStart(32, "0")}`,
      displayName: `接続の案内の確かめ（${testInfo.project.name}）`,
    },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);

  // 1つ目の運用アカウントを、この回だけの Threads のアカウントにつないでおく
  const threadsUserId = `8${Date.now().toString()}${tag === "c0b" ? "1" : "2"}`;
  const username = `guide_${tag}_${stamp}`;
  const first = await createAccount(page, "案内の1つ目");
  const firstToken = await fakeToken(page, threadsUserId, username);
  const connected = await page.request.post(`/api/v1/threads/accounts/${first}/connection`, {
    data: { token: firstToken },
    headers: ORIGIN,
  });
  expect(connected.status()).toBe(200);
  const second = await createAccount(page, "案内の2つ目");

  // 設定：5つの手順・詳しい手順・Meta のアプリで許可する前の案内
  await page.goto(`/threads/accounts/${second}/settings`);
  await expect(page.getByRole("heading", { level: 2, name: "Threads への接続" })).toBeVisible();
  // 手順は「詳しく」の開け閉めの中（threads-017）
  await page.getByText("トークンの作り方（5つの手順）").click();
  await expect(page.getByText("下の欄に貼って「つなぐ」を押す")).toBeVisible();
  await expect(
    page.getByText("threads.com でログインしているアカウントで許可されます。"),
  ).toBeVisible();
  await page.getByText("違うアカウントが出たときは").click();
  await expect(page.getByText("・つなぎたいアカウントでログインし直す")).toBeVisible();
  const guideLink = page.getByRole("link", { name: /詳しい手順を見る/ });
  await expect(guideLink).toHaveAttribute("href", "/threads/guide/threads-token");
  await checkPage(page, "設定（接続の案内）");

  // 貼る前の形の確かめ（欄のそば）
  const field = page.getByLabel(/長期のアクセストークン/);
  await field.fill("abc");
  await page.getByRole("button", { name: "つなぐ", exact: true }).click();
  await expect(page.getByText(/トークンの形ではないようです。/)).toBeVisible();

  // 欄は隠したまま。「表示」で見え、「隠す」でまた隠れる
  await field.fill(firstToken);
  await expect(field).not.toHaveValue(firstToken);
  await page.getByRole("button", { name: "表示", exact: true }).click();
  await expect(field).toHaveValue(firstToken);
  await page.getByRole("button", { name: "隠す", exact: true }).click();
  await expect(field).not.toHaveValue(firstToken);

  // 自分の別の運用アカウントがつないでいる Threads のアカウント：一覧への案内と切り替えの手順
  await page.getByRole("button", { name: "つなぐ", exact: true }).click();
  await expect(page.getByText(/あなたの別の運用アカウントでつながっています/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "アカウントの一覧で、つないでいるアカウントを確かめる" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /threads.com を開く/ }).last()).toHaveAttribute(
    "href",
    "https://www.threads.com/",
  );
  await checkPage(page, "設定（自分の別のアカウントと重なった）");

  // 詳しい手順のページ
  await page.goto("/threads/guide/threads-token");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "自分の Meta のアプリで、Threads のトークンを作る",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "5. 長期のトークンを作る" }),
  ).toBeVisible();
  await checkPage(page, "トークンの作り方");

  expect(await readCspViolations()).toEqual([]);
});

test("確かめの失敗が続くと、待ちが終わるまでボタンを止める（threads-012）", async ({
  page,
}, testInfo) => {
  const tag = testInfo.project.name === "mobile" ? "c0e" : "c0d";
  const stamp = Date.now().toString(16);
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: {
      lineUserId: `U${(tag + stamp).padStart(32, "0")}`,
      displayName: `待ちの確かめ（${testInfo.project.name}）`,
    },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  const id = await createAccount(page, "待ちの確かめ");
  // 形は合うが使えないトークンで5回失敗する
  for (let index = 0; index < 5; index += 1) {
    const failed = await page.request.post(`/api/v1/threads/accounts/${id}/connection`, {
      data: { token: `INVALID${index}${"x".repeat(40)}` },
      headers: ORIGIN,
    });
    expect(failed.status()).toBe(400);
  }
  await page.goto(`/threads/accounts/${id}/settings`);
  await page.getByLabel(/長期のアクセストークン/).fill(`INVALID9${"x".repeat(40)}`);
  const button = page.getByRole("button", { name: "つなぐ", exact: true });
  await button.click();
  await expect(page.getByText(/少し止めています。/)).toBeVisible();
  await expect(page.getByText(/ごろから、また貼れます/)).toBeVisible();
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await checkPage(page, "設定（待っている間）");
});
