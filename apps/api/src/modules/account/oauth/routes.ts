// MCP の認可の道（core-021・AD-21）：メタデータ（RFC 9728・8414）・クライアントの登録（DCR）・認可・同意・トークン。
// - 認可のサーバーは kanaeru（画面の源）。発行者（issuer）は画面の源。FR-024 の独自ドメインまでは仮決め。
// - /.well-known の道は /api の外（画面に戻さない。platform/web の isServerPath）。
// - 認可と同意の要求は、同じ項目を毎回確かめる（同意の送信でも）。
// - 応答のエラーの形：トークンと登録は RFC 6749 の形。同意の送信は kanaeru のエラーの形。
// 仮決め（主催者の確かめ待ち）：DCR は1日 500 件まで。CIMD の文書は1日キャッシュ。範囲は読むだけ（書く範囲は次の段階）。
import { randomBytes } from "node:crypto";
import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/account";
import type { Context } from "hono";
import { AppError, domainErrorResponse } from "../../../kernel/errors.ts";
import type { ApiEnv, DomainRouteDeps } from "../../../kernel/http.ts";
import { fetchClientMetadata, CimdError, parseCimdUrl } from "./cimd.ts";
import { isAcceptableChallenge, verifyPkceS256 } from "./pkce.ts";
import { redirectUriAllowed, isRegistrableRedirectUri } from "./redirect.ts";
import { canonicalMcpResource, isCanonicalMcpResource } from "./resource.ts";
import {
  countDcrClientsSince,
  consumeCode,
  findActiveToken,
  findClient,
  findGrantById,
  findUsedCodeGrant,
  insertCode,
  insertDcrClient,
  insertGrant,
  insertToken,
  revokeGrant,
  revokeToken,
  touchGrant,
  upsertCimdClient,
} from "./store.ts";
import type { ClientRow } from "./store.ts";
import { generateOpaqueToken, hashOpaqueToken } from "./tokens.ts";
import { currentAccount, requireSession } from "../session.ts";
import { registerMcpRoute } from "./mcp.ts";
import { registerConnectionRoutes } from "./connections.ts";

/** DCR の登録の数の上限（1日あたり。仮決め）。 */
export const DCR_DAILY_LIMIT = 500;

/** CIMD の文書を覚える時間（ミリ秒。1日。仮決め）。 */
const CIMD_CACHE_MS = 24 * 60 * 60 * 1000;

/** 認可のコードの期限（ミリ秒）。 */
const CODE_TTL_MS = contract.AUTHORIZATION_CODE_TTL_SECONDS * 1000;

/** 札の期限（ミリ秒）。 */
const ACCESS_TTL_MS = contract.ACCESS_TOKEN_TTL_SECONDS * 1000;
const REFRESH_TTL_MS = contract.REFRESH_TOKEN_TTL_SECONDS * 1000;

/**
 * RFC 6749 のエラーの応答（キャッシュさせない）。
 * @param c 要求の文脈
 * @param status 状態の番号
 * @param error 機械が読むエラー（RFC 6749 の名前）
 * @param description 人が読む説明
 * @returns 応答
 */
function oauthError<S extends 400 | 401 | 429>(c: Context, status: S, error: string, description: string) {
  c.header("Cache-Control", "no-store");
  return c.json({ error, error_description: description }, status);
}

/** 認可の要求の項目（検証を通ったもの）。 */
type AuthorizeRequest = z.infer<typeof contract.AuthorizeParams>;

/** 検証を通った認可の要求。 */
type Validated = { client: ClientRow; request: AuthorizeRequest; scopes: string[] };

/** 検証の失敗：直接返す（戻り先が信じられない）か、戻り先へ返す（RFC 6749 4.1.2.1）。 */
type Rejected =
  | { direct: true; status: 400; error: string; description: string }
  | { direct: false; redirectUri: string; error: string; description: string; state: string };

/**
 * 要求の項目を、クライアントの登録に照らして確かめる。
 * @param deps 土台の道具（DB・取得・設定・アプリの一覧）
 * @param raw 要求の項目（問い合わせ・同意の送信）
 * @returns 検証を通った要求、または失敗
 */
