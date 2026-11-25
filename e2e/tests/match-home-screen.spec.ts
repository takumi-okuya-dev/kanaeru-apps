// 試合表をホーム画面に置く（match-007）：
// - manifest（名前・始まりと範囲 /match/・standalone）とアイコンを返し、CSP の中で読める
// - 試合表の運営の画面にだけ manifest と iPhone のアイコンのリンクが付く。ほかのアプリの道と、参加者が開く見るだけのページには付かない
// - 始まりの /match/（末尾の / つき）で一覧が開き、Service Worker が manifest とアイコンを持つので、電波がなくても読める
// iPhone の Safari と Android の Chrome で、実際にホーム画面に置いて開く動きは実機で確かめる（research の残り）。
import { expect, test } from "@playwright/test";
import type { APIRequest, Page } from "@playwright/test";
import { E2E_ORGANIZER_LINE_USER_ID, E2E_WEB_URL } from "../env.ts";
import { expectNoA11yViolations } from "../helpers/axe.ts";
import { collectCspViolations } from "../helpers/csp.ts";

/** 書く要求に付ける見出し（画面の源）。 */
const ORIGIN = { origin: E2E_WEB_URL };

/** manifest の道。 */
const MANIFEST = "/match/manifest.webmanifest";

/** iPhone のアイコンの道。 */
const APPLE_TOUCH_ICON = "/match/apple-touch-icon.png";

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

/**
 * 見出しの、ホーム画面のためのリンク（manifest と iPhone のアイコン）の行き先。
 * @param page Playwright の画面
 * @returns manifest と iPhone のアイコンの href（なければ null）
 */
function headLinks(page: Page) {
  return page.evaluate(() => ({
    manifest: document.head.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? null,
    icon: document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null,
  }));
}

test.beforeAll(async ({ playwright }) => {
  await setMatchVisibility(playwright.request, "public");
});

test.afterAll(async ({ playwright }) => {
  await setMatchVisibility(playwright.request, "off");
});

test("manifest とアイコンを返す（名前・始まりと範囲・standalone・PNG）", async ({ page }) => {
  const response = await page.request.get(MANIFEST);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = (await response.json()) as {
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    display: string;
    icons: { src: string; purpose: string }[];
  };
  expect(manifest).toMatchObject({
    name: "PaletKit 試合表",
    short_name: "試合表",
    start_url: "/match/",
    scope: "/match",
    display: "standalone",
  });
  expect(manifest.icons.map((icon) => icon.purpose)).toContain("maskable");
  for (const src of [APPLE_TOUCH_ICON, ...manifest.icons.map((icon) => icon.src)]) {
    const icon = await page.request.get(src);
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()["content-type"], src).toBe("image/png");
  }
});

test("試合表の運営の画面にだけ manifest とアイコンのリンクが付き、ほかの道には付かない。電波がなくても読める", async ({
  page,
  context,
}, testInfo) => {
  const readCspViolations = await collectCspViolations(page);
  const tag = testInfo.project.name === "mobile" ? "f2" : "f1";
  const login = await page.request.post("/api/v1/auth/test-login", {
    data: {
      lineUserId: `U${(tag + Date.now().toString(16)).padStart(32, "0")}`,
      displayName: `ホーム画面の運営（${tag}）`,
    },
    headers: ORIGIN,
  });
  expect(login.status()).toBe(200);

  // 始まりの /match/（manifest の start_url）で一覧が開き、リンクが付く
  await page.goto("/match/");
  await expect(page.getByRole("heading", { level: 1, name: "試合表" })).toBeVisible();
  expect(await headLinks(page)).toEqual({ manifest: MANIFEST, icon: APPLE_TOUCH_ICON });
  await expectNoA11yViolations(page, "試合表の一覧（ホーム画面のリンクつき）");

  // ほかのアプリの道（すべてのアプリ・交流会の一覧・設定）と、参加者が開く見るだけのページには付かない
  for (const path of ["/apps", "/admin/events", "/settings/account", "/match/view/not-a-token"]) {
    await page.goto(path);
    await expect(page.locator("h1").first(), path).toBeVisible();
    expect(await headLinks(page), path).toEqual({ manifest: null, icon: null });
  }

  // 試合表の画面に戻ると付き、Service Worker が manifest とアイコンを持つ（範囲は /match/ なので、末尾の / つきで開く）
  await page.goto("/match/");
  await expect(page.getByRole("heading", { level: 1, name: "試合表" })).toBeVisible();
  expect(await headLinks(page)).toEqual({ manifest: MANIFEST, icon: APPLE_TOUCH_ICON });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const names = await caches.keys();
          const name = names.find((key) => key.startsWith("kanaeru-match-"));
          if (!name || !navigator.serviceWorker.controller) return [];
          const cache = await caches.open(name);
          return (await cache.keys()).map((request) => new URL(request.url).pathname);
        }),
      { timeout: 20_000 },
    )
    .toEqual(
      expect.arrayContaining([
        MANIFEST,
        APPLE_TOUCH_ICON,
        "/match/icon-192.png",
        "/match/icon-512.png",
        "/match/icon-maskable-192.png",
        "/match/icon-maskable-512.png",
      ]),
    );

  // 電波がなくても、manifest とアイコンを読める（Service Worker が持っているものを返す）
  await context.setOffline(true);
  try {
    const statuses = await page.evaluate(
      async (paths) => Promise.all(paths.map(async (path) => (await fetch(path)).status)),
      [MANIFEST, APPLE_TOUCH_ICON],
    );
    expect(statuses).toEqual([200, 200]);
  } finally {
    await context.setOffline(false);
  }
  expect(await readCspViolations()).toEqual([]);
});
