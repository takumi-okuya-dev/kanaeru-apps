// アンケートの回答の読み書き（表は survey の領域だけが読み書きする。AD-3）。
// 回答はチェックインの ID だけで引く。交流会ごとの回答は、reception の listCheckins で引いたチェックインの ID で集める（research R1）。
import type { SurveyAnswerValues } from "@workspace/contracts/survey";
import { eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { surveyAnswer } from "./schema.ts";

/** 回答の行（読み出す形）。 */
export type SurveyAnswerRecord = typeof surveyAnswer.$inferSelect;

/**
 * チェックインの回答を読む。
 * @param db DB
 * @param checkinId チェックインの ID
 * @returns 回答。なければ null
 */
export async function findAnswerByCheckin(
  db: Executor,
  checkinId: string,
): Promise<SurveyAnswerRecord | null> {
  const [row] = await db
    .select()
    .from(surveyAnswer)
    .where(eq(surveyAnswer.checkinId, checkinId))
    .limit(1);
  return row ?? null;
}

/**
 * チェックインの回答を作るか、全部を置きかえる（同時に2回来ても1行。checkin_id の一意の制約。research R5）。
 * @param db DB
 * @param checkinId チェックインの ID
 * @param values 回答の値（5つの欄がそろったもの）
 * @returns 作った・直した回答
 * @throws {Error} 行が返らなかったとき（ふつうは起きない）
 */
export async function upsertAnswer(
  db: Executor,
  checkinId: string,
  values: SurveyAnswerValues,
): Promise<SurveyAnswerRecord> {
  const [row] = await db
    .insert(surveyAnswer)
    .values({ checkinId, ...values })
    .onConflictDoUpdate({
      target: surveyAnswer.checkinId,
      set: { ...values, updatedAt: sql`now()` },
    })
    .returning();
  if (!row) throw new Error("書いた回答が返りませんでした。");
  return row;
}

/**
 * チェックインの ID の並びの回答を読む（交流会ごとの一覧・CSV）。
 * @param db DB
 * @param checkinIds チェックインの ID（空なら DB を引かない）
 * @returns 回答の並び（並びは決めない。呼ぶ側で並べる）
 */
export async function listAnswersByCheckins(
  db: Executor,
  checkinIds: readonly string[],
): Promise<SurveyAnswerRecord[]> {
  if (checkinIds.length === 0) return [];
  return db
    .select()
    .from(surveyAnswer)
    .where(inArray(surveyAnswer.checkinId, [...checkinIds]));
}
