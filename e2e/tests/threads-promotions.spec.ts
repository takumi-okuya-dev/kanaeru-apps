// Threads の運用の宣伝（threads-012）：イベントの情報の欄（都道府県・住所・建物・参加費の説明・キャンセル・対象・主催）を入れて保存し、
// カードの優先度・属性・してほしいこと・URL を見て、カードのボタンで一時停止・宣伝中に戻す（宣伝の対象と対象外に分かれる）。
// 両方の幅で axe・CSP・横のスクロールを確かめる。
// Threads のアプリは、台帳に行がない間は運営者だけに見える（AD-16）。始めに運営者として「公開」にし、終わりに「切」に戻す。
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

test("宣伝にイベントの情報を入れ、カードから一時停止・宣伝中に戻す（threads-012）", async ({
  page,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "c04" : "c03";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `宣伝の確かめ（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  const created = await page.request.post("/api/v1/threads/accounts", {
    data: { name: "宣伝部" },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/threads/accounts/${id}/research`);
  await expect(page.getByRole("heading", { level: 1, name: "宣伝とリサーチ" })).toBeVisible();

  // 枠でイベントの情報の全部の欄を入れて保存する
  await page.getByRole("button", { name: "宣伝を足す" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /タイトル/ }).fill("12月の交流会");
  await dialog
    .getByRole("textbox", { name: /宣伝の内容/ })
    .fill("転職を考えている人の交流会です。");
  await dialog.getByRole("textbox", { name: /届けたい人/ }).fill("20代の会社員");
  await dialog.getByRole("textbox", { name: /してほしいこと/ }).fill("リンクから申し込む");
  await dialog.getByRole("textbox", { name: /リンクの URL/ }).fill("https://example.com/event");
  await dialog.getByRole("textbox", { name: /優先度/ }).fill("30");
  await dialog.getByRole("checkbox", { name: /イベントの情報を付ける/ }).check();
  const year = new Date().getFullYear() + 1;
  await dialog.getByLabel("始まり").fill(`${year}-12-05T19:00`);
  await dialog.getByRole("combobox", { name: "都道府県" }).selectOption("東京都");
  await dialog.getByRole("textbox", { name: /市区町村・番地/ }).fill("台東区上野4-1-8");
  await dialog.getByRole("textbox", { name: /建物・階/ }).fill("3階");
  await dialog.getByRole("textbox", { name: /参加費の説明/ }).fill("学生は1000円引き");
  await dialog.getByRole("textbox", { name: /キャンセルの決まり/ }).fill("前日までに連絡");
  await dialog.getByRole("textbox", { name: /対象者/ }).fill("初参加歓迎");
  await dialog.getByRole("textbox", { name: /主催者名/ }).fill("かなえる運営");
  await checkPage(page, "宣伝を足す枠（イベントの情報）");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("宣伝を足しました。")).toBeVisible();

  // 入れた欄は保存されている（外部メディアの掲載文の材料になる）
  const list = (await (
    await page.request.get(`/api/v1/threads/accounts/${id}/promotions`)
  ).json()) as { items: { event: Record<string, unknown> | null }[] };
  expect(list.items[0]?.event).toMatchObject({
    prefecture: "東京都",
    address: "台東区上野4-1-8",
    building: "3階",
    feeNote: "学生は1000円引き",
    cancelPolicy: "前日までに連絡",
    audience: "初参加歓迎",
    organizer: "かなえる運営",
  });

  // カード：宣伝の対象に並び、優先度・属性・してほしいこと・URL が出る
  const targetable = page.getByRole("list", { name: "宣伝の対象" });
  await expect(targetable.getByRole("heading", { name: "12月の交流会" })).toBeVisible();
  await expect(targetable.getByText("優先度 30")).toBeVisible();
  await expect(targetable.getByText("20代の会社員")).toBeVisible();
  await expect(targetable.getByText("してほしいこと：リンクから申し込む")).toBeVisible();
  await expect(targetable.getByRole("link", { name: /example\.com\/event/ })).toBeVisible();
  await checkPage(page, "宣伝とリサーチ（宣伝の対象）");

  // 一時停止にすると対象外に移り、宣伝中に戻すと対象に戻る
  await targetable.getByRole("button", { name: "一時停止" }).click();
  await expect(page.getByText("「12月の交流会」を一時停止にしました。")).toBeVisible();
  const others = page.getByRole("list", { name: "対象外の宣伝" });
  await expect(others.getByRole("heading", { name: "12月の交流会" })).toBeVisible();
  await expect(page.getByText("宣伝の対象（0件）")).toBeVisible();
  await checkPage(page, "宣伝とリサーチ（対象外）");
  await others.getByRole("button", { name: "宣伝中に戻す" }).click();
  await expect(page.getByText("「12月の交流会」を宣伝中に戻しました。")).toBeVisible();
  await expect(targetable.getByRole("heading", { name: "12月の交流会" })).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
});
