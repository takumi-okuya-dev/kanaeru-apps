// 改善点の読み書き（suite-004）。送るのはログインした人、読むのと済みを付けるのは運営者（窓口が確かめる）。
// 本文はログに書かない（Constitution II）。送った人の表示名は account の index.ts から読む。
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { findDisplayNames } from "../account/index.ts";
import { feedback } from "./schema.ts";

/** 運営者の一覧に出す数の上限（新しい順）。 */
export const FEEDBACK_LIST_LIMIT = 500;

/**
 * 1日の上限を超えなければ、改善点を足す（同じ人の送りは人ごとの鍵で順に動かし、数えてから足すまでの間に割りこませない）。
 * @param db DB
 * @param input 送った人・アプリの key・本文
 * @param input.accountId 送った人
 * @param input.appKey アプリの key（なければ null）
 * @param input.body 本文
 * @param limit 上限（since からの数がこれに届いていたら足さない）
 * @param limit.since この時刻から数える（含む）
 * @param limit.max 上限の数
 * @returns 足した改善点の ID（上限に届いていれば null）
 */
export async function insertFeedbackWithinLimit(
  db: Db,
  input: { accountId: string; appKey: string | null; body: string },
  limit: { since: Date; max: number },
): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`feedback:${input.accountId}`}, 0))`,
    );
    const [counted] = await tx
      .select({ value: count() })
      .from(feedback)
      .where(and(eq(feedback.accountId, input.accountId), gte(feedback.createdAt, limit.since)));
    if ((counted?.value ?? 0) >= limit.max) return null;
    const [row] = await tx.insert(feedback).values(input).returning({ id: feedback.id });
    if (!row) throw new Error("改善点を足せませんでした。");
    return row.id;
  });
}

/** 運営者が読む改善点の1行（表示名を付ける前）。 */
export type FeedbackRow = {
  /** ID */
  id: string;
  /** 送った日時 */
  createdAt: Date;
  /** アプリの key */
  appKey: string | null;
  /** 本文 */
  body: string;
  /** 送った人の表示名 */
  sender: string;
  /** 済みか */
  done: boolean;
};

/**
 * 改善点の一覧（新しい順・上限まで。上限より多ければ truncated）。
 * @param db DB
 * @param filter 絞り方（アプリの key・まだのものだけ・1つの ID）
 * @param filter.appKey アプリの key（なければ絞らない）
 * @param filter.pending まだのものだけか
 * @param filter.id この ID の1行だけ
 * @returns 改善点と、上限で切ったか
 */
export async function listFeedback(
  db: Executor,
  filter: { appKey?: string | undefined; pending?: boolean | undefined; id?: string | undefined },
): Promise<{ rows: FeedbackRow[]; truncated: boolean }> {
  const rows = await db
    .select({
      id: feedback.id,
      createdAt: feedback.createdAt,
      appKey: feedback.appKey,
      body: feedback.body,
      accountId: feedback.accountId,
      doneAt: feedback.doneAt,
    })
    .from(feedback)
    .where(
      and(
        filter.appKey ? eq(feedback.appKey, filter.appKey) : undefined,
        filter.pending ? isNull(feedback.doneAt) : undefined,
        filter.id ? eq(feedback.id, filter.id) : undefined,
      ),
    )
    .orderBy(desc(feedback.createdAt), desc(feedback.id))
    .limit(FEEDBACK_LIST_LIMIT + 1);
  const kept = rows.slice(0, FEEDBACK_LIST_LIMIT);
  const names = await findDisplayNames(
    db,
    kept.map((row) => row.accountId),
  );
  return {
    rows: kept.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      appKey: row.appKey,
      body: row.body,
      sender: names.get(row.accountId) ?? "",
      done: row.doneAt !== null,
    })),
    truncated: rows.length > FEEDBACK_LIST_LIMIT,
  };
}

/**
 * 済みを付け外す（もう済みなら、済みにした日時は変えない）。
 * @param db DB
 * @param id 改善点の ID
 * @param done 済みか
 * @returns 付け外したら true、なければ false
 */
export async function setFeedbackDone(db: Executor, id: string, done: boolean): Promise<boolean> {
  const rows = await db
    .update(feedback)
    // 済みにした日時は、最初に済みにしたときのまま（二度押しで上書きしない）
    .set({ doneAt: done ? sql`coalesce(${feedback.doneAt}, now())` : null })
    .where(eq(feedback.id, id))
    .returning({ id: feedback.id });
  return rows.length > 0;
}