async function validateAuthorize(
  deps: Pick<DomainRouteDeps, "db" | "fetch" | "config" | "apps">,
  raw: Record<string, unknown>,
): Promise<{ ok: true; value: Validated } | { ok: false; reason: Rejected }> {
  const parsed = contract.AuthorizeParams.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: { direct: true, status: 400, error: "invalid_request", description: "要求の項目が足りないか、形が違う" } };
  }
  const request = parsed.data;

  let client: ClientRow;
  try {
    client = await resolveClient(deps, request.client_id);
  } catch {
    return { ok: false, reason: { direct: true, status: 400, error: "invalid_client", description: "クライアントを確かめられない" } };
  }
  if (!redirectUriAllowed(request.redirect_uri, client.redirectUris)) {
    return { ok: false, reason: { direct: true, status: 400, error: "invalid_request", description: "戻り先が登録と合わない" } };
  }

  const back = (error: string, description: string): { ok: false; reason: Rejected } => ({
    ok: false,
    reason: { direct: false, redirectUri: request.redirect_uri, error, description, state: request.state },
  });
  if (!isCanonicalMcpResource(request.resource, deps.config.webUrl)) {
    return back("invalid_target", "宛先（resource）が kanaeru の /api/mcp ではない");
  }
  if (!isAcceptableChallenge(request.code_challenge, request.code_challenge_method)) {
    return back("invalid_request", "PKCE（S256）が必要");
  }
  const allowed = deps.apps.map((app) => `${app.key}:read`);
  const requested = (request.scope ?? "").split(" ").filter((s) => s.length > 0);
  if (requested.some((s) => !allowed.includes(s))) {
    return back("invalid_scope", "使えない範囲がある");
  }
  const scopes = requested.length > 0 ? requested : allowed;
  return { ok: true, value: { client, request, scopes } };
}

/**
 * client_id からクライアントを引く（CIMD は取りに行き、覚える。DCR と事前登録は表から）。
 * @param deps 土台の道具
 * @param clientId client_id
 * @returns クライアント
 * @throws 登録がない・取れない・形が違う
 */
async function resolveClient(
  deps: Pick<DomainRouteDeps, "db" | "fetch">,
  clientId: string,
): Promise<ClientRow> {
  if (parseCimdUrl(clientId)) {
    const cached = await findClient(deps.db, clientId);
    if (cached && cached.kind === "cimd" && cached.expiresAt && cached.expiresAt.getTime() > Date.now()) return cached;
    const meta = await fetchClientMetadata(clientId, { fetch: deps.fetch });
    return upsertCimdClient(deps.db, {
      clientId: meta.clientId,
      name: meta.clientName,
      redirectUris: meta.redirectUris,
      expiresAt: new Date(Date.now() + CIMD_CACHE_MS),
    });
  }
  const row = await findClient(deps.db, clientId);
  if (!row || row.kind === "cimd") throw new CimdError("INVALID_DOCUMENT", "登録のないクライアント");
  return row;
}

/**
 * 戻り先に結果を付けて返す（code または error と、state と iss）。
 * @param redirectUri 戻り先
 * @param params 付ける項目
 * @param issuer 発行者（iss。RFC 9207）
 * @returns 戻り先の URL の文字列
 */
function redirectWith(redirectUri: string, params: Record<string, string>, issuer: string): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries({ ...params, iss: issuer })) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * 発行者（issuer）：画面の源。
 * @param webUrl 設定の画面の URL
 * @returns 源（例 https://kanaeru.example）
 */
function issuerOf(webUrl: string): string {
  return new URL(webUrl).origin;
}

/**
 * 札（アクセスとリフレッシュ）を作って、同意に結びつける。
 * @param db DB
 * @param grantId 同意の ID
 * @param resource 宛先
 * @param scopes 範囲
 * @returns 相手に渡す値
 */
async function issueTokens(
  db: DomainRouteDeps["db"],
  grantId: string,
  resource: string,
  scopes: string[],
) {
  const access = generateOpaqueToken();
  const refresh = generateOpaqueToken();
  await insertToken(db, { tokenHash: access.tokenHash, kind: "access", grantId, resource, expiresAt: new Date(Date.now() + ACCESS_TTL_MS) });
  await insertToken(db, { tokenHash: refresh.tokenHash, kind: "refresh", grantId, resource, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) });
  await touchGrant(db, grantId);
  return {
    access_token: access.token,
    token_type: "Bearer" as const,
    expires_in: contract.ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh.token,
    scope: scopes.join(" "),
  };
}

