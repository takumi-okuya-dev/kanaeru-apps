// /api/mcp の結合のテスト（本物の PostgreSQL・core-021）：札の確かめ・宛先・Origin・範囲で見せる道具・記録・回数の制限。
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { registerMcpRoute } from "../src/modules/account/oauth/mcp.ts";
import type { McpTool } from "../src/modules/account/oauth/mcp.ts";
import { insertToken } from "../src/modules/account/oauth/store.ts";
import { generateOpaqueToken } from "../src/modules/account/oauth/tokens.ts";
import type { ApiEnv, DomainRouteDeps } from "../src/kernel/http.ts";
import { mcpToolCall, oauthToken } from "../src/modules/account/schema.ts";
import { hashOpaqueToken } from "../src/modules/account/oauth/tokens.ts";
import { TEST_ORIGIN, buildApp, jsonRequest, testConfig } from "./helpers/app.ts";
import type { TestApp } from "./helpers/app.ts";
import { loginAs, testLineUserId, withCookie } from "./helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "./helpers/db.ts";

const database = useTestDatabase();
const REDIRECT = "http://127.0.0.1:1455/callback";
const VERIFIER = "v".repeat(60);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const RESOURCE = `${TEST_ORIGIN}/api/mcp`;
const PROTOCOL = "2025-11-25";

/**
 * 同意の送信から、アクセストークンを1つ取る（認可の全体の流れを通す）。
 * @param app API
 * @param scopes 同意する範囲（省けば、すべて）
 * @returns 札と同意の情報
 */
async function obtainAccessToken(app: TestApp, scopes?: string[]): Promise<{ access: string; clientId: string }> {
  const reg = await app.request(
    "/api/oauth/register",
    jsonRequest("POST", { client_name: "テスト", redirect_uris: [REDIRECT] }),
  );
  const clientId = ((await reg.json()) as { client_id: string }).client_id;
  const { cookie } = await loginAs(app, { lineUserId: testLineUserId() });
  const meta = (await (await app.request("/.well-known/oauth-protected-resource")).json()) as { scopes_supported: string[] };
  const fields = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    state: "state-value-1234",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: RESOURCE,
  };
  const decision = await app.request(
    "/api/oauth/authorize/decision",
    withCookie(cookie, jsonRequest("POST", { ...fields, decision: "approve", granted_scopes: scopes ?? meta.scopes_supported })),
  );
  const redirected = new URL(((await decision.json()) as { redirectTo: string }).redirectTo);
  const token = await app.request("/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: redirected.searchParams.get("code") ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: VERIFIER,
      resource: RESOURCE,
    }).toString(),
  });
  const body = (await token.json()) as { access_token: string };
  return { access: body.access_token, clientId };
}

/**
 * JSON-RPC の要求を /api/mcp に送る。
 * @param app API
 * @param body 要求の本文
 * @param headers 見出し（札など）
 * @returns 応答
 */
