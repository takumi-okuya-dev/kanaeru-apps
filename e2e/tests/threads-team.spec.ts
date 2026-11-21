// Threads のチーム運用（threads-013・threads-016・suite-003。PRD 組織 5章）：組織の中のチームで、持ち主・管理者・編集者の3人で1つの運用アカウントを運用する。
// 組織を作る・招く・入る・編集者にするのは suite の窓口で用意し（画面は suite-organization.spec.ts が確かめる）、画面で次を通す：
// 管理者が設定 › 組織でチームを作り、持ち主と編集者を足す → 持ち主が設定の「チーム」で運用アカウントをチームに入れる →
// 管理者が Threads の組織の画面で編集者を担当にする →
// 編集者が「担当している運用アカウント」から開いて案をためる（承認はできない）→ 持ち主が承認を任せる → 編集者が承認する →
// 管理者が運用状況を見る（数と日付だけ。本文は出ない）→ 持ち主が退会する（確かめの枠に引き継がれる記録が出る）→
// 管理者が引き継いだ知らせを見て、運用アカウントは「接続し直しが要る」になっている。
// 人ごとに別のブラウザの入れ物を使う。どの画面も axe にかけ、横に動かないことと CSP の違反がないことを確かめる。
// Threads のアプリは、台帳に行がない間は運営者だけに見える（AD-16）。始めに運営者として「公開」にし、終わりに「切」に戻す。
import { expect, test } from "@playwright/test";
import type { APIRequest, APIRequestContext, Browser, Page } from "@playwright/test";
import { E2E_FAKE_THREADS_URL, E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** 編集者が貼る AI の答え（2件）。 */
const AI_ANSWER = [
  "仕事終わりの一杯で、今日の自分をねぎらおう。",
  "@@@",
  "新しい焼き菓子、週末から並びます。",
].join("\n");

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
 * 正規表現の特別な文字を、そのまま比べる形にする。
 * @param value 文字
 * @returns 正規表現の文字
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 1人分のブラウザの入れ物。 */
type Person = { page: Page; request: APIRequestContext; id: string; name: string };

/**
 * 別のブラウザの入れ物を作り、試験用のログインでセッションを作る。
 * @param browser ブラウザ
 * @param lineUserId LINE のユーザー ID
 * @param name 表示名
 * @returns 1人分
 */
async function openPerson(browser: Browser, lineUserId: string, name: string): Promise<Person> {
  const context = await browser.newContext({ baseURL: E2E_WEB_URL });
  const page = await context.newPage();
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: name },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  const { id } = (await login.json()) as { id: string };
  return { page, request: page.request, id, name };
}

test.beforeAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setThreadsVisibility(playwright.request, "off");
});

