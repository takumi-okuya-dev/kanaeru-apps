// 試合表のネットなし（match-005。AD-27・AD-28・AD-30・FR-M22〜M24・FR-M29）：
// - Service Worker の範囲は /match/ だけで、ほかの道（すべてのアプリなど）は受け持たない
// - 1度つながって開いた試合表は、電波がなくても開ける。直すと「電波なし・HH:MM に保存（つながったら送ります）」と出て、
//   つながると送る（サーバーの版が上がる）
// - 電波なしで渡す（M4）：運営の QR を、見るだけのページ（ネットなしで開いた）が「QR を読む」の写真から読み、新しい版を取り込む
// - 電波がなくて受付できない（P3）：参加者のスマホの QR を、運営の M7 が写真から読んで名簿に入れる。つながると自動で送る
// カメラは E2E の Chromium にないので、画面に出た QR の写真（スクリーンショット）を「写真から読む」に渡す（読む道具は同じ）。
// 本物のカメラでの読み取りは、iPhone の Safari と Android の Chrome の実機で確かめる（spec の残り）。名前はどれも架空のもの。
import { expect, test } from "@playwright/test";
import type { APIRequest, BrowserContext, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** 架空の名簿（上級の5人）。 */
const PLAYERS = [
  ["a1", "青木"],
  ["a2", "石田"],
  ["a3", "上田"],
  ["a4", "江口"],
  ["a5", "大野"],
] as const;

/**
 * 運営者として、試合表のアプリの公開の状態を変える。
 * @param requests 要求の入れ物を作る道具
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

/**
 * 試合表の Service Worker が入り、この画面を受け持ち、画面のファイルを持ち終えるのを待つ。
 * @param page Playwright の画面
 */
async function waitOfflineReady(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration("/match/");
          const keys = await caches.keys();
          return Boolean(
            registration?.active &&
            navigator.serviceWorker.controller &&
            keys.some((key) => key.startsWith("kanaeru-match-")),
          );
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}

/**
 * 運営としてログインし、上級の5人と2試合（1つ目は終わった）の試合表を作る。
 * @param page Playwright の画面
 * @param tag 幅ごとの印
 * @param name 試合表の名前
 * @returns 試合表の ID と版
 */
async function createTable(page: Page, tag: string, name: string) {
  const lineUserId = `U${(tag + Date.now().toString(16)).padStart(32, "0")}`;
  const deviceA = `d-e2e-${tag}-offline-a`;
  await page.addInitScript((id) => {
    window.localStorage.setItem("kanaeru.match.deviceId", id);
  }, deviceA);
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: { lineUserId, displayName: `電波なしの運営（${tag}）` },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);
  const created = await page.request.post("/api/v1/match/tables", {
    data: { name, playDate: "2099-12-27", deviceId: deviceA },
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
      seed: 3,
      content: {
        settings: table.content.settings,
        players: PLAYERS.map(([id, nickname]) => ({
          id,
          nickname,
          level: "advanced",
          status: "present",
        })),
        plan: [
          {
            key: "advanced",
            games: [
              { players: ["a1", "a2", "a3", "a4"], done: true },
              { players: ["a5", "a1", "a2", "a3"], done: false },
              { players: ["a4", "a5", "a1", "a2"], done: false },
            ],
          },
        ],
      },
    },
    headers: ORIGIN,
  });
  expect(saved.status()).toBe(200);
  return { id: table.id, version: ((await saved.json()) as { version: number }).version };
}

/**
 * サーバーの試合表の版を読む（電波のある別の要求で）。
 * @param page Playwright の画面（ログインのクッキーを使う）
 * @param tableId 試合表の ID
 * @returns 版
 */
