// PKCE（RFC 7636）の S256 だけを受ける（MCP の認可・AD-21）。plain は受けない。
// verifier は 43〜128 字の非予約文字（RFC 7636 4.1）。比べは定数時間で行う。
import { createHash, timingSafeEqual } from "node:crypto";

/** code_verifier の形（RFC 7636 4.1）。 */
const VERIFIER_FORMAT = /^[A-Za-z0-9._~-]{43,128}$/;

/** code_challenge の形（S256 の base64url・43 字）。 */
const CHALLENGE_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/**
 * verifier から S256 の challenge を作る。
 * @param verifier code_verifier
 * @returns base64url の SHA-256
 */
export function pkceS256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * 認可の要求の code_challenge の形と方式を確かめる（method は必ず S256）。
 * @param challenge code_challenge
 * @param method code_challenge_method
 * @returns 受けてよいなら true
 */
export function isAcceptableChallenge(challenge: string, method: string): boolean {
  return method === "S256" && CHALLENGE_FORMAT.test(challenge);
}

/**
 * code_verifier が code_challenge と合うかを確かめる。
 * @param verifier トークンの要求の code_verifier
 * @param challenge 認可の要求で保存した code_challenge
 * @returns 合えば true
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!VERIFIER_FORMAT.test(verifier)) return false;
  const expected = Buffer.from(pkceS256Challenge(verifier));
  const actual = Buffer.from(challenge);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