test("組織の中のチームで担当が案を作り、任された承認をし、管理者が運用状況を見て、退会で引き継ぐ（threads-013・threads-016）", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const tag = testInfo.project.name === "mobile" ? "d1" : "d0";
  const stamp = Date.now().toString(16);
  const lineId = (who: string) => `U${(tag + who + stamp).padStart(32, "0")}`;
  const admin = await openPerson(browser, lineId("a"), `田中（${testInfo.project.name}）`);
  const owner = await openPerson(browser, lineId("b"), `鈴木（${testInfo.project.name}）`);
  const editor = await openPerson(browser, lineId("c"), `佐藤（${testInfo.project.name}）`);
  const cspOfAdmin = await collectCspViolations(admin.page);
  const cspOfOwner = await collectCspViolations(owner.page);
  const cspOfEditor = await collectCspViolations(editor.page);

  // 用意（suite の窓口）：管理者が組織を作り、持ち主と編集者が招待から入り、管理者が編集者にする
  const organizationName = `飲食チーム${tag}${stamp.slice(-4)}`;
  const created = await admin.request.post("/api/v1/suite/organizations", {
    data: { name: organizationName },
    headers: ORIGIN,
  });
  expect(created.status()).toBe(201);
  const { id: organizationId } = (await created.json()) as { id: string };
  const invite = await admin.request.post(`/api/v1/suite/organizations/${organizationId}/invite`, {
    headers: ORIGIN,
  });
  const { token } = (await invite.json()) as { token: string };
  for (const person of [owner, editor]) {
    const joined = await person.request.post(`/api/v1/suite/organization-invites/${token}`, {
      headers: ORIGIN,
    });
    expect(joined.status()).toBe(200);
  }
  const promoted = await admin.request.put(
    `/api/v1/suite/organizations/${organizationId}/members/${editor.id}`,
    { data: { role: "editor" }, headers: ORIGIN },
  );
  expect(promoted.status()).toBe(204);

  // 持ち主の運用アカウント（偽の Threads につないでおく。退会の引き継ぎで接続が切れることを見るため）
  const accountName = `カフェB店${tag}`;
  const account = await owner.request.post("/api/v1/threads/accounts", {
    data: { name: accountName },
    headers: ORIGIN,
  });
  expect(account.status()).toBe(201);
  const { id: accountId } = (await account.json()) as { id: string };
  const threadsUserId = String(Date.now()) + (tag === "d0" ? "5" : "6");
  await owner.request.post(`${E2E_FAKE_THREADS_URL}/__control/users`, {
    data: { id: threadsUserId, username: `e2e_team_${tag}_${stamp}`, name: "E2E" },
  });
  const issued = await owner.request.post(`${E2E_FAKE_THREADS_URL}/__control/tokens`, {
    data: { userId: threadsUserId },
  });
  const { token: threadsToken } = (await issued.json()) as { token: string };
  const connected = await owner.request.post(`/api/v1/threads/accounts/${accountId}/connection`, {
    data: { token: threadsToken },
    headers: ORIGIN,
  });
  expect(connected.status()).toBe(200);

  // 管理者：設定 › 組織でチームを作り、持ち主と編集者を足す（suite-003）
  const teamName = "店舗A";
  await admin.page.goto(`/settings/organizations/${organizationId}`);
  await expect(admin.page.getByRole("heading", { level: 2, name: "チーム" })).toBeVisible();
  await admin.page.getByLabel(/新しいチームの名前/).fill(teamName);
  await admin.page.getByRole("button", { name: "チームを作る" }).click();
  await expect(
    admin.page.getByText(`チーム「${teamName}」を作りました。人を足してください。`),
  ).toBeVisible();
  for (const person of [owner, editor]) {
    await admin.page
      .getByLabel(`「${teamName}」に足す人`)
      .selectOption({ label: `${person.name}（${person === editor ? "編集者" : "メンバー"}）` });
    await admin.page.getByRole("button", { name: "チームに足す" }).click();
    await expect(
      admin.page.getByText(`${person.name}さんを「${teamName}」に足しました。`),
    ).toBeVisible();
  }
  const teamList = admin.page.getByRole("list", { name: `${teamName}の人` });
  await expect(teamList.getByRole("listitem")).toHaveCount(2);
  await checkPage(admin.page, "組織の画面のチーム（管理者）");

  // 持ち主：設定の「チーム」で、運用アカウントをチームに入れる（入れるときの説明が出る）
  await owner.page.goto(`/threads/accounts/${accountId}/settings`);
  await expect(owner.page.getByRole("heading", { level: 2, name: "チーム" })).toBeVisible();
  await expect(
    owner.page.getByText(/あなたが退会すると、この運用アカウントは組織の管理者に引き継がれます/),
  ).toBeVisible();
  await owner.page.getByLabel("入れるチーム").selectOption({ label: teamName });
  await owner.page.getByRole("button", { name: "チームを変える" }).click();
  await expect(
    owner.page.getByText(`組織「${organizationName}」のチーム「${teamName}」に入れました。`),
  ).toBeVisible();
  await expect(owner.page.getByRole("heading", { name: "このアカウントのチーム" })).toBeVisible();
  await checkPage(owner.page, "設定のチーム（持ち主）");

  // 管理者：Threads の組織の画面で、編集者を担当にする（持ち主の行は「自分」で選べない）
  await admin.page.goto(`/threads/organizations/${organizationId}`);
  await expect(admin.page.getByRole("heading", { level: 1, name: organizationName })).toBeVisible();
  await expect(admin.page.getByRole("heading", { level: 2, name: teamName })).toBeVisible();
  await expect(admin.page.getByRole("heading", { level: 3, name: accountName })).toBeVisible();
  const editorGroup = admin.page.getByRole("group", {
    name: new RegExp(`^${escapeRegExp(editor.name)}`),
  });
  // 押すと保存してから印が付く（保存の結果で描き直す）ので、click で押して結果を待つ
  await editorGroup.getByRole("checkbox", { name: accountName }).click();
  await expect(
    admin.page.getByText(`${editor.name}さんを「${accountName}」の担当にしました。`),
  ).toBeVisible();
  await checkPage(admin.page, "Threads の組織の画面（管理者）");

  // 編集者：一覧の「担当している運用アカウント」に出る（担当が付いた知らせも1回だけ出る）。案をためるが、承認はできない
  await editor.page.goto("/threads/accounts");
  await expect(editor.page.getByText(/の担当になりました/)).toBeVisible();
  const assigned = editor.page.getByRole("list", { name: "担当している運用アカウント" });
  await expect(assigned.getByRole("link", { name: accountName })).toBeVisible();
  await checkPage(editor.page, "アカウントの一覧（担当の人）");
  await editor.page.goto(`/threads/accounts/${accountId}/create`);
  await expect(editor.page.getByRole("heading", { level: 1, name: "案を作る" })).toBeVisible();
  await expect(editor.page.getByText(/変えるのは持ち主だけです/)).toBeVisible();
  await editor.page.getByRole("textbox", { name: /AI の答え/ }).fill(AI_ANSWER);
  await editor.page.getByRole("button", { name: "案をためる" }).click();
  await expect(editor.page.getByText("2件の案をためました。")).toBeVisible();
  await editor.page.goto(`/threads/accounts/${accountId}/stock`);
  await expect(editor.page.getByRole("heading", { level: 1, name: "投稿の案" })).toBeVisible();
  const editorCards = editor.page.locator('li[id^="threads-draft-card-"]');
  await expect(editorCards).toHaveCount(2);
  await expect(editorCards.first().getByText(`作った人：${editor.name}`)).toBeVisible();
  await expect(editorCards.first().getByRole("button", { name: "直す" })).toBeVisible();
  await expect(editor.page.getByRole("button", { name: "承認する" })).toHaveCount(0);
  await checkPage(editor.page, "投稿の案（承認を任されていない担当の人）");

  // 持ち主：設定で、編集者に承認を任せる
  await owner.page.reload();
  await owner.page.getByRole("checkbox", { name: `${editor.name}さんに承認を任せる` }).click();
  await expect(owner.page.getByText(`${editor.name}さんに承認を任せました。`)).toBeVisible();
  await expect(owner.page.getByText("承認を任されている")).toBeVisible();

  // 編集者：任されたので承認できる（NG ワードの確かめは持ち主と同じ）
  await editor.page.reload();
  await editorCards.first().getByRole("button", { name: "承認する" }).click();
  await expect(editor.page.getByRole("radio", { name: "承認済み（1）" })).toBeVisible();

  // 管理者：運用状況（数と日付だけ。本文は出ない）
  await admin.page.goto(`/threads/organizations/${organizationId}`);
  await admin.page.getByRole("link", { name: "運用状況を見る" }).click();
  await expect(admin.page.getByRole("heading", { level: 1, name: "運用状況" })).toBeVisible();
  const statusAccounts = admin.page.getByRole("list", { name: "運用アカウントの運用状況" });
  await expect(statusAccounts.getByRole("heading", { name: accountName })).toBeVisible();
  await expect(statusAccounts.getByText("1件").first()).toBeVisible();
  await expect(admin.page.getByText("仕事終わりの一杯で")).toHaveCount(0);
  await expect(admin.page.getByText("新しい焼き菓子")).toHaveCount(0);
  await checkPage(admin.page, "運用状況（管理者）");

  // 持ち主が「チームに見せる」にすると、担当でない管理者は投稿の案と戦略を読むだけで見られる（直す・承認は出ない）
  const shared = await owner.request.put(`/api/v1/threads/accounts/${accountId}/team/shared`, {
    data: { shared: true },
    headers: ORIGIN,
  });
  expect(shared.status()).toBe(200);
  await admin.page.goto(`/threads/organizations/${organizationId}`);
  await admin.page.getByRole("link", { name: "読むだけで見る" }).click();
  await expect(
    admin.page.getByText(
      new RegExp(`さんの運用アカウントを見ています（読むだけ）・${organizationName}`),
    ),
  ).toBeVisible();
  await expect(admin.page.getByText("新しい焼き菓子、週末から並びます。")).toBeVisible();
  await expect(admin.page.getByRole("button", { name: /承認|直す|消す/ })).toHaveCount(0);
  await checkPage(admin.page, "見せてもらっている運用アカウント（読むだけ）");

  await owner.page.goto("/settings/account");
  await owner.page.getByRole("button", { name: "退会する" }).click();
  const withdrawDialog = owner.page.getByRole("alertdialog");
  await expect(
    withdrawDialog.getByText(
      new RegExp(
        `「${accountName}」は、.*さん（組織「${organizationName}」の管理者）に引き継がれます`,
      ),
    ),
  ).toBeVisible();
  await withdrawDialog.getByRole("button", { name: "退会する" }).click();
  await expect(owner.page).toHaveURL(/\/apps$/);

  // 管理者：引き継いだ知らせが出て、運用アカウントは自分のもの（接続し直しが要る）
  await admin.page.goto("/threads/accounts");
  await expect(
    admin.page.getByText(new RegExp(`さんの退会で、「${accountName}」を引き継ぎました。`)),
  ).toBeVisible();
  const mine = admin.page.getByRole("list", { name: "アカウントの一覧" });
  const card = mine.getByRole("listitem").filter({ hasText: accountName });
  await expect(card.getByText("要再接続")).toBeVisible();
  await checkPage(admin.page, "アカウントの一覧（引き継いだ管理者）");

  expect(await cspOfAdmin()).toEqual([]);
  expect(await cspOfOwner()).toEqual([]);
  expect(await cspOfEditor()).toEqual([]);
});
