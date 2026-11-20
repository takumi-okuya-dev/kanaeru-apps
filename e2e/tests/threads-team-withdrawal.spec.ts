// 組織に入れた Threads の運用アカウントと退会（threads-013・suite-001。PRD 組織 5.7）：管理者が退会するとき、確かめの枠に
// 組織・引き継がれる記録（組織に入れた運用アカウント）・消える記録（個人の運用アカウント）を分けて出す。
// 組織の E2E（suite-organization.spec.ts）から、Threads に関わる分をここへ移した。
import { expect, test } from "@playwright/test";
import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
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

/**
 * 運営者として、Threads のアプリの公開の状態を変える（退会の確かめで、Threads の記録を出すため）。
 * @param browser ブラウザ
 * @param visibility 公開の状態
 */
async function setThreadsVisibility(browser: Browser, visibility: "off" | "public") {
  const context = await browser.newContext({ baseURL: E2E_WEB_URL });
  try {
    await login(context.request, E2E_ORGANIZER_LINE_USER_ID, "E2E の運営者");
    const response = await context.request.put("/api/v1/suite/app-settings/threads", {
      data: { visibility },
      headers: ORIGIN,
    });
    expect(response.status()).toBe(200);
  } finally {
    await context.close();
  }
}

test("管理者の退会の確かめに、組織・引き継がれる記録・消える記録を分けて出す", async ({
  page,
  browser,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "f2" : "f1";
  const adminName = `退会する山口${tag}`;
  const successorName = `残る佐藤${tag}`;
  await setThreadsVisibility(browser, "public");
  try {
    await login(page.request, uniqueLineUserId(`${tag}a`), adminName);
    // 窓口で用意する：組織を作って招き、運用アカウントを1つ組織に入れ、1つは個人のままにする
    const created = await page.request.post("/api/v1/suite/organizations", {
      data: { name: `パン屋の会${tag}` },
      headers: ORIGIN,
    });
    expect(created.status()).toBe(201);
    const { id: organizationId } = (await created.json()) as { id: string };
    const invite = await page.request.post(`/api/v1/suite/organizations/${organizationId}/invite`, {
      headers: ORIGIN,
    });
    const { token } = (await invite.json()) as { token: string };
    const successor = await openAs(browser, successorName, `${tag}b`);
    const joined = await successor.request.post(`/api/v1/suite/organization-invites/${token}`, {
      headers: ORIGIN,
    });
    expect(joined.status()).toBe(200);
    const placedAccount = await page.request.post("/api/v1/threads/accounts", {
      data: { name: `ベーカリー${tag}` },
      headers: ORIGIN,
    });
    expect(placedAccount.status()).toBe(201);
    const { id: placedId } = (await placedAccount.json()) as { id: string };
    const placement = await page.request.put(
      `/api/v1/threads/accounts/${placedId}/team/placement`,
      {
        data: { organizationId },
        headers: ORIGIN,
      },
    );
    expect(placement.status()).toBe(200);
    const personal = await page.request.post("/api/v1/threads/accounts", {
      data: { name: `個人の店${tag}` },
      headers: ORIGIN,
    });
    expect(personal.status()).toBe(201);

    // 設定 › アカウント → 退会する：枠に3つのまとまりと「元に戻せません」
    await page.goto("/settings/account");
    await page.getByRole("button", { name: "退会する" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("region", { name: "組織" })).toContainText(
      `${successorName}さんに引き継ぎます`,
    );
    await expect(dialog.getByRole("region", { name: "引き継がれる記録" })).toContainText(
      `ベーカリー${tag}`,
    );
    await expect(dialog.getByRole("region", { name: "消える記録" })).toContainText(
      `個人の店${tag}`,
    );
    await expect(dialog.getByText("元に戻せません。")).toBeVisible();
    await checkPage(page, "退会の確かめ");

    // 退会すると、残る人が管理者になる
    await dialog.getByRole("button", { name: "退会する" }).click();
    await expect(page).toHaveURL(/\/apps$/);
    const after = await successor.request.get("/api/v1/suite/organizations");
    const list = (await after.json()) as { organizations: { id: string; myRole: string }[] };
    expect(list.organizations.find((row) => row.id === organizationId)?.myRole).toBe("admin");
    expect(await readCspViolations()).toEqual([]);
    await successor.context().close();
  } finally {
    await setThreadsVisibility(browser, "off");
  }
});
