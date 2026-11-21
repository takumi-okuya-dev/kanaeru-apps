// 見るだけの札（AD-26）と受付の札（AD-30）。128ビット以上の乱数（ここでは 192ビット）を URL に入れ、DB には SHA-256 だけを持つ。
// 期限は札を作るときに決める：「試合の日」と「今日」の遅いほうの、日本時間の終わり（前の日に QR を刷っても、試合の日に使える。
// 試合の日を直しても、出した札の期限は黙って変わらない。match-001 research R5・match-004 research R1【仮決め】）。
import { createHash, randomBytes } from "node:crypto";
import { endOfJstDate } from "@workspace/contracts/core";

/** 札の形（base64url の 32 文字）。形が違えば DB を引かずに 404 にする。 */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

/**
 * 新しい札（192ビットの乱数を base64url にしたもの）。
 * @returns 札
 */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * 札の SHA-256（16進）。
 * @param token 札
 * @returns 16進の文字
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 札の期限（試合の日と今日の遅いほうの、日本時間の終わり）。
 * @param playDate 試合の日（日本時間の日付）
 * @param now 今の時刻
 * @returns 期限
 */
export function tokenExpiry(playDate: string, now: Date): Date {
  const end = endOfJstDate(`${playDate}T00:00:00+09:00`);
  const today = endOfJstDate(now);
  return end > today ? end : today;
}
