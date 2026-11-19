// アンケートの回答の読み書き（表は survey の領域だけが読み書きする。AD-3）。
// 回答はチェックインの ID だけで引く。交流会ごとの回答は、reception の listCheckins で引いたチェックインの ID で集める（research R1）。
import type { SurveyAnswerValues } from "@workspace/contracts/survey";
import { eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { surveyAnswer } from "./schema.ts";

/** 回答のチェックインへの外部キーの制約の名前（DB の変更 0005_survey.sql）。 */
const CHECKIN_FK = "survey_answer_checkin_id_checkin_id_fk";

/**
 * 回答のチェックインへの外部キーの違反か（チェックインがもうない。drizzle が包んだ違反は cause に入る）。
 * kernel/pg-errors.ts には一意の制約の違反しかないので、survey の中で見分ける（共通に出すのは別の共通の PR）。
 * @param error 投げられたもの
 * @returns 違反なら true
 */
function isCheckinForeignKeyViolation(error: unknown): boolean {
  const own = error as { code?: unknown; constraint?: unknown } | null;
  const cause = (error as { cause?: { code?: unknown; constraint?: unknown } } | null)?.cause;
  return [own, cause].some((item) => item?.code === "23503" && item.constraint === CHECKIN_FK);
}

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
 * チェックインを読んでから書くまでの間に、チェックインが取り消された（外部キーの違反）ときは null を返す。
 * @param db DB
 * @param checkinId チェックインの ID
 * @param values 回答の値（5つの欄がそろったもの）
 * @returns 作った・直した回答。チェックインがもうなければ null
 * @throws {Error} 行が返らなかったとき（ふつうは起きない）と、外部キーの違反のほかの DB のエラー
 */
export async function upsertAnswer(
  db: Executor,
  checkinId: string,
  values: SurveyAnswerValues,
): Promise<SurveyAnswerRecord | null> {
  let rows: SurveyAnswerRecord[];
  try {
    rows = await db
      .insert(surveyAnswer)
      .values({ checkinId, ...values })
      .onConflictDoUpdate({
        target: surveyAnswer.checkinId,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning();
  } catch (error) {
    if (isCheckinForeignKeyViolation(error)) return null;
    throw error;
  }
  const [row] = rows;
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
