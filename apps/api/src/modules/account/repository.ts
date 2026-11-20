// アカウントとセッションの読み書き（表は account の領域だけが読み書きする。AD-3）。
// セッションは札の SHA-256 で引き、期限（expires_at）を過ぎたものは引けない。
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { account, session } from "./schema.ts";

/** アカウントの行（読み出す形）。 */
export type AccountRecord = {
  /** account の ID */
  id: string;
  /** LINE のユーザー ID */
  lineUserId: string;
  /** 表示名 */
  displayName: string;
  /** 登録日（作った時刻） */
  registeredAt: Date;
};

/** 読み出す列。 */
const accountColumns = {
  id: account.id,
  lineUserId: account.lineUserId,
  displayName: account.displayName,
  registeredAt: account.createdAt,
};

/**
 * LINE のユーザー ID でアカウントを作るか探す。表示名があれば上書きする（research R6）。
 * 同じ人が同時に2回来ても、一意の制約で1つになる。
 * @param db DB
 * @param input LINE のユーザー ID と表示名（なければ、作るときは空・あるときは変えない）
 * @param input.lineUserId LINE のユーザー ID（確かめたもの）
 * @param input.displayName 表示名（確かめた ID トークンの name か、試験用のログインの値）
 * @returns アカウント
 */
export async function upsertAccount(
  db: Executor,
  input: { lineUserId: string; displayName: string | undefined },
): Promise<AccountRecord> {
  const [row] = await db
    .insert(account)
    .values({ lineUserId: input.lineUserId, displayName: input.displayName ?? "" })
    .onConflictDoUpdate({
      target: account.lineUserId,
      // 表示名がないときも、行を返すために同じ値で上書きする（中身は変わらない）
      set:
        input.displayName === undefined
          ? { lineUserId: sql`excluded.line_user_id` }
          : { displayName: input.displayName, updatedAt: sql`now()` },
    })
    .returning(accountColumns);
  if (!row) throw new Error("作ったアカウントが返りませんでした。");
  return row;
}

/**
 * アカウントを ID で読む（ほかの領域も index.ts から使う）。
 * @param db DB
 * @param id account の ID（uuid の形のもの）
 * @returns アカウント。なければ null
 */
export async function findAccountById(db: Executor, id: string): Promise<AccountRecord | null> {
  const [row] = await db.select(accountColumns).from(account).where(eq(account.id, id)).limit(1);
  return row ?? null;
}

/**
 * 表示名をまとめて読む（組織の人の一覧など、ほかの領域が表示名を出すときに使う。ないアカウントは入らない）。
 * @param db DB
 * @param ids account の ID
 * @returns account の ID → 表示名
 */
export async function findDisplayNames(
  db: Executor,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: account.id, displayName: account.displayName })
    .from(account)
    .where(inArray(account.id, unique));
  return new Map(rows.map((row) => [row.id, row.displayName]));
}

/**
 * アカウントを消す（セッションは CASCADE で消える。ほかの領域の本人のデータも、その表の CASCADE で消える。AD-7）。
 * @param db DB
 * @param id account の ID（uuid の形のもの）
 * @returns 消したら true、なければ false
 */
export async function deleteAccount(db: Executor, id: string): Promise<boolean> {
  const rows = await db.delete(account).where(eq(account.id, id)).returning({ id: account.id });
  return rows.length > 0;
}

/**
 * セッションを作り、その人の期限の切れたセッションを消す（定期の掃除の仕事は作らない。research R5）。
 * @param db DB
 * @param input account の ID・札の SHA-256・期限
 * @param input.accountId account の ID
 * @param input.tokenHash 札の SHA-256
 * @param input.expiresAt 期限
 */
export async function createSession(
  db: Executor,
  input: { accountId: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db
    .delete(session)
    .where(and(eq(session.accountId, input.accountId), lt(session.expiresAt, sql`now()`)));
  await db.insert(session).values(input);
}

/**
 * 札の SHA-256 から、期限内のセッションのアカウントを引く（account と結んで1回で読む。GET /me もこの行で答える）。
 * @param db DB
 * @param tokenHash 札の SHA-256
 * @returns アカウント。ない・期限切れなら null
 */
export async function findSessionAccount(
  db: Executor,
  tokenHash: string,
): Promise<AccountRecord | null> {
  const [row] = await db
    .select(accountColumns)
    .from(session)
    .innerJoin(account, eq(account.id, session.accountId))
    .where(and(eq(session.tokenHash, tokenHash), gt(session.expiresAt, sql`now()`)))
    .limit(1);
  return row ?? null;
}

/**
 * セッションを消す（ログアウト）。
 * @param db DB
 * @param tokenHash 札の SHA-256
 */
export async function deleteSessionByTokenHash(db: Executor, tokenHash: string): Promise<void> {
  await db.delete(session).where(eq(session.tokenHash, tokenHash));
}
