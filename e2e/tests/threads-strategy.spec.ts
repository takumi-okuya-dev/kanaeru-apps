// Threads の運用の戦略（threads-012）：進みと「次におすすめ」・活動の軸を5問から AI と整理する（貼った答えを入れずに閉じるときの確かめ）・
// 欄ごとの文字数・壁打ちのすべて選ぶ／外す・保存していない変更の守り（離れる前の確かめ・変更を捨てる）・ほかの画面で先に保存されたときの上書き・
// #field-<キー> で開いたらその項目へ移る。両方の幅で axe・CSP・横のスクロールを確かめる。
// ログインは account の試験用のログイン。運用アカウントは API で作る。Threads のアプリは始めに運営者として「公開」にし、終わりに「切」に戻す。
import { expect, test } from "@playwright/test";
import type { APIRequest, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";
import { clickNavLink } from "../helpers/nav.ts";

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
 * 試験用のログインをして、運用アカウントを API で作る。
 * @param page Playwright の画面
 * @param tag 前の回と見分ける印
 * @param name 運用アカウントの名前
 * @returns 運用アカウントの ID
 */
async function loginWithAccount(page: Page, tag: string, name: string): Promise<string> {
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `${name}の確かめ` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  const created = await page.request.post("/api/v1/threads/accounts", {
    data: { name },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

test.beforeAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "off");
});

test("戦略の進み・活動の軸・変更の守り・上書き（threads-012）", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const mobile = testInfo.project.name === "mobile";
  const accountId = await loginWithAccount(page, mobile ? "c08" : "c07", "戦略部");
  const strategyPath = `/threads/accounts/${accountId}/strategy`;

  // 進み：はじめは何も書けていない。「次におすすめ」で Q1 の欄へ移る
  await page.goto(strategyPath);
  await expect(page.getByRole("heading", { level: 1, name: "戦略" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "進み" })).toBeVisible();
  await expect(page.getByText("まだ保存していません")).toBeVisible();
  // 区分のタブ（上に固定。1区分ずつ見せる。threads-017）
  await expect(
    page.getByRole("navigation", { name: "区分" }).getByRole("button", { name: "目的 0/5" }),
  ).toHaveAttribute("aria-current", "true");
  await checkPage(page, "戦略（進み）");
  await page.getByRole("button", { name: /^次におすすめ：Q1/ }).click();
  const q1 = page.getByRole("textbox", { name: /Q1：なぜ、この活動を始めようと思いましたか？/ });
  await expect(q1).toBeFocused();

  // 活動の軸：5問のどれかに答えるまでは押せない
  const axisButton = page.getByRole("button", { name: "5問から AI と整理する" });
  await expect(axisButton).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("先に Q1〜Q5 のどれかに答えてください。")).toBeVisible();
  await q1.fill("上京して、話せる人がいなかったから。");
  await expect(page.getByText("18／2,000文字")).toBeVisible();
  await expect(axisButton).not.toHaveAttribute("aria-disabled", "true");
  await axisButton.click();
  let dialog = page.getByRole("dialog", { name: "活動の軸を5問から AI と整理する" });
  await expect(dialog.getByRole("textbox", { name: "活動の軸を考えるプロンプト" })).toHaveValue(
    /上京して/,
  );
  await dialog
    .getByRole("textbox", { name: /AI の答え/ })
    .fill("案2にします。\n【完成版ここから】\n人と人をつなぐ場を作る\n【完成版ここまで】");
  await checkPage(page, "活動の軸の枠");
  await dialog.getByRole("button", { name: "この項目に入れる" }).click();
  await expect(page.getByRole("textbox", { name: /活動の軸/ })).toHaveValue(
    "人と人をつなぐ場を作る",
  );

  // 貼った答えを入れずに閉じるときは確かめる
  await axisButton.click();
  dialog = page.getByRole("dialog", { name: "活動の軸を5問から AI と整理する" });
  await dialog.getByRole("textbox", { name: /AI の答え/ }).fill("まだ考え中");
  await dialog.getByRole("button", { name: "やめる" }).click();
  const discardAnswer = page.getByRole("alertdialog", { name: "貼った AI の答えを捨てますか" });
  await expect(discardAnswer).toBeVisible();
  await discardAnswer.getByRole("button", { name: "捨てて閉じる" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 区分の「AI と考える」：すべて選ぶ・すべて外すと「n件中m件」。入れると枠が閉じる（threads-017）
  await page.getByRole("button", { name: "AI と考える（目的）" }).click();
  const think = page.getByRole("dialog", { name: "AI と考える（目的）" });
  await think
    .getByRole("textbox", { name: /AI の答え/ })
    .fill(
      "【項目：Q2】\n人の役に立つ自分でいたい。\n【項目ここまで】\n【項目：Q3】\n気軽に話せる仲間ができてほしい。\n【項目ここまで】",
    );
  await expect(think.getByText("2件中2件を選んでいます")).toBeVisible();
  await think.getByRole("button", { name: "すべて外す" }).click();
  await expect(think.getByText("2件中0件を選んでいます")).toBeVisible();
  await think.getByRole("button", { name: "すべて選ぶ" }).click();
  await expect(think.getByText("2件中2件を選んでいます")).toBeVisible();
  await checkPage(page, "AI と考える（目的）");
  await think.getByRole("button", { name: "選んだ項目に入れる" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /Q2：この活動を通して/ })).toHaveValue(
    "人の役に立つ自分でいたい。",
  );

  // 保存していない変更があるまま離れようとすると確かめる
  await expect(page.getByText("保存していない変更があります")).toBeVisible();
  await clickNavLink(page, "設定");
  const leave = page.getByRole("alertdialog", { name: "保存していない変更があります" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "この画面に残る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "戦略" })).toBeVisible();

  // 保存する
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("戦略を保存しました。")).toBeVisible();
  await expect(page.getByText(/最後に保存：/)).toBeVisible();
  await expect(page.getByText("保存済み")).toBeVisible();

  // 変更を捨てる：最後に保存した内容に戻る（「その他」の区分を開く。threads-017）
  await page
    .getByRole("navigation", { name: "区分" })
    .getByRole("button", { name: /^その他 / })
    .click();
  const differentiation = page.getByRole("textbox", { name: /競合・他アカウントとの違い/ });
  await differentiation.fill("実際に会える場がある");
  await page.getByRole("button", { name: "変更を捨てる" }).click();
  const discard = page.getByRole("alertdialog", { name: "保存していない変更を捨てますか" });
  await discard.getByRole("button", { name: "変更を捨てる" }).click();
  await expect(differentiation).toHaveValue("");

  // 保存の誤りの欄へ移ったあとも、ほかの区分へ切り替えられる（threads-017）
  await differentiation.fill("あ".repeat(2001));
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(differentiation).toBeFocused();
  await page
    .getByRole("navigation", { name: "区分" })
    .getByRole("button", { name: /^目的 / })
    .click();
  await expect(page.getByRole("heading", { level: 2, name: "活動の目的・在り方" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "区分" })
    .getByRole("button", { name: /^その他 / })
    .click();
  await differentiation.fill("");

  // ほかの画面で先に保存された：上書きする
  const current = await page.request.get(`/api/v1/threads/accounts/${accountId}/strategy`);
  const {
    filledCount: _filled,
    total: _total,
    updatedAt: _updated,
    ...input
  } = (await current.json()) as Record<string, unknown>;
  const other = await page.request.put(`/api/v1/threads/accounts/${accountId}/strategy`, {
    data: { ...input, successMetrics: "ほかの画面で書いた" },
    headers: ORIGIN,
  });
  expect(other.status()).toBe(200);
  await differentiation.fill("実際に会える場がある");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const conflict = page.getByRole("dialog", { name: "ほかの画面で先に保存されました" });
  await expect(conflict).toBeVisible();
  await checkPage(page, "戦略（版が合わない）");
  await conflict.getByRole("button", { name: "上書きする" }).click();
  await expect(page.getByText("戦略を保存しました。")).toBeVisible();
  const overwritten = (await (
    await page.request.get(`/api/v1/threads/accounts/${accountId}/strategy`)
  ).json()) as { differentiation: string; successMetrics: string };
  expect(overwritten).toMatchObject({
    differentiation: "実際に会える場がある",
    successMetrics: "",
  });

  // #field-<キー> で開くと、その項目へ移る
  await page.goto("about:blank");
  await page.goto(`${strategyPath}#field-differentiation`);
  await expect(differentiation).toHaveValue("実際に会える場がある");
  await expect(differentiation).toBeFocused();

  expect(await readCspViolations()).toEqual([]);
});
