// 組み立てのテスト：エラーの形・要求の ID・守りの見出し・源の確かめ・本文の大きさ・回数の制限・窓口の文書・
// createRoute を通さない道で起動を止めること。
import { createServer } from "node:net";
import type { AddressInfo, Socket } from "node:net";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { DB_UNAVAILABLE_MESSAGES } from "@workspace/contracts/core";
import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../src/kernel/db.ts";
import { uuidParam } from "../src/kernel/http.ts";
import { OPENAPI_DOC_PATH, toFieldErrors } from "../src/app.ts";
import type { AppEnv, DomainModule, DomainRouteDeps } from "../src/app.ts";
import { TEST_ORIGIN, buildApp, jsonRequest, testConfig } from "./helpers/app.ts";
import { useTestDatabase } from "./helpers/db.ts";

const database = useTestDatabase();

/** 予期しないエラーの文（応答に出てはいけない）。 */
const SECRET_ERROR_TEXT = "秘密の中身-operator@example.com";

/** テストだけの領域：状態を変える道と、予期しないエラーを投げる道。 */
const testModule: DomainModule = {
  routes: () =>
    new OpenAPIHono<AppEnv>()
      .openapi(
        createRoute({
          method: "post",
          path: "/api/v1/test-only/echo",
          request: {
            body: {
              content: {
                "application/json": {
                  schema: z.strictObject({ value: z.string(), count: z.number().optional() }),
                },
              },
            },
          },
          responses: { 200: { description: "受け取った" } },
        }),
        (c) => c.json({ ok: true }, 200),
      )
      .openapi(
        createRoute({
          method: "get",
          path: "/api/v1/test-only/items/{itemId}",
          request: { params: z.object({ itemId: uuidParam("itemId", "ID") }) },
          responses: { 200: { description: "形の合う ID" } },
        }),
        // 処理の中では ID の形を確かめない（約束で確かめる）
        (c) => c.json({ id: c.req.valid("param").itemId }, 200),
      )
      .openapi(
        createRoute({
          method: "get",
          path: "/api/v1/test-only/status/{status}",
          request: { params: z.object({ status: z.string() }) },
          responses: { 200: { description: "HTTPException を投げる" } },
        }),
        (c) => {
          throw new HTTPException(Number(c.req.valid("param").status) as 429);
        },
      )
      .openapi(
        createRoute({
          method: "get",
          path: "/api/v1/test-only/boom",
          responses: { 200: { description: "投げる" } },
        }),
        () => {
          throw new TypeError(SECRET_ERROR_TEXT);
        },
      ),
};

