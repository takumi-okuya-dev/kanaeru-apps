// メモの画面の表示の手伝い。

/** 日時の書き方（日本の書き方。端末の時刻の帯）。 */
const DATE_TIME = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

/**
 * ISO 8601 の日時を、画面に出す書き方にする。
 * @param iso ISO 8601 の日時
 * @returns 画面に出す日時（例：2026/11/18 9:30）
 */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