/** 道の定義（文書の名前つき）。 */
const authorizeQuery = contract.AuthorizeParams.openapi("OAuthAuthorizeQuery");
const consentBody = contract.ConsentInput.openapi("OAuthConsentInput");
const registerBody = contract.ClientRegistrationInput.openapi("OAuthClientRegistrationInput");
const tokenForm = contract.TokenRequest;

const oauthErrorSchema = contract.OAuthErrorResponse.openapi("OAuthErrorResponse");

const metadataRoute = createRoute({
  method: "get",
  path: "/.well-known/oauth-authorization-server",
  tags: ["account"],
  operationId: "accountOAuthAuthorizationServerMetadata",
  summary: "認可のサーバーのメタデータ（RFC 8414）",
  responses: { 200: { description: "メタデータ", content: { "application/json": { schema: z.record(z.string(), z.unknown()) } } } },
});

const registerRoute = createRoute({
  method: "post",
  path: "/api/oauth/register",
  tags: ["account"],
  operationId: "accountOAuthRegisterClient",
  summary: "クライアントを登録する（DCR・RFC 7591。非推奨だが後方互換のため残す）",
  request: { body: { required: true, content: { "application/json": { schema: registerBody } } } },
  responses: {
    201: { description: "登録した", content: { "application/json": { schema: contract.ClientRegistrationResponse } } },
    400: { description: "形が違う・戻り先が使えない", content: { "application/json": { schema: oauthErrorSchema } } },
    429: { description: "登録が多すぎる（1日の上限）", content: { "application/json": { schema: oauthErrorSchema } } },
  },
});

const authorizeRoute = createRoute({
  method: "get",
  path: "/api/oauth/authorize",
  tags: ["account"],
  operationId: "accountOAuthAuthorize",
  summary: "認可の要求を受けて、同意の画面へ送る",
  request: { query: authorizeQuery },
  responses: {
    302: { description: "同意の画面へ（要求の項目を引き継ぐ）、または戻り先へ結果（エラー）" },
    400: { description: "戻り先を信じられない要求（直接の応答）", content: { "application/json": { schema: oauthErrorSchema } } },
  },
});

const consentRoute = createRoute({
  method: "post",
  path: "/api/oauth/authorize/decision",
  tags: ["account"],
  operationId: "accountOAuthDecide",
  summary: "同意の画面の決め（許す・断る）",
  request: { body: { required: true, content: { "application/json": { schema: consentBody } } } },
  responses: {
    200: { description: "戻り先の URL（画面がそこへ進める）", content: { "application/json": { schema: contract.ConsentResponse } } },
    400: { description: "形が違う・範囲が要求の外", content: { "application/json": { schema: contract.OAuthErrorResponse.openapi("OAuthErrorBody") } } },
    401: domainErrorResponse({ code: "UNAUTHENTICATED", status: 401, message: "ログインしていない" }, "ログインしていない"),
    403: domainErrorResponse({ code: "FORBIDDEN", status: 403, message: "権限がない" }, "源が違う"),
  },
});

const consentViewRoute = createRoute({
  method: "get",
  path: "/api/oauth/authorize/consent",
  tags: ["account"],
  operationId: "accountOAuthConsentView",
  summary: "同意の画面に出すもの（クライアントの名前と、範囲の説明）",
  request: { query: authorizeQuery },
  responses: {
    200: {
      description: "同意の画面に出すもの。戻り先へ返すべき失敗（範囲・宛先・PKCE）なら、画面が進む戻り先の URL",
      content: { "application/json": { schema: contract.ConsentViewResult } },
    },
    400: { description: "要求の形が違う・クライアントや範囲が使えない", content: { "application/json": { schema: oauthErrorSchema } } },
    401: domainErrorResponse({ code: "UNAUTHENTICATED", status: 401, message: "ログインしていない" }, "ログインしていない"),
  },
});

const tokenRoute = createRoute({
  method: "post",
  path: "/api/oauth/token",
  tags: ["account"],
  operationId: "accountOAuthToken",
  summary: "トークンを発行・更新する（RFC 6749。公開クライアントは client_id だけ）",
  request: { body: { required: true, content: { "application/x-www-form-urlencoded": { schema: tokenForm } } } },
  responses: {
    200: { description: "トークン", content: { "application/json": { schema: contract.TokenResponse } } },
    400: { description: "要求が違う・コードや札が無効", content: { "application/json": { schema: oauthErrorSchema } } },
    401: { description: "クライアントを確かめられない", content: { "application/json": { schema: oauthErrorSchema } } },
  },
});

