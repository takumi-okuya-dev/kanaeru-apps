// 予約の知らせ（booking-002。PRD 受付アプリの予約 4.6・構成の決めごと AD-24）：組織の管理者が設定の画面で LINE 公式アカウントの値を
// 入れ、偽の友だち追加の Webhook（署名つき）に返したあいさつのリンクから参加者が紐づけ、管理者が自分に確かめのメッセージを送る。
// E2E は APP_ENV=test なので本物の LINE には送らず、偽の送り手が覚えたものを開発の窓口から読む。どの画面も axe にかけ、
// 横に動かないことと、画面の CSP の違反がないことを確かめる。値はどれもテストだけの見本。
import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** 見本のチャネルシークレット（16進の32文字。決まった並びから作る）。 */
const CHANNEL_HEX = [..."0123456789abcdef", ..."fedcba9876543210"].join("");

/** 見本のチャネルアクセストークン。 */
const CHANNEL_ACCESS = `${"e2esample".repeat(6)}wxyz`;

/**
 * この回だけの16進の文字（ID の見分け）。
 * @param tag 見分け（16進の文字）
 * @returns 32文字の16進
 */
function uniqueHex(tag: string): string {
  return (tag + Date.now().toString(16)).padStart(32, "0").slice(-32);
}

/**
 * 試験用のログインでセッションを作る。
 * @param request 要求の道具
 * @param lineUserId LINE のユーザー ID
 * @param displayName 表示名
 */
async function login(request: APIRequestContext, lineUserId: string, displayName: string) {
  const response = await request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName },
    headers: ORIGIN,
  });
  expect(response.status()).toBe(200);
}

/**
 * 別の人のブラウザの入れ物を作り、ログインした画面を返す。
 * @param browser ブラウザ
 * @param displayName 表示名
 * @param tag LINE のユーザー ID の見分け
 * @returns 画面
 */
async function openAs(browser: Browser, displayName: string, tag: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: E2E_WEB_URL, locale: "ja-JP" });
  const page = await context.newPage();
  await login(page.request, `U${uniqueHex(tag)}`, displayName);
  return page;
}

/**
 * 今の画面を確かめる（アクセシビリティと、横に動かないこと）。
 * @param page Playwright の画面
 * @param label 失敗したときに出す、画面の名前
 */
