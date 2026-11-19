// 困りごとの CSV（FR-15。research R12）。UTF-8 の BOM と CRLF で、Excel で開いても文字化けしない。
// 名前と困りごとは利用者が入れた値なので、式として読まれないよう、= + - @ タブ CR で始まる欄の先頭に ' を足す。
// 欄の書き方は reception の参加者の CSV と同じ形（reception の内部は読まない。plan の Complexity Tracking）。
import {
  JOB_ROLE_LABELS,
  JOB_TYPE_LABELS,
  MONTHLY_PRICE_LABELS,
  SURVEY_COLUMN_LABELS,
  TESTER_ANSWER_LABELS,
  choiceLabel,
} from "@workspace/contracts/survey";
import type { AnswerWithCheckin } from "./views.ts";

/** BOM（Excel が UTF-8 と読むため）。 */
const BOM = "﻿";

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

/** 日本時間の日時の部品を取り出す道具（サーバーの時刻帯に頼らない）。 */
const JST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * 日本時間の日時（YYYY-MM-DD HH:mm）。
 * @param instant 時刻
 * @returns 日時の文字
 */
export function formatJstDateTime(instant: Date): string {
  const parts = Object.fromEntries(
    JST_PARTS.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * 1つの欄を CSV の形にする（式の先頭を打ち消し、要れば " で囲む）。
 * @param value 欄の値
 * @returns CSV の欄
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * 困りごとの CSV を作る（BOM つき・CRLF・最後の行も CRLF で終える）。
 * @param rows 回答とチェックインの組（並びはそのまま）
 * @returns CSV の文字
 */
export function buildConcernsCsv(rows: readonly AnswerWithCheckin[]): string {
  const lines = [
    CONCERNS_CSV_HEADER.join(","),
    ...rows.map(({ answer, checkin }) =>
      [
        checkin.name,
        answer.concern ?? "",
        choiceLabel(MONTHLY_PRICE_LABELS, answer.monthlyPrice),
        choiceLabel(TESTER_ANSWER_LABELS, answer.tester),
        choiceLabel(JOB_ROLE_LABELS, answer.jobRole),
        choiceLabel(JOB_TYPE_LABELS, answer.jobType),
        checkin.accountId === null ? "手" : "LINE",
        formatJstDateTime(answer.updatedAt),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
