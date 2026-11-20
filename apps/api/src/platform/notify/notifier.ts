// 知らせを送る道具を作る（AD-24）：守り（送り方・許可リスト）を通してから、偽か本物の送り手に渡す。
// fakeOnly（APP_ENV が local・test）のときは本物の HTTP を作らない。組み立て（app.ts）が設定から1度だけ作り、領域に渡す。
import type { DeliveryStatus, Notifier } from "../../kernel/notifier.ts";
import type { Logger } from "../../kernel/logger.ts";
import type { EmailSender } from "./email.ts";
import { createFakeOutbox } from "./fake.ts";
import { decideDelivery } from "./guard.ts";
import type { NotifyPolicy } from "./guard.ts";
import { createLineClient } from "./line-client.ts";

/** 偽の送り手のボット情報で、合わないとみなすトークンの頭（テストと手元で入れ間違いを試すため）。 */
const FAKE_INVALID_TOKEN_PREFIX = "invalid";

/** 偽の送り手のベーシック ID。 */
const FAKE_BASIC_ID = "@fake";

/** 送る道具を作るのに使うもの。 */
export type NotifierDeps = {
  /** 守りの設定 */
  policy: NotifyPolicy;
  /** 外への出口（本物の送り手だけが使う） */
  fetch: typeof globalThis.fetch;
  /** ログ（手段・結果・状態の番号だけを出す） */
  logger: Logger;
  /** メールの送り手（送信のサービスが決まるまでない。本物で、なければ unavailable） */
  emailSender?: EmailSender;
  /** 今の時刻（偽の送り手の覚えの時刻。テストで固定する） */
  now?: () => Date;
};

/**
 * 守りの判定を結果にする（送らないときの結果）。
 * @param decision 判定
 * @returns 送らないなら結果、送るなら null
 */
function blocked(decision: ReturnType<typeof decideDelivery>): { status: DeliveryStatus } | null {
  return decision === "send" ? null : { status: decision };
}

/**
 * 知らせを送る道具を作る。
 * @param deps 守りの設定・外への出口・ログ・メールの送り手
 * @returns 道具
 */
export function createNotifier(deps: NotifierDeps): Notifier {
  const { policy, logger } = deps;
  const outbox = policy.fakeOnly ? createFakeOutbox(deps.now) : null;
  const line = policy.fakeOnly ? null : createLineClient(deps.fetch, logger);
  /**
   * 結果をログに出す（宛先・本文は出さない）。
   * @param method 手段
   * @param status 結果
   * @param length 本文の文字数
   * @returns 結果
   */
  const report = (method: string, status: DeliveryStatus, length: number) => {
    logger.info({ method, status, length, fake: outbox !== null }, "知らせ");
    return { status };
  };
  return {
    mode: policy.mode,
    fake: outbox !== null,
    async pushLine({ accessToken, to, text }) {
      const stop = blocked(decideDelivery(policy, to));
      if (stop) return report("line_push", stop.status, text.length);
      if (outbox) {
        outbox.push({ method: "line_push", to, text });
        return report("line_push", "sent", text.length);
      }
      const ok = await line?.push(accessToken, to, text);
      return report("line_push", ok ? "sent" : "failed", text.length);
    },
    async replyLine({ accessToken, replyToken, text }) {
      // 友だち追加した本人への返事なので、許可リストは見ない（off だけで止める。booking-002 research R4）
      if (policy.mode === "off") return report("line_reply", "off", text.length);
      if (outbox) {
        outbox.push({ method: "line_reply", to: replyToken, text });
        return report("line_reply", "sent", text.length);
      }
      const ok = await line?.reply(accessToken, replyToken, text);
      return report("line_reply", ok ? "sent" : "failed", text.length);
    },
    getLineBotInfo(accessToken) {
      if (!line) {
        return Promise.resolve(
          accessToken.startsWith(FAKE_INVALID_TOKEN_PREFIX)
            ? { ok: false, reason: "unauthorized" }
            : { ok: true, basicId: FAKE_BASIC_ID },
        );
      }
      return line.botInfo(accessToken);
    },
    async sendEmail(message) {
      const stop = blocked(decideDelivery(policy, message.to));
      if (stop) return report("email", stop.status, message.text.length);
      if (outbox) {
        outbox.push({
          method: "email",
          to: message.to,
          text: message.text,
          subject: message.subject,
        });
        return report("email", "sent", message.text.length);
      }
      if (!deps.emailSender) return report("email", "unavailable", message.text.length);
      const result = await deps.emailSender.send(message);
      return report("email", result, message.text.length);
    },
    fakeOutbox: () => outbox?.list() ?? null,
  };
}
