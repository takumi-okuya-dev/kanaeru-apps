// カレンダーに入れる道具（Google カレンダーの追加の画面の URL と、カレンダーの時刻の形）。業務を知らない技術の道具（構成の決めごと AD-18）。
// booking の約束から移した（予約の知らせと、読書記録のやってみることの2つが使うため）。Google の API は使わず、利用者が自分のカレンダーに足す画面を開くだけ。
// 終わりの時刻の決め方（交流会の長さなど）は、使う領域が決めて渡す。zod を読まない。

/** Google カレンダーの追加の画面の頭。 */
const GOOGLE_CALENDAR_BASE = "https://calendar.google.com/calendar/render";

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

/** Google カレンダーに入れる予定。 */
export type GoogleCalendarEntry = {
  /** 予定の題 */
  title: string;
  /** 始まり */
  startsAt: Date;
  /** 終わり */
  endsAt: Date;
  /** 場所（なければ null か省く） */
  location?: string | null;
  /** 説明（開くページの URL など） */
  details?: string;
};

/**
 * Google カレンダーの追加の画面の URL。
 * @param entry 予定
 * @returns URL
 */
export function googleCalendarUrl(entry: GoogleCalendarEntry): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: entry.title,
    dates: `${calendarStamp(entry.startsAt)}/${calendarStamp(entry.endsAt)}`,
  });
  if (entry.location) params.set("location", entry.location);
  if (entry.details) params.set("details", entry.details);
  return `${GOOGLE_CALENDAR_BASE}?${params.toString()}`;
}
