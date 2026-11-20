// LINE の Webhook の署名の確かめ（x-line-signature ＝ チャネルシークレットによる本文の HMAC-SHA256 の base64）。
// 時間の差が出ない比べ方（timingSafeEqual）で比べ、長さが違えば先に落とす。シークレット・本文・署名をエラーやログに出さない。
import { createHmac, timingSafeEqual } from "node:crypto";

/** base64 の形。 */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * LINE の Webhook の署名を確かめる。
 * @param channelSecret チャネルシークレット
 * @param rawBody 受け取った本文（そのままの文字。JSON にする前）
 * @param signature 見出し x-line-signature の値（なければ undefined）
 * @returns 署名が合えば true
 */
export function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  signature: string | undefined,
): boolean {
  if (!signature || !BASE64.test(signature)) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(signature, "base64");
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
