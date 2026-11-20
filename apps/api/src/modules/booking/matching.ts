// チェックインと名簿の当てを、読むときに決める（純粋な関数。保存しない。AD-23・booking-001 research R8）。
// 1. 行の checkin_id（手で当てた・飛び入り） 2. 行のアカウント = チェックインのアカウント（自動）
// 3. 残りのチェックインに、当たっていない確定の行で、そろえた名前が同じ・ちがう人にしていない行がちょうど1つ → 候補
// 取り消しの行は、自動でも候補でも当てない。来なかったは、交流会の日が終わってから、確定で来ていない行。
import type { Attendance, EntryKind, EntryStatus, MatchState } from "@workspace/contracts/booking";
import { normalizeCheckinName } from "@workspace/contracts/reception";

/** 当てに使う名簿の行（要る列だけ）。 */
export type MatchableEntry = {
  /** 行の ID */
  id: string;
  /** 名前 */
  name: string;
  /** 入口 */
  entryKind: EntryKind;
  /** 状態 */
  status: EntryStatus;
  /** 本人のアカウント（なければ null） */
  accountId: string | null;
  /** 手で当てたチェックイン（なければ null） */
  checkinId: string | null;
};

/** 当てに使うチェックイン（要る列だけ。reception の listEventAttendees の行）。 */
export type MatchableCheckin = {
  /** チェックインの ID */
  checkinId: string;
  /** 名前 */
  name: string;
  /** LINE のチェックインの本人（手なら null） */
  accountId: string | null;
};

/** ちがう人にした組。 */
export type DismissedPair = {
  /** チェックインの ID */
  checkinId: string;
  /** 行の ID */
  entryId: string;
};

/** 当ての結果。 */
export type MatchResult = {
  /** 行ごとの当たったチェックイン（手か自動） */
  byEntry: ReadonlyMap<string, { checkinId: string; kind: "manual" | "auto" }>;
  /** チェックインごとの状態と、当たった行か候補の行の ID */
  byCheckin: ReadonlyMap<string, { state: MatchState; entryId: string | null }>;
};

/**
 * チェックインと名簿の当てを決める。
 * @param entries その交流会の名簿の行（すべて）
 * @param checkins その交流会のチェックイン
 * @param dismissals ちがう人にした組
 * @returns 行ごと・チェックインごとの当て
 */
export function resolveMatches(
  entries: readonly MatchableEntry[],
  checkins: readonly MatchableCheckin[],
  dismissals: readonly DismissedPair[],
): MatchResult {
  const byEntry = new Map<string, { checkinId: string; kind: "manual" | "auto" }>();
  const byCheckin = new Map<string, { state: MatchState; entryId: string | null }>();
  const present = new Set(checkins.map((checkin) => checkin.checkinId));

  for (const entry of entries) {
    if (entry.checkinId && present.has(entry.checkinId) && !byCheckin.has(entry.checkinId)) {
      byEntry.set(entry.id, { checkinId: entry.checkinId, kind: "manual" });
      byCheckin.set(entry.checkinId, {
        state: entry.entryKind === "walk_in" ? "walk_in" : "matched_manual",
        entryId: entry.id,
      });
    }
  }

  for (const entry of entries) {
    if (byEntry.has(entry.id) || entry.accountId === null || entry.status === "cancelled") continue;
    const checkin = checkins.find(
      (item) => item.accountId === entry.accountId && !byCheckin.has(item.checkinId),
    );
    if (!checkin) continue;
    byEntry.set(entry.id, { checkinId: checkin.checkinId, kind: "auto" });
    byCheckin.set(checkin.checkinId, { state: "matched_auto", entryId: entry.id });
  }

  const dismissed = new Set(dismissals.map((pair) => `${pair.checkinId}:${pair.entryId}`));
  const open = entries.filter((entry) => entry.status === "confirmed" && !byEntry.has(entry.id));
  for (const checkin of checkins) {
    if (byCheckin.has(checkin.checkinId)) continue;
    const key = normalizeCheckinName(checkin.name);
    const candidates = open.filter(
      (entry) =>
        normalizeCheckinName(entry.name) === key &&
        !dismissed.has(`${checkin.checkinId}:${entry.id}`),
    );
    const [only] = candidates;
    byCheckin.set(
      checkin.checkinId,
      candidates.length === 1 && only
        ? { state: "candidate", entryId: only.id }
        : { state: "unmatched", entryId: null },
    );
  }
  return { byEntry, byCheckin };
}

/**
 * 行の来たかを決める。
 * @param entry 行
 * @param entry.status 状態
 * @param matched 当たったチェックインがあるか
 * @param eventEnded 交流会の日（日本時間）が終わったか
 * @returns 来た・来なかった・まだ
 */
export function attendanceOf(
  entry: { status: EntryStatus },
  matched: boolean,
  eventEnded: boolean,
): Attendance {
  if (matched) return "came";
  if (eventEnded && entry.status === "confirmed") return "no_show";
  return "pending";
}

/**
 * 同じ名前の印を付ける行（取り消しでない行のうち、そろえた名前が同じ行が2つ以上）。
 * @param entries 名簿の行
 * @returns 印を付ける行の ID
 */
export function sameNameEntryIds(
  entries: readonly { id: string; name: string; status: EntryStatus }[],
): Set<string> {
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.status === "cancelled") continue;
    const key = normalizeCheckinName(entry.name);
    groups.set(key, [...(groups.get(key) ?? []), entry.id]);
  }
  return new Set([...groups.values()].filter((ids) => ids.length > 1).flat());
}
