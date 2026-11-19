// DB の夜間の停止（日本時間 0時〜8時。構成の決めごと AD-10）の時間帯か。
// API は DB に届かないときの文（messages.ts の dbUnavailableMessage）を選ぶのに、画面は問い合わせをくり返すのを止めるかを決めるのに使う。
// 日本時間は jst.ts の関数で出す（サーバーや端末の時刻帯に頼らない）。zod を読まない。
import { endOfJstDate } from "./jst.ts";

/** 夜間の停止が終わる時刻（日本時間の時。0時から、この時の前まで止まる）。 */
export const NIGHT_STOP_END_HOUR_JST = 8;

/** 1時間（ミリ秒）。 */
const HOUR_MS = 60 * 60 * 1000;

/** 1日（ミリ秒）。 */
const DAY_MS = 24 * HOUR_MS;

/**
 * 夜間の停止の時間帯（日本時間 0時〜8時。8時ちょうどは含まない）か。
 * @param now 調べる時刻（既定は今）
 * @returns 夜間の停止の時間帯なら true
 * @throws {RangeError} 時刻として読めないとき
 */
export function isNightStopWindow(now: Date = new Date()): boolean {
  const startOfJstDay = endOfJstDate(now).getTime() - DAY_MS;
  return now.getTime() - startOfJstDay < NIGHT_STOP_END_HOUR_JST * HOUR_MS;
}