/**
 * 同意の送信のログインの確かめ（kanaeru の形で返す）。
 * @param deps 土台の道具（DB と設定）
 * @returns requireSession の中間処理
 */
const requireLogin = (deps: Pick<DomainRouteDeps, "db" | "config">) => requireSession({ db: deps.db, config: deps.config });

/**
 * 認可の道を app に足す（accountRoutes から呼ぶ）。
 * @param app 領域の道
 * @param deps 土台の道具
 * @returns 同じ app
 */
export function registerOAuthRoutes<T extends OpenAPIHono<ApiEnv>>(app: T, deps: DomainRouteDeps): T {
  const issuer = issuerOf(deps.config.webUrl);
  const resource = canonicalMcpResource(deps.config.webUrl);

  app.get("/.well-known/oauth-authorization-server", (c) =>
    c.json({
      issuer,
      authorization_endpoint: `${issuer}/api/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      scopes_supported: deps.apps.map((app) => `${app.key}:read`),
    }),
  );

  app.get("/.well-known/oauth-protected-resource", (c) =>
    c.json({
      resource,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: deps.apps.map((app) => `${app.key}:read`),
    }),
  );

  app.openapi(metadataRoute, (c) => c.json({ issuer }, 200));

  app.openapi(registerRoute, async (c) => {
    const body = c.req.valid("json");
    if (!body.redirect_uris.every(isRegistrableRedirectUri)) {
      return oauthError(c, 400, "invalid_redirect_uri", "戻り先は https か、ループバックの http だけ");
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if ((await countDcrClientsSince(deps.db, since)) >= DCR_DAILY_LIMIT) {
      return oauthError(c, 429, "temporarily_unavailable", "登録が多いので、しばらくしてから試す");
    }
    const clientId = `dcr_${randomBytes(18).toString("base64url")}`;
    const issuedAt = Date.now();
    await insertDcrClient(deps.db, {
      clientId,
      name: body.client_name,
      redirectUris: body.redirect_uris,
      expiresAt: new Date(issuedAt + 30 * 24 * 60 * 60 * 1000),
    });
    c.header("Cache-Control", "no-store");
    return c.json(
      {
        client_id: clientId,
        client_name: body.client_name,
        redirect_uris: body.redirect_uris,
        token_endpoint_auth_method: "none" as const,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_id_issued_at: Math.floor(issuedAt / 1000),
      },
      201,
    );
  });

  app.openapi(authorizeRoute, async (c) => {
    const query = c.req.valid("query");
    const checked = await validateAuthorize(deps, query);
    if (!checked.ok) {
      if (checked.reason.direct) {
        return oauthError(c, 400, checked.reason.error, checked.reason.description);
      }
      return c.redirect(
        redirectWith(checked.reason.redirectUri, { error: checked.reason.error, error_description: checked.reason.description, state: checked.reason.state }, issuer),
        302,
      );
    }
    const next = new URL("/oauth/consent", deps.config.webUrl);
    for (const [key, value] of Object.entries(query)) next.searchParams.set(key, String(value));
    return c.redirect(next.toString(), 302);
  });

  // 同意の送信（ログインが要る。画面の源と違う Origin は断る）
  app.use("/api/oauth/authorize/decision", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && origin !== issuer) throw new AppError("FORBIDDEN");
    return next();
  });
  app.use("/api/oauth/authorize/decision", requireLogin(deps));

  // 同意の画面に出すもの（ログインが要る。読むだけ）
  app.use("/api/oauth/authorize/consent", requireLogin(deps));
  app.openapi(consentViewRoute, async (c) => {
    const checked = await validateAuthorize(deps, c.req.valid("query"));
    c.header("Cache-Control", "no-store");
    if (!checked.ok) {
      // 戻り先を信じられない失敗は画面に出す。戻り先を信じられる失敗は、クライアントへ結果を返す（画面がそこへ進む）
      if (checked.reason.direct) return oauthError(c, 400, checked.reason.error, checked.reason.description);
      return c.json(
        { redirectTo: redirectWith(checked.reason.redirectUri, { error: checked.reason.error, error_description: checked.reason.description, state: checked.reason.state }, issuer) },
        200,
      );
    }
    const { client, request, scopes } = checked.value;
    return c.json(
      {
        clientName: client.name,
        clientKind: client.kind,
        redirectHost: new URL(request.redirect_uri).host,
        scopes: scopes.map((scope) => {
          const app = deps.apps.find((candidate) => `${candidate.key}:read` === scope);
          return {
            scope,
            label: `${app?.name ?? scope}の記録を読む`,
            description: app?.accountData ?? "",
          };
        }),
      },
      200,
    );
  });

  app.openapi(consentRoute, async (c) => {
    const body = c.req.valid("json");
    // 同意の項目（decision・granted_scopes）を外して、認可の要求の項目だけを確かめる
    const { decision, granted_scopes: grantedInput, ...authorizeFields } = body;
    const checked = await validateAuthorize(deps, authorizeFields);
    if (!checked.ok) {
      if (checked.reason.direct) return oauthError(c, 400, checked.reason.error, checked.reason.description);
      return c.json({ redirectTo: redirectWith(checked.reason.redirectUri, { error: checked.reason.error, error_description: checked.reason.description, state: checked.reason.state }, issuer) }, 200);
    }
    const { client, request, scopes } = checked.value;
    const account = currentAccount(c);
    if (decision === "deny") {
      return c.json({ redirectTo: redirectWith(request.redirect_uri, { error: "access_denied", state: request.state }, issuer) }, 200);
    }
    const granted = (grantedInput ?? []).filter((s) => scopes.includes(s));
    if (granted.length === 0) throw new AppError("INVALID_INPUT");
    const grantId = await insertGrant(deps.db, { accountId: account.accountId, clientRowId: client.id, scopes: granted });
    const code = generateOpaqueToken();
    await insertCode(deps.db, {
      codeHash: code.tokenHash,
      grantId,
      codeChallenge: request.code_challenge,
      redirectUri: request.redirect_uri,
      resource: request.resource,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    return c.json({ redirectTo: redirectWith(request.redirect_uri, { code: code.token, state: request.state }, issuer) }, 200);
  });

  app.openapi(tokenRoute, async (c) => {
    const body = c.req.valid("form");
    const client = await findClient(deps.db, body.client_id);
    if (!client) {
      return oauthError(c, 401, "invalid_client", "クライアントを確かめられない");
    }
    if (client.secretHash) {
      if (!body.client_secret || hashOpaqueToken(body.client_secret) !== client.secretHash) {
        return oauthError(c, 401, "invalid_client", "クライアントを確かめられない");
      }
    }
    if (!isCanonicalMcpResource(body.resource, deps.config.webUrl)) {
      return oauthError(c, 400, "invalid_target", "宛先（resource）が kanaeru の /api/mcp ではない");
    }

    if (body.grant_type === "authorization_code") {
      const codeHash = hashOpaqueToken(body.code);
      const consumed = await consumeCode(deps.db, codeHash);
      if (!consumed) {
        // 使用済みのコードの再利用は、同意ごと止める（RFC 6749 4.1.2）
        const reused = await findUsedCodeGrant(deps.db, codeHash);
        if (reused) await revokeGrant(deps.db, reused);
        return oauthError(c, 400, "invalid_grant", "コードが無効か、使用済み");
      }
      const grant = await findGrantById(deps.db, consumed.grantId);
      if (!grant || grant.revoked || grant.clientRowId !== client.id) {
        return oauthError(c, 400, "invalid_grant", "コードが無効");
      }
      if (body.redirect_uri !== consumed.redirectUri || body.resource !== consumed.resource) {
        return oauthError(c, 400, "invalid_grant", "戻り先か宛先が認可の要求と違う");
      }
      if (!verifyPkceS256(body.code_verifier, consumed.codeChallenge)) {
        return oauthError(c, 400, "invalid_grant", "code_verifier が合わない");
      }
      c.header("Cache-Control", "no-store");
      return c.json(await issueTokens(deps.db, consumed.grantId, consumed.resource, grant.scopes), 200);
    }

    // refresh_token：使ったリフレッシュは取り消して、新しい組を出す
    const row = await findActiveToken(deps.db, hashOpaqueToken(body.refresh_token), "refresh");
    if (!row || row.clientRowId !== client.id || row.resource !== body.resource) {
      return oauthError(c, 400, "invalid_grant", "更新の札が無効");
    }
    await revokeToken(deps.db, row.tokenId);
    c.header("Cache-Control", "no-store");
    return c.json(await issueTokens(deps.db, row.grantId, row.resource, row.scopes), 200);
  });

  registerConnectionRoutes(app, deps);
  registerMcpRoute(app, deps);
  return app;
}
