// Threads の運用（threads-001・002）：運用アカウントを作り、戦略を書き、NG ワードを足し、プロンプトを作って AI の答えを貼り、
// 案をためて承認・却下する（001。011：ためたのを取り消す・離れる前の確かめ・まとめて承認・まとめて消す・承認済みを直す）。偽の Threads につなぎ、自動投稿の時刻を決める（002）。反応の画面と CSV（003）。宣伝とリサーチ（004）。分析の設定（006）。時間差のメンション（007）。外部メディアの掲載文（008）。戦略のガイドと壁打ち（009）。Meta のアプリでの接続とデータの削除の状況（010）。両方の幅で axe・CSP・横のスクロールを確かめる。
// ログインは account の試験用のログイン。DB は消さない（LINE のユーザー ID に幅と時刻を入れて、前の回と見分ける）。
// Threads のアプリは、台帳に行がない間は運営者だけに見える（AD-16）。始めに運営者として「公開」にし、終わりに「切」に戻す（E2E の立ち上げと同じ状態。apps/api/test/e2e-server.ts）。
import { expect, test } from "@playwright/test";
import type { APIRequest, Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  E2E_FAKE_THREADS_URL,
  E2E_JOB_TRIGGER_SECRET,
  E2E_ORGANIZER_LINE_USER_ID,
  E2E_THREADS_APP_SECRET,
  E2E_WEB_URL,
} from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";
import { clickNavLink } from "../helpers/nav.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** 貼る AI の答え（3件。2件目は NG ワードを含む）。 */
const AI_ANSWER = [
  "朝の通勤電車で、今の仕事を続けていいのか考える日がある。",
  "@@@",
  "これは必ず儲かる副業です。",
  "@@@",
  "転職に迷ったら、まず自分の強みを3つ書き出してみよう。",
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

test("運用アカウントを作り、案をためて承認・却下する", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "b2" : "b1";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `Threads の確かめ（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);

  // 入口（まだ開いたアカウントがない）→ 一覧（空）→ 名前が空なら欄のそばに誤り → 作るとホームへ（threads-012）→ 戦略へ
  await page.goto("/threads");
  await expect(page.getByRole("heading", { level: 1, name: "Threads のアカウント" })).toBeVisible();
  await expect(page).toHaveURL(/\/threads\/accounts$/);
  await expect(page.getByText("まだアカウントはありません。")).toBeVisible();
  await checkPage(page, "アカウントの一覧（空）");
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByText("アカウントの名前を入れてください。")).toBeVisible();
  await page.getByRole("textbox", { name: /アカウントの名前/ }).fill("AI部");
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ホーム" })).toBeVisible();
  await expect(page.getByText("「AI部」を作りました（登録済み 1/10件）。")).toBeVisible();
  await clickNavLink(page, "戦略");
  await expect(page.getByRole("heading", { level: 1, name: "戦略" })).toBeVisible();
  await checkPage(page, "戦略");

  // 戦略：口調を選んで保存（区分は開け閉め。threads-017）
  await page
    .getByRole("navigation", { name: "区分" })
    .getByRole("button", { name: /^人柄 / })
    .click();
  await page.getByRole("radio", { name: "丁寧・温かい" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("戦略を保存しました。")).toBeVisible();

  // 設定：NG ワードを足す
  await clickNavLink(page, "設定");
  await expect(page.getByRole("heading", { level: 1, name: "設定" })).toBeVisible();
  await page.getByRole("textbox", { name: /足すNGワード/ }).fill("必ず儲かる");
  await page.getByRole("button", { name: "NGワードを足す" }).click();
  await expect(page.getByText("「必ず儲かる」を足しました。")).toBeVisible();
  await checkPage(page, "設定");

  // 案を作る：開くとプロンプトができ、答えを貼ると何件に分かれるかが出る
  await clickNavLink(page, "案を作る", false);
  await expect(page.getByRole("heading", { level: 1, name: "案を作る" })).toBeVisible();
  await expect(page.getByText(/NGワード 1個/)).toBeVisible();
  await page.getByText("プロンプトに入っている情報").click();
  await expect(page.getByText("投稿のルール：0行／NGワード：1個")).toBeVisible();
  await page.getByRole("textbox", { name: /AI の答え/ }).fill(AI_ANSWER);
  await expect(page.getByText("3件の案に分かれます。")).toBeVisible();
  await checkPage(page, "案を作る");
  await page.getByRole("button", { name: "案をためる" }).click();

  // ためたあとも画面に残り、取り消すと貼った文が欄に戻る（threads-011）
  await expect(page.getByText("3件の案をためました。")).toBeVisible();
  await checkPage(page, "案を作る（ためたあと）");
  await page.getByRole("button", { name: "取り消す" }).click();
  await expect(
    page.getByText("3件のためた案を取り消しました。貼った文を欄に戻しました。"),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: /AI の答え/ })).toHaveValue(AI_ANSWER);
  // 貼った文があるまま離れようとすると確かめる
  await clickNavLink(page, "投稿の案", false);
  const leaveDialog = page.getByRole("alertdialog");
  await expect(leaveDialog.getByText("貼った文が、まだためていません")).toBeVisible();
  await leaveDialog.getByRole("button", { name: "この画面に残る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "案を作る" })).toBeVisible();
  await page.getByRole("button", { name: "案をためる" }).click();
  await expect(page.getByText("3件の案をためました。")).toBeVisible();
  await page.getByRole("link", { name: "投稿の案で確かめる" }).click();

  // 投稿の案：NG ワードを含む案は承認できない。1件目を承認し、承認できるものを選んでまとめて承認し、残りを理由つきで却下する
  await expect(page.getByRole("heading", { level: 1, name: "投稿の案" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /にためた3件/ })).toBeVisible();
  await expect(page.getByText("NGワード：必ず儲かる")).toBeVisible();
  await checkPage(page, "投稿の案");
  const cards = page.locator('li[id^="threads-draft-card-"]');
  await expect(cards.nth(1).getByRole("button", { name: "承認する" })).toBeDisabled();
  await cards.nth(0).getByRole("button", { name: "承認する" }).click();
  await expect(page.getByRole("radio", { name: "承認済み（1）" })).toBeVisible();

  await page.getByRole("button", { name: "承認できるものを選ぶ（1件）" }).click();
  await page.getByRole("button", { name: "選んだ1件を承認" }).click();
  const approveDialog = page.getByRole("alertdialog");
  await expect(approveDialog.getByText(/あなた（アカウントの運用者）の責任のもとで/)).toBeVisible();
  await checkPage(page, "まとめて承認の枠");
  await approveDialog.getByRole("button", { name: "1件を承認する" }).click();
  await expect(page.getByText("1件を承認しました。")).toBeVisible();
  await expect(page.getByRole("radio", { name: "承認済み（2）" })).toBeVisible();

  await page.getByRole("button", { name: "却下する" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "却下する" }).click();
  await expect(dialog.getByText("却下の理由を選ぶか、メモを書いてください。")).toBeVisible();
  await dialog.getByRole("checkbox", { name: "内容が薄い" }).check();
  await checkPage(page, "却下の枠");
  await dialog.getByRole("button", { name: "却下する" }).click();
  await expect(page.getByText("1件を却下しました。")).toBeVisible();

  // 選んだ状態は道に残る。却下は選んでまとめて消せる（消す前に確かめる）
  await page.getByRole("radio", { name: /^却下/ }).click();
  await expect(page).toHaveURL(/tab=rejected/);
  await expect(page.getByText("却下の理由：内容が薄い")).toBeVisible();
  await page.getByRole("button", { name: "すべて選ぶ" }).click();
  await page.getByRole("button", { name: "選んだ1件を消す" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "消す" }).click();
  await expect(page.getByText("1件の案を消しました。")).toBeVisible();

  // 承認済みの案も直せる。直すと承認待ちに戻る
  await page.getByRole("radio", { name: /^承認済み/ }).click();
  await cards.first().getByRole("button", { name: "直す" }).click();
  const editDialog = page.getByRole("dialog");
  await expect(editDialog.getByText(/保存すると承認待ちに戻り/)).toBeVisible();
  await editDialog.getByRole("textbox", { name: /本文/ }).fill("直した承認済みの案です。");
  await editDialog.getByRole("button", { name: "保存" }).click();
  await expect(
    page.getByText("直したので、承認待ちに戻しました。もう一度承認してください。"),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "承認済み（1）" })).toBeVisible();

  // 一覧：数が出る
  await clickNavLink(page, "アカウント", false);
  await expect(page.getByRole("link", { name: "AI部" })).toBeVisible();
  await checkPage(page, "アカウントの一覧");

  expect(await readCspViolations()).toEqual([]);
});

test("Threads につなぎ、自動投稿の時刻を決める（threads-002）", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "c2" : "c1";
  const stamp = Date.now().toString(16);
  const lineUserId = `U${(tag + stamp).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `自動投稿の確かめ（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  // 偽の Threads に、この回だけの利用者とトークンを作る（前の回・ほかの幅と同じ Threads のアカウントにしない）
  const threadsUserId = String(Date.now()) + (tag === "c1" ? "1" : "2");
  const username = `e2e_${tag}_${stamp}`;
  await page.request.post(`${E2E_FAKE_THREADS_URL}/__control/users`, {
    data: { id: threadsUserId, username, name: "E2E" },
  });
  const issued = await page.request.post(`${E2E_FAKE_THREADS_URL}/__control/tokens`, {
    data: { userId: threadsUserId },
  });
  const { token } = (await issued.json()) as { token: string };

  // アカウントを作り、投稿の案の画面で「つないでいない」と知らせる
  await page.goto("/threads");
  await page.getByRole("textbox", { name: /アカウントの名前/ }).fill("自動投稿部");
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ホーム" })).toBeVisible();
  await clickNavLink(page, "投稿の案");
  await expect(page.getByText("Threads にまだつないでいません。")).toBeVisible();
  await expect(page.getByText("自動投稿はオフです。")).toBeVisible();
  await checkPage(page, "投稿の案（未接続）");

  // 設定：トークンを貼ってつなぐ
  await clickNavLink(page, "設定");
  await expect(page.getByRole("heading", { level: 2, name: "Threads への接続" })).toBeVisible();
  // 題の上の切り替えにも「未接続」が出るので、接続の節の中で探す
  await expect(
    page.getByRole("region", { name: "Threads への接続" }).getByText("未接続", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "つなぐ", exact: true }).click();
  await expect(page.getByText("トークンを貼ってください。")).toBeVisible();
  await page.getByLabel(/長期のアクセストークン/).fill(token);
  await page.getByRole("button", { name: "つなぐ", exact: true }).click();
  await expect(page.getByText(`@${username} につなぎました。`)).toBeVisible();
  await expect(page.getByText("接続済み")).toBeVisible();
  await checkPage(page, "設定（接続済み）");

  // 自動投稿：夜間の時刻は欄のそばに誤り。昼の時刻でオンにする
  await page.getByRole("checkbox", { name: "自動投稿をオンにする" }).check();
  await page.getByLabel("1つ目の時刻", { exact: true }).fill("07:00");
  await page.getByRole("button", { name: "自動投稿の設定を保存" }).click();
  await expect(page.getByText(/07:00 は選べません/)).toBeVisible();
  await page.getByLabel("1つ目の時刻", { exact: true }).fill("12:00");
  await page.getByRole("button", { name: "時刻を足す" }).click();
  await page.getByLabel("2つ目の時刻", { exact: true }).fill("19:30");
  await page.getByRole("button", { name: "自動投稿の設定を保存" }).click();
  await expect(page.getByText("自動投稿をオンにしました（1日2回）。")).toBeVisible();
  // 操作の記録（threads-005）に、接続と自動投稿の設定が残る
  const activity = page.getByRole("list", { name: "操作の記録" });
  await expect(activity.getByText("自動投稿の設定を保存した")).toBeVisible();
  await expect(activity.getByText("Threads につないだ")).toBeVisible();
  await checkPage(page, "設定（自動投稿）");

  // 投稿の案：オンになり、承認済みがないと知らせる
  await clickNavLink(page, "投稿の案", false);
  await expect(page.getByText(/承認済みの案がありません。/)).toBeVisible();
  await checkPage(page, "投稿の案（自動投稿オン）");

  // 反応（threads-003）：まだ投稿がない。CSV は書き出せる
  await clickNavLink(page, "反応", false);
  await expect(page.getByRole("heading", { level: 1, name: "反応" })).toBeVisible();
  await expect(page.getByText(/確定した投稿が5件たまると/)).toBeVisible();
  await expect(page.getByText(/まだ投稿済みの投稿はありません。/)).toBeVisible();
  await checkPage(page, "反応");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "投稿ごとに書き出す" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^threads-posts-\d{4}-\d{2}-\d{2}\.csv$/);
  // 列はめぐると同じ37列（threads-012）
  const csv = await readFile(await download.path(), "utf8");
  expect(
    csv
      .replace(/^\uFEFF/, "")
      .split("\r\n")[0]
      ?.split(","),
  ).toHaveLength(37);

  // 定期の仕事の窓口は、合言葉がなければ 404・あれば動く（Cloud Scheduler と同じ JSON の本文）
  const denied = await page.request.post("/api/v1/threads/jobs/tick", { data: {} });
  expect(denied.status()).toBe(404);
  const ran = await page.request.post("/api/v1/threads/jobs/tick", {
    data: {},
    headers: { authorization: `Bearer ${E2E_JOB_TRIGGER_SECRET}` },
  });
  expect(ran.status()).toBe(200);

  // 接続を切る前は確かめる
  await clickNavLink(page, "設定");
  await page.getByRole("button", { name: "接続を切る" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("Threads への接続を切ります")).toBeVisible();
  await checkPage(page, "接続を切る確かめ");
  await confirm.getByRole("button", { name: "切る", exact: true }).click();
  await expect(page.getByText("接続を切りました。自動投稿もオフにしました。")).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
});

test("宣伝とリサーチを足し、プロンプトに入れる（threads-004）", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "d2" : "d1";
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `リサーチの確かめ（${testInfo.project.name}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  await page.goto("/threads");
  await page.getByRole("textbox", { name: /アカウントの名前/ }).fill("リサーチ部");
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ホーム" })).toBeVisible();
  await clickNavLink(page, "リサーチ");
  await expect(page.getByRole("heading", { level: 1, name: "宣伝とリサーチ" })).toBeVisible();
  await checkPage(page, "宣伝とリサーチ（空）");

  // 宣伝：枠で足す（タイトルが空なら欄のそばに誤り）
  await page.getByRole("button", { name: "宣伝を足す" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByText("タイトルを入れてください。")).toBeVisible();
  await dialog.getByRole("textbox", { name: /タイトル/ }).fill("12月の交流会");
  await dialog
    .getByRole("textbox", { name: /宣伝の内容/ })
    .fill("転職を考えている人の交流会です。");
  await checkPage(page, "宣伝を足す枠");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("宣伝を足しました。")).toBeVisible();
  await expect(page.getByText("転職を考えている人の交流会です。")).toBeVisible();

  // 参考の投稿：枠で足して、解説のプロンプトを作り、答えを貼って保存する（threads-012：枠で足す・保存する答えを選ぶ）
  await page.getByRole("button", { name: "参考の投稿を足す" }).click();
  const referenceDialog = page.getByRole("dialog", { name: "参考の投稿を足す" });
  await referenceDialog
    .getByRole("textbox", { name: /^本文/ })
    .fill("仕事を辞めたい夜にやったこと。");
  await referenceDialog.getByRole("button", { name: "足す", exact: true }).click();
  await expect(page.getByText("参考の投稿を1件足しました。")).toBeVisible();
  const shortId = (
    (await page
      .getByText(/^ID:[0-9a-f]+$/)
      .first()
      .textContent()) ?? ""
  ).replace("ID:", "");
  await page.getByRole("button", { name: "解説のプロンプトを作る" }).click();
  await expect(page.getByRole("textbox", { name: /解説のプロンプト/ })).toBeVisible();
  await page
    .getByRole("textbox", { name: /AI の解説の答え/ })
    .fill(`【ID:${shortId}】\n共感から入っている`);
  await expect(page.getByRole("checkbox", { name: new RegExp(`ID:${shortId}`) })).toBeChecked();
  await page.getByRole("button", { name: "1件の解説を保存" }).click();
  await expect(page.getByText("1件の解説を保存しました。")).toBeVisible();
  await expect(page.getByText("なぜ良いか：共感から入っている")).toBeVisible();

  // キーワード：足す・同じものは断る・案を貼って選んで足す
  await page.getByRole("textbox", { name: /足すキーワード/ }).fill("転職");
  await page.getByRole("button", { name: "キーワードを足す" }).click();
  await expect(page.getByText("「転職」を足しました。")).toBeVisible();
  await page.getByRole("textbox", { name: /足すキーワード/ }).fill("転職");
  await page.getByRole("button", { name: "キーワードを足す" }).click();
  await expect(page.getByText(/同じキーワードがあります。/)).toBeVisible();
  await page.getByRole("button", { name: "キーワードの案のプロンプトを作る" }).click();
  await page
    .getByRole("textbox", { name: /AI のキーワードの案の答え/ })
    .fill("残業｜疲れている人\n転職｜登録済み");
  await page.getByRole("checkbox", { name: /残業/ }).check();
  await expect(page.getByRole("checkbox", { name: /転職/ })).toBeDisabled();
  await checkPage(page, "宣伝とリサーチ（材料あり）");
  await page.getByRole("button", { name: "選んだキーワードを足す" }).click();
  await expect(page.getByText("1個のキーワードを足しました。")).toBeVisible();

  // 案を作る：宣伝と参考の投稿がプロンプトに入る
  await clickNavLink(page, "案を作る", false);
  await expect(page.getByRole("heading", { level: 1, name: "案を作る" })).toBeVisible();
  // 開くとプロンプトができる（threads-011）
  await expect(page.getByText(/宣伝 1件・参考の投稿 1件/)).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
});

/**
 * 試験用のログインをして、運用アカウントを1つ作る（ホームで終わる。threads-012）。
 * @param page Playwright の画面
 * @param tag 幅ごとの印（前の回・ほかの幅と見分ける）
 * @param name 運用アカウントの名前
 */
async function loginAndCreateAccount(page: Page, tag: string, name: string): Promise<void> {
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `${name}の確かめ` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  await page.goto("/threads");
  await page.getByRole("textbox", { name: /アカウントの名前/ }).fill(name);
  await page.getByRole("button", { name: "作る" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ホーム" })).toBeVisible();
}

test("分析の画面で、テーマと傾向の設定を保存する（threads-006）", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  await loginAndCreateAccount(page, testInfo.project.name === "mobile" ? "e2" : "e1", "分析部");
  await clickNavLink(page, "分析", false);
  await expect(page.getByRole("heading", { level: 1, name: "分析" })).toBeVisible();
  await expect(page.getByText("確定した投稿が、あと20件たまると見られます。")).toBeVisible();
  await expect(page.getByText("分類がまだの確定した投稿はありません。").first()).toBeVisible();
  await checkPage(page, "分析（材料なし）");

  // テーマを足す（空の名前は外す）・同じ名前は欄のそばに誤り
  await page.getByRole("button", { name: "テーマを足す" }).click();
  await page.getByRole("textbox", { name: "テーマ 1" }).fill("仕事の悩み");
  await page.getByRole("button", { name: "テーマを足す" }).click();
  await page.getByRole("textbox", { name: "テーマ 2" }).fill("仕事の悩み");
  await page.getByRole("button", { name: "分析の設定を保存" }).click();
  await expect(page.getByText("同じ名前のテーマがあります。")).toBeVisible();
  await page.getByRole("textbox", { name: "テーマ 2" }).fill("転職");
  await page.getByRole("checkbox", { name: "伸びた傾向を、次のプロンプトに入れる" }).uncheck();
  await page.getByRole("button", { name: "分析の設定を保存" }).click();
  await expect(page.getByText("分析の設定を保存しました。")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "テーマ 2" })).toHaveValue("転職");
  await expect(
    page.getByRole("checkbox", { name: "伸びた傾向を、次のプロンプトに入れる" }),
  ).not.toBeChecked();
  await checkPage(page, "分析（設定あり）");

  // 操作の記録に残る
  await clickNavLink(page, "設定");
  await expect(
    page.getByRole("list", { name: "操作の記録" }).getByText("分析の設定を保存した"),
  ).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
});

