// スイートの組織（suite-001。PRD 組織 4章・構成の決めごと AD-22）：設定で組織を作り、招待のリンクを別の人が開いて入り、
// 役割を切り替え、管理者を引き継いで抜ける（退会の確かめに Threads の引き継ぎを出す通しは e2e/tests/threads-team.spec.ts）。
// どの画面も axe にかけ、横に動かないことと、画面の CSP の違反がないことを確かめる。人ごとに別のブラウザの入れ物を使う。
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/**
 * この回だけの LINE のユーザー ID（U と16進の32文字）。
 * @param tag 見分け（16進の文字）
 * @returns LINE のユーザー ID
 */
function uniqueLineUserId(tag: string): string {
  return `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
}

/**
 * 試験用のログインでセッションを作る。
 * @param request 要求の道具
 * @param lineUserId LINE のユーザー ID
 * @param displayName 表示名
 */
async function login(
  request: APIRequestContext,
  lineUserId: string,
  displayName: string,
): Promise<void> {
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
  await login(page.request, uniqueLineUserId(tag), displayName);
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

test("組織を作って招き、役割を変え、管理者を引き継いで抜ける", async ({
  page,
  browser,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "e2" : "e1";
  const adminName = `管理者の田中${tag}`;
  const memberName = `カフェの鈴木${tag}`;
  const organizationName = `飲食チーム${tag}`;
  await login(page.request, uniqueLineUserId(`${tag}a`), adminName);

  // 設定 › 組織：名前が空なら欄のそばに誤り → 作ると組織の画面へ移り、知らせの帯
  await page.goto("/settings/organizations");
  await expect(page.getByRole("heading", { name: "組織", level: 1 })).toBeVisible();
  await checkPage(page, "組織の一覧");
  await page.getByRole("button", { name: "組織を作る" }).click();
  await expect(page.getByText("名前を入れてください。")).toBeVisible();
  await page.getByLabel("組織の名前").fill(organizationName);
  await page.getByRole("button", { name: "組織を作る" }).click();
  await expect(page).toHaveURL(/\/settings\/organizations\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: organizationName, level: 1 })).toBeVisible();
  await expect(page.getByText("組織を作りました。")).toBeVisible();
  const organizationUrl = page.url();

  // 招待のリンクを作る（リンクと QR に同じ URL）
  await page.getByRole("button", { name: "招待のリンクを作る" }).click();
  const linkText = (await page.getByTestId("organization-invite-link").textContent()) ?? "";
  expect(linkText).toMatch(/\/join\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole("img", { name: /招待のQR/ })).toHaveAttribute(
    "data-qr-value",
    linkText,
  );
  await checkPage(page, "組織の画面（管理者）");

  // 別の人がリンクを開き、説明を確かめて、メンバーとして入る
  const member = await openAs(browser, memberName, `${tag}b`);
  const readMemberCsp = await collectCspViolations(member);
  await member.goto(new URL(linkText).pathname);
  await expect(member.getByRole("heading", { name: "組織への招待" })).toBeVisible();
  await expect(member.getByText("メンバーとして入ります。")).toBeVisible();
  await expect(member.getByText(adminName)).toBeVisible();
  await expect(member.getByText("組織の人どうしで、表示名と役割が見えます。")).toBeVisible();
  await expect(member.getByText(/組織の管理者に引き継がれます/)).toBeVisible();
  await checkPage(member, "組織の招待");
  await member.getByRole("button", { name: "入る" }).click();
  await expect(member).toHaveURL(organizationUrl);
  await expect(member.getByText(`組織「${organizationName}」に入りました。`)).toBeVisible();
  await checkPage(member, "組織の画面（メンバー）");
  // 2回目に開いても入り直さず、組織の画面への入口を出す
  await member.goto(new URL(linkText).pathname);
  await expect(member.getByRole("heading", { name: "すでに入っています" })).toBeVisible();

  // 管理者：入った人に「新しい人」の印 → 編集者にする
  await page.reload();
  const memberRow = page.getByRole("listitem", { name: memberName });
  await expect(memberRow.getByText("新しい人")).toBeVisible();
  await memberRow.getByRole("button", { name: "編集者にする" }).click();
  await expect(memberRow.getByText(`${memberName}さんを編集者にしました。`)).toBeVisible();
  await expect(memberRow.getByText(/^編集者・/)).toBeVisible();

  // 管理者を引き継ぐ（前の管理者は編集者になる）
  await page.getByLabel("新しい管理者").selectOption({ index: 1 });
  await page.getByRole("button", { name: "管理者を引き継ぐ" }).click();
  const transfer = page.getByRole("alertdialog");
  await transfer.getByRole("button", { name: "引き継ぐ" }).click();
  await expect(
    page.getByText(/管理者を引き継ぎました。あなたは編集者になりました。/),
  ).toBeVisible();
  await expect(page.getByText("あなたの役割：編集者")).toBeVisible();

  // 抜ける（一覧へ移り、知らせの帯）
  await page.getByRole("button", { name: "組織を抜ける" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "抜ける" }).click();
  await expect(page).toHaveURL(/\/settings\/organizations$/);
  await expect(page.getByText(`組織「${organizationName}」を抜けました。`)).toBeVisible();

  // 新しい管理者はひとりになり、抜ける代わりに組織を消すよう案内される
  await member.goto(new URL(organizationUrl).pathname);
  await expect(member.getByText("あなたの役割：管理者")).toBeVisible();
  await expect(member.getByText(/ほかに誰もいないので、管理者を引き継げません/)).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
  expect(await readMemberCsp()).toEqual([]);
  await member.context().close();
});
