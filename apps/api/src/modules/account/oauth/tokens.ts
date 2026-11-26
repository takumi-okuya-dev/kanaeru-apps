// 認可の札（コード・アクセストークン・更新トークン）の作り方と、DB に入れる形（FR-011）。
// 札は 32 バイトの乱数（base64url）。DB には SHA-256（16進）だけを持つ。札はログに出さない。
import { createHash, randomBytes } from "node:crypto";

/**
 * 新しい札と、その SHA-256 を作る。
 * @returns 札（相手に渡す）と SHA-256（DB に入れる）
 */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashOpaqueToken(token) };
}

/**
 * 札の SHA-256（16進）。
 * @param token 札
 * @returns 16進64文字
 */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
