// 土台の code と、画面にそのまま出せる日本語の文言（zod を読まない。画面が文言だけを読んでも、zod を束に入れないため）。
// 文言は EXPERIENCE.md 2 の言葉づかい（何が起きたか・なぜか・どうすればよいか。使う人を責めない）に従う。
import { isNightStopWindow } from "./night-stop.ts";

/** DB に届かないとき（DB_UNAVAILABLE）の文。起きた時刻で選ぶ（dbUnavailableMessage）。 */
export const DB_UNAVAILABLE_MESSAGES = {
  // 夜間（日本時間 0時〜8時）の停止のあいだ（構成の決めごと AD-10。文は EXPERIENCE.md の決めた言葉）
  nightStop: "夜間（0時〜8時）は止まっています。8時からもう一度開いてください。",
  // 昼の、一時的に届かないとき（Cloud SQL の保守の再起動など）
  temporary: "一時的につながりません。少し待ってから、もう一度開いてください。",
} as const;

/** 土台の code と、画面にそのまま出せる日本語の文言。 */
export const CORE_ERROR_MESSAGES = {
  INVALID_INPUT: "入力に誤りがあります。欄のそばの説明を見て、直してください。",
  NOT_FOUND: "見つかりません。消されたか、URL が違う可能性があります。",
  FORBIDDEN: "この操作はできません。",
  CONFLICT: "ほかの所で変わりました。読み込み直してから、もう一度お試しください。",
  // DB に届かない。ここは時刻によらない文（窓口の文書の例など）。応答の文は時刻で選ぶので coreErrorMessage を使う
  DB_UNAVAILABLE: DB_UNAVAILABLE_MESSAGES.temporary,
  PAYLOAD_TOO_LARGE: "送った中身が大きすぎます。短くして、もう一度お試しください。",
  RATE_LIMITED: "操作が続いたため、少し止めています。時間をおいて、もう一度お試しください。",
  INTERNAL: "うまくいきませんでした。時間をおいて、もう一度お試しください。",
} as const;

/** 土台の code。 */
export type CoreErrorCode = keyof typeof CORE_ERROR_MESSAGES;

/**
 * DB に届かないとき（DB_UNAVAILABLE）の文を、起きた時刻で選ぶ。夜間の停止の時間帯（日本時間 0時〜8時）なら夜間の文、ほかは一時的な文。
 * @param now 起きた時刻（既定は今）
 * @returns 画面にそのまま出せる文
 */
export function dbUnavailableMessage(now: Date = new Date()): string {
  return isNightStopWindow(now)
    ? DB_UNAVAILABLE_MESSAGES.nightStop
    : DB_UNAVAILABLE_MESSAGES.temporary;
}

/**
 * 土台の code の、その時刻に出す文（DB_UNAVAILABLE だけ時刻で変わる。ほかは CORE_ERROR_MESSAGES のまま）。
 * @param code 土台の code
 * @param now 起きた時刻（既定は今）
 * @returns 画面にそのまま出せる文
 */
export function coreErrorMessage(code: CoreErrorCode, now: Date = new Date()): string {
  return code === "DB_UNAVAILABLE" ? dbUnavailableMessage(now) : CORE_ERROR_MESSAGES[code];
}
