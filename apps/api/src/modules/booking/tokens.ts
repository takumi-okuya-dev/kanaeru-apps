// 札の作り方と SHA-256（booking-002 の紐づけの札・booking-003 のメールで申し込む札が共に使う）。札は32バイトの乱数を base64url に
// したもので、DB には SHA-256（16進）だけを持つ。札はログに出さない。
import { createHash, randomBytes } from "node:crypto";

/** 札の長さ（バイト）。 */
const TOKEN_BYTES = 32;

/** 札の形（base64url。形の違う値は DB を引く前に断る）。 */
export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * 新しい札を作る。
 * @returns 札（DB には持たない）
 */
export function createToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * 札の SHA-256（16進）。
 * @param token 札
 * @returns ハッシュ
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
