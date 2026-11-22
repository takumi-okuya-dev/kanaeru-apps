// 試合表（match-002）：試合表を作り、フォームの回答を貼り付けて名簿を作り、設定を選んで組み、試合表を見て進め、印刷の版を見る。
// シングルスにすると2列になる。ログインしていなければ「ログインしてください」。両方の幅で axe・CSP・横のスクロールを確かめる。
// 試合表の道は LIFF を始めない（core-013）。ログインは account の試験用のログイン（クッキー）。名前はどれも架空のもの。
// 試合表のアプリは、台帳に行がない間は運営者だけに見える（AD-16）。始めに運営者として「公開」にし、終わりに「切」に戻す。
import { expect, test } from "@playwright/test";
import type { APIRequest, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** 架空の名簿（4つのレベルに4人ずつ。1人は空白なしの氏名・1人は同じ姓）。 */
const PEOPLE = [
  ["高橋 拓真", "1上級"],
  ["佐藤 美咲", "1上級"],
  ["佐藤 健司", "1上級"],
  ["伊藤 結衣", "1上級"],
  ["渡辺 颯太", "2中級"],
  ["山本 彩", "2中級"],
  ["中村 蓮", "2中級"],
  ["小林 葵", "2中級"],
  ["林優斗", "3初級"],
  ["清水 陽菜", "3初級"],
  ["木村 大翔", "3初級"],
  ["山口 結菜", "3初級"],
  ["橋本 湊", "4入門"],
  ["森 凛", "4入門"],
  ["池田 樹", "4入門"],
  ["石川 海", "4入門"],
] as const;

/** スプレッドシートからコピーした形（タブ区切り。メール・ラケット・要望の列つき）。 */
const PASTED = [
  "タイムスタンプ\tメールアドレス\t氏名\tバドミントンのレベル\tラケットの有無\tその他の要望",
  ...PEOPLE.map(
    ([name, level], index) =>
      `2026/11/01 10:${String(index).padStart(2, "0")}:00\tp${index}@example.com\t${name}\t${level}\tあり\t`,
  ),
].join("\n");

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
 * 保存が終わるのを待つ（「保存しています…」が消える）。
 * @param page Playwright の画面
 */
async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByText("保存しています…")).toHaveCount(0);
  await expect(page.getByText("保存できませんでした")).toHaveCount(0);
}

/**
 * 運営者として、試合表のアプリの公開の状態を変える。
 * @param requests 要求の入れ物を作る道具（Playwright の request）
 * @param visibility 公開の状態
 */
async function setMatchVisibility(requests: APIRequest, visibility: "off" | "public") {
  const request = await requests.newContext({ baseURL: E2E_WEB_URL });
  try {
    const login = await request.post("/api/v1/auth/test-login", {
      data: { lineUserId: E2E_ORGANIZER_LINE_USER_ID, displayName: "E2E の運営者" },
      headers: ORIGIN,
    });
    expect(login.status()).toBe(200);
    const response = await request.put("/api/v1/suite/app-settings/match", {
      data: { visibility },
      headers: ORIGIN,
    });
    expect(response.status()).toBe(200);
  } finally {
    await request.dispose();
  }
}

test.beforeAll(async ({ playwright }) => {
  await setMatchVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setMatchVisibility(playwright.request, "off");
});

