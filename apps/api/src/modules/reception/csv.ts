// 参加者の CSV（FR-15。research R11）。UTF-8 の BOM と CRLF で、Excel で開いても文字化けしない。
// 名前・紹介者の名前は利用者が入れた値なので、式として読まれないよう、= + - @ タブ CR で始まる欄の先頭に ' を足す。
// 割引（名前と額の写し）と紹介者の名前は reception-002 で足した（主催者だけの窓口。research R9）。
import {
  APPLICATION_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  REFERRAL_LABELS,
} from "@workspace/contracts/reception";
import type { CheckinRecord } from "./repository.ts";

/** BOM（Excel が UTF-8 と読むため）。 */
const BOM = "﻿";

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
  const lines = [
    PARTICIPANTS_CSV_HEADER.join(","),
    ...rows.map(({ record, enteredByName }) =>
      [
        record.name,
        formatJstDateTime(record.createdAt),
        APPLICATION_SOURCE_LABELS[record.applicationSource],
        REFERRAL_LABELS[record.referral],
        PAYMENT_METHOD_LABELS[record.paymentMethod],
        String(record.amount),
        record.discountName ?? "",
        record.discountAmount === null ? "" : String(record.discountAmount),
        record.referrerName ?? "",
        record.accountId === null ? "手" : "LINE",
        enteredByName ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
