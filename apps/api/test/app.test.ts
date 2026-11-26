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
import {
  BOOKING_WEBHOOK_RATE_LIMIT,
  OPENAPI_DOC_PATH,
  PUBLIC_READ_RATE_LIMIT,
  collectEventLinkRestrictions,
  collectPublicReadPaths,
  isPublicReadPath,
  orderWithdrawalSteps,
  toFieldErrors,
} from "../src/app.ts";
import type { AppEnv, DomainModule, DomainRouteDeps } from "../src/app.ts";
import { TEST_ORIGIN, buildApp, jsonRequest, testConfig } from "./helpers/app.ts";
import { loginAs, withCookie } from "./helpers/account.ts";
import { DEMO_APP } from "./helpers/suite.ts";
import { truncateAllTables, useTestDatabase } from "./helpers/db.ts";
import type { AppDefinition } from "@workspace/contracts/core";
import type { WithdrawalStep } from "../src/kernel/withdrawal.ts";

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
      "threadsApiBaseUrl",
      "webUrl",
    ]);
    expect(received?.config.lineChannelIds).toEqual(["1234567890"]);
    expect(received?.fetch).toBe(fakeFetch);
    // 秘密の値は、値ではなく道具（秘密の箱・合言葉の確かめ）にして渡す。設定がなければ箱はなく、合言葉はいつも合わない
    expect(Object.keys(received ?? {}).sort()).toEqual([
      "apps",
      "config",
      "db",
      "eventLinkRestrictions",
      "features",
      "fetch",
      "internalFetch",
      "isJobRequest",
      "logger",
      "mcpTools",
      "metaApp",
      "notifier",
      "secretBox",
      "withdrawalSteps",
    ]);
    expect(received?.secretBox).toBeUndefined();
    // 知らせを送る道具は、許可リストの値を持たず、テストでは偽の送り手で既定は止めている（booking-002）
    expect(received?.notifier?.fake).toBe(true);
    expect(received?.notifier?.mode).toBe("off");
    expect(received?.isJobRequest("Bearer ")).toBe(false);
    // Meta のアプリの設定がなければ、その道具もない
    expect(received?.metaApp).toBeUndefined();
  });

  it("鍵の束と合言葉の設定があれば、秘密の箱と合言葉の確かめを渡す（値は渡さない）", async () => {
    let received: DomainRouteDeps | undefined;
    const spy: DomainModule = {
      routes: (deps) => {
        received = deps;
        return new OpenAPIHono<AppEnv>();
      },
    };
    const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(5)));
    buildApp(
      database,
      testConfig({
        tokenEncryption: { keyRing: JSON.stringify({ "1": key }), currentVersion: 1 },
        jobTriggerSecret: "k".repeat(32),
      }),
      { extraModules: [spy] },
    );
    const sealed = await received?.secretBox?.seal("値", "id");
    expect(sealed?.keyVersion).toBe(1);
    expect(received?.isJobRequest(`Bearer ${"k".repeat(32)}`)).toBe(true);
    expect(JSON.stringify(received?.config)).not.toContain(key);
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

  it("フォームの形の書きこみは、Webhook の道（/api/v1/<領域>/webhooks/…）だけ源の確かめを通さない", async () => {
    // 外のサービス（Meta）は Origin なしのフォームの形で送る。Webhook の道は領域が署名で確かめる
    const accepted = createRoute({
      method: "post",
      path: "/api/v1/sample/webhooks/ping",
      responses: { 200: { description: "受け取った" } },
    });
    const plain = createRoute({
      method: "post",
      path: "/api/v1/test-only/form",
      responses: { 200: { description: "受け取った" } },
    });
    const forms: DomainModule = {
      routes: () =>
        new OpenAPIHono<AppEnv>()
          .openapi(accepted, (c) => c.json({}, 200))
          .openapi(plain, (c) => c.json({}, 200)),
    };
    const app = buildApp(database, testConfig(), { extraModules: [forms] });
    const form = {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "signed_request=x",
    };
    expect((await app.request("/api/v1/sample/webhooks/ping", form)).status).toBe(200);
    expect((await app.request("/api/v1/test-only/form", form)).status).toBe(403);
    // Webhook の道でも、画面と違う源（Origin）は止める
    const foreign = await app.request("/api/v1/sample/webhooks/ping", {
      ...form,
      headers: { ...form.headers, origin: "https://evil.example.com" },
    });
    expect(foreign.status).toBe(403);
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

  /** テストだけの Webhook の道（threads と booking の道の形。組み立ての回数の制限だけを見る）。 */
  const webhookModule: DomainModule = {
    routes: () =>
      new OpenAPIHono<AppEnv>()
        .openapi(
          createRoute({
            method: "post",
            path: "/api/v1/threads/webhooks/test-only-ping",
            responses: { 200: { description: "受け取った" } },
          }),
          (c) => c.json({}, 200),
        )
        .openapi(
          createRoute({
            method: "post",
            path: "/api/v1/booking/webhooks/test-only-ping",
            responses: { 200: { description: "受け取った" } },
          }),
          (c) => c.json({}, 200),
        ),
  };

  it("booking 以外の Webhook の道（threads の Meta など）は、今までどおり IP ごとのふつうの上限で数える", async () => {
    const config = testConfig({ rateLimit: { enabled: true, windowSeconds: 60, max: 2 } });
    const app = buildApp(database, config, { extraModules: [webhookModule, testModule] });
    const hook = () =>
      app.request("/api/v1/threads/webhooks/test-only-ping", jsonRequest("POST", { events: [] }));
    expect([(await hook()).status, (await hook()).status, (await hook()).status]).toEqual([
      200, 200, 429,
    ]);
    // ほかの書く道と同じ数を使う
    const echo = await app.request("/api/v1/test-only/echo", jsonRequest("POST", { value: "x" }));
    expect(echo.status).toBe(429);
  });

  it("booking の Webhook の道は、ふつうの上限で数えず、IP ごとの別の高めの上限で数える", async () => {
    const config = testConfig({ rateLimit: { enabled: true, windowSeconds: 60, max: 2 } });
    const app = buildApp(database, config, { extraModules: [webhookModule, testModule] });
    const hook = () =>
      app.request("/api/v1/booking/webhooks/test-only-ping", jsonRequest("POST", { events: [] }));
    const statuses: number[] = [];
    for (let index = 0; index < 5; index += 1) statuses.push((await hook()).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    // ふつうの上限の数を使わない（ほかの書く道は、今までどおり数える）
    const echo = () => app.request("/api/v1/test-only/echo", jsonRequest("POST", { value: "x" }));
    expect([(await echo()).status, (await echo()).status, (await echo()).status]).toEqual([
      200, 200, 429,
    ]);
    // 別の上限（BOOKING_WEBHOOK_RATE_LIMIT）を超えたら 429 と Retry-After
    for (let index = 5; index < BOOKING_WEBHOOK_RATE_LIMIT.max; index += 1) {
      expect((await hook()).status).toBe(200);
    }
    const over = await hook();
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBeTruthy();
  });

  it("booking の Webhook の道の別の上限も、RATE_LIMIT_ENABLED が切なら数えない", async () => {
    const config = testConfig({ rateLimit: { enabled: false, windowSeconds: 60, max: 2 } });
    const app = buildApp(database, config, { extraModules: [webhookModule] });
    for (let index = 0; index <= BOOKING_WEBHOOK_RATE_LIMIT.max; index += 1) {
      expect(
        (
          await app.request(
            "/api/v1/booking/webhooks/test-only-ping",
            jsonRequest("POST", { events: [] }),
          )
        ).status,
      ).toBe(200);
    }
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

  /** テストだけの、ログインなしで読める道（見るだけのページの形：札の道と、その版の道）を持つ領域（core-016）。 */
  const publicReadModule: DomainModule = {
    publicReadPaths: ["/api/v1/test-only/views/"],
    routes: () =>
      new OpenAPIHono<AppEnv>()
        .openapi(
          createRoute({
            method: "get",
            path: "/api/v1/test-only/views/{token}",
            request: { params: z.object({ token: z.string() }) },
            responses: { 200: { description: "見るだけの中身" } },
          }),
          (c) => c.json({ ok: true }, 200),
        )
        .openapi(
          createRoute({
            method: "get",
            path: "/api/v1/test-only/views/{token}/version",
            request: { params: z.object({ token: z.string() }) },
            responses: { 200: { description: "版の番号" } },
          }),
          (c) => c.json({ version: 1 }, 200),
        ),
  };

  it("ログインなしで読める道の頭は、自分の領域の道の下で、形の合うものだけ集める（core-016）", () => {
    const module = (paths: string[]): DomainModule => ({ publicReadPaths: paths });
    expect(
      collectPublicReadPaths([
        ["demo", module(["/api/v1/demo/views/", "/api/v1/demo/joins/"])],
        ["other", {}],
        ["extra:0", module(["/api/v1/test-only/views/", "/api/v1/demo/views/"])],
      ]),
    ).toEqual(["/api/v1/demo/views/", "/api/v1/demo/joins/", "/api/v1/test-only/views/"]);
    for (const bad of [
      "/api/v1/other/views/", // ほかの領域の道
      "/api/v1/demo/", // 領域全体
      "/api/v1/demo/views", // "/" で終わらない（"/api/v1/demo/viewsx" まで入る）
      "/api/v1/demo/../other/", // 形の外
      "/api/v1/demo/Views/",
      "/api/v2/demo/views/",
      "",
    ]) {
      expect(() => collectPublicReadPaths([["demo", module([bad])]]), bad).toThrow(
        "ログインなしで読める道の頭",
      );
    }
  });

  it("道が、ログインなしで読める道の頭で始まるかを見る（頭の外・似た名前の道は入らない）", () => {
    const prefixes = ["/api/v1/demo/views/", "/api/v1/demo/joins/"];
    expect(isPublicReadPath("/api/v1/demo/views/abc", prefixes)).toBe(true);
    expect(isPublicReadPath("/api/v1/demo/views/abc/version", prefixes)).toBe(true);
    expect(isPublicReadPath("/api/v1/demo/joins/abc", prefixes)).toBe(true);
    expect(isPublicReadPath("/api/v1/demo/views", prefixes)).toBe(false);
    expect(isPublicReadPath("/api/v1/demo/viewsx/abc", prefixes)).toBe(false);
    expect(isPublicReadPath("/api/v1/demo/tables/abc", prefixes)).toBe(false);
    expect(isPublicReadPath("/api/v1/other/views/abc", prefixes)).toBe(false);
    expect(isPublicReadPath("/api/v1/demo/views/abc", [])).toBe(false);
  });

  it("ログインなしで読める道の読む要求は、書く操作と別の上限（PUBLIC_READ_RATE_LIMIT）で IP ごとに数える", async () => {
    const config = testConfig({ rateLimit: { enabled: true, windowSeconds: 60, max: 2 } });
    const app = buildApp(database, config, { extraModules: [publicReadModule, testModule] });
    // 体育館の1つの IP の後ろの30人が、30秒おきに版を確かめる1分ぶん（60回）と、版が変わるたびの読み直し（30回）は通る
    for (let index = 0; index < 60; index += 1) {
      expect((await app.request(`/api/v1/test-only/views/t${index % 30}/version`)).status).toBe(
        200,
      );
    }
    for (let index = 0; index < 30; index += 1) {
      expect((await app.request(`/api/v1/test-only/views/t${index}`)).status).toBe(200);
    }
    // ふつうの上限（書く操作の2回）とは別に数える：見る要求が多くても、書く操作は止まらない
    const echo = () => app.request("/api/v1/test-only/echo", jsonRequest("POST", { value: "x" }));
    expect([(await echo()).status, (await echo()).status, (await echo()).status]).toEqual([
      200, 200, 429,
    ]);
    // 札の道と版の道は、同じ数を使う。上限を超えたら 429 と Retry-After
    for (let index = 90; index < PUBLIC_READ_RATE_LIMIT.max; index += 1) {
      expect((await app.request("/api/v1/test-only/views/t1")).status).toBe(200);
    }
    const over = await app.request("/api/v1/test-only/views/t1/version");
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBeTruthy();
    expect(((await over.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    // 頭の外の読む要求（ログインした画面の読み直しなど）は、今までどおり数えない
    for (let index = 0; index < 3; index += 1) {
      expect(
        (await app.request("/api/v1/test-only/items/0193A1B2-0000-7000-8000-000000000000")).status,
      ).toBe(200);
      expect((await app.request("/api/v1/health")).status).toBe(200);
    }
  });

  it("ログインなしで読める道の上限は、IP ごとに別に数え、RATE_LIMIT_ENABLED が切なら数えない", async () => {
    const limited = buildApp(
      database,
      testConfig({ rateLimit: { enabled: true, windowSeconds: 60, max: 2 }, trustedProxyHops: 1 }),
      { extraModules: [publicReadModule] },
    );
    /**
     * 中継が付けた IP から、見るだけの道を読む。
     * @param ip 利用者の IP
     * @returns 状態の番号
     */
    const view = async (ip: string) =>
      (await limited.request("/api/v1/test-only/views/t1", { headers: { "x-forwarded-for": ip } }))
        .status;
    for (let index = 0; index < PUBLIC_READ_RATE_LIMIT.max; index += 1) {
      expect(await view("203.0.113.1")).toBe(200);
    }
    expect(await view("203.0.113.1")).toBe(429);
    expect(await view("203.0.113.2")).toBe(200);

    const unlimited = buildApp(
      database,
      testConfig({ rateLimit: { enabled: false, windowSeconds: 60, max: 2 } }),
      { extraModules: [publicReadModule] },
    );
    for (let index = 0; index <= PUBLIC_READ_RATE_LIMIT.max; index += 1) {
      expect((await unlimited.request("/api/v1/test-only/views/t1")).status).toBe(200);
    }
  });

  it("ログインなしで読める道の頭が自分の領域の外を指すと、組み立てが止まる", () => {
    const stray: DomainModule = { publicReadPaths: ["/api/v1/other/views/"] };
    expect(() =>
      buildApp(database, testConfig(), { extraModules: { demo: stray }, extraApps: [DEMO_APP] }),
    ).toThrow("ログインなしで読める道の頭");
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

describe("退会の手順の並び（AD-22）", () => {
  /**
   * 呼ばれた順を書きとめる手順を作る。
   * @param name 名前
   * @param calls 書きとめる先
   * @param text 確かめの中身の文
   * @returns 手順
   */
  function recordingStep(name: string, calls: string[], text = name): WithdrawalStep {
    return {
      prepare: () => {
        calls.push(name);
        return Promise.resolve();
      },
      preview: () => Promise.resolve([{ kind: "delete", text }]),
    };
  }

  /**
   * テストのアプリを作る。
   * @param key アプリの key
   * @param domains 属する領域
   * @returns アプリの定義
   */
  function fakeApp(key: string, domains: string[]): AppDefinition {
    return {
      key,
      name: `アプリ${key}`,
      summary: "",
      description: "",
      icon: "list",
      domains,
      basePath: `/${key}`,
      uses: [],
      accountData: "",
    };
  }

  it("交流会の招待のリンクを絞る決まりは、出している領域のものだけを集める（AD-5・AD-23）", () => {
    const restricts = { restrictsLinks: () => Promise.resolve(true) };
    const never = { restrictsLinks: () => Promise.resolve(false) };
    const collected = collectEventLinkRestrictions([
      ["a1", { eventLinkRestriction: restricts }],
      ["nostep", {}],
      ["b1", { eventLinkRestriction: never }],
    ]);
    expect(collected).toEqual([restricts, never]);
  });

  it("共通の領域を先、アプリを一覧の順（アプリの中は domains の順）、テストの領域を最後に並べ、account は入れない", () => {
    const calls: string[] = [];
    const apps = [fakeApp("beta", ["b2", "b1"]), fakeApp("alpha", ["a1"])];
    const steps = orderWithdrawalSteps(
      [
        ["a1", { withdrawal: recordingStep("a1", calls) }],
        ["extra:0", { withdrawal: recordingStep("extra", calls) }],
        ["b1", { withdrawal: recordingStep("b1", calls) }],
        ["account", { withdrawal: recordingStep("account", calls) }],
        ["nostep", {}],
        ["b2", { withdrawal: recordingStep("b2", calls) }],
        ["suite", { withdrawal: recordingStep("suite", calls) }],
      ],
      apps,
    );
    expect(steps.map((step) => [step.domain, step.source])).toEqual([
      ["suite", "スイート"],
      ["b2", "アプリbeta"],
      ["b1", "アプリbeta"],
      ["a1", "アプリalpha"],
      ["extra:0", "スイート"],
    ]);
  });

  it("退会の窓口は、手順を順に流してから消し、確かめの中身は同じ順で出典つき。主催者がアカウントを消すときも流す", async () => {
    await truncateAllTables(database);
    const calls: string[] = [];
    const late = fakeApp("zlast", ["zlast"]);
    const app = buildApp(database, testConfig({ organizerLineUserId: `U${"e".repeat(32)}` }), {
      extraApps: [late],
      extraModules: {
        zlast: { withdrawal: recordingStep("zlast", calls, "見本の記録を消します。") },
      },
    });
    const { cookie, account } = await loginAs(app, { displayName: "退会する人" });
    const preview = await app.request("/api/v1/accounts/me/withdrawal", withCookie(cookie));
    expect(preview.status).toBe(200);
    const items = ((await preview.json()) as { items: { source: string; text: string }[] }).items;
    // 登録されたアプリの手順のあとに、テストのアプリの手順が来る
    expect(items.at(-1)).toEqual({
      kind: "delete",
      source: "アプリzlast",
      text: "見本の記録を消します。",
    });
    expect(
      (await app.request("/api/v1/accounts/me", withCookie(cookie, { method: "DELETE" }))).status,
    ).toBe(204);
    expect(calls).toEqual(["zlast"]);
    const gone = await database.pool.query("SELECT 1 FROM account WHERE id = $1", [account.id]);
    expect(gone.rowCount).toBe(0);

    const organizer = await loginAs(app, { lineUserId: `U${"e".repeat(32)}` });
    const target = await loginAs(app, { displayName: "消される人" });
    expect(
      (
        await app.request(
          `/api/v1/accounts/${target.account.id}`,
          withCookie(organizer.cookie, { method: "DELETE" }),
        )
      ).status,
    ).toBe(204);
    expect(calls).toEqual(["zlast", "zlast"]);
  });
});
