// 試合表の画面の言葉の形（日付・時刻・札の期限・分け方）。
import { MATCH_GROUPING_LABELS } from "@workspace/contracts/match";
import type { MatchSettings } from "@workspace/contracts/match";

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

/**
 * 期限の文（例：「2026/12/13(日) の終わりまで」）。期限は日本時間の翌日0時なので、1ミリ秒前の日付を出す。
 * @param expiresAt 期限（ISO 8601）
 * @returns 文
 */
export function expiryText(expiresAt: string): string {
  const last = new Date(Date.parse(expiresAt) - 1 + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `${formatPlayDate(last)} の終わりまで`;
}

/**
 * 分け方の文（担当でない端末の設定の欄・題の下）。
 * @param settings 設定
 * @returns 文（例：「レベル別（上級・中級・初級・入門）・分けない・ミニゲーム（3コート）」）
 */
export function settingsText(settings: MatchSettings): string {
  return [
    ...(settings.levels ? [`レベル別（${MATCH_GROUPING_LABELS[settings.levels]}）`] : []),
    ...(settings.ungrouped ? ["分けない"] : []),
    ...(settings.courts !== null ? [`ミニゲーム（${settings.courts}コート）`] : []),
  ].join("・");
}