test("ログインしていなければ、試合表の一覧は「ログインしてください」を出す", async ({ page }) => {
  const readCspViolations = await collectCspViolations(page);
  await page.goto("/match");
  await expect(page.getByRole("heading", { level: 1, name: "ログインしてください" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ログインする" })).toHaveAttribute(
    "href",
    "/settings/account",
  );
  await checkPage(page, "試合表（未ログイン）");
  expect(await readCspViolations()).toEqual([]);
});

test("貼り付けた名簿から試合表を作り、進めて、印刷の版を見る", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "c2" : "c1";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `試合表の運営（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);

  // M0 一覧（空）→ 作る（名前が空なら欄のそばに誤り）→ 名簿と設定へ
  await page.goto("/match");
  await expect(page.getByRole("heading", { level: 1, name: "試合表" })).toBeVisible();
  await expect(page.getByText("まだ試合表はありません。")).toBeVisible();
  await checkPage(page, "試合表の一覧（空）");
  await page.getByRole("link", { name: "試合表を作る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "試合表を作る" })).toBeVisible();
  await checkPage(page, "試合表を作る");
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByText("試合表の名前を入れてください。")).toBeVisible();
  await page.getByRole("textbox", { name: /試合表の名前/ }).fill("12/13(日) 練習会");
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "12/13(日) 練習会" })).toBeVisible();
  await expect(page.getByText("まだ名簿はありません。")).toBeVisible();

  // M1 フォームから貼り付ける：氏名とレベルだけを読み、呼び名は姓（同じ姓は名の1字・空白なしは印）
  await page.getByRole("button", { name: "フォームから貼り付ける" }).click();
  const dialog = page.getByRole("dialog", { name: "フォームの回答を貼り付ける" });
  await dialog.getByRole("textbox", { name: "貼り付ける表" }).fill(PASTED);
  await dialog.getByRole("button", { name: "名簿に入れる" }).click();
  await expect(page.getByText("16人を名簿に入れました。")).toBeVisible();
  await waitSaved(page);
  await expect(page.getByRole("textbox", { name: "佐藤美の呼び名" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "佐藤健の呼び名" })).toBeVisible();
  await expect(page.getByText("姓と名の間に空白がありません")).toBeVisible();
  await expect(page.getByText("p0@example.com")).toHaveCount(0);
  await expect(page.getByText("16人", { exact: true })).toBeVisible();
  await checkPage(page, "名簿と設定");

  // 1人のレベルと当日の印を直す（森さんは来ない → 入門は3人で組めない）
  await page.getByRole("combobox", { name: "森の当日" }).selectOption("absent");
  await waitSaved(page);
  await expect(page.getByText(/3人（4人に足りないので組めません/u)).toBeVisible();
  await page.getByRole("radio", { name: "上級・中級・初級＆入門" }).click();
  await waitSaved(page);
  await expect(page.getByText("7人・8試合")).toBeVisible();

  // 試合表を作る → M2 試合表（上級・中級・初級＆入門のタブ。1行に4人・見出しなし）
  await page.getByRole("button", { name: "試合表を作る" }).click();
  await expect(page.getByText("試合表を作りました。")).toBeVisible();
  await waitSaved(page);
  await expect(page.getByRole("tab", { name: /上級/u })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /初級＆入門/u })).toBeVisible();
  const board = page.getByRole("table", { name: "上級の試合表" });
  await expect(board.getByRole("row")).toHaveCount(8);
  await expect(board.getByRole("row").first().getByRole("cell")).toHaveCount(6);
  await expect(board.getByRole("columnheader")).toHaveCount(0);
  await checkPage(page, "試合表（ダブルス）");

  // 第1試合にチェックを付けると、第2試合が今になる。読み直しても残る
  await board.getByRole("checkbox", { name: "第1試合を終えた" }).check();
  await waitSaved(page);
  await expect(page.getByRole("tab", { name: /上級/u })).toContainText("第2試合");
  await page.reload();
  await expect(
    page
      .getByRole("table", { name: "上級の試合表" })
      .getByRole("checkbox", { name: "第1試合を終えた" }),
  ).toBeChecked();
  await page.getByRole("tab", { name: /中級/u }).click();
  await expect(page.getByRole("table", { name: "中級の試合表" }).getByRole("row")).toHaveCount(8);

  // M5・R1 印刷：組ごとに1枚・紙と向きを選ぶ・刷る組を外す
  await page.getByRole("link", { name: "印刷" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "印刷" })).toBeVisible();
  await expect(page.getByRole("button", { name: "3枚を印刷する（A3 縦）" })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(3);
  await page.getByRole("radio", { name: "A4" }).click();
  await page.getByRole("radio", { name: "横" }).click();
  await page.getByRole("checkbox", { name: "初級＆入門" }).uncheck();
  await expect(page.getByRole("button", { name: "2枚を印刷する（A4 横）" })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(2);
  await expect(page.getByRole("figure", { name: "上級の印刷の版" })).toContainText(
    "kanaeru で作った試合表",
  );
  await checkPage(page, "印刷");
  // 印刷では版だけを出し、版は紙（A4 横の刷る範囲）の大きさになる
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { level: 1, name: "印刷" })).toBeHidden();
  const sheet = await page.locator("[data-match-sheets] [data-paper]").first().boundingBox();
  expect(sheet?.width ?? 0).toBeGreaterThan(1000);
  await page.emulateMedia({ media: "screen" });

  // M6 シングルス：試合の形を変えると合わない試合を外す（確かめる）→ 作り直すと、名前は2列
  await page.goto(page.url().replace(/\/print$/u, ""));
  await page.getByRole("radio", { name: "シングルス" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "変える" }).click();
  await waitSaved(page);
  await page.getByRole("button", { name: "試合表を作る" }).click();
  await waitSaved(page);
  const singles = page.getByRole("table", { name: "上級の試合表" });
  await expect(singles.getByRole("row").first().getByRole("cell")).toHaveCount(4);
  await checkPage(page, "試合表（シングルス）");

  // 一覧に出る
  await page.goto("/match");
  await expect(page.getByRole("link", { name: "12/13(日) 練習会" })).toBeVisible();
  expect(await readCspViolations()).toEqual([]);
});