async function serverVersion(page: Page, tableId: string): Promise<number> {
  const response = await page.request.get(`/api/v1/match/tables/${tableId}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { version: number }).version;
}

/**
 * ログインなしの別のブラウザを作る（同じ幅）。
 * @param page もとの画面
 * @param browser ブラウザ
 * @returns 文脈
 */
async function guestContextOf(
  page: Page,
  browser: { newContext: (options: object) => Promise<BrowserContext> },
): Promise<BrowserContext> {
  return browser.newContext({ baseURL: E2E_WEB_URL, viewport: page.viewportSize() ?? undefined });
}

test("Service Worker の範囲は /match/ だけで、ほかの道は受け持たない（AD-27）", async ({
  page,
}) => {
  const readCspViolations = await collectCspViolations(page);
  const sw = await page.request.get("/match/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["cache-control"]).toBe("no-cache");
  const body = await sw.text();
  expect(body).not.toContain("__SW_PRECACHE__");
  expect(body).toContain('"/match/"');

  await page.goto("/match/view/not-a-real-token");
  await expect(page.getByRole("heading", { level: 1, name: "見られません" })).toBeVisible();
  await waitOfflineReady(page);
  const scopes = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.scope),
  );
  expect(scopes).toEqual([`${E2E_WEB_URL}/match/`]);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toBe(
    `${E2E_WEB_URL}/match/sw.js`,
  );
  // 試合表の画面のファイルだけを持つ（ほかのアプリの画面の束は持たない）
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((name) => name.startsWith("kanaeru-match-")) ?? "");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cached).toContain("/match/");
  expect(cached.some((path) => /\/assets\/BoardPage-/u.test(path))).toBe(true);
  expect(
    cached.some((path) => /\/assets\/(EventListPage|ThreadsHome|CheckinPage)-/u.test(path)),
  ).toBe(false);

  // ほかの道（すべてのアプリ・参加者のチェックイン）は受け持たない
  for (const path of ["/apps", "/e/0193a1b2-0000-7000-8000-000000000000/checkin", "/matchfoo"]) {
    await page.goto(path);
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null),
      path,
    ).toBeNull();
  }
  // カメラは試合表の道だけ許す
  const matchPage = await page.request.get("/match/tables/x/join");
  expect(matchPage.headers()["permissions-policy"]).toContain("camera=(self)");
  const appsPage = await page.request.get("/apps");
  expect(appsPage.headers()["permissions-policy"]).toContain("camera=()");
  expect(await readCspViolations()).toEqual([]);
});

test("電波がなくても試合表を開いて直し、つながったら送る。電波なしで渡す QR を見るだけのページが読む（match-005）", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "f2" : "f1";
  const table = await createTable(page, tag, "12/27(日) 体育館");
  const viewLink = await page.request.put(`/api/v1/match/tables/${table.id}/view-link`, {
    headers: ORIGIN,
  });
  expect(viewLink.status()).toBe(200);
  const { token } = (await viewLink.json()) as { token: string };
  const versionAfterLink = await serverVersion(page, table.id);

  // 参加者：つながっているときに見るだけのページを1度開く
  const guestContext = await guestContextOf(page, browser);
  try {
    const guest = await guestContext.newPage();
    const readGuestCsp = await collectCspViolations(guest);
    await guest.goto(`/match/view/${token}`);
    await expect(guest.getByRole("heading", { level: 1, name: "12/27(日) 体育館" })).toBeVisible();
    await expect(guest.getByText("今 第2試合")).toBeVisible();
    await waitOfflineReady(guest);

    // 運営：つながっているときに試合表を1度開く
    await page.goto(`/match/tables/${table.id}/board`);
    await expect(page.getByRole("heading", { level: 1, name: "12/27(日) 体育館" })).toBeVisible();
    await waitOfflineReady(page);

    // 電波がなくなる → 読み直しても開ける（Service Worker と端末の中身）
    await context.setOffline(true);
    await guestContext.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "12/27(日) 体育館" })).toBeVisible();
    await expect(
      page.getByText(/電波なし・この端末に置いた \d{2}:\d{2} の試合表です/u),
    ).toBeVisible();

    // 進める（第2試合にチェック）→ 端末に保存して、つながったら送ると出る
    // 画面は問い合わせの入れ物の知らせで描き直すので、押してから印が付くのを待つ
    await page.getByRole("checkbox", { name: "第2試合を終えた" }).click();
    await expect(page.getByRole("checkbox", { name: "第2試合を終えた" })).toBeChecked();
    await expect(
      page.getByText(
        /電波なし・\d{2}:\d{2} に保存（つながったら送ります）。まだ送っていない変更：1件/u,
      ),
    ).toBeVisible();
    // 組み直す（別の組み合わせにする）
    await page.getByRole("button", { name: "別の組み合わせにする" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "別の組み合わせにする" })
      .click();
    await expect(page.getByText(/まだ送っていない変更：2件/u)).toBeVisible();
    expect(await serverVersion(page, table.id)).toBe(versionAfterLink);
    await expectNoA11yViolations(page, "試合表（電波なし）");

    // 電波なしで渡す（M4）：QR の写真を、ネットなしで開いた見るだけのページが読む
    await page.getByRole("button", { name: "電波なしで渡す" }).click();
    const handoffQr = page.getByRole("img", { name: "試合表の QR" });
    await expect(handoffQr).toBeVisible();
    await expect(page.getByText(`（版 ${versionAfterLink + 2}）`, { exact: false })).toBeVisible();
    await expectNoA11yViolations(page, "電波なしで渡す");
    const qrImage = await handoffQr.screenshot();
    await page.getByRole("button", { name: "閉じる" }).click();

    await guest.reload();
    await expect(guest.getByRole("heading", { level: 1, name: "12/27(日) 体育館" })).toBeVisible();
    await expect(
      guest.getByText(/電波がないか読めないため、\d{2}:\d{2} に読んだ表を出しています/u),
    ).toBeVisible();
    await guest.getByRole("button", { name: "QR を読む" }).click();
    await guest
      .getByLabel("写真から読む")
      .setInputFiles({ name: "handoff.png", mimeType: "image/png", buffer: qrImage });
    await expect(
      guest.getByText(`版 ${versionAfterLink + 2} の表を取り込みました。`),
    ).toBeVisible();
    await guest.getByRole("button", { name: "閉じる" }).click();
    await expect(
      guest.getByText(new RegExp(`QR で受け取った表です（版 ${versionAfterLink + 2}）`, "u")),
    ).toBeVisible();
    // 第2試合にチェックが付いたので、今は第3試合
    await expect(guest.getByText(/今 第3試合/u)).toBeVisible();
    await expectNoA11yViolations(guest, "見るだけのページ（QR で受け取った）");
    // 同じ QR をもう一度読んでも取り込まない（今より新しい版のときだけ）
    await guest.getByRole("button", { name: "QR を読む" }).click();
    await guest
      .getByLabel("写真から読む")
      .setInputFiles({ name: "handoff.png", mimeType: "image/png", buffer: qrImage });
    await expect(guest.getByText(/もう同じ版（版 \d+）の表が入っています。/u)).toBeVisible();
    await guest.getByRole("button", { name: "閉じる" }).click();

    // つながる → 古い順に送り、サーバーの版が上がる
    await context.setOffline(false);
    await expect(page.getByText(/この端末（端末 [0-9A-Z]{4}）が担当です/u)).toBeVisible({
      timeout: 20_000,
    });
    expect(await serverVersion(page, table.id)).toBe(versionAfterLink + 2);
    await guestContext.setOffline(false);
    expect(await readGuestCsp()).toEqual([]);
  } finally {
    await context.setOffline(false);
    await guestContext.close();
  }
  expect(await readCspViolations()).toEqual([]);
});

test("電波がなくて受付できない参加者の QR を、運営の M7 が読んで名簿に入れる（P3・AD-30）", async ({
  page,
  browser,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "d2" : "d1";
  const table = await createTable(page, tag, "12/27(日) 受付");
  const joinLink = await page.request.put(`/api/v1/match/tables/${table.id}/join-link`, {
    headers: ORIGIN,
  });
  expect(joinLink.status()).toBe(200);
  const { token } = (await joinLink.json()) as { token: string };

  const guestContext = await guestContextOf(page, browser);
  try {
    const guest = await guestContext.newPage();
    const readGuestCsp = await collectCspViolations(guest);
    await guest.goto(`/match/join/${token}`);
    await expect(guest.getByRole("heading", { level: 1, name: "12/27(日) 受付" })).toBeVisible();
    // 電波がなくなってから受付する → 名前とレベルの QR が出る
    await guestContext.setOffline(true);
    await guest.getByRole("textbox", { name: /名前/u }).fill("小川");
    await guest.getByRole("radio", { name: "初級" }).click();
    await guest.getByRole("button", { name: "受付する" }).click();
    await expect(guest.getByText("この QR を運営に見せてください")).toBeVisible();
    const joinQr = guest.getByRole("img", { name: "受付の QR（運営に見せる）" });
    await expect(joinQr).toBeVisible();
    await expectNoA11yViolations(guest, "受付（電波なし・QR）");
    const qrImage = await joinQr.screenshot();

    // 運営：M7 で参加者の QR を読む → 名簿に入る（2回読んでも1人）
    await page.goto(`/match/tables/${table.id}/join`);
    await expect(page.getByRole("heading", { level: 1, name: "QR で受け付ける" })).toBeVisible();
    await page.getByRole("button", { name: "参加者の QR を読む" }).click();
    await page
      .getByLabel("写真から読む")
      .setInputFiles({ name: "join.png", mimeType: "image/png", buffer: qrImage });
    await expect(
      page.getByText("小川（初級）を名簿に入れました。", { exact: false }),
    ).toBeVisible();
    await expectNoA11yViolations(page, "参加者の QR を読む");
    await page
      .getByLabel("写真から読む")
      .setInputFiles({ name: "join.png", mimeType: "image/png", buffer: qrImage });
    await expect(page.getByText("小川（初級）は、もう名簿に入っています。")).toBeVisible();
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByRole("list", { name: "QR で入れた人" }).getByText("小川")).toBeVisible();

    // 参加者がつながると自動で送る（運営の一覧に「同じ名前」の印が付く）
    await guestContext.setOffline(false);
    await expect(guest.getByRole("heading", { level: 1, name: "受付できました" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("同じ名前")).toBeVisible({ timeout: 15_000 });
    expect(await readGuestCsp()).toEqual([]);
  } finally {
    await guestContext.close();
  }
  expect(await readCspViolations()).toEqual([]);
});
