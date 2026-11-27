// 人物メモの CSV（FR-019・research R13）。BOM・CRLF・式として読まれない守りは共通の道具 @workspace/csv が行う（core-004）。
// ここでは見出しと、各欄を文字にする（タグと会った場を「、」でつなぐ・日本時間の日時）ことだけを決める。
import { jstDateTime } from "@workspace/contracts/core";
import { buildCsv } from "@workspace/csv";
import type { ExportRow } from "./repository.ts";

/** 見出しの行（research R13 の列）。 */
export const PERSON_CSV_HEADER = [
  "フルネーム",
  "よみ",
  "LINE の名前",
  "見た目の特徴",
  "X",
  "connpass",
  "GitHub",
  "LinkedIn",
  "LINE ID",
  "URL",
  "タグ",
  "話したこと",
  "次に話したいこと",
  "会った場",
  "最後に保存した日時",
] as const;

/**
 * 人物メモの CSV を作る（BOM つき・CRLF・最後の行も CRLF で終える）。
 * @param rows 書き出しの行（並びはそのまま）
 * @returns CSV の文字
 */
export function buildPersonCsv(rows: readonly ExportRow[]): string {
  return buildCsv(
    PERSON_CSV_HEADER,
    rows.map((row) => [
      row.fullName,
      row.reading ?? "",
      row.lineName ?? "",
      row.appearance ?? "",
      row.accountX ?? "",
      row.accountConnpass ?? "",
      row.accountGithub ?? "",
      row.accountLinkedin ?? "",
      row.accountLine ?? "",
      row.accountUrl ?? "",
      row.tags.join("、"),
      row.talk,
      row.nextTopic,
      row.meetings.map((meeting) => `${meeting.name}（${meeting.metOn}）`).join("、"),
      jstDateTime(row.updatedAt),
    ]),
  );
}
