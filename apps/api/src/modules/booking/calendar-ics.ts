// .ics（iCalendar。RFC 5545）を作る（booking-003 research R16）。iPhone・Outlook の「ほかのカレンダー」に入れる1つの予定。
// 文字は escape（\ ; , と改行）し、行は75オクテットで折り返す（続きの行は空白で始める）。行の終わりは CRLF。
// 終わりの時刻は交流会にないので、始まりから決まった長さ（@workspace/contracts/booking の eventEndsAt）にする。
import { calendarStamp, eventEndsAt } from "@workspace/contracts/booking";

/** .ics に入れる中身。 */
export type IcsEvent = {
  /** 交流会の ID（UID に使う） */
  eventId: string;
  /** 名前 */
  name: string;
  /** 始まり */
  startsAt: Date;
  /** 会場 */
  venue: string | null;
  /** 説明 */
  description: string;
  /** 申込みページの URL */
  url: string;
};

/** 1行の上限（オクテット）。 */
const LINE_OCTETS = 75;

/**
 * 文字の値を escape する（RFC 5545 3.3.11）。
 * @param value 値
 * @returns escape した値
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * 1行を75オクテットで折り返す（文字の途中で切らない）。
 * @param line 行
 * @returns 折り返した行（CRLF と空白でつなぐ）
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // 続きの行は頭の空白の1オクテットを数える
    const limit = parts.length === 0 ? LINE_OCTETS : LINE_OCTETS - 1;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * .ics の本文を作る。
 * @param event 中身
 * @param now 作った時刻（DTSTAMP）
 * @returns .ics の本文（CRLF）
 */
export function buildIcs(event: IcsEvent, now: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//kanaeru//booking//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.eventId}@kanaeru`,
    `DTSTAMP:${calendarStamp(now)}`,
    `DTSTART:${calendarStamp(event.startsAt)}`,
    `DTEND:${calendarStamp(eventEndsAt(event.startsAt))}`,
    `SUMMARY:${escapeIcsText(event.name)}`,
    ...(event.venue ? [`LOCATION:${escapeIcsText(event.venue)}`] : []),
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `URL:${event.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
