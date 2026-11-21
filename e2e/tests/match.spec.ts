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

/** 当日の E2E の名簿（上級5人・中級4人・初級2人・入門2人。架空の名前）。 */
const DAY_PLAYERS = [
  ["a1", "青木", "advanced"],
  ["a2", "石田", "advanced"],
  ["a3", "上田", "advanced"],
  ["a4", "江口", "advanced"],
  ["a5", "大野", "advanced"],
  ["b1", "加納", "intermediate"],
  ["b2", "菊池", "intermediate"],
  ["b3", "久保", "intermediate"],
  ["b4", "小松", "intermediate"],
  ["c1", "佐野", "beginner"],
  ["c2", "柴田", "beginner"],
  ["d1", "須藤", "novice"],
  ["d2", "関口", "novice"],
] as const;

test("当日：人を選んで直す・分け方を変える・大きく映す・担当の端末を受け取る（match-003）", async ({
  page,
  browser,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "d2" : "d1";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const deviceA = `d-e2e-${tag}-device-a`;
  await page.addInitScript((id) => {
    window.localStorage.setItem("kanaeru.match.deviceId", id);
  }, deviceA);
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `当日の運営（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  // 試合表と名簿は窓口で作る（この端末が担当）
  const created = await page.request.post("/api/v1/match/tables", {
    data: { name: "12/20(日) 練習会", playDate: "2026-12-20", deviceId: deviceA },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const table = (await created.json()) as {
    id: string;
    version: number;
    content: { settings: Record<string, unknown> };
  };
  const saved = await page.request.put(`/api/v1/match/tables/${table.id}`, {
    data: {
      deviceId: deviceA,
      baseVersion: table.version,
      changeId: crypto.randomUUID(),
      seed: 11,
      content: {
        settings: table.content.settings,
        players: DAY_PLAYERS.map(([id, nickname, level]) => ({
          id,
          nickname,
          level,
          status: "present",
        })),
        plan: [],
      },
    },
    headers: ORIGIN,
  });
  expect(saved.status()).toBe(200);

  // 組む → 上級の第1試合にチェック
  await page.goto(`/match/tables/${table.id}`);
  await page.getByRole("button", { name: "試合表を作る" }).click();
  await waitSaved(page);
  const advanced = page.getByRole("table", { name: "上級の試合表" });
  await advanced.getByRole("checkbox", { name: "第1試合を終えた" }).check();
  await waitSaved(page);
  await expect(
    page.getByRole("status").filter({ hasText: /この端末（端末 .+）が担当です/u }),
  ).toBeVisible();

  // M2 人を選んで直す：青木さんが帰る → 上級のこれからの試合だけを組み直す（第1試合は残る）
  await page.getByRole("button", { name: "人を選んで直す" }).click();
  const attendance = page.getByRole("dialog", { name: "人を選んで直す" });
  await attendance.getByRole("combobox", { name: "人" }).selectOption({ label: "青木（来る）" });
  await expect(attendance.getByRole("button", { name: "来なかった" })).toBeVisible();
  await checkPage(page, "人を選んで直す");
  await attendance.getByRole("button", { name: "帰る" }).click();
  await waitSaved(page);
  await expect(
    page.getByText(/組み直しました。青木：帰る（上級の第\d試合から組み直しました）/u),
  ).toBeVisible();
  await expect(advanced.getByRole("checkbox", { name: "第1試合を終えた" })).toBeChecked();
  await expect(page.getByText(/帰った 1人/u)).toBeVisible();

  // レベルの分け方：初級と入門（2人ずつで組めない）を一緒にする。何が変わるかを先に出す
  await page.getByRole("button", { name: "レベルの分け方" }).click();
  const regroup = page.getByRole("dialog", { name: "レベルの分け方と試合の形" });
  await regroup.getByRole("radio", { name: "上級・中級・初級＆入門" }).click();
  await expect(regroup.getByText("上級・中級の試合は、そのまま残します。")).toBeVisible();
  await checkPage(page, "レベルの分け方");
  await regroup.getByRole("button", { name: "変えて組み直す" }).click();
  await waitSaved(page);
  await expect(page.getByRole("tab", { name: /初級＆入門/u })).toBeVisible();
  await expect(advanced.getByRole("checkbox", { name: "第1試合を終えた" })).toBeChecked();
  await checkPage(page, "試合表（当日）");

  // M3 大きく映す：上級の今（第2試合）と次（第3試合）
  await page.getByRole("link", { name: "大きく映す" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "12/20(日) 練習会" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "今・第2試合" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "次・第3試合" })).toBeVisible();
  await page.getByRole("tab", { name: /初級＆入門/u }).click();
  await expect(page.getByRole("listitem", { name: "今・第1試合" })).toBeVisible();
  await checkPage(page, "大きく映す");
  await page.getByRole("link", { name: "戻る" }).click();
  await expect(page.getByRole("table", { name: "上級の試合表" })).toBeVisible();

  // 担当の受け渡し（AD-28）：別の端末（同じ人のログイン・別の端末の ID）は見るだけで、確かめてから受け取る
  const otherContext = await browser.newContext({
    baseURL: E2E_WEB_URL,
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    await otherContext.addCookies(await page.context().cookies());
    const other = await otherContext.newPage();
    await other.goto(`/match/tables/${table.id}/board`);
    await expect(other.getByText("この端末は見るだけです。", { exact: false })).toBeVisible();
    await expect(other.getByText(/今の担当：端末 .+（この端末は 端末 .+）/u)).toBeVisible();
    await expect(other.getByRole("button", { name: "人を選んで直す" })).toHaveCount(0);
    await checkPage(other, "試合表（見るだけの端末）");
    await other.getByRole("button", { name: "この端末で直す" }).click();
    await other.getByRole("alertdialog").getByRole("button", { name: "この端末で直す" }).click();
    await expect(
      other.getByRole("status").filter({ hasText: /この端末（端末 .+）が担当です/u }),
    ).toBeVisible();

    // 前の担当の端末は、次に送ると「保存できませんでした」になり、見るだけになる
    await page
      .getByRole("table", { name: "上級の試合表" })
      .getByRole("checkbox", { name: "第2試合を終えた" })
      .check();
    await expect(page.getByText(/保存できませんでした。この端末は担当の端末でない/u)).toBeVisible();
    await expect(page.getByText("この端末は見るだけです。", { exact: false })).toBeVisible();
  } finally {
    await otherContext.close();
  }
  expect(await readCspViolations()).toEqual([]);
});
