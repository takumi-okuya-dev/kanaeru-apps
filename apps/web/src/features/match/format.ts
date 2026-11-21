// 試合表の画面の言葉の形（日付・時刻）。

/** 曜日の言葉。 */
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * 試合の日を「2026/12/13(日)」の形にする（日本時間の日付をそのまま使う。時差で日がずれない）。
 * @param playDate 試合の日（YYYY-MM-DD）
 * @returns 画面の言葉
 */
export function formatPlayDate(playDate: string): string {
  const [year, month, day] = playDate.split("-").map(Number);
  if (!year || !month || !day) return playDate;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
  return `${year}/${month}/${day}(${weekday})`;
}

/**
 * 時刻を「13:02」の形にする（端末の時刻。画面は日本時間で使う）。
 * @param time 時刻（ミリ秒）
 * @returns 画面の言葉
 */
export function formatClock(time: number): string {
  return new Date(time).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
