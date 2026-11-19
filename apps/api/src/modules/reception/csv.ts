// 参加者の CSV（FR-15。research R11）。BOM・CRLF・式として読まれない守りは共通の道具 @workspace/csv が行う（core-004）。
// ここでは見出しと、各欄を文字にする（ラベル・日本時間の日時・数）ことだけを決める。
// 割引（名前と額の写し）と紹介者の名前は reception-002 で足した（主催者だけの窓口。research R9）。
import { jstDateTime } from "@workspace/contracts/core";
import {
  APPLICATION_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  REFERRAL_LABELS,
} from "@workspace/contracts/reception";
import { buildCsv } from "@workspace/csv";
import type { CheckinRecord } from "./repository.ts";

/** 見出しの行。 */
export const PARTICIPANTS_CSV_HEADER = [
  "名前",
  "チェックインの時刻",
  "申し込みの媒体",
  "知ったきっかけ",
  "支払い方法",
  "金額",
  "割引",
  "割引の額",
  "紹介者",
  "入れ方",
  "入れた人",
] as const;

/** CSV の1行に要るもの。 */
export type ParticipantRow = {
  /** チェックイン */
  record: CheckinRecord;
  /** 手で入れた人の表示名（なければ null） */
  enteredByName: string | null;
};

/**
 * 参加者の CSV を作る（BOM つき・CRLF・最後の行も CRLF で終える）。
 * @param rows 行（並びはそのまま）
 * @returns CSV の文字
 */
export function buildParticipantsCsv(rows: readonly ParticipantRow[]): string {
  return buildCsv(
    PARTICIPANTS_CSV_HEADER,
    rows.map(({ record, enteredByName }) => [
      record.name,
      jstDateTime(record.createdAt),
      APPLICATION_SOURCE_LABELS[record.applicationSource],
      REFERRAL_LABELS[record.referral],
      PAYMENT_METHOD_LABELS[record.paymentMethod],
      String(record.amount),
      record.discountName ?? "",
      record.discountAmount === null ? "" : String(record.discountAmount),
      record.referrerName ?? "",
      record.accountId === null ? "手" : "LINE",
      enteredByName ?? "",
    ]),
  );
}