async function checkPage(page: Page, label: string): Promise<void> {
  await expectNoA11yViolations(page, label);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} が横に動きます`).toBeLessThanOrEqual(0);
}

/**
 * LINE からの友だち追加・ブロックの Webhook を、署名を付けて送る（偽の LINE）。
 * @param request 要求の道具
 * @param webhookPath Webhook の道
 * @param type 種類
 * @param userId 公式アカウントから見える LINE のユーザー ID
 */
async function sendLineEvent(
  request: APIRequestContext,
  webhookPath: string,
  type: "follow" | "unfollow",
  userId: string,
): Promise<void> {
  const body = JSON.stringify({
    destination: `U${"f".repeat(32)}`,
    events: [
      {
        type,
        ...(type === "follow" ? { replyToken: `reply-${userId.slice(-6)}` } : {}),
        source: { type: "user", userId },
        timestamp: Date.now(),
        mode: "active",
      },
    ],
  });
  const signature = createHmac("sha256", CHANNEL_HEX).update(body).digest("base64");
  const response = await request.post(webhookPath, {
    data: body,
    headers: { "content-type": "application/json", "x-line-signature": signature },
  });
  expect(response.status()).toBe(200);
}

/**
 * 偽の送り手が最後に返したあいさつのリンクの道（開発の窓口から読む）。
 * @param request 要求の道具（ログインしたもの）
 * @returns 紐づけの画面の道
 */
async function lastGreetingPath(request: APIRequestContext): Promise<string> {
  const response = await request.get("/api/v1/booking/dev/notify-outbox");
  expect(response.status()).toBe(200);
  const { messages } = (await response.json()) as { messages: { method: string; text: string }[] };
  const greeting = messages.find((message) => message.method === "line_reply");
  const path = /\/line-link\/[A-Za-z0-9_-]+/.exec(greeting?.text ?? "")?.[0];
  expect(path, "あいさつに紐づけのリンクがありません").toBeTruthy();
  return path ?? "";
}

test("組織の管理者が公式アカウントを設定し、参加者が友だち追加のリンクから紐づけ、確かめのメッセージを送る（booking-002）", async ({
  page,
  browser,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "b2" : "b1";
  const organizationName = `知らせのチーム${tag}`;
  await login(page.request, `U${uniqueHex(`${tag}a`)}`, `管理者${tag}`);
  const created = await page.request.post("/api/v1/suite/organizations", {
    data: { name: organizationName },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);

  // 設定 › 予約の知らせ：個人の設定と、管理者の組織への入口
  await page.goto("/settings");
  await page.getByRole("link", { name: "予約の知らせ" }).first().click();
  await expect(page.getByRole("heading", { name: "予約の知らせ", level: 1 })).toBeVisible();
  await checkPage(page, "予約の知らせ（個人）");
  await page.getByRole("link", { name: `${organizationName}の設定を開く` }).click();
  await expect(
    page.getByRole("heading", { name: `予約の知らせ（${organizationName}）`, level: 1 }),
  ).toBeVisible();

  // 空で保存すると欄のそばに誤り → 3つ入れて保存すると、末尾だけと Webhook の URL が出る
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.getByText("チャネル ID を入れてください。")).toBeVisible();
  await checkPage(page, "予約の知らせ（組織・まだ設定なし）");
  await page.getByLabel(/^チャネル ID/).fill("1234567890");
  await page.getByLabel(/^チャネルシークレット/).fill(CHANNEL_HEX);
  await page.getByLabel(/^チャネルアクセストークン/).fill(CHANNEL_ACCESS);
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.getByText(`末尾 ${CHANNEL_HEX.slice(-4)}`)).toBeVisible();
  await expect(page.getByText("末尾 wxyz")).toBeVisible();
  await expect(page.getByText(CHANNEL_HEX)).toHaveCount(0);
  const webhookUrl =
    (await page.locator("code", { hasText: "/webhooks/line/" }).textContent()) ?? "";
  expect(webhookUrl).toMatch(/\/api\/v1\/booking\/webhooks\/line\/[0-9a-f-]{36}$/);
  const webhookPath = new URL(webhookUrl).pathname;
  await checkPage(page, "予約の知らせ（組織・設定あり）");

  // 参加者が友だち追加 → あいさつのリンクを開いて紐づける
  const participantLineUser = `U${uniqueHex(`${tag}c`)}`;
  await sendLineEvent(page.request, webhookPath, "follow", participantLineUser);
  const participantLink = await lastGreetingPath(page.request);
  const participant = await openAs(browser, `参加者${tag}`, `${tag}b`);
  const readParticipantCsp = await collectCspViolations(participant);
  await participant.goto(participantLink);
  await expect(participant.getByRole("heading", { name: "LINE の紐づけ", level: 1 })).toBeVisible();
  await expect(participant.getByText(`${organizationName}の LINE 公式アカウントと`)).toBeVisible();
  await checkPage(participant, "紐づけ");
  await participant.getByRole("button", { name: "紐づける" }).click();
  await expect(participant.getByRole("heading", { name: "紐づけました", level: 1 })).toBeVisible();
  await checkPage(participant, "紐づけました");
  // 同じリンクを開き直すと「もう紐づいています」
  await participant.reload();
  await expect(participant.getByRole("heading", { name: "もう紐づいています" })).toBeVisible();

  // 管理者も自分で友だち追加して紐づけ、確かめのメッセージを送る
  await sendLineEvent(page.request, webhookPath, "follow", `U${uniqueHex(`${tag}d`)}`);
  await page.goto(await lastGreetingPath(page.request));
  await page.getByRole("button", { name: "紐づける" }).click();
  await expect(page.getByRole("heading", { name: "紐づけました", level: 1 })).toBeVisible();
  await page.goto("/settings/reception/notify");
  await page.getByRole("link", { name: `${organizationName}の設定を開く` }).click();
  await expect(page.getByText("2人")).toBeVisible();
  await expect(page.getByText("あなたはこの公式アカウントと紐づいています。")).toBeVisible();
  await page.getByRole("button", { name: "自分に確かめのメッセージを送る" }).click();
  await expect(page.getByText(/確かめのメッセージを送りました/)).toBeVisible();
  await expect(page.getByText("1通")).toBeVisible();

  // 参加者がブロックすると、紐づいた人数が減る
  await sendLineEvent(page.request, webhookPath, "unfollow", participantLineUser);
  await page.reload();
  await expect(page.getByText("1人")).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
  expect(await readParticipantCsp()).toEqual([]);
  await participant.context().close();
});
