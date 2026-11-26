// 接続の一覧・取り消し・退会（本物の PostgreSQL・core-021・FR-015・SC-004・T041）。
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { TEST_ORIGIN, buildApp, jsonRequest, testConfig } from "./helpers/app.ts";
import type { TestApp } from "./helpers/app.ts";
import { loginAs, testLineUserId, withCookie } from "./helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "./helpers/db.ts";

const database = useTestDatabase();
const REDIRECT = "http://127.0.0.1:1455/callback";
const VERIFIER = "v".repeat(60);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const RESOURCE = `${TEST_ORIGIN}/api/mcp`;

/**
 * 利用者の同意を1つ作り、札を返す（認可の流れを通す）。
 * @param app API
 * @param cookie その利用者のクッキー
 * @returns 札
 */
async function connect(app: TestApp, cookie: string): Promise<string> {
  const reg = await app.request(
    "/api/oauth/register",
    jsonRequest("POST", { client_name: "テストの AI", redirect_uris: [REDIRECT] }),
  );
  const clientId = ((await reg.json()) as { client_id: string }).client_id;
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
    withCookie(
      cookie,
      jsonRequest("POST", { ...fields, decision: "approve", granted_scopes: ["reception:read"] }),
    ),
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
  return ((await token.json()) as { access_token: string }).access_token;
}

/**
 * 札で /api/mcp の一覧を呼ぶ（取り消しの確かめに使う）。
 * @param app API
 * @param token 札
 * @returns 応答の状態
 */
async function mcpStatus(app: TestApp, token: string): Promise<number> {
  const response = await app.request("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  return response.status;
}

beforeEach(async () => {
  await truncateAllTables(database);
});

describe("接続の一覧と取り消し（FR-015）", () => {
  it("一覧は自分の接続だけ。取り消すと、その札は次の呼び出しから使えない（SC-004）", async () => {
    const app = buildApp(database, testConfig({ testLoginEnabled: true }));
    const alice = await loginAs(app, { lineUserId: testLineUserId() });
    const bob = await loginAs(app, { lineUserId: testLineUserId() });
    const aliceToken = await connect(app, alice.cookie);
    const bobToken = await connect(app, bob.cookie);

    const list = await app.request("/api/v1/accounts/me/connections", withCookie(alice.cookie));
    const { connections } = (await list.json()) as {
      connections: Array<{ id: string; clientName: string; scopes: string[] }>;
    };
    expect(connections.length).toBe(1);
    expect(connections[0]?.clientName).toBe("テストの AI");
    expect(connections[0]?.scopes).toEqual(["reception:read"]);
    const aliceGrant = connections[0]?.id ?? "";

    // ほかの人の接続は取り消せない（404）・札は使えたまま
    const bobGrantList = await app.request(
      "/api/v1/accounts/me/connections",
      withCookie(bob.cookie),
    );
    const bobGrant =
      ((await bobGrantList.json()) as { connections: Array<{ id: string }> }).connections[0]?.id ??
      "";
    const foreign = await app.request(
      `/api/v1/accounts/me/connections/${bobGrant}`,
      withCookie(alice.cookie, { method: "DELETE" }),
    );
    expect(foreign.status).toBe(404);
    expect(await mcpStatus(app, bobToken)).toBe(200);

    // 取り消す → 次の呼び出しから 401
    expect(await mcpStatus(app, aliceToken)).toBe(200);
    const revoke = await app.request(
      `/api/v1/accounts/me/connections/${aliceGrant}`,
      withCookie(alice.cookie, { method: "DELETE" }),
    );
    expect(revoke.status).toBe(204);
    expect(await mcpStatus(app, aliceToken)).toBe(401);
    const after = await app.request("/api/v1/accounts/me/connections", withCookie(alice.cookie));
    expect(((await after.json()) as { connections: unknown[] }).connections).toEqual([]);
  });

  it("ログインのない人は一覧も取り消しも 401", async () => {
    const app = buildApp(database, testConfig({ testLoginEnabled: true }));
    expect((await app.request("/api/v1/accounts/me/connections")).status).toBe(401);
  });
});

describe("退会と接続（T041）", () => {
  it("退会すると、その人の接続と札はすべて使えなくなる", async () => {
    const app = buildApp(database, testConfig({ testLoginEnabled: true }));
    const carol = await loginAs(app, { lineUserId: testLineUserId() });
    const token = await connect(app, carol.cookie);
    expect(await mcpStatus(app, token)).toBe(200);

    const withdraw = await app.request(
      "/api/v1/accounts/me",
      withCookie(carol.cookie, { method: "DELETE" }),
    );
    expect(withdraw.status).toBe(204);
    expect(await mcpStatus(app, token)).toBe(401);
  });
});
