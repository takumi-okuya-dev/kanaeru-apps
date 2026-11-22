// LINE の Messaging API の HTTP の呼び方（push・reply・ボット情報とトークンを発行したチャネルの ID）。宛先は決まった https://api.line.me だけで、
// 利用者の入れた値を URL に入れない（SSRF を起こさない。プロフィールの道の LINE のユーザー ID は、形を確かめてから入れる）。外へは渡された fetch で出る（テストでは差しかえ、手元とテストは呼ばない）。
// トークン・宛先・本文をログに出さない（失敗のときも状態の番号だけ）。5秒で切る。
import { randomUUID } from "node:crypto";
import type { LineBotInfoResult, LineProfileResult } from "../../kernel/notifier.ts";
import type { Logger } from "../../kernel/logger.ts";

/** LINE の Messaging API の宛先。 */
export const LINE_API_BASE_URL = "https://api.line.me";

/** 1つの要求の時間の上限（ミリ秒）。 */
const LINE_TIMEOUT_MS = 5000;

/** LINE の HTTP の道具。 */
export type LineClient = {
  /**
   * push で送る。
   * @param accessToken チャネルアクセストークン
   * @param to 送り先（公式アカウントから見える LINE のユーザー ID）
   * @param text 本文
   * @returns 受け取られたら true
   */
  push(accessToken: string, to: string, text: string): Promise<boolean>;
  /**
   * reply で送る。
   * @param accessToken チャネルアクセストークン
   * @param replyToken Webhook の replyToken
   * @param text 本文
   * @returns 受け取られたら true
   */
  reply(accessToken: string, replyToken: string, text: string): Promise<boolean>;
  /**
   * ボット情報と、トークンを発行したチャネルの ID を読む（LINE にトークンを確かめさせる）。
   * @param accessToken チャネルアクセストークン
   * @returns 結果
   */
  botInfo(accessToken: string): Promise<LineBotInfoResult>;
  /**
   * 友だちの表示名を読む。
   * @param accessToken チャネルアクセストークン
   * @param userId LINE のユーザー ID（U と16進の32文字）
   * @returns 結果
   */
  profile(accessToken: string, userId: string): Promise<LineProfileResult>;
};

/** LINE のユーザー ID の形（公式アカウントから見えるもの）。 */
const LINE_USER_ID = /^U[0-9a-f]{32}$/;

/**
 * LINE の HTTP の道具を作る。
 * @param fetch 外への出口
 * @param logger ログ（状態の番号だけを出す）
 * @returns 道具
 */
export function createLineClient(fetch: typeof globalThis.fetch, logger: Logger): LineClient {
  /**
   * トークンを発行したチャネルの ID を、LINE にトークンを確かめさせて読む（セキュリティの全体点検 run-1）。
   * 短期・長期のトークンは POST /v2/oauth/verify、期限を決めたトークン（v2.1）は GET /oauth2/v2.1/verify。
   * どちらも 400 なら合わないトークン。返る client_id は「トークンを発行したチャネルの ID」（LINE の Messaging API の文書）。
   * @param accessToken チャネルアクセストークン
   * @returns チャネルの ID か、合わない・届かない
   */
  async function channelIdOf(
    accessToken: string,
  ): Promise<
    { ok: true; channelId: string } | { ok: false; reason: "unauthorized" | "unreachable" }
  > {
    const attempts: (() => Promise<Response>)[] = [
      () =>
        fetch(`${LINE_API_BASE_URL}/v2/oauth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ access_token: accessToken }).toString(),
          signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
        }),
      () =>
        fetch(
          `${LINE_API_BASE_URL}/oauth2/v2.1/verify?${new URLSearchParams({ access_token: accessToken }).toString()}`,
          { signal: AbortSignal.timeout(LINE_TIMEOUT_MS) },
        ),
    ];
    try {
      for (const attempt of attempts) {
        const response = await attempt();
        if (response.status === 400) continue;
        if (!response.ok) {
          logger.warn({ status: response.status }, "LINE のトークンの確かめに失敗しました");
          return { ok: false, reason: "unreachable" };
        }
        const body = (await response.json()) as { client_id?: unknown };
        if (typeof body.client_id !== "string" || body.client_id === "") {
          return { ok: false, reason: "unreachable" };
        }
        return { ok: true, channelId: body.client_id };
      }
      return { ok: false, reason: "unauthorized" };
    } catch (error) {
      logger.warn(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "LINE のトークンの確かめに届きませんでした",
      );
      return { ok: false, reason: "unreachable" };
    }
  }

  /**
   * メッセージを送る（push・reply）。
   * @param path 道
   * @param accessToken チャネルアクセストークン
   * @param body 本文
   * @param retryKey 送り直しの鍵（push だけ）
   * @returns 受け取られたら true
   */
  const send = async (
    path: string,
    accessToken: string,
    body: Record<string, unknown>,
    retryKey?: string,
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${LINE_API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
      });
      if (response.ok) return true;
      logger.warn({ path, status: response.status }, "LINE が知らせを受け取りませんでした");
      return false;
    } catch (error) {
      logger.warn(
        { path, errorName: error instanceof Error ? error.name : "unknown" },
        "LINE に届きませんでした",
      );
      return false;
    }
  };
  return {
    push: (accessToken, to, text) =>
      send(
        "/v2/bot/message/push",
        accessToken,
        { to, messages: [{ type: "text", text }] },
        randomUUID(),
      ),
    reply: (accessToken, replyToken, text) =>
      send("/v2/bot/message/reply", accessToken, {
        replyToken,
        messages: [{ type: "text", text }],
      }),
    async botInfo(accessToken) {
      try {
        const response = await fetch(`${LINE_API_BASE_URL}/v2/bot/info`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
        });
        if (response.status === 401) return { ok: false, reason: "unauthorized" };
        if (!response.ok) {
          logger.warn({ status: response.status }, "LINE のボット情報を読めませんでした");
          return { ok: false, reason: "unreachable" };
        }
        const info = (await response.json()) as { basicId?: unknown; userId?: unknown };
        const channel = await channelIdOf(accessToken);
        if (!channel.ok) return channel;
        return {
          ok: true,
          basicId: typeof info.basicId === "string" ? info.basicId : null,
          userId: typeof info.userId === "string" ? info.userId : null,
          channelId: channel.channelId,
        };
      } catch (error) {
        logger.warn(
          { errorName: error instanceof Error ? error.name : "unknown" },
          "LINE のボット情報に届きませんでした",
        );
        return { ok: false, reason: "unreachable" };
      }
    },
    async profile(accessToken, userId) {
      if (!LINE_USER_ID.test(userId)) return { ok: false };
      try {
        const response = await fetch(
          `${LINE_API_BASE_URL}/v2/bot/profile/${encodeURIComponent(userId)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
          },
        );
        if (!response.ok) {
          logger.warn({ status: response.status }, "LINE のプロフィールを読めませんでした");
          return { ok: false };
        }
        const profile = (await response.json()) as { displayName?: unknown };
        return typeof profile.displayName === "string" && profile.displayName !== ""
          ? { ok: true, displayName: profile.displayName }
          : { ok: false };
      } catch (error) {
        logger.warn(
          { errorName: error instanceof Error ? error.name : "unknown" },
          "LINE のプロフィールに届きませんでした",
        );
        return { ok: false };
      }
    },
  };
}