test("時間差のメンションの人を足し、案に付けて承認する（threads-007）", async ({
  page,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  await loginAndCreateAccount(
    page,
    testInfo.project.name === "mobile" ? "f2" : "f1",
    "メンション部",
  );

  // 設定：ひとことと時間差・メンションする人（形が違えば欄のそばに誤り）
  await clickNavLink(page, "設定");
  await expect(page.getByRole("heading", { level: 2, name: "時間差のメンション" })).toBeVisible();
  await page.getByRole("textbox", { name: /ひとこと/ }).fill("よければシェアお願いします");
  await page.getByRole("radio", { name: "1時間後" }).click();
  await page.getByRole("button", { name: "メンションの設定を保存" }).click();
  await expect(page.getByText("メンションの設定を保存しました。")).toBeVisible();
  await page.getByRole("textbox", { name: /Threads のユーザー名/ }).fill("あいう");
  await page.getByRole("textbox", { name: /呼び名/ }).fill("港の運営");
  await page.getByRole("button", { name: "メンションする人を足す" }).click();
  await expect(page.getByText(/ユーザー名は、英小文字・数字/)).toBeVisible();
  await page.getByRole("textbox", { name: /Threads のユーザー名/ }).fill("@minato_place");
  await page.getByRole("checkbox", { name: /いつも付ける/ }).check();
  await page.getByRole("button", { name: "メンションする人を足す" }).click();
  await expect(page.getByText("「港の運営」を足しました。")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "メンションする人" }).getByText("@minato_place"),
  ).toBeVisible();
  await checkPage(page, "設定（時間差のメンション）");

  // 案をためて、カードでメンションを付ける
  await clickNavLink(page, "案を作る", false);
  await page.getByRole("textbox", { name: /AI の答え/ }).fill("週末のイベントのお知らせです。");
  await page.getByRole("button", { name: "案をためる" }).click();
  await page.getByRole("link", { name: "投稿の案で確かめる" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "投稿の案" })).toBeVisible();
  await page.getByRole("button", { name: "メンションを付ける", exact: true }).click();
  await expect(page.getByText("投稿の1時間後にメンション")).toBeVisible();
  await expect(page.getByRole("button", { name: /港の運営/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("textbox", { name: /返信の文/ })).toHaveValue(
    "よければシェアお願いします\n@minato_place",
  );
  await checkPage(page, "投稿の案（メンションを付ける）");
  await page.getByRole("button", { name: "メンションを保存" }).click();
  await expect(page.getByText("投稿の1時間後にメンション：@minato_place")).toBeVisible();
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page.getByRole("radio", { name: "承認済み（1）" })).toBeVisible();
  await page.getByRole("radio", { name: "承認済み（1）" }).click();
  await expect(page.getByText("投稿の1時間後にメンション：@minato_place")).toBeVisible();
  await checkPage(page, "投稿の案（メンション付きの承認済み）");

  expect(await readCspViolations()).toEqual([]);
});

