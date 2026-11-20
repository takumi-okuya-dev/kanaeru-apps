// 名簿と受付係の画面の答えの形を作る（当ては matching.ts で読むときに決める。booking-001 research R8）。
// 入れた人の名前は account の findDisplayNames で引く（写さない）。チェックインは reception の listEventAttendees で読む。
import type { MatchBoard, Roster, RosterEntry } from "@workspace/contracts/booking";
import { APPLICATION_SOURCES } from "@workspace/contracts/reception";
import type { Executor } from "../../kernel/db.ts";
import { findDisplayNames } from "../account/index.ts";
import type { EventAttendee } from "../reception/index.ts";
import { attendanceOf, resolveMatches, sameNameEntryIds } from "./matching.ts";
import type { DismissedPair, MatchResult } from "./matching.ts";
import type { EntryRecord } from "./repository.ts";

/**
 * 入れた人の表示名を引く（同じ人は1回だけ）。
 * @param db DB
 * @param entries 名簿の行
 * @returns account の ID から表示名
 */
export function enteredByNames(
  db: Executor,
  entries: readonly EntryRecord[],
): Promise<Map<string, string>> {
  return findDisplayNames(
    db,
    entries.flatMap((entry) => (entry.enteredBy ? [entry.enteredBy] : [])),
  );
}

/**
 * 名簿の1行を答えの形にする。
 * @param entry 行
 * @param context 当て・同じ名前の印・入れた人の名前・交流会の日が終わったか
 * @param context.matches 当て
 * @param context.sameName 同じ名前の印を付ける行の ID
 * @param context.names 入れた人の表示名
 * @param context.eventEnded 交流会の日が終わったか
 * @returns 名簿の行
 */
export function toRosterEntry(
  entry: EntryRecord,
  context: {
    matches: MatchResult;
    sameName: ReadonlySet<string>;
    names: ReadonlyMap<string, string>;
    eventEnded: boolean;
  },
): RosterEntry {
  const match = context.matches.byEntry.get(entry.id);
  return {
    id: entry.id,
    name: entry.name,
    applicationSource: entry.applicationSource,
    entryKind: entry.entryKind,
    status: entry.status,
    appliedAt: entry.appliedAt.toISOString(),
    enteredByName:
      entry.entryKind !== "import" && entry.enteredBy
        ? (context.names.get(entry.enteredBy) ?? null)
        : null,
    memo: entry.memo,
    sameName: context.sameName.has(entry.id),
    attendance: attendanceOf(entry, match !== undefined, context.eventEnded),
    match: match?.kind ?? null,
  };
}

/**
 * 名簿の答え（行と人数）を作る。
 * @param db DB
 * @param entries 名簿の行
 * @param attendees その交流会のチェックイン
 * @param dismissals ちがう人の組
 * @param eventEnded 交流会の日が終わったか
 * @returns 名簿
 */
export async function buildRoster(
  db: Executor,
  entries: readonly EntryRecord[],
  attendees: readonly EventAttendee[],
  dismissals: readonly DismissedPair[],
  eventEnded: boolean,
): Promise<Roster> {
  const matches = resolveMatches(entries, attendees, dismissals);
  const context = {
    matches,
    sameName: sameNameEntryIds(entries),
    names: await enteredByNames(db, entries),
    eventEnded,
  };
  const views = entries.map((entry) => toRosterEntry(entry, context));
  const confirmed = views.filter((entry) => entry.status === "confirmed");
  return {
    entries: views,
    counts: {
      confirmed: confirmed.length,
      cancelled: views.length - confirmed.length,
      came: views.filter((entry) => entry.attendance === "came").length,
      noShow: views.filter((entry) => entry.attendance === "no_show").length,
      walkIn: views.filter((entry) => entry.entryKind === "walk_in").length,
      bySource: APPLICATION_SOURCES.map((applicationSource) => ({
        applicationSource,
        count: confirmed.filter((entry) => entry.applicationSource === applicationSource).length,
      })),
    },
    eventEnded,
  };
}

/**
 * 受付係の「名簿に当てる」の答えを作る。
 * @param entries 名簿の行
 * @param attendees その交流会のチェックイン（古い順）
 * @param dismissals ちがう人の組
 * @returns 受付係の画面
 */
export function buildMatchBoard(
  entries: readonly EntryRecord[],
  attendees: readonly EventAttendee[],
  dismissals: readonly DismissedPair[],
): MatchBoard {
  const matches = resolveMatches(entries, attendees, dismissals);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const brief = (entry: EntryRecord) => ({
    id: entry.id,
    name: entry.name,
    applicationSource: entry.applicationSource,
  });
  const checkins = [...attendees].reverse().map((attendee) => {
    const state = matches.byCheckin.get(attendee.checkinId) ?? {
      state: "unmatched" as const,
      entryId: null,
    };
    const entry = state.entryId ? byId.get(state.entryId) : undefined;
    return {
      checkinId: attendee.checkinId,
      name: attendee.name,
      method: attendee.method,
      checkedInAt: attendee.checkedInAt.toISOString(),
      state: state.state,
      entry: entry ? brief(entry) : null,
    };
  });
  const confirmed = entries.filter((entry) => entry.status === "confirmed");
  const choices = confirmed
    .filter((entry) => !matches.byEntry.has(entry.id))
    .map(brief)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return {
    checkins,
    choices,
    counts: {
      came: confirmed.filter((entry) => matches.byEntry.has(entry.id)).length,
      confirmed: confirmed.length,
      walkIn: entries.filter((entry) => entry.entryKind === "walk_in").length,
      pending: checkins.filter((item) => item.state === "candidate" || item.state === "unmatched")
        .length,
    },
  };
}
