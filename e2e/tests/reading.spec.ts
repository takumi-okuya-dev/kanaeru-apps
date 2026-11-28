// 読書記録（reading-001）：ログインしていなければ「ログインしていません」。試験用のログインで、本を手で書いて足し（書名が空なら誤り）、
// GoodNotes の見本の PDF（架空の文）を端末の中で読んで確かめの画面から入れ、本の画面に章ごとに並ぶ。貼り付けで取りこみ、
// 同じ PDF を取りこみ直しても「新しいマーカー 0」。本棚・本を足す・取りこむ・確かめ・本の画面を、両方の幅で axe（WCAG 2.2 AA）・
// CSP（pdf.js の worker と CMap は自分のドメインから。CSP の違反がない）・横のスクロールで確かめる。
// 書誌の検索は外の API を呼ぶので、ここでは使わない（窓口の結合のテストで、出口を差しかえて確かめる）。
// 読書記録のアプリは、台帳に行がない間は運営者だけに見える（AD-16）。始めに運営者として「公開」にし、終わりに「切」に戻す。
// DB は消さない（LINE のユーザー ID に幅と時刻を入れて、前の回と見分ける）。書名とマーカーの文は、どれも架空のもの。
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { APIRequest, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** GoodNotes の見本の PDF（架空の文・マーカー3つ・テキストボックス1つ）。 */
const SAMPLE_PDF = fileURLToPath(
  new URL(
    "../../apps/web/src/features/reading/import/__fixtures__/goodnotes-sample.pdf",
    import.meta.url,
  ),
);

/**
 * ページが横に動かない（横のスクロールが出ない）ことを確かめる。
 * @param page Playwright の画面
 * @param label 失敗したときに出す、画面の名前
 */
async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} が横に動きます`).toBeLessThanOrEqual(0);
}

/**
 * 画面を確かめる（axe と横のスクロール）。
 * @param page Playwright の画面
 * @param label 画面の名前
 */
async function checkPage(page: Page, label: string): Promise<void> {
  await expectNoA11yViolations(page, label);
  await expectNoHorizontalScroll(page, label);
}

/**
 * 運営者として、読書記録のアプリの公開の状態を変える。
 * @param requests 要求の入れ物を作る道具（Playwright の request）
 * @param visibility 公開の状態
 */
async function setReadingVisibility(requests: APIRequest, visibility: "off" | "public") {
  const request = await requests.newContext({ baseURL: E2E_WEB_URL });
  try {
    const login = await request.post("/api/v1/auth/test-login", {
      data: { lineUserId: E2E_ORGANIZER_LINE_USER_ID, displayName: "E2E の運営者" },
      headers: ORIGIN,
    });
    expect(login.status()).toBe(200);
    const response = await request.put("/api/v1/suite/app-settings/reading", {
      data: { visibility },
      headers: ORIGIN,
    });
    expect(response.status()).toBe(200);
  } finally {
    await request.dispose();
  }
}

test.beforeAll(async ({ playwright }) => {
  await setReadingVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setReadingVisibility(playwright.request, "off");
});

test("ログインしていなければ、読書記録は「ログインしていません」を出す", async ({ page }) => {
  const readCspViolations = await collectCspViolations(page);
  await page.goto("/reading");
  await expect(page.getByRole("heading", { level: 1, name: "ログインしていません" })).toBeVisible();
  await checkPage(page, "読書記録（未ログイン）");
  expect(await readCspViolations()).toEqual([]);
});

test("本を足し、GoodNotes の PDF と貼り付けで取りこみ、本の画面で読み返す", async ({
  page,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "b2" : "b1";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `読書記録を使う人（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);

  // 本棚（空）
  await page.goto("/reading");
  await expect(page.getByRole("heading", { level: 1, name: "本棚" })).toBeVisible();
  await expect(page.getByText(/まだ本がありません/u)).toBeVisible();
  await checkPage(page, "本棚（空）");

  // 本を足す（書名が空なら誤り）
  await page.getByRole("link", { name: "本を足す" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "本を足す" })).toBeVisible();
  await checkPage(page, "本を足す");
  await page.getByRole("button", { name: "本棚に足す" }).click();
  await expect(page.getByText("書名を入れてください。")).toBeVisible();
  await page.getByRole("textbox", { name: /書名/u }).fill("見本の本");
  await page.getByRole("textbox", { name: "この本で分かりたいこと" }).fill("見本の仕組み");
  await page.getByRole("button", { name: "本棚に足す" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "見本の本" })).toBeVisible();
  await expect(page.getByText("見本の仕組み")).toBeVisible();

  // GoodNotes の見本の PDF を取りこむ（端末の中で読む）
  await page.goto("/reading/import");
  await expect(page.getByRole("heading", { level: 1, name: "取りこむ" })).toBeVisible();
  await checkPage(page, "取りこむ");
  await page.getByLabel("ファイルを選ぶ").setInputFiles(SAMPLE_PDF);
  await expect(page.getByRole("heading", { level: 1, name: "読み取りました" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/マーカー 3・コメント 1/u)).toBeVisible();
  await page.getByRole("combobox", { name: "本" }).selectOption({ label: "見本の本" });
  await expect(page.getByText(/新しいマーカー 3/u)).toBeVisible();
  await checkPage(page, "確かめてから入れる");
  await page.getByRole("button", { name: "入れる", exact: true }).click();

  // 本の画面：章ごとに並ぶ
  await expect(page.getByRole("heading", { level: 1, name: "見本の本" })).toBeVisible();
  await expect(page.getByRole("region").first()).toBeVisible();
  await checkPage(page, "本の画面");

  // 同じ PDF を取りこみ直すと、新しいマーカーは 0
  await page.goto("/reading/import");
  await page.getByLabel("ファイルを選ぶ").setInputFiles(SAMPLE_PDF);
  await expect(page.getByRole("heading", { level: 1, name: "読み取りました" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("combobox", { name: "本" }).selectOption({ label: "見本の本" });
  await expect(page.getByText(/新しいマーカー 0/u)).toBeVisible();
  await page.getByRole("link", { name: "やめる" }).click();

  // 貼り付けで取りこむ
  await page
    .getByRole("textbox", { name: "マーカーの文（1行に1つ）" })
    .fill("p.12 貼り付けた見本の文 // ? 分からない");
  await page.getByRole("button", { name: "確かめる" }).click();
  await page.getByRole("combobox", { name: "本" }).selectOption({ label: "見本の本" });
  await page.getByRole("button", { name: "入れる", exact: true }).click();
  await expect(page.getByText("貼り付けた見本の文")).toBeVisible();
  await expect(page.getByText("あとで調べる").first()).toBeVisible();

  // 本棚：マーカーの数
  await page.goto("/reading");
  await expect(page.getByRole("listitem", { name: "見本の本" })).toContainText("マーカー 4");
  await checkPage(page, "本棚");
  expect(await readCspViolations()).toEqual([]);
});
