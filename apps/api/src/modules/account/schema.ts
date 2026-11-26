// アカウントの領域の表（docs/apps/account.md）。account と session は account の領域だけが持つ（AD-2・AD-3）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。
// session は札そのものを持たず、札の SHA-256 だけを持つ（specs/account/001-line-login/research.md R4）。
// account を消すと、その人のセッションも消える（ON DELETE CASCADE。AD-7）。
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";

/** アカウント（LINE の利用者1人）。created_at が登録日。 */
export const account = pgTable(
  "account",
  {
    id: primaryId(),
    /** LINE のユーザー ID（プロバイダーごとに決まる。AD-2） */
    lineUserId: text("line_user_id").notNull(),
    /** 表示名（LINE の名前。ログインのたびに上書きする） */
    displayName: text("display_name").notNull().default(""),
    ...timestamps(),
  },
  (table) => [uniqueIndex("account_line_user_id_unique").on(table.lineUserId)],
);

/** セッション（ログインの1回。期限は作ってから30日）。 */
export const session = pgTable(
  "session",
  {
    id: primaryId(),
    /** クッキーの札の SHA-256（16進64文字） */
    tokenHash: text("token_hash").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("session_token_hash_unique").on(table.tokenHash),
    index("session_account_id_idx").on(table.accountId),
  ],
);

// --- MCP の認可（core-021・AD-21）。トークンとコードは、札そのものでなくハッシュだけを持つ（FR-011）。

/** 接続するクライアント（CIMD の URL・DCR で登録したもの・事前登録のもの。FR-009・FR-035）。 */
export const oauthClient = pgTable(
  "oauth_client",
  {
    id: primaryId(),
    /** クライアントの ID（CIMD は URL、DCR は発行した文字列、事前登録は運営者が発行した値） */
    clientId: text("client_id").notNull(),
    /** どの方法で登録されたか */
    kind: text("kind", { enum: ["cimd", "dcr", "preregistered"] }).notNull(),
    /** 同意の画面に出す名前（CIMD・DCR のメタデータから。無ければ空） */
    name: text("name").notNull().default(""),
    /** 戻り先の登録（完全一致で確かめる。ループバックは FR-033 の例外） */
    redirectUris: text("redirect_uris").array().notNull(),
    /** 事前登録のシークレットの SHA-256（事前登録のときだけ） */
    secretHash: text("secret_hash"),
    /** 使われない DCR の登録を消す期限（DCR のときだけ。FR-009） */
    expiresAt: timestamptz("expires_at"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("oauth_client_client_id_unique").on(table.clientId)],
);

/** 利用者が1つの接続に同意した記録（範囲は配列。FR-012・FR-031）。取り消すと、そのトークンは使えない。 */
export const oauthGrant = pgTable(
  "oauth_grant",
  {
    id: primaryId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    clientRowId: uuid("client_row_id")
      .notNull()
      .references(() => oauthClient.id, { onDelete: "cascade" }),
    /** 範囲（`<key>:read`・`<key>:write`） */
    scopes: text("scopes").array().notNull(),
    lastUsedAt: timestamptz("last_used_at"),
    revokedAt: timestamptz("revoked_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("oauth_grant_account_id_idx").on(table.accountId),
    index("oauth_grant_client_row_id_idx").on(table.clientRowId),
  ],
);

/** 認可のコード（一時。1回だけ使える。PKCE と戻り先と resource に結びつく）。 */
export const oauthCode = pgTable(
  "oauth_code",
  {
    id: primaryId(),
    /** コードの SHA-256 */
    codeHash: text("code_hash").notNull(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => oauthGrant.id, { onDelete: "cascade" }),
    codeChallenge: text("code_challenge").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    resource: text("resource").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    usedAt: timestamptz("used_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("oauth_code_code_hash_unique").on(table.codeHash)],
);

/** トークン（access と refresh）。札そのものは持たず、SHA-256 だけを持つ（FR-011）。 */
export const oauthToken = pgTable(
  "oauth_token",
  {
    id: primaryId(),
    tokenHash: text("token_hash").notNull(),
    kind: text("kind", { enum: ["access", "refresh"] }).notNull(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => oauthGrant.id, { onDelete: "cascade" }),
    /** 宛先（RFC 8707。kanaeru の /api/mcp だけ。FR-007） */
    resource: text("resource").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("oauth_token_token_hash_unique").on(table.tokenHash),
    index("oauth_token_grant_id_idx").on(table.grantId),
  ],
);

/** ツールの呼び出しの記録（FR-018・FR-029）。引数と返した中身は残さない。 */
export const mcpToolCall = pgTable(
  "mcp_tool_call",
  {
    id: primaryId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    /** read か write（write の仕組みは後で使う。FR-025） */
    access: text("access", { enum: ["read", "write"] }).notNull(),
    /** 対象の記録の id（あれば）。中身は持たない */
    targetId: text("target_id"),
    /** 結果の種類（成功、または断った code） */
    result: text("result").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [index("mcp_tool_call_account_id_idx").on(table.accountId)],
);
