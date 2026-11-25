// 困りごとの CSV（FR-15。research R12）。BOM・CRLF・式として読まれない守りは共通の道具 @workspace/csv が行う（core-004）。
// ここでは見出しと、各欄を文字にする（ラベル・日本時間の日時）ことだけを決める。
import { jstDateTime } from "@workspace/contracts/core";
import {
  JOB_ROLE_LABELS,
  JOB_TYPE_LABELS,
  MONTHLY_PRICE_LABELS,
  SURVEY_COLUMN_LABELS,
  TESTER_ANSWER_LABELS,
  choiceLabel,
} from "@workspace/contracts/survey";
import { buildCsv } from "@workspace/csv";
import type { AnswerWithCheckin } from "./views.ts";

/** 見出しの行。 */
export const CONCERNS_CSV_HEADER = [
  "名前",
  SURVEY_COLUMN_LABELS.concern,
  SURVEY_COLUMN_LABELS.monthlyPrice,
  SURVEY_COLUMN_LABELS.tester,
  SURVEY_COLUMN_LABELS.jobRole,
  SURVEY_COLUMN_LABELS.jobType,
  "入れ方",
  "回答の時刻",
] as const;

/**
 * 困りごとの CSV を作る（BOM つき・CRLF・最後の行も CRLF で終える）。
 * @param rows 回答とチェックインの組（並びはそのまま）
 * @returns CSV の文字
 */
export function buildConcernsCsv(rows: readonly AnswerWithCheckin[]): string {
  return buildCsv(
    CONCERNS_CSV_HEADER,
    rows.map(({ answer, checkin }) => [
      checkin.name,
      answer.concern ?? "",
      choiceLabel(MONTHLY_PRICE_LABELS, answer.monthlyPrice),
      choiceLabel(TESTER_ANSWER_LABELS, answer.tester),
      choiceLabel(JOB_ROLE_LABELS, answer.jobRole),
      choiceLabel(JOB_TYPE_LABELS, answer.jobType),
      checkin.accountId === null ? "手" : "LINE",
      jstDateTime(answer.updatedAt),
    ]),
  );
}
