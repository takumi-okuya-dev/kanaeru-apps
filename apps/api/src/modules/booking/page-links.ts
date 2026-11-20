// 知らせ・カレンダーに入れるリンク（申込みページ・札のページ・自分の申込み・Google カレンダー）。API は LIFF ID を知らないので、
// 画面の源（WEB_URL）＋参加者の道（AD-14 の participantPaths）にする（booking-003 R12・booking-004 R12）。札はログに出さない。
import type { CalendarLinks } from "@workspace/contracts/booking";
import { googleCalendarUrl } from "@workspace/contracts/booking";
import { participantPaths } from "@workspace/contracts/core";
import type { EventSummary } from "@workspace/contracts/event";
import type { DomainConfig } from "../../kernel/http.ts";

/** リンクを作るのに要る設定。 */
type LinkDeps = { config: Pick<DomainConfig, "webUrl"> };

/**
 * 申込みページの URL。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @returns URL
 */
export function applyUrl(deps: LinkDeps, eventId: string): string {
  return `${deps.config.webUrl}${participantPaths.apply(eventId)}`;
}

/**
 * 札のページの URL（札つき。ログに出さない）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param token 札
 * @returns URL
 */
export function entryTokenUrl(deps: LinkDeps, eventId: string, token: string): string {
  return `${deps.config.webUrl}${participantPaths.entry(eventId, token)}`;
}

/**
 * 自分の申込みの URL（LINE の人の打診の返事。booking-004 R8）。
 * @param deps 道具
 * @returns URL
 */
export function myBookingsUrl(deps: LinkDeps): string {
  return `${deps.config.webUrl}${participantPaths.myBookings()}`;
}

/**
 * カレンダーに追加のリンク。
 * @param deps 道具
 * @param event 要約
 * @param hostName 主催の名前
 * @returns Google のリンクと .ics の道
 */
export function calendarLinks(
  deps: LinkDeps,
  event: EventSummary,
  hostName: string,
): CalendarLinks {
  const details = [hostName ? `主催：${hostName}` : "", applyUrl(deps, event.id)]
    .filter(Boolean)
    .join("\n");
  return {
    googleUrl: googleCalendarUrl({
      name: event.name,
      startsAt: event.startsAt,
      venue: event.venue,
      details,
    }),
    icsPath: `/api/v1/booking/events/${event.id}/calendar`,
  };
}
