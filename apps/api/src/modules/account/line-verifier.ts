// LINE の ID トークンの確かめ（構成の決めごと AD-4。specs/account/001-line-login/research.md R2）。
// - ID トークンの中身を確かめずに読むのは、aud（チャネル ID）を選ぶためだけ。aud が設定 LINE_CHANNEL_IDS にあれば、
//   その値を client_id にして LINE の verify（POST https://api.line.me/oauth2/v2.1/verify）を1度だけ呼ぶ。
//   署名・iss・exp・aud は verify が確かめ、信じるのは verify の答えだけ。
// - LINE への要求には時間の上限を置く。届かない・LINE の障害は LINE_UNREACHABLE（502）、確かめられないは LINE_LOGIN_FAILED（401）。
// - ID トークンと答えの本文はログに出さない（失敗の種類と状態の番号だけ）。
import { ACCOUNT_ERRORS } from "@workspace/contracts/account";
import { z } from "zod";
import { AppError } from "../../kernel/errors.ts";
import type { Logger } from "../../kernel/logger.ts";

/** LINE の ID トークンの確かめの窓口。 */
export const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

/** LINE への要求の時間の上限の既定（ミリ秒）。 */
export const LINE_VERIFY_TIMEOUT_MS = 5000;

/** LINE が確かめた利用者。 */
export type VerifiedLineUser = {
  /** LINE のユーザー ID（ID トークンの sub） */
  lineUserId: string;
  /** LINE の表示名（ID トークンの name。profile のスコープがなければ undefined） */
  displayName: string | undefined;
};

/** LINE の ID トークンを確かめる道具（テストでは fetch を差しかえて作る）。 */
export type LineIdTokenVerifier = {
  /**
   * ID トークンを確かめ、LINE の利用者を返す。
   * @param idToken 画面が liff.getIDToken() で得た生の ID トークン
   * @returns LINE が確かめた利用者
   * @throws {AppError} 確かめられない（LINE_LOGIN_FAILED）・LINE に届かない（LINE_UNREACHABLE）とき
   */
  verify(idToken: string): Promise<VerifiedLineUser>;
};

/** verify の成功の答え（使う欄だけ）。 */
const VerifyResponse = z.object({
  sub: z.string().min(1),
  aud: z.string().min(1),
  name: z.string().optional(),
});

/** JWT の中身の aud（文字か、文字の並び）。 */
const UnverifiedPayload = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
});

/**
 * ID トークン（JWT）の中身を確かめずに読み、aud の候補を返す（client_id を選ぶためだけ）。
 * @param idToken ID トークン
 * @returns aud の候補（読めなければ空）
 */
export function readAudiences(idToken: string): string[] {
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[1]) return [];
  try {
    const json: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const parsed = UnverifiedPayload.safeParse(json);
    if (!parsed.success) return [];
    return typeof parsed.data.aud === "string" ? [parsed.data.aud] : parsed.data.aud;
  } catch {
    return [];
  }
}

/**
 * LINE の verify を呼んで確かめる道具を作る。
 * @param options 確かめてよいチャネル ID の並び・外への出口・時間の上限・ログ
 * @param options.channelIds 設定 LINE_CHANNEL_IDS（空なら、どの ID トークンも確かめられない）
 * @param options.fetch 外への出口（土台が渡す deps.fetch）
 * @param options.timeoutMs LINE への要求の時間の上限（既定 5000）
 * @param options.logger ログ（失敗の種類と状態の番号だけを書く）
 * @returns 確かめる道具
 */
export function createLineIdTokenVerifier(options: {
  channelIds: readonly string[];
  fetch: typeof fetch;
  timeoutMs?: number;
  logger?: Logger;
}): LineIdTokenVerifier {
  const allowed: ReadonlySet<string> = new Set(options.channelIds);
  const timeoutMs = options.timeoutMs ?? LINE_VERIFY_TIMEOUT_MS;
  const failed = (reason: string, status?: number) => {
    options.logger?.warn({ reason, status }, "LINE の ID トークンを確かめられませんでした");
    return new AppError(ACCOUNT_ERRORS.LINE_LOGIN_FAILED);
  };
  const unreachable = (reason: string, status?: number) => {
    options.logger?.warn({ reason, status }, "LINE に届きませんでした");
    return new AppError(ACCOUNT_ERRORS.LINE_UNREACHABLE);
  };

  return {
    async verify(idToken) {
      const clientId = readAudiences(idToken).find((aud) => allowed.has(aud));
      if (!clientId) throw failed("aud が LINE_CHANNEL_IDS にない");

      let response: Response;
      try {
        response = await options.fetch(LINE_VERIFY_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ id_token: idToken, client_id: clientId }).toString(),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw unreachable(error instanceof Error ? error.name : "通信の誤り");
      }
      if (response.status >= 400 && response.status < 500) {
        throw failed("verify が断った", response.status);
      }
      if (!response.ok) throw unreachable("verify の障害", response.status);

      const body: unknown = await response.json().catch(() => undefined);
      const parsed = VerifyResponse.safeParse(body);
      if (!parsed.success) throw unreachable("verify の答えの形が違う", response.status);
      if (parsed.data.aud !== clientId) throw failed("verify の aud が違う");
      const displayName = parsed.data.name?.trim();
      return { lineUserId: parsed.data.sub, displayName: displayName || undefined };
    },
  };
}
