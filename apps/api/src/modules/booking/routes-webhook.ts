// LINE 公式アカウントの Webhook（booking-002 research R1・R4・R13。AD-24）。道は /api/v1/booking/webhooks/line/{channelId}：
// 組み立てが「外のサービスの Webhook」として扱う形（CSRF の確かめの外・アプリが切のときだけ 404・IP ごとの回数の制限の外）。
// 本文はそのままの文字で読み、その設定のシークレットで x-line-signature を確かめてから JSON にする。合わなければ本文のない 400。
// 署名が合ったら、設定ごとに回数を数える（60秒に LINE_WEBHOOK_PER_CHANNEL_MAX 回まで。超えたら 429。LINE が送り直す）。
// 本文の destination（ボットの userId）が設定の bot_user_id と違えば、取り違えとして 400（research R10）。
// 友だち追加（follow）：送り方が off でなければ、使い切りの札つきのリンクのあいさつを返事（reply）で送る。送り直し
// （deliveryContext.isRedelivery）では札を作り直さない（前に届いたリンクを使えなくしないため）。
// ブロック（unfollow）：その友だちの札を押さえてから、紐づけと使っていない札を消す。ほかの種類は無視する。
// 答えの前に処理を済ませる（Cloud Run が答えのあとの処理を止めるため）。
// 本文・署名・LINE のユーザー ID・札・トークンはログに出さない（設定の ID と数だけ）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { participantPaths } from "@workspace/contracts/core";
import { bodyLimit } from "hono/body-limit";
import { AppError } from "../../kernel/errors.ts";
import { notFoundResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { verifyLineSignature } from "../../platform/notify/index.ts";
import { createCounter } from "../../platform/rate-limit/index.ts";
import { greetingText } from "./notice-templates.ts";
import { issueLinkToken } from "./line-link.ts";
import {
  deleteLinkOfLineUser,
  deleteUnusedTokens,
  findChannelById,
  lockTokensOfLineUser,
} from "./notify-repository.ts";
import { holderNameOf, holderOfChannel, notifierOf, openLine } from "./notify-settings.ts";

/** Webhook の本文の上限（署名を確かめる前に読む量を縛る）。 */
export const LINE_WEBHOOK_BODY_MAX_BYTES = 64 * 1024;

/** 設定ごとに、60秒に受け取る Webhook の回数の上限（署名が合ったものだけを数える）。 */
export const LINE_WEBHOOK_PER_CHANNEL_MAX = 600;

/** 設定ごとの回数を数える秒。 */
const LINE_WEBHOOK_WINDOW_SECONDS = 60;

/** LINE のユーザー ID の形（公式アカウントから見えるもの）。 */
const LINE_USER_ID = /^U[0-9a-f]{32}$/;

/** Webhook の本文のうち、読むところ（ほかの欄は読まずに残す）。 */
const WebhookBody = z.looseObject({
  destination: z.string().max(100).optional(),
  events: z.array(
    z.looseObject({
      type: z.string(),
      replyToken: z.string().max(200).optional(),
      source: z.looseObject({ type: z.string(), userId: z.string().optional() }).optional(),
      deliveryContext: z.looseObject({ isRedelivery: z.boolean().optional() }).optional(),
    }),
  ),
});

/** 道の設定の ID。 */
const ChannelParams = z.object({ channelId: uuidParam("channelId", "公式アカウントの設定の ID") });

/**
 * LINE の Webhook の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function bookingWebhookRoutes(deps: DomainRouteDeps) {
  const { db, logger } = deps;
  // 設定ごとの回数（この API の仕組みの中に持つ。署名が合ったものだけを数える）
  const perChannel = createCounter({
    enabled: true,
    windowSeconds: LINE_WEBHOOK_WINDOW_SECONDS,
    max: LINE_WEBHOOK_PER_CHANNEL_MAX,
  });
  const limit = bodyLimit({
    maxSize: LINE_WEBHOOK_BODY_MAX_BYTES,
    onError: (c) => c.body(null, 400),
  });
  const route = createRoute({
    method: "post",
    path: "/api/v1/booking/webhooks/line/{channelId}",
    tags: ["booking"],
    operationId: "bookingLineWebhook",
    summary:
      "LINE 公式アカウントの Webhook（ログインなし。署名を確かめ、友だち追加にあいさつ・ブロックで紐づけを消す）",
    middleware: [limit] as const,
    request: { params: ChannelParams },
    responses: {
      200: { description: "受け取った（本文なし）" },
      400: { description: "署名・形が合わない・別の公式アカウントの知らせ（本文なし）" },
      404: notFoundResponse,
      429: { description: "設定ごとの回数の上限を超えた（本文なし。LINE が送り直す）" },
    },
  });

  return new OpenAPIHono<ApiEnv>().openapi(route, async (c) => {
    const channel = await findChannelById(db, c.req.valid("param").channelId);
    const opened = channel ? await openLine(deps.secretBox, channel) : null;
    // 知らない設定・LINE の値がない設定・秘密の箱がない環境は、窓口があることを知らせない
    if (!channel || !opened) throw new AppError("NOT_FOUND");
    const raw = await c.req.text();
    if (!verifyLineSignature(opened.channelSecret, raw, c.req.header("x-line-signature"))) {
      return c.body(null, 400);
    }
    const retryAfter = perChannel.consume(channel.id);
    if (retryAfter !== undefined) {
      logger.warn({ channelId: channel.id }, "LINE の Webhook が設定ごとの上限を超えました");
      c.header("Retry-After", String(Math.max(1, Math.ceil(retryAfter))));
      return c.body(null, 429);
    }
    let parsed: z.infer<typeof WebhookBody>;
    try {
      const result = WebhookBody.safeParse(JSON.parse(raw));
      if (!result.success) return c.body(null, 400);
      parsed = result.data;
    } catch {
      return c.body(null, 400);
    }
    if (channel.botUserId && parsed.destination && parsed.destination !== channel.botUserId) {
      // シークレットは合うのに、別の公式アカウントの知らせ（設定の取り違え）
      logger.warn(
        { channelId: channel.id },
        "LINE の Webhook の送り先が設定の公式アカウントと違います",
      );
      return c.body(null, 400);
    }
    const notifier = notifierOf(deps);
    const now = new Date();
    let redelivered = 0;
    let follows = 0;
    let unfollows = 0;
    let greeted = 0;
    for (const event of parsed.events) {
      const userId = event.source?.type === "user" ? event.source.userId : undefined;
      if (!userId || !LINE_USER_ID.test(userId)) continue;
      if (event.type === "unfollow") {
        unfollows += 1;
        await db.transaction(async (tx) => {
          await lockTokensOfLineUser(tx, channel.id, userId);
          await deleteLinkOfLineUser(tx, channel.id, userId);
          await deleteUnusedTokens(tx, channel.id, userId);
        });
        continue;
      }
      if (event.type !== "follow" || !event.replyToken) continue;
      follows += 1;
      // 送り直しでは札を作り直さない（作り直すと、前に届いたリンクが使えなくなる。返事の札も使えないことが多い）
      if (event.deliveryContext?.isRedelivery === true) {
        redelivered += 1;
        continue;
      }
      // off では札も作らない（あいさつを送らないので、使われない札を残さない。research R4）
      if (notifier.mode === "off") continue;
      const token = await issueLinkToken(db, channel.id, userId, now);
      const holderName = await holderNameOf(db, holderOfChannel(channel));
      const url = `${deps.config.webUrl}${participantPaths.lineLink(token)}`;
      const { status } = await notifier.replyLine({
        accessToken: opened.accessToken,
        replyToken: event.replyToken,
        text: greetingText(holderName, url),
      });
      if (status === "sent") greeted += 1;
    }
    logger.info(
      {
        channelId: channel.id,
        events: parsed.events.length,
        follows,
        unfollows,
        greeted,
        redelivered,
      },
      "LINE の Webhook",
    );
    return c.body(null, 200);
  });
}
