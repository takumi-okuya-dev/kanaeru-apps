// カレンダーに追加（Google カレンダーのリンク。booking-003 research R16）。Google の API は使わない（PRD 8.2）。
// 交流会に終わりの時刻がないので、始まりから EVENT_DEFAULT_DURATION_MINUTES 分を終わりにする。API（知らせ）と画面が同じものを使う。
// zod を読まない。

/** 終わりの時刻がない交流会の長さ（分）。 */
export const EVENT_DEFAULT_DURATION_MINUTES = 120;

/** Google カレンダーの追加の画面の頭。 */
const GOOGLE_CALENDAR_BASE = "https://calendar.google.com/calendar/render";

/**
 * 交流会の終わり（始まりから決まった長さ）。
 * @param startsAt 始まり
 * @returns 終わり
 */
export function eventEndsAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + EVENT_DEFAULT_DURATION_MINUTES * 60 * 1000);
}

/**
 * カレンダーの時刻の形（UTC の YYYYMMDDTHHMMSSZ）。
 * @param instant 時刻
 * @returns 時刻の文字
 */
export function calendarStamp(instant: Date): string {
  return instant
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
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
 * Google カレンダーの追加の画面の URL。
 * @param event 中身
 * @returns URL
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const starts = new Date(event.startsAt);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${calendarStamp(starts)}/${calendarStamp(eventEndsAt(starts))}`,
  });
  if (event.venue) params.set("location", event.venue);
  if (event.details) params.set("details", event.details);
  return `${GOOGLE_CALENDAR_BASE}?${params.toString()}`;
}