describe("組み立て", () => {
  it("領域には、秘密でない設定と外への出口だけを渡す（DB の接続先・環境の名前は渡さない）", () => {
    let received: DomainRouteDeps | undefined;
    const fakeFetch: typeof fetch = () => Promise.resolve(new Response(null));
    const spy: DomainModule = {
      routes: (deps) => {
        received = deps;
        return new OpenAPIHono<AppEnv>();
      },
    };
    buildApp(database, testConfig({ lineChannelIds: ["1234567890"] }), {
      extraModules: [spy],
      fetch: fakeFetch,
    });
    expect(Object.keys(received?.config ?? {}).sort()).toEqual([
      "lineChannelIds",
      "openChatUrl",
      "organizerLineUserId",
      "testLoginEnabled",
      "webUrl",
    ]);
    expect(received?.config.lineChannelIds).toEqual(["1234567890"]);
    expect(received?.fetch).toBe(fakeFetch);
  });

  it("動いているかの窓口は、DB につながれば ok を返し、要求の ID と守りの見出しをつける", async () => {
    const app = buildApp(database);
    const response = await app.request("/api/v1/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    // http の源（手元）では HSTS を出さない
    expect(response.headers.get("strict-transport-security")).toBeNull();
  });

  it("WEB_URL が https のときだけ Strict-Transport-Security がつく", async () => {
    const app = buildApp(database, testConfig({ webUrl: "https://app.example.com" }));
    const response = await app.request("/api/v1/health");
    expect(response.headers.get("strict-transport-security")).toMatch(
      /^max-age=\d{8,}; includeSubDomains$/,
    );
  });

  it("送られた要求の ID が正しい形なら、そのまま返す", async () => {
    const app = buildApp(database);
    const response = await app.request("/api/v1/health", {
      headers: { "x-request-id": "abc-123" },
    });
    expect(response.headers.get("x-request-id")).toBe("abc-123");
  });

  it("ない道は、エラーの本文の形の 404", async () => {
    const app = buildApp(database);
    const response = await app.request("/api/v1/nothing-here");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("予期しないエラーは 500 の INTERNAL で、中身を応答に出さない", async () => {
    const app = buildApp(database, testConfig(), { extraModules: [testModule] });
    const response = await app.request("/api/v1/test-only/boom");
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("INTERNAL");
    expect(text).not.toContain(SECRET_ERROR_TEXT);
  });

  it("入力が合わなければ 400 の INVALID_INPUT と、欄ごとの日本語の理由", async () => {
    const app = buildApp(database, testConfig(), { extraModules: [testModule] });
    const response = await app.request(
      "/api/v1/test-only/echo",
      jsonRequest("POST", { count: "x", extra: 1 }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; fields: unknown[] } };
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.fields).toEqual(
      expect.arrayContaining([
        { path: "value", message: "入れてください。" },
        { path: "count", message: "形が合いません。" },
        { path: "extra", message: "この欄は受け取れません。" },
      ]),
    );
  });

  it("約束に書いた日本語の文は、そのまま欄の理由にする", () => {
    const schema = z.object({ title: z.string().min(1, { error: "題を入れてください。" }) });
    const result = schema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(toFieldErrors(result.error.issues, { title: "" })).toEqual([
      { path: "title", message: "題を入れてください。" },
    ]);
  });

  it("画面と違う源（Origin）からの書きこみは 403、同じ源なら通す", async () => {
    const app = buildApp(database, testConfig(), { extraModules: [testModule] });
    const other = await app.request("/api/v1/test-only/echo", {
      ...jsonRequest("POST", { value: "x" }),
      headers: { "content-type": "application/json", origin: "https://evil.example.com" },
    });
    expect(other.status).toBe(403);
    expect(((await other.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    const same = await app.request("/api/v1/test-only/echo", jsonRequest("POST", { value: "x" }));
    expect(same.status).toBe(200);
  });

  it("本文が大きすぎれば 413 の PAYLOAD_TOO_LARGE", async () => {
    const app = buildApp(database, testConfig(), { extraModules: [testModule] });
    const response = await app.request(
      "/api/v1/test-only/echo",
      jsonRequest("POST", { value: "あ".repeat(60_000) }),
    );
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "PAYLOAD_TOO_LARGE",
    );
  });

  it("書く操作が上限を超えたら 429 と Retry-After。読む操作は数えない", async () => {
    const config = testConfig({ rateLimit: { enabled: true, windowSeconds: 60, max: 2 } });
    const app = buildApp(database, config, { extraModules: [testModule] });
    for (let index = 0; index < 3; index += 1) {
      expect((await app.request("/api/v1/health")).status).toBe(200);
    }
    const statuses: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await app.request(
        "/api/v1/test-only/echo",
        jsonRequest("POST", { value: "x" }),
      );
      statuses.push(response.status);
      if (response.status === 429) expect(response.headers.get("retry-after")).toBeTruthy();
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it("窓口の文書は OPENAPI_DOC_ENABLED のときだけ出し、すべての道が載る", async () => {
    const enabled = buildApp(database, testConfig({ openApiDocEnabled: true }));
    const response = await enabled.request(OPENAPI_DOC_PATH);
    expect(response.status).toBe(200);
    const document = (await response.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toContain("/api/v1/health");

    const disabled = buildApp(database, testConfig({ openApiDocEnabled: false }));
    expect((await disabled.request(OPENAPI_DOC_PATH)).status).toBe(404);
  });

  it("createRoute を通さない道（Hono の .get）を /api の下に足すと、組み立てが止まる", () => {
    const plain: DomainModule = {
      routes: () => {
        const routes = new OpenAPIHono<AppEnv>();
        routes.get("/api/v1/test-only/plain", (c) => c.json({}, 200));
        return routes;
      },
    };
    expect(() => buildApp(database, testConfig(), { extraModules: [plain] })).toThrow(
      "createRoute を通さない道があります",
    );
  });

  it("DOMAIN_FEATURES に登録されていない領域の名前があると、組み立てが止まる", () => {
    expect(() => buildApp(database, testConfig({ domainFeatures: ["nosuch.thing"] }))).toThrow(
      "nosuch.thing",
    );
  });

  it("道の ID が uuid の形でなければ、処理の前に 404（NOT_FOUND）。形が合えば処理に渡す", async () => {
    const app = buildApp(database, testConfig(), { extraModules: [testModule] });
    for (const id of ["not-a-uuid", "1' OR '1'='1", "0193a1b2-0000-7000-8000-00000000000"]) {
      const response = await app.request(`/api/v1/test-only/items/${encodeURIComponent(id)}`);
      expect(response.status, id).toBe(404);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
    }
    const ok = await app.request("/api/v1/test-only/items/0193A1B2-0000-7000-8000-000000000000");
    expect(ok.status).toBe(200);
  });

  it("投げられた HTTPException は、状態の番号に合う土台の code にする（429・500 を含む）", async () => {
    const app = buildApp(database, testConfig(), { extraModules: [testModule] });
    for (const [status, code] of [
      [400, "INVALID_INPUT"],
      [404, "NOT_FOUND"],
      [413, "PAYLOAD_TOO_LARGE"],
      [429, "RATE_LIMITED"],
      [500, "INTERNAL"],
      [503, "DB_UNAVAILABLE"],
    ] as const) {
      const response = await app.request(`/api/v1/test-only/status/${status}`);
      expect(response.status).toBe(status);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(code);
    }
  });

  it("IPv6 は /64 ごとに数える（/64 の中で IP を替えても、上限は効く）", async () => {
    const config = testConfig({
      rateLimit: { enabled: true, windowSeconds: 60, max: 2 },
      trustedProxyHops: 1,
    });
    const app = buildApp(database, config, { extraModules: [testModule] });
    /**
     * 中継が付けた IP から、書く操作を送る。
     * @param ip 利用者の IP
     * @returns 状態の番号
     */
    const post = async (ip: string) => {
      const request = jsonRequest("POST", { value: "x" });
      const response = await app.request("/api/v1/test-only/echo", {
        ...request,
        headers: { ...(request.headers as Record<string, string>), "x-forwarded-for": ip },
      });
      return response.status;
    };
    expect(await post("2001:db8:1:2::1")).toBe(200);
    expect(await post("2001:db8:1:2::2")).toBe(200);
    expect(await post("2001:db8:1:2:ffff::3")).toBe(429);
    // ほかの /64 は別に数える
    expect(await post("2001:db8:1:3::1")).toBe(200);
  });

  it("DB が答えないときも、動いているかの窓口は時間の上限のうちに 503 を返す", async () => {
    // つないでも何も答えない口（DB が止まった・中継が詰まった形）
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const silent = createDatabase(`postgres://user:pass@127.0.0.1:${port}/app`, {
      connectTimeoutMs: 300,
      queryTimeoutMs: 300,
    });
    try {
      const app = buildApp(silent);
      const startedAt = performance.now();
      const response = await app.request("/api/v1/health");
      expect(response.status).toBe(503);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        "DB_UNAVAILABLE",
      );
      expect(performance.now() - startedAt).toBeLessThan(3000);
    } finally {
      await silent.pool.end().catch(() => undefined);
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("領域の窓口で DB に届かないときも、土台が 503 の DB_UNAVAILABLE にする（文は日本時間で選ぶ）", async () => {
    // 使っていない口（つなぐと拒まれる）
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise((resolve) => server.close(resolve));
    const refused = createDatabase(`postgres://user:pass@127.0.0.1:${port}/app`, {
      connectTimeoutMs: 1000,
      queryTimeoutMs: 1000,
    });
    const reads: DomainModule = {
      routes: (deps) =>
        new OpenAPIHono<AppEnv>()
          .openapi(
            createRoute({
              method: "get",
              path: "/api/v1/test-only/reads-db",
              responses: { 200: { description: "DB を読む（Drizzle が包む命令のエラー）" } },
            }),
            async (c) => {
              await deps.db.execute(sql`SELECT 1`);
              return c.json({ ok: true }, 200);
            },
          )
          .openapi(
            createRoute({
              method: "get",
              path: "/api/v1/test-only/tx-db",
              responses: {
                200: { description: "取引を始める（包まれない pool.connect() のエラー）" },
              },
            }),
            async (c) => {
              await deps.db.transaction(async (tx) => {
                await tx.execute(sql`SELECT 1`);
              });
              return c.json({ ok: true }, 200);
            },
          ),
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const app = buildApp(refused, testConfig(), { extraModules: [reads] });
      for (const [time, message] of [
        ["2026-11-25T03:00:00+09:00", DB_UNAVAILABLE_MESSAGES.nightStop],
        ["2026-11-25T14:00:00+09:00", DB_UNAVAILABLE_MESSAGES.temporary],
      ] as const) {
        vi.setSystemTime(new Date(time));
        for (const path of ["/api/v1/test-only/reads-db", "/api/v1/test-only/tx-db"]) {
          const response = await app.request(path);
          expect(response.status, `${time} ${path}`).toBe(503);
          const body = (await response.json()) as { error: { code: string; message: string } };
          expect(body.error.code, `${time} ${path}`).toBe("DB_UNAVAILABLE");
          expect(body.error.message, `${time} ${path}`).toBe(message);
        }
      }
    } finally {
      vi.useRealTimers();
      await refused.pool.end().catch(() => undefined);
    }
  });

  it("DB の層から来ていない通信の失敗（LINE への fetch の ENOTFOUND）は、DB_UNAVAILABLE にせず INTERNAL", async () => {
    const callsLine: DomainModule = {
      routes: () =>
        new OpenAPIHono<AppEnv>().openapi(
          createRoute({
            method: "get",
            path: "/api/v1/test-only/calls-line",
            responses: { 200: { description: "LINE を呼ぶ" } },
          }),
          () => {
            // fetch が名前を引けなかったときの形（TypeError に、ソケットのエラーが包まれる）
            throw new TypeError("fetch failed", {
              cause: Object.assign(new Error("getaddrinfo ENOTFOUND api.line.me"), {
                code: "ENOTFOUND",
                syscall: "getaddrinfo",
                hostname: "api.line.me",
              }),
            });
          },
        ),
    };
    const app = buildApp(database, testConfig(), { extraModules: [callsLine] });
    const response = await app.request("/api/v1/test-only/calls-line");
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("INTERNAL");
  });

  it("1つの命令が時間の上限を超えたら、待ち続けずに失敗する", async () => {
    const slow = createDatabase(database.databaseUrl, {
      connectTimeoutMs: 5000,
      queryTimeoutMs: 200,
    });
    try {
      await expect(slow.pool.query("SELECT pg_sleep(2)")).rejects.toThrow();
    } finally {
      await slow.pool.end();
    }
  });

  it("画面の源は、テストの設定のもの", () => {
    expect(testConfig().webUrl).toBe(TEST_ORIGIN);
  });
});
