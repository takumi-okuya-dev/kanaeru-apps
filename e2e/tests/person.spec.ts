// 人物メモ（person-001）：ログインしていなければ「ログインしていません」。試験用のログインで、人を足し（フルネームが空なら欄のそばに誤り）、
// 人のメモで書き足し、一覧で探し（URL に言葉が載らない）、会った場を作って続けて足し、前に足した人を付ける。
// 一覧・人を足す・人のメモ・会った場の一覧・会った場の画面を、両方の幅で axe（WCAG 2.2 AA）・CSP・横のスクロールで確かめる。
// 人物メモのアプリは、台帳に行がない間は運営者だけに見える（AD-16）。始めに運営者として「公開」にし、終わりに E2E の初めの状態（「切」。apps/api/test/e2e-server.ts）に戻す。
// DB は消さない（LINE のユーザー ID に幅と時刻を入れて、前の回と見分ける）。名前と話したことは、どれも架空のもの。
import { expect, test } from "@playwright/test";
import type { APIRequest, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

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
 * 運営者として、人物メモのアプリの公開の状態を変える。
 * @param requests 要求の入れ物を作る道具（Playwright の request）
 * @param visibility 公開の状態
 */
async function setPersonVisibility(requests: APIRequest, visibility: "off" | "public") {
  const request = await requests.newContext({ baseURL: E2E_WEB_URL });
  try {
    const login = await request.post("/api/v1/auth/test-login", {
      data: { lineUserId: E2E_ORGANIZER_LINE_USER_ID, displayName: "E2E の運営者" },
      headers: ORIGIN,
    });
    expect(login.status()).toBe(200);
    const response = await request.put("/api/v1/suite/app-settings/person", {
      data: { visibility },
      headers: ORIGIN,
    });
    expect(response.status()).toBe(200);
  } finally {
    await request.dispose();
  }
}

test.beforeAll(async ({ playwright }) => {
  await setPersonVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setPersonVisibility(playwright.request, "off");
});

test("ログインしていなければ、人物メモは「ログインしていません」を出す", async ({ page }) => {
  const readCspViolations = await collectCspViolations(page);
  await page.goto("/person");
  await expect(page.getByRole("heading", { level: 1, name: "ログインしていません" })).toBeVisible();
  await checkPage(page, "人物メモ（未ログイン）");
  expect(await readCspViolations()).toEqual([]);
});

test("人を足して書き足し、探し、会った場で続けて足す", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "e2" : "e1";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `人物メモを使う人（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);

  // 一覧（空）
  await page.goto("/person");
  await expect(page.getByRole("heading", { level: 1, name: "人物メモ" })).toBeVisible();
  await expect(page.getByText("このメモを見られるのはあなただけです。")).toBeVisible();
  await expect(page.getByText(/まだだれもいません/u)).toBeVisible();
  await checkPage(page, "人物メモの一覧（空）");

  // 人を足す（フルネームが空なら欄のそばに誤り）
  await page.getByRole("link", { name: "人を足す" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "人を足す" })).toBeVisible();
  await expect(
    page.getByText("病気・信条など、相手が知られたくないことは書かないでください。"),
  ).toBeVisible();
  await checkPage(page, "人を足す");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("フルネームを入れてください。")).toBeVisible();
  await page.getByRole("textbox", { name: /フルネーム/u }).fill("田中 太郎");
  await page.getByRole("textbox", { name: /見た目の特徴/u }).fill("黒ぶちの眼鏡");
  await page
    .getByRole("textbox", { name: "話したこと", exact: true })
    .fill("Go のバックエンドの話");
  await page.getByRole("textbox", { name: "次に話したいこと" }).fill("転職の話");
  await page.getByRole("button", { name: "保存", exact: true }).click();

  // 人のメモ：話したことと次に話したいことが最初に出る。書き足す
  await expect(page.getByRole("heading", { level: 1, name: "田中 太郎" })).toBeVisible();
  await expect(page.getByText("Go のバックエンドの話")).toBeVisible();
  await checkPage(page, "人のメモ");
  await page.getByRole("textbox", { name: "書き足すこと" }).fill("次は勉強会で会う");
  await page.getByRole("button", { name: "書き足す" }).click();
  await expect(page.getByText("書き足しました。")).toBeVisible();
  await expect(page.getByText(/次は勉強会で会う/u).first()).toBeVisible();

  // 一覧で探す（当たった所に印。URL に言葉が載らない）
  await page.goto("/person");
  await expect(page.getByRole("link", { name: "田中 太郎" })).toBeVisible();
  await expect(page.getByText("黒ぶちの眼鏡")).toBeVisible();
  await page.getByRole("searchbox", { name: "探す言葉" }).fill("ｇｏ");
  await page.getByRole("button", { name: "探す", exact: true }).click();
  await expect(page.locator("mark", { hasText: "Go" })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
  expect(page.url()).not.toContain("go");
  await checkPage(page, "人物メモの検索の結果");

  // 会った場を作り、続けて足し、前に足した人を付ける
  await page.goto("/person/meetings");
  await expect(page.getByRole("heading", { level: 1, name: "会った場" })).toBeVisible();
  await checkPage(page, "会った場の一覧");
  await page.getByRole("textbox", { name: /会った場の名前/u }).fill("11月の AI 勉強会");
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "11月の AI 勉強会" })).toBeVisible();
  const form = page.getByRole("form", { name: "ここで会った人を足す" });
  await form.getByRole("textbox", { name: /フルネーム/u }).fill("鈴木 花子");
  await form.getByRole("button", { name: "保存して次の人へ" }).click();
  await expect(form.getByText(/鈴木 花子さんを足しました/u)).toBeVisible();
  await expect(form.getByRole("textbox", { name: /フルネーム/u })).toHaveValue("");
  const met = page.getByRole("list", { name: "ここで会った人" });
  await expect(met.getByRole("link", { name: "鈴木 花子" })).toBeVisible();
  await page
    .getByRole("combobox", { name: "前に足した人" })
    .selectOption({ label: "田中 太郎（黒ぶちの眼鏡）" });
  await page.getByRole("button", { name: "付ける" }).click();
  await expect(met.getByRole("link", { name: "田中 太郎" })).toBeVisible();
  await checkPage(page, "会った場");
  expect(await readCspViolations()).toEqual([]);
});
