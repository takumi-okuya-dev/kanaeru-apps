// 日本時間（JST。UTC+9・夏時間なし）の日付・日時と「その日の終わり」（構成の決めごと Consistency Conventions「ID・時刻」）。
// サーバーや端末の時刻帯に頼らない（UTC に9時間を足し、UTC の読み方で日付を出す）。
// 例：招待の期限は「交流会の日時の、日本時間の日付が終わるまで」＝ now < endOfJstDate(交流会の日時)（AD-5）。
// zod を読まない。

/** 日本時間の時差（ミリ秒）。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 時刻を読む（Date か、時差つきの ISO 8601 の文字）。
 * @param instant 時刻
 * @returns UNIX の時刻（ミリ秒）
 * @throws {RangeError} 時刻として読めないとき
 */
function toEpochMs(instant: Date | string): number {
  const ms = instant instanceof Date ? instant.getTime() : Date.parse(instant);
  if (Number.isNaN(ms)) throw new RangeError("時刻として読めません。");
  return ms;
}

/**
 * 日本時間の日付。
 * @param instant 時刻（Date か、時差つきの ISO 8601 の文字）
 * @returns `YYYY-MM-DD`（日本時間）
 * @throws {RangeError} 時刻として読めないとき
 */
export function jstDate(instant: Date | string): string {
  return new Date(toEpochMs(instant) + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 日本時間の日時（CSV などに出す形。秒は切り捨てる）。
 * @param instant 時刻（Date か、時差つきの ISO 8601 の文字）
 * @returns `YYYY-MM-DD HH:mm`（日本時間）
 * @throws {RangeError} 時刻として読めないとき
 */
export function jstDateTime(instant: Date | string): string {
  const iso = new Date(toEpochMs(instant) + JST_OFFSET_MS).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/**
 * その時刻の、日本時間の日付が終わる時刻（翌日の日本時間 0時）。含まない側の境なので、`now < endOfJstDate(x)` ならその日のうち。
 * @param instant 時刻（Date か、時差つきの ISO 8601 の文字）
 * @returns 翌日の日本時間 0時の時刻
 * @throws {RangeError} 時刻として読めないとき
 */
export function endOfJstDate(instant: Date | string): Date {
  const shifted = toEpochMs(instant) + JST_OFFSET_MS;
  const startOfJstDay = shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS);
  return new Date(startOfJstDay + DAY_MS - JST_OFFSET_MS);
}
