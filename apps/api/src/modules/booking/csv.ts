// 名簿の CSV（主催者だけ。booking-001 research R15）。BOM・CRLF・式として読まれない守りは共通の道具 @workspace/csv が行う。
// ここでは見出しと、各欄を文字にする（言葉・日本時間の日時）ことだけを決める。
import {
  ATTENDANCE_LABELS,
  ENTRY_KIND_LABELS,
  ENTRY_STATUS_LABELS,
} from "@workspace/contracts/booking";
import type { RosterEntry } from "@workspace/contracts/booking";
import { jstDateTime } from "@workspace/contracts/core";
import { APPLICATION_SOURCE_LABELS } from "@workspace/contracts/reception";
import { buildCsv } from "@workspace/csv";

/** 見出しの行。 */
export const ROSTER_CSV_HEADER = [
  "名前",
  "媒体",
  "入口",
  "状態",
  "申し込んだ日時",
  "来た",
  "入れた人",
  "メモ",
] as const;

/**
 * 名簿の CSV を作る（並びは名簿のまま）。
 * @param entries 名簿の行
 * @returns CSV の文字
 */
export function buildRosterCsv(entries: readonly RosterEntry[]): string {
  return buildCsv(
    ROSTER_CSV_HEADER,
    entries.map((entry) => [
      entry.name,
      APPLICATION_SOURCE_LABELS[entry.applicationSource],
      ENTRY_KIND_LABELS[entry.entryKind],
      ENTRY_STATUS_LABELS[entry.status],
      jstDateTime(entry.appliedAt),
      entry.attendance === "pending" ? "" : ATTENDANCE_LABELS[entry.attendance],
      entry.enteredByName ?? "",
      entry.memo ?? "",
    ]),
  );
}
