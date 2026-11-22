// 試合表の画面の言葉の形（日付）。

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
