// 主催者・受付係に返す設定と名簿の答え（routes.ts と routes-waitlist.ts が同じものを使う）。
// 設定には使い方・申込みページ・定員と枠・席の内訳・中止・変更（booking-004）、名簿の行には何番目か・打診の期限を入れる。
// チェックインは reception の index.ts（listEventAttendees）、交流会は event の index.ts からだけ読む（AD-3）。
import type { BookingSetting, Roster, RosterEntry } from "@workspace/contracts/booking";
import { BOOKING_ERRORS } from "@workspace/contracts/booking";
import { endOfJstDate } from "@workspace/contracts/core";
import { EVENT_ERRORS } from "@workspace/contracts/event";
import { AppError } from "../../kernel/errors.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { findEventOrganizationId, getEventSummary } from "../event/index.ts";
import { listEventAttendees } from "../reception/index.ts";
import { findPageSetting } from "./apply-repository.ts";
import { countEntries, listDismissals, listEntries } from "./repository.ts";
import { buildRoster } from "./views.ts";
import { waitlistSettingFields } from "./waitlist.ts";
import { listPendingOffers } from "./waitlist-repository.ts";

/** 答えを作るのに使う道具。 */
type ViewDeps = Pick<DomainRouteDeps, "db" | "config">;

/**
 * 交流会の使い方・申込みページ・定員とキャンセル待ちの設定の答え（booking-003 R13・booking-004 R3）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @returns 設定
 * @throws {AppError} 交流会がないとき（event の NOT_FOUND）
 */
export async function readSettingView(deps: ViewDeps, eventId: string): Promise<BookingSetting> {
  const { db } = deps;
  const page = await findPageSetting(db, eventId);
  const entryCount = await countEntries(db, eventId);
  const summary = await getEventSummary(db, deps.config, eventId);
  if (!summary) throw new AppError(EVENT_ERRORS.NOT_FOUND);
  const now = new Date();
  return {
    mode: page.mode,
    entryCount,
    accepting: page.accepting,
    visibility: page.visibility,
    started: new Date(summary.startsAt).getTime() <= now.getTime(),
    inOrganization: (await findEventOrganizationId(db, eventId)) !== null,
    ...(await waitlistSettingFields(db, eventId, summary, now)),
  };
}

/**
 * 名簿の答え（行と人数）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @returns 名簿
 * @throws {AppError} 交流会がないとき（event の NOT_FOUND）
 */
export async function readRosterView(deps: ViewDeps, eventId: string): Promise<Roster> {
  const { db } = deps;
  const summary = await getEventSummary(db, deps.config, eventId);
  if (!summary) throw new AppError(EVENT_ERRORS.NOT_FOUND);
  const now = new Date();
  const [entries, attendees, dismissals, offers] = await Promise.all([
    listEntries(db, eventId),
    listEventAttendees(db, eventId),
    listDismissals(db, eventId),
    listPendingOffers(db, eventId),
  ]);
  const ended = endOfJstDate(summary.startsAt).getTime() <= now.getTime();
  return buildRoster(db, entries, attendees, dismissals, ended, offers, now);
}

/**
 * 名簿の1行の答え（同じ名前の印と来たか・何番目かは名簿の全体から決める）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 * @returns 名簿の行
 * @throws {AppError} ないとき（BOOKING_ENTRY_NOT_FOUND）
 */
export async function readRosterEntryView(
  deps: ViewDeps,
  eventId: string,
  entryId: string,
): Promise<RosterEntry> {
  const entry = (await readRosterView(deps, eventId)).entries.find((item) => item.id === entryId);
  if (!entry) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
  return entry;
}
