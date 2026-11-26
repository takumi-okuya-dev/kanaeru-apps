// MCP の認可の表の読み書き（account の領域だけが読み書きする。AD-3）。札は SHA-256 だけで引く。
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Executor } from "../../../kernel/db.ts";
import { mcpToolCall, oauthClient, oauthCode, oauthGrant, oauthToken } from "../schema.ts";

/** クライアントの行（読み出す形）。 */
export type ClientRow = {
  id: string;
  clientId: string;
  kind: "cimd" | "dcr" | "preregistered";
  name: string;
  redirectUris: string[];
  secretHash: string | null;
  expiresAt: Date | null;
};

const clientColumns = {
  id: oauthClient.id,
  clientId: oauthClient.clientId,
  kind: oauthClient.kind,
  name: oauthClient.name,
  redirectUris: oauthClient.redirectUris,
  secretHash: oauthClient.secretHash,
  expiresAt: oauthClient.expiresAt,
};

/**
 * client_id でクライアントを引く。
 * @param db DB
 * @param clientId client_id
 * @returns 行、ない場合は null
 */
export async function findClient(db: Executor, clientId: string): Promise<ClientRow | null> {
  const [row] = await db
    .select(clientColumns)
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  return row ?? null;
}

/**
 * CIMD のクライアントを作るか、取り直した値で直す（期限つき。次に使うときに取り直す）。
 * @param db DB
 * @param input 取った値と期限
 * @returns 行
 */
export async function upsertCimdClient(
  db: Executor,
  input: { clientId: string; name: string; redirectUris: string[]; expiresAt: Date },
): Promise<ClientRow> {
  const [row] = await db
    .insert(oauthClient)
    .values({
      clientId: input.clientId,
      kind: "cimd",
      name: input.name,
      redirectUris: input.redirectUris,
      expiresAt: input.expiresAt,
    })
    .onConflictDoUpdate({
      target: oauthClient.clientId,
      set: {
        name: input.name,
        redirectUris: input.redirectUris,
        expiresAt: input.expiresAt,
        updatedAt: sql`now()`,
      },
    })
    .returning(clientColumns);
  if (!row) throw new Error("CIMD のクライアントを作れなかった");
  return row;
}

/**
 * DCR で登録したクライアントを作る。
 * @param db DB
 * @param input 登録の値
 * @returns 行
 */
export async function insertDcrClient(
  db: Executor,
  input: { clientId: string; name: string; redirectUris: string[]; expiresAt: Date },
): Promise<ClientRow> {
  const [row] = await db
    .insert(oauthClient)
    .values({
      clientId: input.clientId,
      kind: "dcr",
      name: input.name,
      redirectUris: input.redirectUris,
      expiresAt: input.expiresAt,
    })
    .returning(clientColumns);
  if (!row) throw new Error("DCR のクライアントを作れなかった");
  return row;
}

/**
 * 指定の時刻より後にできた DCR の登録の数（登録の数の上限に使う）。
 * @param db DB
 * @param since この時刻より後
 * @returns 数
 */
export async function countDcrClientsSince(db: Executor, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(oauthClient)
    .where(and(eq(oauthClient.kind, "dcr"), gt(oauthClient.createdAt, since)));
  return Number(row?.n ?? 0);
}

/**
 * 同意の記録を作る。
 * @param db DB
 * @param input 利用者・クライアント・範囲
 * @returns 同意の ID
 */
export async function insertGrant(
  db: Executor,
  input: { accountId: string; clientRowId: string; scopes: string[] },
): Promise<string> {
  const [row] = await db.insert(oauthGrant).values(input).returning({ id: oauthGrant.id });
  if (!row) throw new Error("同意を作れなかった");
  return row.id;
}

/**
 * 認可のコードを作る（SHA-256 だけを持つ）。
 * @param db DB
 * @param input コードの SHA-256 と、同意・PKCE・戻り先・宛先・期限
 */
