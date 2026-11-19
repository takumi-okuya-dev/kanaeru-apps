// 交流会の日時と参加費の見せ方、日時の入力の欄の読み書き（research R4）。
// 日時はいつも日本時間で見せ、端末の時刻帯に頼らない（Consistency Conventions「ID・時刻」）。
// 入力は日本時間の日付（type="date"）と時刻（type="time"）の2つの欄で受け、時差つきの ISO 8601 にして送る。

/** 日本時間の時差（ミリ秒）。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の日時の部品を取り出す道具。 */
const JST_PARTS = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * 日本時間の日時の部品。
 * @param iso 時差つきの ISO 8601
 * @returns 年・月・日・曜日・時・分
 */
function jstParts(
  iso: string,
): Record<"year" | "month" | "day" | "weekday" | "hour" | "minute", string> {
  const parts = Object.fromEntries(
    JST_PARTS.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return {
    year: parts.year ?? "",
    month: parts.month ?? "",
    day: parts.day ?? "",
    weekday: parts.weekday ?? "",
    hour: parts.hour ?? "",
    minute: parts.minute ?? "",
  };
}

/**
 * 日本時間の日付（例：2026年11月25日（水））。
 * @param iso 時差つきの ISO 8601
 * @returns 日付の文字
 */
export function formatJstDate(iso: string): string {
  const { year, month, day, weekday } = jstParts(iso);
  return `${year}年${month}月${day}日（${weekday}）`;
}

/**
 * 交流会の日時（例：2026年11月25日（水）19:00）。
 * @param iso 時差つきの ISO 8601
 * @returns 日時の文字
 */
export function formatEventDateTime(iso: string): string {
  const { hour, minute } = jstParts(iso);
  return `${formatJstDate(iso)}${hour}:${minute}`;
}

/**
 * 参加費（例：1,000円・0円）。
 * @param fee 円の整数
 * @returns 参加費の文字
 */
export function formatFee(fee: number): string {
  return `${fee.toLocaleString("ja-JP")}円`;
}

/**
 * 時刻を、日本時間の日付と時刻の欄の値にする（直すときの初期値）。
 * @param iso 時差つきの ISO 8601
 * @returns 日付（YYYY-MM-DD）と時刻（HH:mm）
 */
export function toJstInputs(iso: string): { date: string; time: string } {
  const shifted = new Date(new Date(iso).getTime() + JST_OFFSET_MS).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

/**
 * 日本時間の日付と時刻の欄の値を、時差つきの ISO 8601 にする。
 * @param date 日付（YYYY-MM-DD）
 * @param time 時刻（HH:mm。秒つきの HH:mm:ss も受け取る）
 * @returns `YYYY-MM-DDTHH:mm:00+09:00`。形が違えば undefined
 */
export function fromJstInputs(date: string, time: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return undefined;
  const value = `${date}T${time.slice(0, 5)}:00+09:00`;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

/**
 * 参加費の欄の文字を数にする（全角・桁の区切り・空白は除く）。数字だけでなければ、そのまま返す（約束が誤りにする）。
 * @param value 欄の文字
 * @returns 円の整数・空なら undefined・数字でなければ元の文字
 */
export function parseFee(value: string): number | string | undefined {
  const normalized = value.normalize("NFKC").replace(/[,\s]/g, "");
  if (normalized === "") return undefined;
  return /^\d+$/.test(normalized) ? Number(normalized) : value;
}
