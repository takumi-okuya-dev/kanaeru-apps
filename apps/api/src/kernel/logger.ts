// ログ。
// 1行1つの JSON（後の Cloud Logging がそのまま読める形）。手元は LOG_PRETTY=true で pino-pretty。
// 要求と応答の本文は出さない。redact は守りの二重目として、名前・メール・通行証・クッキーを消す。
import { pino } from "pino";
import type { DestinationStream, Logger as PinoLogger } from "pino";

/** redact で消した値の代わりに出す文字。 */
export const REDACTED = "[消した]";

/** 消す欄の道（pino の redact の形）。上の段と、1段下の両方を消す。 */
const REDACT_PATHS = [
  ...["email", "name", "password", "token", "accessToken", "refreshToken", "idToken"].flatMap(
    (key) => [key, `*.${key}`],
  ),
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
];

/** ログを書く道具。 */
export type Logger = PinoLogger;

/**
 * ログを書く道具を作る。
 * @param options ログの細かさと、人が読みやすい形にするか
 * @param destination 書き出し先（テストで替えるとき。渡すと pino-pretty は使わない）
 * @returns ログを書く道具
 */
export function createLogger(
  options: { level: string; pretty: boolean },
  destination?: DestinationStream,
): Logger {
  const base = { level: options.level, redact: { paths: REDACT_PATHS, censor: REDACTED } };
  if (destination) return pino(base, destination);
  return pino({
    ...base,
    ...(options.pretty
      ? { transport: { target: "pino-pretty", options: { colorize: true, singleLine: true } } }
      : {}),
  });
}