export async function insertCode(
  db: Executor,
  input: {
    codeHash: string;
    grantId: string;
    codeChallenge: string;
    redirectUri: string;
    resource: string;
    expiresAt: Date;
  },
): Promise<void> {
  await db.insert(oauthCode).values(input);
}

/**
 * コードを1回だけ使えるようにする（未使用・期限内のものだけ、使用済みの印を付けて返す）。
 * 同じコードの同時の2回目は、片方しか取れない。
 * @param db DB
 * @param codeHash コードの SHA-256
 * @returns 取れたコードの行、取れなければ null
 */
export async function consumeCode(
  db: Executor,
  codeHash: string,
): Promise<{
  grantId: string;
  codeChallenge: string;
  redirectUri: string;
  resource: string;
} | null> {
  const [row] = await db
    .update(oauthCode)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(oauthCode.codeHash, codeHash),
        isNull(oauthCode.usedAt),
        gt(oauthCode.expiresAt, sql`now()`),
      ),
    )
    .returning({
      grantId: oauthCode.grantId,
      codeChallenge: oauthCode.codeChallenge,
      redirectUri: oauthCode.redirectUri,
      resource: oauthCode.resource,
    });
  return row ?? null;
}

/**
 * コードが使用済みかを引く（使い回しの検出に使う）。
 * @param db DB
 * @param codeHash コードの SHA-256
 * @returns 使用済みのコードの同意の ID（使用済みでなければ null）
 */
export async function findUsedCodeGrant(db: Executor, codeHash: string): Promise<string | null> {
  const [row] = await db
    .select({ grantId: oauthCode.grantId })
    .from(oauthCode)
    .where(and(eq(oauthCode.codeHash, codeHash), sql`${oauthCode.usedAt} is not null`))
    .limit(1);
  return row?.grantId ?? null;
}

/**
 * 札（アクセスかリフレッシュ）を作る。
 * @param db DB
 * @param input 札の SHA-256・種類・同意・宛先・期限
 */
export async function insertToken(
  db: Executor,
  input: {
    tokenHash: string;
    kind: "access" | "refresh";
    grantId: string;
    resource: string;
    expiresAt: Date;
  },
): Promise<void> {
  await db.insert(oauthToken).values(input);
}

/** 札の照合の結果（有効な札と、その同意とクライアント）。 */
export type ActiveTokenRow = {
  tokenId: string;
  grantId: string;
  accountId: string;
  scopes: string[];
  resource: string;
  clientRowId: string;
  clientId: string;
};

/**
 * 札の SHA-256 から、有効な札（取り消していない・期限内・同意も取り消していない）を引く。
 * @param db DB
 * @param tokenHash 札の SHA-256
 * @param kind 札の種類
 * @returns 有効な札、なければ null
 */
