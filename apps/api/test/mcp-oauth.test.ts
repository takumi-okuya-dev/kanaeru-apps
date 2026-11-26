// MCP の認可の結合のテスト（本物の PostgreSQL・core-021・AD-21）：メタデータ・DCR・認可・同意・トークン・更新・使い回しの検出。
// 外へは出ない（CIMD は取りに行けない形で、安全に断ることだけ確かめる）。
import { describe, expect, it, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { TEST_ORIGIN, buildApp, jsonRequest, testConfig } from "./helpers/app.ts";
import type { TestApp } from "./helpers/app.ts";
import { loginAs, testLineUserId, withCookie } from "./helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "./helpers/db.ts";

const database = useTestDatabase();
const REDIRECT = "http://127.0.0.1:1455/callback";
const VERIFIER = "v".repeat(60);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const STATE = "state-value-1234";
const RESOURCE = `${TEST_ORIGIN}/api/mcp`;

/** テストの API（試験用のログインが使える設定）。 */
function makeApp(): TestApp {
  return buildApp(database, testConfig({ testLoginEnabled: true }));
}

/**
 * 項目の組を問い合わせの文字列にする。
 * @param fields 項目
 * @returns 問い合わせの文字列
 */
function qs(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

/**
 * 登録した DCR のクライアントを作る。
 * @param app API
 * @returns client_id
 */
async function registerClient(app: TestApp): Promise<string> {
  const response = await app.request(
    "/api/oauth/register",
    jsonRequest("POST", { client_name: "テストの CLI", redirect_uris: [REDIRECT] }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { client_id: string }).client_id;
}

/**
 * 認可の要求の項目を作る。
 * @param clientId client_id
 * @param overrides 替える項目
 * @returns 項目
 */
function params(clientId: string, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    state: STATE,
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: RESOURCE,
    ...overrides,
  };
}

/**
 * 同意の送信を、ログイン済みの利用者として行い、戻り先の URL を返す。
 * @param app API
 * @param cookie ログインのクッキー
 * @param clientId client_id
 * @param decision 許す・断る
 * @returns 戻り先の URL
 */
async function decide(app: TestApp, cookie: string, clientId: string, decision: "approve" | "deny"): Promise<string> {
  const meta = (await (await app.request("/.well-known/oauth-protected-resource")).json()) as { scopes_supported: string[] };
  const response = await app.request(
    "/api/oauth/authorize/decision",
    withCookie(cookie, jsonRequest("POST", { ...params(clientId), decision, granted_scopes: meta.scopes_supported })),
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { redirectTo: string }).redirectTo;
}

/**
 * トークンの要求を送る（フォームの形）。
 * @param app API
 * @param form 項目
 * @returns 応答
 */
function tokenRequest(app: TestApp, form: Record<string, string>) {
  return app.request("/api/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
}

/**
 * 戻り先の URL から code を取る。
 * @param url 戻り先の URL
 * @returns code と iss と state
 */
function parseRedirect(url: string): { code: string | null; iss: string | null; state: string | null; error: string | null } {
  const u = new URL(url);
  return {
    code: u.searchParams.get("code"),
    iss: u.searchParams.get("iss"),
    state: u.searchParams.get("state"),
    error: u.searchParams.get("error"),
  };
}

beforeEach(async () => {
  await truncateAllTables(database);
});

describe("認可のメタデータ（RFC 9728・8414）", () => {
  it("発行者は画面の源。/api/mcp を保護資源として名指す。PKCE は S256、iss を返す", async () => {
    const app = makeApp();
    const asMeta = (await (await app.request("/.well-known/oauth-authorization-server")).json()) as Record<string, unknown>;
    expect(asMeta.issuer).toBe(TEST_ORIGIN);
    expect(asMeta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(asMeta.client_id_metadata_document_supported).toBe(true);
    expect(asMeta.authorization_response_iss_parameter_supported).toBe(true);
    const prMeta = (await (await app.request("/.well-known/oauth-protected-resource")).json()) as Record<string, unknown>;
    expect(prMeta.resource).toBe(RESOURCE);
    expect(prMeta.authorization_servers).toEqual([TEST_ORIGIN]);
    expect(prMeta.bearer_methods_supported).toEqual(["header"]);
  });
});

describe("クライアントの登録（DCR）", () => {
  it("戻り先の登録は https かループバックの http だけ。それ以外は断る", async () => {
    const app = makeApp();
    const bad = await app.request(
      "/api/oauth/register",
      jsonRequest("POST", { client_name: "x", redirect_uris: ["http://example.com/cb"] }),
    );
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_redirect_uri");
    const ok = await app.request(
      "/api/oauth/register",
      jsonRequest("POST", { client_name: "CLI", redirect_uris: [REDIRECT] }),
    );
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { client_id: string }).client_id).toMatch(/^dcr_/);
  });
});

describe("認可の要求", () => {
  it("正しい要求は同意の画面へ送る（要求の項目を引き継ぐ）", async () => {
    const app = makeApp();
    const clientId = await registerClient(app);
    const response = await app.request(`/api/oauth/authorize?${qs(params(clientId))}`, { redirect: "manual" });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/oauth/consent");
    expect(location.searchParams.get("state")).toBe(STATE);
  });

  it("登録にない戻り先・わからない client_id は直接の 400（戻り先へは送らない）", async () => {
    const app = makeApp();
    const clientId = await registerClient(app);
    const badRedirect = await app.request(
      `/api/oauth/authorize?${qs(params(clientId, { redirect_uri: "http://127.0.0.1:9/other" }))}`,
      { redirect: "manual" },
    );
    expect(badRedirect.status).toBe(400);
    const unknown = await app.request(`/api/oauth/authorize?${qs(params("dcr_nope"))}`, { redirect: "manual" });
    expect(unknown.status).toBe(400);
    // CIMD の文書は外へ出ずに取れない（安全に断る）
    const cimd = await app.request(
      `/api/oauth/authorize?${qs(params("https://nowhere.invalid/client.json"))}`,
      { redirect: "manual" },
    );
    expect(cimd.status).toBe(400);
  });

  it("宛先が /api/mcp でない・PKCE が plain は、戻り先へ error を返す（state と iss つき）", async () => {
    const app = makeApp();
    const clientId = await registerClient(app);
    const wrongResource = await app.request(
      `/api/oauth/authorize?${qs(params(clientId, { resource: `${TEST_ORIGIN}/api/v1/x` }))}`,
      { redirect: "manual" },
    );
    expect(wrongResource.status).toBe(302);
    const r1 = parseRedirect(wrongResource.headers.get("location") ?? "");
    expect(r1.error).toBe("invalid_target");
    expect(r1.state).toBe(STATE);
    expect(r1.iss).toBe(TEST_ORIGIN);

    const plain = await app.request(
      `/api/oauth/authorize?${qs(params(clientId, { code_challenge_method: "plain" }))}`,
      { redirect: "manual" },
    );
    expect(plain.status).toBe(400); // method が S256 以外は入力の形で断る
  });
});

describe("同意とトークン（全体の流れ）", () => {
  it("許す → コードを交換 → 更新 → 使い回しで同意ごと止まる", async () => {
    const app = makeApp();
    const clientId = await registerClient(app);
    const { cookie } = await loginAs(app, { lineUserId: testLineUserId() });

    const redirect = await decide(app, cookie, clientId, "approve");
    const got = parseRedirect(redirect);
    expect(got.code).toBeTruthy();
    expect(got.state).toBe(STATE);
    expect(got.iss).toBe(TEST_ORIGIN);

    const token = await tokenRequest(app, {
      grant_type: "authorization_code",
      code: got.code ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: VERIFIER,
      resource: RESOURCE,
    });
    expect(token.status).toBe(200);
    expect(token.headers.get("cache-control")).toBe("no-store");
    const tokens = (await token.json()) as { access_token: string; refresh_token: string; token_type: string; scope: string };
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.access_token.length).toBeGreaterThan(20);
    expect(tokens.scope.length).toBeGreaterThan(0);

    // 更新：新しい組が出て、古い更新の札は使えない
    const refreshed = await tokenRequest(app, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      resource: RESOURCE,
    });
    expect(refreshed.status).toBe(200);
    const again = await tokenRequest(app, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      resource: RESOURCE,
    });
    expect(again.status).toBe(400);

    // コードの使い回し：同意ごと止まり、新しく出た札も使えなくなる
    const reuse = await tokenRequest(app, {
      grant_type: "authorization_code",
      code: got.code ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: VERIFIER,
      resource: RESOURCE,
    });
    expect(reuse.status).toBe(400);
    const newer = (await refreshed.json()) as { refresh_token: string };
    const afterReuse = await tokenRequest(app, {
      grant_type: "refresh_token",
      refresh_token: newer.refresh_token,
      client_id: clientId,
      resource: RESOURCE,
    });
    expect(afterReuse.status).toBe(400);
  });

  it("PKCE が合わないと発行しない。断ると、戻り先に access_denied が返る", async () => {
    const app = makeApp();
    const clientId = await registerClient(app);
    const { cookie } = await loginAs(app, { lineUserId: testLineUserId() });

    const denied = parseRedirect(await decide(app, cookie, clientId, "deny"));
    expect(denied.error).toBe("access_denied");
    expect(denied.code).toBeNull();

    const got = parseRedirect(await decide(app, cookie, clientId, "approve"));
    const wrong = await tokenRequest(app, {
      grant_type: "authorization_code",
      code: got.code ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: "w".repeat(60),
      resource: RESOURCE,
    });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: string }).error).toBe("invalid_grant");
  });

  it("同意の送信はログインが要り、画面の源と違う Origin は断る", async () => {
    const app = makeApp();
    const clientId = await registerClient(app);
    const anon = await app.request(
      "/api/oauth/authorize/decision",
      jsonRequest("POST", { ...params(clientId), decision: "approve" }),
    );
    expect(anon.status).toBe(401);

    const { cookie } = await loginAs(app, { lineUserId: testLineUserId() });
    const foreign = await app.request(
      "/api/oauth/authorize/decision",
      withCookie(cookie, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ ...params(clientId), decision: "approve" }),
      }),
    );
    expect(foreign.status).toBe(403);
  });

  it("未知のクライアントはトークンを出さない（invalid_client）", async () => {
    const app = makeApp();
    const response = await tokenRequest(app, {
      grant_type: "refresh_token",
      refresh_token: "x".repeat(43),
      client_id: "dcr_unknown",
      resource: RESOURCE,
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe("invalid_client");
  });
});
