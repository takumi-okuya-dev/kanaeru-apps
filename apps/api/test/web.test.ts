// 画面のファイルを返すこと（AD-8）：ファイル・SPA の戻り・拡張子のある道・画面の外の道・/api との見出しの分け方・キャッシュ。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../src/kernel/db.ts";
import {
  EDGE_CACHE_HEADER,
  EDGE_HTML_CACHE,
  WEB_CSP_DIRECTIVES,
  allowsCamera,
} from "../src/platform/web/index.ts";
import { buildApp, testConfig } from "./helpers/app.ts";

/** 画面のフォルダの中身（組み立てた形を小さくまねたもの）。 */
const INDEX_HTML =
  '<!doctype html><html lang="ja"><title>テストの画面</title><div id="root"></div>';

// DB には触らない（つなぐ先は使わない値）
const database = createDatabase("postgres://user:pass@127.0.0.1:1/app");
let root: string;
let distDir: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "web-dist-"));
  distDir = join(root, "dist");
  mkdirSync(join(distDir, "assets"), { recursive: true });
  writeFileSync(join(distDir, "index.html"), INDEX_HTML);
  writeFileSync(join(distDir, "assets", "app-abc123.js"), "console.log(1);");
  // 試合表のオフラインの Service Worker（毎回確かめる。古い sw.js を持ち続けない）
  mkdirSync(join(distDir, "match"), { recursive: true });
  writeFileSync(join(distDir, "match", "sw.js"), "self.addEventListener('fetch', () => {});");
  // 画面のフォルダの外のファイル（読ませてはいけない）
  writeFileSync(join(root, "secret.txt"), "秘密");
});

afterAll(async () => {
  rmSync(root, { recursive: true, force: true });
  await database.pool.end();
});

/**
 * 画面のフォルダを渡して API を組み立てる。
 * @param webUrl 画面の源
 * @returns 組み立てた API
 */
function appWithWeb(webUrl?: string) {
  return buildApp(database, testConfig({ webDistDir: distDir, ...(webUrl ? { webUrl } : {}) }));
}

