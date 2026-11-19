// 回答の行を、答えの形にする（参加者の回答・困りごとの一覧の行）と、一覧の並べ方と絞りこみ（research R7）。
// 名前と入れ方は、いつも reception のチェックインから（AD-6）。
import type { SurveyAnswer, SurveyAnswerRow, SurveyListQuery } from "@workspace/contracts/survey";
import { compareByMonthlyPrice } from "@workspace/contracts/survey";
import type { CheckinRecord } from "../reception/index.ts";
import type { SurveyAnswerRecord } from "./repository.ts";

/**
 * 回答を、参加者と主催者が読む形にする。
 * @param record 回答の行
 * @returns 回答
 */
export function toSurveyAnswer(record: SurveyAnswerRecord): SurveyAnswer {
  return {
    concern: record.concern,
    monthlyPrice: record.monthlyPrice,
    tester: record.tester,
    jobRole: record.jobRole,
    jobType: record.jobType,
    answeredAt: record.updatedAt.toISOString(),
  };
}

/** 回答とチェックインの組。 */
export type AnswerWithCheckin = {
  /** 回答 */
  answer: SurveyAnswerRecord;
  /** その回答のチェックイン */
  checkin: CheckinRecord;
};

/**
 * 回答を、チェックインと組にする（チェックインのない回答は捨てる。ふつうは CASCADE で残らない）。
 * @param answers 回答
 * @param checkins その交流会のチェックイン
 * @returns 組の並び（並びは決めない）
 */
export function pairWithCheckins(
  answers: readonly SurveyAnswerRecord[],
  checkins: readonly CheckinRecord[],
): AnswerWithCheckin[] {
  const byId = new Map(checkins.map((checkin) => [checkin.id, checkin]));
  return answers.flatMap((answer) => {
    const checkin = byId.get(answer.checkinId);
    return checkin ? [{ answer, checkin }] : [];
  });
}

/**
 * 回答を作った時刻の新しい順（同じ時刻は ID の新しい順）の比べ方。
 * @param a 1つ目
 * @param b 2つ目
 * @returns a が前なら負
 */
function newestFirst(a: AnswerWithCheckin, b: AnswerWithCheckin): number {
  const byTime = b.answer.createdAt.getTime() - a.answer.createdAt.getTime();
  return byTime !== 0 ? byTime : b.answer.id.localeCompare(a.answer.id);
}

/**
 * 一覧の絞りこみと並べ方を当てる（tester=yes は「はい」だけ。sort=price は月いくらの高い順で、同じ答えの中は新しい順）。
 * @param pairs 回答とチェックインの組
 * @param query 絞りこみと並べ方
 * @returns 当てた並び
 */
export function applyListQuery(
  pairs: readonly AnswerWithCheckin[],
  query: SurveyListQuery,
): AnswerWithCheckin[] {
  const filtered =
    query.tester === "yes" ? pairs.filter((p) => p.answer.tester === "yes") : [...pairs];
  return filtered.sort((a, b) =>
    query.sort === "price"
      ? compareByMonthlyPrice(a.answer.monthlyPrice, b.answer.monthlyPrice) || newestFirst(a, b)
      : newestFirst(a, b),
  );
}

/**
 * 回答とチェックインを、困りごとの一覧の行にする。
 * @param pair 回答とチェックインの組
 * @returns 一覧の行
 */
export function toSurveyAnswerRow({ answer, checkin }: AnswerWithCheckin): SurveyAnswerRow {
  return {
    ...toSurveyAnswer(answer),
    id: answer.id,
    checkinId: checkin.id,
    name: checkin.name,
    method: checkin.accountId === null ? "manual" : "line",
    createdAt: answer.createdAt.toISOString(),
  };
}