test("宣伝から外部メディアの掲載文を作り、コピーして状況を残す（threads-008）", async ({
  page,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await loginAndCreateAccount(page, testInfo.project.name === "mobile" ? "a2" : "a1", "掲載部");
  const accountId = /\/threads\/accounts\/([^/?#]+)/.exec(page.url())?.[1] ?? "";
  const year = new Date().getFullYear() + 1;
  const created = await page.request.post(`/api/v1/threads/accounts/${accountId}/promotions`, {
    headers: ORIGIN,
    data: {
      title: "IT交流会",
      content: "ゆるく繋がる会です。\nhttps://maps.app.goo.gl/abc",
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
  expect(created.status()).toBe(201);

  // 一覧：宣伝と5つの媒体
  await clickNavLink(page, "外部メディア", false);
  await expect(page.getByRole("heading", { level: 1, name: "外部メディア" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "IT交流会" })).toBeVisible();
  await checkPage(page, "外部メディア");

  // Peatix の掲載文を作る：ルールに合わない行は外れ、欄が並ぶ
  await page.getByRole("link", { name: "IT交流会のPeatixの掲載文を開く" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Peatixの掲載文" })).toBeVisible();
  await page.getByRole("button", { name: "掲載文を作る" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "ルールのチェック" })).toBeVisible();
  await expect(page.getByText(/自動で直した内容（1件）/)).toBeVisible();
  await checkPage(page, "掲載文（入力）");
  await page.getByRole("button", { name: "まとめてコピー" }).click();
  await expect(page.getByText("コピーしました。", { exact: true })).toBeVisible();

  // 作業の手順
  await page.getByRole("radio", { name: "作業の手順" }).click();
  await expect(
    page.getByText("上から順番にコピーして、Peatixに貼り付けてください。"),
  ).toBeVisible();
  await checkPage(page, "掲載文（作業の手順）");

  // 状況：URL の形が違えば誤り、掲載済みにして保存
  await page.getByRole("radio", { name: "掲載済み" }).click();
  await page.getByRole("textbox", { name: /掲載 URL/ }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "状況を保存" }).click();
  await expect(page.getByText("http:// か https:// で始まる URL にしてください。")).toBeVisible();
  await page.getByRole("textbox", { name: /掲載 URL/ }).fill("https://peatix.com/event/1");
  await page.getByRole("button", { name: "状況を保存" }).click();
  await expect(page.getByText("掲載の状況を保存しました。")).toBeVisible();
  await page.getByRole("link", { name: "外部メディアの一覧へ" }).click();
  await expect(page.getByText("掲載済み").first()).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
});

test("戦略をヒントと AI の答えで埋める（threads-009）", async ({ page }, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await loginAndCreateAccount(page, testInfo.project.name === "mobile" ? "a4" : "a3", "壁打ち部");
  await clickNavLink(page, "戦略");
  await expect(page.getByRole("heading", { level: 1, name: "戦略" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^次におすすめ：/ })).toBeVisible();
  // 区分のタブで営業導線へ。項目の行の「考えるヒント」を開く（threads-017）
  await page
    .getByRole("navigation", { name: "区分" })
    .getByRole("button", { name: /^営業導線 / })
    .click();
  const hintToggle = page.getByRole("button", {
    name: "「どんな人に投稿を届けたいか」の考えるヒント",
  });
  await hintToggle.click();
  await expect(hintToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("悪い例")).toBeVisible();
  await checkPage(page, "戦略（ヒント）");

  // 1つの項目を AI と深める：完成版の目印のあいだを入れる
  await page.getByRole("button", { name: "「どんな人に投稿を届けたいか」を AI と深める" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "プロンプトをコピー" }).click();
  await expect(dialog.getByText("コピーしました。外の AI に貼ってください。")).toBeVisible();
  await dialog
    .getByRole("textbox", { name: /AI の答え/ })
    .fill("いいですね。\n【完成版ここから】\n30歳を前に転職を迷っている会社員\n【完成版ここまで】");
  await expect(dialog.getByText("目印のあいだを入れます。")).toBeVisible();
  await checkPage(page, "AI と深める枠");
  await dialog.getByRole("button", { name: "この項目に入れる" }).click();
  await expect(page.getByRole("textbox", { name: /どんな人に投稿を届けたいか/ })).toHaveValue(
    "30歳を前に転職を迷っている会社員",
  );

  // 区分の「AI と考える」：項目ごとの答えを貼り、選んで入れる（threads-017）
  await page
    .getByRole("navigation", { name: "区分" })
    .getByRole("button", { name: /^目的 / })
    .click();
  await page.getByRole("button", { name: "AI と考える（目的）" }).click();
  const think = page.getByRole("dialog", { name: "AI と考える（目的）" });
  await expect(think.getByRole("button", { name: "プロンプトをコピー" })).toBeVisible();
  await think
    .getByRole("textbox", { name: /AI の答え/ })
    .fill("【項目：Q1】\n上京して、話せる人がいなかったから。\n【項目ここまで】");
  await expect(think.getByRole("checkbox", { name: /Q1：なぜ/ })).toBeChecked();
  await checkPage(page, "戦略（AI と考える）");
  await think.getByRole("button", { name: "選んだ項目に入れる" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: /Q1：なぜ、この活動を始めようと思いましたか？/ }),
  ).toHaveValue("上京して、話せる人がいなかったから。");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("戦略を保存しました。")).toBeVisible();

  expect(await readCspViolations()).toEqual([]);
});

test("Meta のアプリでつなぎ、データの削除の要求の状況を見る（threads-010）", async ({
  page,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "a6" : "a5";
  await loginAndCreateAccount(page, tag, "OAuth部");
  // 偽の Threads に、この回だけの利用者を作り、偽の認可の画面でその人が許可したことにする
  const threadsUserId = `7${Date.now().toString()}${tag === "a5" ? "1" : "2"}`;
  const username = `oauth_${tag}_${Date.now().toString(16)}`;
  await page.request.post(`${E2E_FAKE_THREADS_URL}/__control/users`, {
    data: { id: threadsUserId, username, name: "OAuth" },
  });
  await page.request.post(`${E2E_FAKE_THREADS_URL}/__control/authorize-as`, {
    data: { userId: threadsUserId },
  });

  await clickNavLink(page, "設定");
  await expect(page.getByRole("button", { name: "Meta のアプリでつなぐ" })).toBeVisible();
  await checkPage(page, "設定（Meta のアプリでつなぐ）");
  await page.getByRole("button", { name: "Meta のアプリでつなぐ" }).click();
  // 偽の認可の画面 → API の戻り → 完了の画面 → 設定の画面
  await expect(page.getByText("Meta のアプリで Threads につなぎました。")).toBeVisible();
  await expect(page.getByText("接続済み")).toBeVisible();
  await expect(page.getByText(`@${username}`).first()).toBeVisible();
  await checkPage(page, "設定（OAuth でつないだ）");

  // Meta のデータの削除の要求（フォームの形・Origin なし）→ 状況の画面
  const body = Buffer.from(
    JSON.stringify({ algorithm: "HMAC-SHA256", user_id: threadsUserId }),
  ).toString("base64url");
  const signature = createHmac("sha256", E2E_THREADS_APP_SECRET).update(body).digest("base64url");
  const received = await page.request.post("/api/v1/threads/webhooks/data-deletion", {
    form: { signed_request: `${signature}.${body}` },
  });
  expect(received.status()).toBe(200);
  const { url } = (await received.json()) as { url: string };
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "データの削除の状況" })).toBeVisible();
  await expect(page.getByText("削除しました")).toBeVisible();
  await checkPage(page, "データの削除の状況");

  expect(await readCspViolations()).toEqual([]);
});
