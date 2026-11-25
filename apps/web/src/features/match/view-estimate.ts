// 見るだけのページの「今の試合」の見込み（PRD FR-M15【仮決め】。match-005）。状態を持たない関数だけ。
// つながらない間は、最後に読んだ表（とその時刻）と1試合の長さから、今どの試合まで進んだかを見込む：
// 読んだときの今の試合（チェックのない最初の試合）から、過ぎた時間を1試合の長さで割った数だけ、チェックのない試合を進める。

/** 見込みに使う1試合（終わったか）。 */
type GameLike = { done: boolean };

/**
 * 今の試合の番号（0から。チェックのない最初の試合。みな終わっていれば試合の数）。
 * @param games 試合
 * @returns 番号
 */
export function nowIndexOf(games: readonly GameLike[]): number {
  const index = games.findIndex((game) => !game.done);
  return index < 0 ? games.length : index;
}

/**
 * 今の試合の番号の見込み（0から。みな終わった見込みなら試合の数）。
 * @param games 試合（最後に読んだ表）
 * @param readAt 読んだ時刻（ミリ秒）
 * @param minutesPerGame 1試合の長さ（分）
 * @param now 今の時刻（ミリ秒）
 * @returns 見込みの番号
 */
export function estimateNowIndex(
  games: readonly GameLike[],
  readAt: number,
  minutesPerGame: number,
  now: number,
): number {
  let index = nowIndexOf(games);
  if (minutesPerGame <= 0) return index;
  const steps = Math.max(0, Math.floor((now - readAt) / (minutesPerGame * 60_000)));
  for (let step = 0; step < steps && index < games.length; step += 1) {
    index += 1;
    while (index < games.length && games[index]?.done) index += 1;
  }
  return index;
}
