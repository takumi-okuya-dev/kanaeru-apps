// Threads の運用の設定（threads-012）：規約への備えを読む・投稿できるかを確かめる（直近24時間の投稿の数）・
// 自動投稿を保存したあとの次の投稿の案内・アカウントを消すときは名前を入れる。両方の幅で axe・CSP・横のスクロールを確かめる。
// ログインは account の試験用のログイン。DB は消さない（LINE のユーザー ID に幅と時刻を入れて、前の回と見分ける）。
// Threads のアプリは、台帳に行がない間は運営者だけに見える（AD-16）。始めに運営者として「公開」にし、終わりに「切」に戻す。
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

test.beforeAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "off");
});

test("設定：規約への備え・投稿できるかの確かめ・保存のあとの案内・名前を入れて消す（threads-012）", async ({
  page,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "c0a" : "c09";
  const stamp = Date.now().toString(16);
  const lineUserId = `U${(tag + stamp).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `設定の確かめ（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  const created = await page.request.post("/api/v1/threads/accounts", {
    data: { name: "設定部" },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  // 規約への備え：読むだけの枠
  await page.goto(`/threads/accounts/${id}/settings`);
  await expect(page.getByRole("heading", { level: 1, name: "設定" })).toBeVisible();
  await page.getByRole("button", { name: "規約への備えを見る" }).click();
  const policy = page.getByRole("dialog", { name: "Threads の規約への備え" });
  await expect(policy.getByText("プロンプトに入れるルール")).toBeVisible();
  await expect(policy.getByText("見返りでの反応集め")).toBeVisible();
  await checkPage(page, "規約への備え");
  await policy.getByRole("button", { name: "閉じる" }).click();
  await expect(policy).toBeHidden();

  // 未接続：確かめると、つなぐと確かめられると出す
  await page.getByRole("button", { name: "投稿できるかを確かめる" }).click();
  await expect(page.getByText("Threads につなぐと確かめられます。")).toBeVisible();

  // 偽の Threads につなぐ
  const threadsUserId = String(Date.now()) + (tag === "c09" ? "3" : "4");
  const username = `e2e_${tag}_${stamp}`;
  await page.request.post(`${E2E_FAKE_THREADS_URL}/__control/users`, {
    data: { id: threadsUserId, username, name: "E2E" },
  });
  const issued = await page.request.post(`${E2E_FAKE_THREADS_URL}/__control/tokens`, {
    data: { userId: threadsUserId },
  });
  const { token } = (await issued.json()) as { token: string };
  const connected = await page.request.post(`/api/v1/threads/accounts/${id}/connection`, {
    data: { token },
    headers: ORIGIN,
  });
  expect(connected.status()).toBe(200);
  await page.reload();

  // 投稿できる：直近24時間の投稿の数を出す
  await page.getByRole("button", { name: "投稿できるかを確かめる" }).click();
  await expect(page.getByText("投稿できる状態です（直近24時間の投稿 0/250件）。")).toBeVisible();

  // 自動投稿をオンで保存すると、承認済みの案を用意するよう添える
  await page.getByRole("checkbox", { name: "自動投稿をオンにする" }).check();
  await page.getByLabel("1つ目の時刻", { exact: true }).fill("12:00");
  await page.getByRole("button", { name: "自動投稿の設定を保存" }).click();
  await expect(
    page.getByText("自動投稿をオンにしました（1日1回）。承認済みの案を用意してください。"),
  ).toBeVisible();
  await checkPage(page, "設定（確かめと保存のあと）");

  // 消す：名前が違えば欄のそばに誤り。合えば消して一覧へ
  await page.getByRole("button", { name: "このアカウントを消す" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("「設定部」を消します")).toBeVisible();
  await confirm.getByRole("button", { name: "削除", exact: true }).click();
  await expect(confirm.getByText("消すアカウントの名前を入れてください。")).toBeVisible();
  await confirm.getByRole("textbox", { name: /アカウントの名前を入れてください/ }).fill("違う");
  await confirm.getByRole("button", { name: "削除", exact: true }).click();
  await expect(confirm.getByText(/入れた名前がアカウントの名前と違います。/)).toBeVisible();
  await checkPage(page, "アカウントを消す確かめ");
  await confirm.getByRole("textbox", { name: /アカウントの名前を入れてください/ }).fill("設定部");
  await confirm.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.getByText("「設定部」を消しました。")).toBeVisible();
  expect((await page.request.get(`/api/v1/threads/accounts/${id}`)).status()).toBe(404);

  expect(await readCspViolations()).toEqual([]);
});
