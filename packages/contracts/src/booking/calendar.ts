// カレンダーに追加（Google カレンダーのリンク。booking-003 research R16）。Google の API は使わない（PRD 8.2）。
// 交流会に終わりの時刻がないので、始まりから EVENT_DEFAULT_DURATION_MINUTES 分を終わりにする。API（知らせ）と画面が同じものを使う。
// URL と時刻の形を作る道具は共通（core の calendar。読書記録も使うので移した）。ここは交流会の長さと、交流会の中身の渡し方だけ。
// zod を読まない。
import { calendarStamp, googleCalendarUrl as googleCalendarEntryUrl } from "../core/index.ts";

export { calendarStamp };

/** 終わりの時刻がない交流会の長さ（分）。 */
export const EVENT_DEFAULT_DURATION_MINUTES = 120;

/**
 * 交流会の終わり（始まりから決まった長さ）。
 * @param startsAt 始まり
 * @returns 終わり
 */
export function eventEndsAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + EVENT_DEFAULT_DURATION_MINUTES * 60 * 1000);
}

/** カレンダーに入れる中身。 */
export type CalendarEvent = {
  /** 交流会の名前 */
  name: string;
  /** 始まり（ISO 8601 か Date） */
  startsAt: string | Date;
  /** 会場（なければ null） */
  venue: string | null;
  /** 説明（主催・申込みページの URL など） */
  details?: string;
};

/**
 * 交流会を Google カレンダーに入れる画面の URL。
 * @param event 中身
 * @returns URL
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const starts = new Date(event.startsAt);
  return googleCalendarEntryUrl({
    title: event.name,
    startsAt: starts,
    endsAt: eventEndsAt(starts),
    location: event.venue,
    ...(event.details ? { details: event.details } : {}),
  });
}
