// Threads の運用（threads-012）：外部メディアの掲載文で、宣伝の元の情報・タイトルのほかの案・保存すると外す内容（その場の見せ方）・
// 保存していない変更の確かめを使う。両方の幅で axe・CSP・横のスクロールを確かめる。
// ログインは account の試験用のログイン。運用アカウントと宣伝は API で作り、掲載文の画面を直に開く（ほかの画面の流れに頼らない）。
// Threads のアプリは、始めに運営者として「公開」にし、終わりに「切」に戻す（threads.spec.ts と同じ）。
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

/**
 * ログインし、運用アカウントとイベントの情報つきの宣伝を API で作る。
 * @param page Playwright の画面
 * @param tag 幅ごとに変える印（LINE のユーザー ID を前の回と見分ける）
 * @returns 運用アカウントの ID と宣伝の ID
 */
async function setUp(page: Page, tag: string): Promise<{ accountId: string; promotionId: string }> {
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: "掲載の確かめ" },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  const account = await page.request.post("/api/v1/threads/accounts", {
    data: { name: "掲載部" },
    headers: ORIGIN,
  });
  expect(account.status()).toBe(201);
  const accountId = ((await account.json()) as { id: string }).id;
  const year = new Date().getFullYear() + 1;
  const promotion = await page.request.post(`/api/v1/threads/accounts/${accountId}/promotions`, {
    headers: ORIGIN,
    data: {
      title: "IT交流会",
      content: "ゆるく繋がる会です。",
      targetLocation: "",
      targetPersona: "",
      targetAgeRange: "",
      cta: "",
      linkedUrl: "",
      priority: 0,
      status: "active",
      validUntil: null,
      event: {
        startAt: `${year}-11-25T20:00`,
        endAt: `${year}-11-25T22:00`,
        format: "venue",
        venueName: "会議室A",
        prefecture: "東京都",
        address: "台東区上野4-1-8",
        building: null,
        station: "御徒町駅 徒歩3分",
        capacity: 25,
        feeYen: 3000,
        feeNote: null,
        cancelPolicy: null,
        audience: null,
        organizer: null,
      },
    },
  });
  expect(promotion.status()).toBe(201);
  const promotionId = ((await promotion.json()) as { id: string }).id;
  return { accountId, promotionId };
}

test("掲載文で、元の情報・タイトルのほかの案・外す内容・保存していない変更を確かめる（threads-012）", async ({
  page,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const { accountId, promotionId } = await setUp(
    page,
    testInfo.project.name === "mobile" ? "c06" : "c05",
  );
  await page.goto(`/threads/accounts/${accountId}/media/${promotionId}/peatix`);
  await expect(page.getByRole("heading", { level: 1, name: "Peatixの掲載文" })).toBeVisible();
  await page.getByRole("button", { name: "掲載文を作る" }).click();

  // 宣伝の元の情報（変わらない）
  const source = page.getByRole("complementary", { name: "宣伝の元の情報（変わりません）" });
  await expect(source.getByText("IT交流会", { exact: true })).toBeVisible();
  await expect(source.getByText("会議室A（御徒町駅 徒歩3分）")).toBeVisible();
  await expect(source.getByText("25名・3,000円")).toBeVisible();
  // 作ったばかりの掲載文には、保存すると外す内容はない
  await expect(page.getByRole("heading", { name: /保存すると外す内容/ })).toHaveCount(0);
  await checkPage(page, "掲載文（元の情報）");

  // タイトルのほかの案を押すと入れ替わる
  const title = page.getByRole("textbox", { name: /^イベント名/ });
  const before = await title.inputValue();
  const candidates = page.getByRole("list", { name: "「イベント名」のほかの案" });
  const candidate = candidates.getByRole("button").first();
  const alternative = (await candidate.textContent()) ?? "";
  expect(alternative).not.toBe(before);
  await candidate.click();
  await expect(title).toHaveValue(alternative);
  await expect(candidate).toHaveAttribute("aria-pressed", "true");

  // 本文に LINE の行を足すと、保存の前に「保存すると外す内容」が出る
  const body = page.getByRole("textbox", { name: /^イベントの詳細/ });
  await body.fill(`${await body.inputValue()}\nLINEで連絡ください`);
  await expect(page.getByRole("heading", { name: "保存すると外す内容（1件）" })).toBeVisible();
  await expect(page.getByText("「LINEで連絡ください」を外します", { exact: false })).toBeVisible();
  await checkPage(page, "掲載文（外す内容）");

  // 保存せずに離れようとすると確かめる → 残る
  await page.getByRole("link", { name: "外部メディアの一覧へ" }).click();
  const leave = page.getByRole("alertdialog", { name: "保存していない変更があります" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "この画面に残る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Peatixの掲載文" })).toBeVisible();
  await expect(title).toHaveValue(alternative);

  // 保存すると外れ、離れても確かめない
  await page.getByRole("button", { name: "掲載文を保存" }).click();
  await expect(
    page.getByText("掲載文を保存しました（ルールに合わない行は外しました）。"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /保存すると外す内容/ })).toHaveCount(0);
  await expect(body).not.toHaveValue(/LINEで連絡ください/);
  await page.getByRole("link", { name: "外部メディアの一覧へ" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "外部メディア" })).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
});
