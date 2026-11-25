// MCP の認可（core-021・AD-21）の約束：道の入力と、RFC どおりの応答の形。
// 認可の道の入力は、道ごとに RFC の名前（snake_case）をそのまま使う。エラーは RFC 6749 の形（{error, error_description}）。
import { z } from "zod";

/** 認可の要求の共通の項目（GET /api/oauth/authorize と、同意の送信で同じ形を確かめる）。 */
export const AuthorizeParams = z
  .object({
    response_type: z.literal("code"),
    client_id: z.string().min(1).max(2048),
    redirect_uri: z.string().min(1).max(2048),
    state: z.string().min(8).max(512),
    code_challenge: z.string().min(43).max(128),
    code_challenge_method: z.literal("S256"),
    resource: z.string().min(1).max(2048),
    scope: z.string().max(512).optional(),
  })
  .strict();

/** 同意の送信の入力（認可の要求の項目と、利用者の選び）。 */
export const ConsentInput = AuthorizeParams.extend({
  decision: z.enum(["approve", "deny"]),
  /** 同意した範囲（要求の範囲の中から選ぶ。読むだけが既定） */
  granted_scopes: z.array(z.string().min(1).max(128)).max(50).optional(),
}).strict();

/** クライアントの登録（DCR・RFC 7591 の最小の形）。 */
export const ClientRegistrationInput = z
  .object({
    client_name: z.string().min(1).max(100),
    redirect_uris: z.array(z.string().min(1).max(2048)).min(1).max(10),
    token_endpoint_auth_method: z.literal("none").optional(),
  })
  .strict();

/** 登録の応答（RFC 7591）。 */
export const ClientRegistrationResponse = z.object({
  client_id: z.string(),
  client_name: z.string(),
  redirect_uris: z.array(z.string()),
  token_endpoint_auth_method: z.literal("none"),
  grant_types: z.array(z.string()),
  response_types: z.array(z.string()),
  client_id_issued_at: z.number(),
});

/** トークンの要求（authorization_code か refresh_token。RFC 6749 4.1.3・6）。 */
export const TokenRequest = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1).max(512),
    redirect_uri: z.string().min(1).max(2048),
    client_id: z.string().min(1).max(2048),
    code_verifier: z.string().min(43).max(128),
    resource: z.string().min(1).max(2048),
    client_secret: z.string().min(1).max(512).optional(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1).max(512),
    client_id: z.string().min(1).max(2048),
    resource: z.string().min(1).max(2048),
    client_secret: z.string().min(1).max(512).optional(),
  }),
]);

/** トークンの応答（RFC 6749 5.1）。 */
export const TokenResponse = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number(),
  refresh_token: z.string(),
  scope: z.string(),
});

/** RFC 6749 のエラーの応答（5.2）。 */
export const OAuthErrorResponse = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

/** 同意の送信の応答（画面が開く先）。 */
export const ConsentResponse = z.object({ redirectTo: z.string() });

/** 認可のコードの期限（秒）。 */
export const AUTHORIZATION_CODE_TTL_SECONDS = 300;
/** アクセストークンの期限（秒）。 */
export const ACCESS_TOKEN_TTL_SECONDS = 3600;
/** 更新トークンの期限（秒）。 */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600;

/** 接続の1行（設定の画面に出す。FR-015）。 */
export const ConnectionView = z.object({
  id: z.string(),
  clientName: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** 接続の一覧の応答。 */
export const ConnectionListView = z.object({ connections: z.array(ConnectionView) });