describe("画面のファイル", () => {
  it("/ と画面の道（ファイルのない道）は index.html と画面の CSP を返し、毎回確かめさせる", async () => {
    const app = appWithWeb();
    for (const path of [
      "/",
      "/e/0193a1b2-0000-7000-8000-000000000000/checkin",
      "/invite/abc",
      // 参加者の道に . があっても画面の道（拡張子として扱わない）
      "/invite/abc.def",
      "/e/x/survey/v1.2",
      "/apifoo",
    ]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toContain("text/html");
      expect(await response.text(), path).toContain("テストの画面");
      // ブラウザは毎回確かめる。源（Cloud Run）が落ちたときは、前に置く Cloudflare が前の画面を出せる（core-020）
      expect(response.headers.get("cache-control"), path).toBe("no-cache");
      expect(response.headers.get(EDGE_CACHE_HEADER), path).toBe(EDGE_HTML_CACHE);
      const csp = response.headers.get("content-security-policy") ?? "";
      expect(csp, path).toContain("script-src 'self' https://static.line-scdn.net");
      expect(csp, path).toContain("connect-src 'self' https://api.line.me");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).not.toContain("unsafe-inline");
      expect(csp, path).not.toContain("unsafe-eval");
      expect(response.headers.get("x-frame-options"), path).toBe("DENY");
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("referrer-policy"), path).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("x-request-id"), path).toBeTruthy();
    }
  });

  it("カメラは試合表の道（/match・/match/…）だけで自分の源に許し、ほかの道と /api では止める（core-015）", async () => {
    const app = appWithWeb();
    for (const path of ["/match", "/match/", "/match/tables/x/join", "/match/view/abc"]) {
      const response = await app.request(path);
      expect(response.headers.get("permissions-policy"), path).toBe(
        "camera=(self), microphone=(), geolocation=()",
      );
      expect(response.headers.get("content-security-policy"), path).toContain(
        "frame-ancestors 'none'",
      );
    }
    for (const path of ["/", "/matchfoo", "/Match", "/apps", "/e/x/checkin", "/api/v1/health"]) {
      const response = await app.request(path);
      expect(response.headers.get("permissions-policy"), path).toBe(
        "camera=(), microphone=(), geolocation=()",
      );
    }
    expect(allowsCamera("/match/sw.js")).toBe(true);
    expect(allowsCamera("/matches")).toBe(false);
  });

  it("HTML のファイルは Cloudflare に源が落ちたときだけ前のものを出させ、HTML でないファイル（sw.js）には付けない（core-020）", async () => {
    const app = appWithWeb();
    const index = await app.request("/index.html");
    expect(index.status).toBe(200);
    expect(index.headers.get("cache-control")).toBe("no-cache");
    expect(index.headers.get(EDGE_CACHE_HEADER)).toBe(EDGE_HTML_CACHE);
    expect(EDGE_HTML_CACHE).toContain("stale-if-error=");
    expect(EDGE_HTML_CACHE).not.toMatch(/no-cache|must-revalidate|no-store|public/);
    const worker = await app.request("/match/sw.js");
    expect(worker.status).toBe(200);
    expect(worker.headers.get("cache-control")).toBe("no-cache");
    expect(worker.headers.get(EDGE_CACHE_HEADER)).toBeNull();
  });

  it("中身の印つきのファイル（/assets/）は、そのまま返し、長く持たせる", async () => {
    const response = await appWithWeb().request("/assets/app-abc123.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await response.text()).toBe("console.log(1);");
  });

  it("/assets/ の下でファイルがなければ、index.html を返さず 404（長く持たせない）", async () => {
    const app = appWithWeb();
    for (const path of ["/assets/nothing-here.js", "/assets/nothing-here"]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("cache-control"), path).toBe("no-store");
      expect(((await response.json()) as { error: { code: string } }).error.code, path).toBe(
        "NOT_FOUND",
      );
    }
  });

  it("範囲の要求：206 は長く持たせ、範囲が合わない 416 には長いキャッシュを付けない", async () => {
    const app = appWithWeb();
    const partial = await app.request("/assets/app-abc123.js", { headers: { range: "bytes=0-6" } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await partial.text()).toBe("console");
    const unsatisfiable = await app.request("/assets/app-abc123.js", {
      headers: { range: "bytes=9999-" },
    });
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get("cache-control") ?? "").not.toContain("immutable");
    expect(unsatisfiable.headers.get("cache-control") ?? "").not.toContain("max-age");
  });

  it("画面のフォルダの外のファイルは読ませない", async () => {
    const app = appWithWeb();
    for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt"]) {
      const response = await app.request(path);
      expect(await response.text(), path).not.toContain("秘密");
    }
  });

  it("/api の下は、画面を返さず、API の答えと API の CSP", async () => {
    const response = await appWithWeb().request("/api/v1/nothing-here");
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("/.well-known の下も画面に戻さず、API の守り（core-021・AD-21）", async () => {
    // まだ道のない /.well-known は、画面（HTML）に戻さず 404 にする（認可のメタデータの道は次の PR）
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/unknown-thing"]) {
      const response = await appWithWeb().request(path);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("content-type") ?? "", path).not.toContain("text/html");
      expect(response.headers.get("content-security-policy"), path).toContain("default-src 'none'");
    }
    // 画面の道はそのまま（.well-known の名前の前だけ一致させない）
    const page = await appWithWeb().request("/.well-known-page");
    expect(page.status).toBe(200);
  });

  it("GET・HEAD でない要求には画面を返さない", async () => {
    const response = await appWithWeb().request("/e/x/checkin", { method: "POST" });
    expect(response.status).toBe(404);
  });

  it("HEAD は本文なしで 200", async () => {
    const response = await appWithWeb().request("/e/x/checkin", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("WEB_URL が https のときだけ、画面にも HSTS がつく", async () => {
    expect((await appWithWeb().request("/")).headers.get("strict-transport-security")).toBeNull();
    const https = await appWithWeb("https://app.example.com").request("/");
    expect(https.headers.get("strict-transport-security")).toMatch(
      /^max-age=\d{8,}; includeSubDomains$/,
    );
  });

  it("WEB_DIST_DIR がなければ画面を返さない（/ は API の 404）", async () => {
    const response = await buildApp(database, testConfig()).request("/");
    expect(response.status).toBe(404);
  });

  it("WEB_DIST_DIR に index.html がなければ、組み立てが止まる", () => {
    expect(() => buildApp(database, testConfig({ webDistDir: root }))).toThrow("index.html");
  });

  it("画面の CSP は、LINE の SDK が使う源と Threads のプロフィールの画像の源を許し、ほかの外の源を許さない", () => {
    const { imgSrc, ...others } = WEB_CSP_DIRECTIVES;
    const sources = Object.values(others)
      .flat()
      .filter((source) => source.startsWith("https://"));
    for (const source of sources) {
      expect(new URL(source).hostname, source).toMatch(/(^|\.)line\.me$|(^|\.)line-scdn\.net$/);
    }
    // 画像だけは、Threads のプロフィールの画像（Meta の画像の置き場所）も許す
    for (const source of imgSrc.filter((value) => value.startsWith("https://"))) {
      expect(source).toMatch(
        /^https:\/\/(profile\.line-scdn\.net|\*\.cdninstagram\.com|\*\.fbcdn\.net)$/,
      );
    }
  });
});
