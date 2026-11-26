// 改善点の読み書き（suite-004）。送るのはログインした人、読むのと済みを付けるのは運営者（窓口が確かめる）。
// 本文はログに書かない（Constitution II）。送った人の表示名は account の index.ts から読む。
import { and, count, desc, eq, gte, isNull } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { findDisplayNames } from "../account/index.ts";
import { feedback } from "./schema.ts";

/** 運営者の一覧に出す数の上限（新しい順）。 */
export const FEEDBACK_LIST_LIMIT = 500;

/**
 * 改善点を足す。
 * @param db DB
 * @param input 送った人・アプリの key・本文
 * @param input.accountId 送った人
 * @param input.appKey アプリの key（なければ null）
 * @param input.body 本文
 * @returns 足した改善点の ID
 */
export async function insertFeedback(
  db: Executor,
  input: { accountId: string; appKey: string | null; body: string },
): Promise<string> {
  const [row] = await db.insert(feedback).values(input).returning({ id: feedback.id });
  if (!row) throw new Error("改善点を足せませんでした。");
  return row.id;
}

/**
 * その人が、ある時刻のあとに送った改善点の数（1日の上限を確かめる）。
 * @param db DB
 * @param accountId 送った人
 * @param since この時刻から（含む）
 * @returns 数
 */
export async function countFeedbackSince(
  db: Executor,
  accountId: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(feedback)
    .where(and(eq(feedback.accountId, accountId), gte(feedback.createdAt, since)));
  return row?.value ?? 0;
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
  /** 送った人の表示名（退会した人は null） */
  sender: string | null;
  /** 済みか */
  done: boolean;
};

/**
 * 改善点の一覧（新しい順・上限まで）。
 * @param db DB
 * @param filter 絞り方（アプリの key・まだのものだけ・1つの ID）
 * @param filter.appKey アプリの key（なければ絞らない）
 * @param filter.pending まだのものだけか
 * @param filter.id この ID の1行だけ
 * @returns 改善点
 */
export async function listFeedback(
  db: Executor,
  filter: { appKey?: string | undefined; pending?: boolean | undefined; id?: string | undefined },
): Promise<FeedbackRow[]> {
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
    .limit(FEEDBACK_LIST_LIMIT);
  const names = await findDisplayNames(
    db,
    rows.flatMap((row) => (row.accountId ? [row.accountId] : [])),
  );
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    appKey: row.appKey,
    body: row.body,
    sender: row.accountId ? (names.get(row.accountId) ?? null) : null,
    done: row.doneAt !== null,
  }));
}

/**
 * 済みを付け外す。
 * @param db DB
 * @param id 改善点の ID
 * @param done 済みか
 * @returns 付け外したら true、なければ false
 */
export async function setFeedbackDone(db: Executor, id: string, done: boolean): Promise<boolean> {
  const rows = await db
    .update(feedback)
    .set({ doneAt: done ? new Date() : null })
    .where(eq(feedback.id, id))
    .returning({ id: feedback.id });
  return rows.length > 0;
}