export async function findActiveToken(
  db: Executor,
  tokenHash: string,
  kind: "access" | "refresh",
): Promise<ActiveTokenRow | null> {
  const [row] = await db
    .select({
      tokenId: oauthToken.id,
      grantId: oauthGrant.id,
      accountId: oauthGrant.accountId,
      scopes: oauthGrant.scopes,
      resource: oauthToken.resource,
      clientRowId: oauthClient.id,
      clientId: oauthClient.clientId,
    })
    .from(oauthToken)
    .innerJoin(oauthGrant, eq(oauthGrant.id, oauthToken.grantId))
    .innerJoin(oauthClient, eq(oauthClient.id, oauthGrant.clientRowId))
    .where(
      and(
        eq(oauthToken.tokenHash, tokenHash),
        eq(oauthToken.kind, kind),
        isNull(oauthToken.revokedAt),
        isNull(oauthGrant.revokedAt),
        gt(oauthToken.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * 札を取り消す（使ったリフレッシュの札は、次から使えないようにする）。
 * @param db DB
 * @param tokenId 札の ID
 */
export async function revokeToken(db: Executor, tokenId: string): Promise<void> {
  await db
    .update(oauthToken)
    .set({ revokedAt: sql`now()` })
    .where(eq(oauthToken.id, tokenId));
}

/**
 * 同意を取り消す（その同意の札はすべて使えなくなる）。
 * @param db DB
 * @param grantId 同意の ID
 */
export async function revokeGrant(db: Executor, grantId: string): Promise<void> {
  await db
    .update(oauthGrant)
    .set({ revokedAt: sql`now()` })
    .where(eq(oauthGrant.id, grantId));
}

/**
 * 同意の最後に使った時刻を直す（接続の一覧に出す）。
 * @param db DB
 * @param grantId 同意の ID
 */
export async function touchGrant(db: Executor, grantId: string): Promise<void> {
  await db
    .update(oauthGrant)
    .set({ lastUsedAt: sql`now()` })
    .where(eq(oauthGrant.id, grantId));
}

/**
 * ツールの呼び出しの記録（中身は持たない。FR-018）。書く操作の段階まで、呼び出しは作らない。
 * @param db DB
 * @param input 記録
 */
export async function insertToolCall(
  db: Executor,
  input: {
    accountId: string;
    toolName: string;
    access: "read" | "write";
    targetId?: string;
    result: string;
  },
): Promise<void> {
  await db.insert(mcpToolCall).values(input);
}

/**
 * 利用者の接続（同意）の一覧（設定の画面に出す。FR-015）。
 * @param db DB
 * @param accountId 利用者
 * @returns 同意の一覧（取り消していないもの）
 */
export async function listActiveGrants(
  db: Executor,
  accountId: string,
): Promise<
  Array<{
    id: string;
    clientName: string;
    scopes: string[];
    lastUsedAt: Date | null;
    createdAt: Date;
  }>
> {
  return db
    .select({
      id: oauthGrant.id,
      clientName: oauthClient.name,
      scopes: oauthGrant.scopes,
      lastUsedAt: oauthGrant.lastUsedAt,
      createdAt: oauthGrant.createdAt,
    })
    .from(oauthGrant)
    .innerJoin(oauthClient, eq(oauthClient.id, oauthGrant.clientRowId))
    .where(and(eq(oauthGrant.accountId, accountId), isNull(oauthGrant.revokedAt)))
    .orderBy(desc(oauthGrant.createdAt));
}

/**
 * 同意の行（利用者・クライアント・範囲・取り消し）を引く。
 * @param db DB
 * @param grantId 同意の ID
 * @returns 行、ない場合は null
 */
export async function findGrantById(
  db: Executor,
  grantId: string,
): Promise<{ accountId: string; clientRowId: string; scopes: string[]; revoked: boolean } | null> {
  const [row] = await db
    .select({
      accountId: oauthGrant.accountId,
      clientRowId: oauthGrant.clientRowId,
      scopes: oauthGrant.scopes,
      revokedAt: oauthGrant.revokedAt,
    })
    .from(oauthGrant)
    .where(eq(oauthGrant.id, grantId))
    .limit(1);
  if (!row) return null;
  return {
    accountId: row.accountId,
    clientRowId: row.clientRowId,
    scopes: row.scopes,
    revoked: row.revokedAt !== null,
  };
}

/**
 * 自分の同意を取り消す（ほかの人の同意は触らない。見つからなければ false）。
 * @param db DB
 * @param grantId 同意の ID
 * @param accountId 持ち主（今の利用者）
 * @returns 取り消したなら true
 */
export async function revokeGrantOwnedBy(
  db: Executor,
  grantId: string,
  accountId: string,
): Promise<boolean> {
  const rows = await db
    .update(oauthGrant)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(oauthGrant.id, grantId),
        eq(oauthGrant.accountId, accountId),
        isNull(oauthGrant.revokedAt),
      ),
    )
    .returning({ id: oauthGrant.id });
  return rows.length > 0;
}