function mcp(app: TestApp | OpenAPIHono<ApiEnv>, body: unknown, headers: Record<string, string> = {}) {
  return app.request("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "test", version: "1" } },
};

beforeEach(async () => {
  await truncateAllTables(database);
});

describe("/api/mcp の札の確かめ", () => {
  it("札がない・クッキーだけ・札の形が違う は 401 と、どこで認可するかの案内（WWW-Authenticate）", async () => {
    const app = buildApp(database, testConfig({ testLoginEnabled: true }));
    const none = await mcp(app, INIT);
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toContain("resource_metadata=");
    expect(none.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource");

    const { cookie } = await loginAs(app, { lineUserId: testLineUserId() });
    const cookieOnly = await mcp(app, INIT, { cookie });
    expect(cookieOnly.status).toBe(401);

    const malformed = await mcp(app, INIT, { authorization: "Bearer short" });
    expect(malformed.status).toBe(401);
  });

  it("別の宛先（resource）のトークンは 401（FR-007）", async () => {
    const app = buildApp(database, testConfig({ testLoginEnabled: true }));
    const { access } = await obtainAccessToken(app);
    // 同じ同意で、別の宛先のトークンを作る（流用されても受けない）
    const grantId = await grantIdOf(access);
    const other = generateOpaqueToken();
    await insertToken(database.db, {
      tokenHash: other.tokenHash,
      kind: "access",
      grantId,
      resource: "https://elsewhere.example/api/mcp",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const response = await mcp(app, INIT, { authorization: `Bearer ${other.token}` });
    expect(response.status).toBe(401);
  });

  it("画面の源と違う Origin は 403", async () => {
    const app = buildApp(database, testConfig({ testLoginEnabled: true }));
    const { access } = await obtainAccessToken(app);
    const foreign = await mcp(app, INIT, { authorization: `Bearer ${access}`, origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
  });
});

describe("/api/mcp の応答", () => {
  it("札があれば initialize に答え、道具は範囲で見せる（道具を登録していなければ空）", async () => {
    const app = buildApp(database, testConfig({ testLoginEnabled: true }));
    const { access } = await obtainAccessToken(app);
    const init = await mcp(app, INIT, { authorization: `Bearer ${access}` });
    expect(init.status).toBe(200);
    const initBody = (await init.json()) as { result?: { serverInfo?: { name: string } } };
    expect(initBody.result?.serverInfo?.name).toBe("kanaeru");

    const list = await mcp(app, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, { authorization: `Bearer ${access}` });
    const listBody = (await list.json()) as { result?: { tools: unknown[] } };
    expect(listBody.result?.tools).toEqual([]);
  });
});

describe("/api/mcp の道具（範囲・記録）", () => {
  const readTool: McpTool = {
    name: "echo_record",
    description: "テスト用の読む道具",
    access: "read",
    requiredScope: "reception:read",
    inputSchema: z.object({ word: z.string() }),
    run: (input) => Promise.resolve(`echo:${(input as { word: string }).word}`),
  };
  const writeTool: McpTool = {
    name: "write_thing",
    description: "テスト用の書く道具（範囲 write が要る）",
    access: "write",
    requiredScope: "reception:write",
    inputSchema: z.object({}),
    run: () => Promise.resolve("written"),
  };

  /**
   * テスト用の道具だけを持つ /api/mcp の道を作る（本番の一覧は空のまま）。
   * @returns 道を持つ API
   */
  function appWithTools(): OpenAPIHono<ApiEnv> {
    const deps = {
      db: database.db,
      config: testConfig({ testLoginEnabled: true }),
    } as unknown as DomainRouteDeps;
    return registerMcpRoute(new OpenAPIHono<ApiEnv>(), deps, [readTool, writeTool]);
  }

  it("範囲にある道具だけ見せ、呼ぶと結果を返し、記録を1件残す（中身は残さない）", async () => {
    const app = buildApp(database, testConfig({ testLoginEnabled: true }));
    // 範囲は読むだけ（reception:read）。テスト用の道具は別の API に登録する
    const { access } = await obtainAccessToken(app, ["reception:read"]);
    const tools = appWithTools();
    const list = await mcp(tools, { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }, { authorization: `Bearer ${access}` });
    const names = ((await list.json()) as { result?: { tools: Array<{ name: string }> } }).result?.tools.map((t) => t.name);
    // reception:read のトークンが見せるのは reception:read の道具だけ（write の道具は出ない）
    expect(names).toEqual(["echo_record"]);

    const call = await mcp(
      tools,
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "echo_record", arguments: { word: "hi" } } },
      { authorization: `Bearer ${access}` },
    );
    const callBody = (await call.json()) as { result?: { content: Array<{ text: string }> } };
    expect(callBody.result?.content[0]?.text).toBe("echo:hi");

    const records = await database.db.select().from(mcpToolCall);
    expect(records.map((r) => r.toolName)).toEqual(["echo_record"]);
    expect(JSON.stringify(records)).not.toContain("hi");
  });
});

/**
 * 札の同意の ID を引く（テストの手伝い：札の SHA-256 から）。
 * @param access アクセストークン
 * @returns 同意の ID
 */
async function grantIdOf(access: string): Promise<string> {
  const [row] = await database.db
    .select({ grantId: oauthToken.grantId })
    .from(oauthToken)
    .where(eq(oauthToken.tokenHash, hashOpaqueToken(access)))
    .limit(1);
  if (!row) throw new Error("札が見つからない");
  return row.grantId;
}
