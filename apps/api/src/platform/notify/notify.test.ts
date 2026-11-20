// 送る道具の単体のテスト（booking-002。AD-24）：守りの判定・偽の送り手は外へ出ない・本物の LINE の要求の形と失敗の扱い・
// reply は off だけで止まる・メールは送り手がなければ unavailable・ログに宛先と本文とトークンを出さない・Webhook の署名。
import { createHmac } from "node:crypto";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../kernel/logger.ts";
import { FAKE_OUTBOX_MAX, createNotifier, decideDelivery, verifyLineSignature } from "./index.ts";
import type { EmailSender, NotifyPolicy } from "./index.ts";

const LINE_USER = `U${"a".repeat(32)}`;
const OTHER_LINE_USER = `U${"b".repeat(32)}`;
const TOKEN = "token-abcdefghijklmnopqrstuvwxyz-0123456789";

/**
 * ログを文字にためる道具を作る。
 * @returns ログの道具と、たまった文字を返す関数
 */
function captureLogger() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return {
    logger: createLogger({ level: "debug", pretty: false }, stream),
    text: () => chunks.join(""),
  };
}

/** 呼ばれた要求の記録。 */
type Call = { url: string; init: RequestInit };

/**
 * 答えを決めた偽の fetch。
 * @param respond 要求ごとの答え
 * @returns fetch と呼ばれた要求
 */
function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: input instanceof Request ? input.url : input.toString(), init };
    calls.push(call);
    return respond(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

/** 呼ばれたら失敗にする fetch（外へ出ないことを確かめる）。 */
const forbiddenFetch = (() => {
  throw new Error("外へ出ようとしました");
}) as unknown as typeof globalThis.fetch;

/**
 * 送る道具を作る。
 * @param policy 守り
 * @param fetch 外への出口
 * @param emailSender メールの送り手
 * @returns 道具とログ
 */
function build(
  policy: Partial<NotifyPolicy>,
  fetch: typeof globalThis.fetch = forbiddenFetch,
  emailSender?: EmailSender,
) {
  const log = captureLogger();
  const notifier = createNotifier({
    policy: { mode: "on", allowlist: [], fakeOnly: false, ...policy },
    fetch,
    logger: log.logger,
    ...(emailSender ? { emailSender } : {}),
  });
  return { notifier, log };
}

describe("守りの判定", () => {
  it("off は送らない・on は送る・allowlist は並びにある宛先だけ（メールは大小を見ない）", () => {
    const allowlist = [LINE_USER, "hanako@example.com"];
    expect(decideDelivery({ mode: "off", allowlist }, LINE_USER)).toBe("off");
    expect(decideDelivery({ mode: "on", allowlist: [] }, LINE_USER)).toBe("send");
    expect(decideDelivery({ mode: "allowlist", allowlist }, LINE_USER)).toBe("send");
    expect(decideDelivery({ mode: "allowlist", allowlist }, OTHER_LINE_USER)).toBe("not_allowed");
    expect(decideDelivery({ mode: "allowlist", allowlist }, "Hanako@Example.COM")).toBe("send");
    expect(decideDelivery({ mode: "allowlist", allowlist: [] }, LINE_USER)).toBe("not_allowed");
  });
});

describe("偽の送り手（手元とテスト）", () => {
  it("どの送り方でも外へ出ず、守りを通ったものだけを覚える。ログに宛先・本文を出さない", async () => {
    const { notifier, log } = build({ mode: "allowlist", allowlist: [LINE_USER], fakeOnly: true });
    expect(notifier.fake).toBe(true);
    expect(
      await notifier.pushLine({ accessToken: TOKEN, to: LINE_USER, text: "ひみつの本文" }),
    ).toEqual({
      status: "sent",
    });
    expect(
      await notifier.pushLine({ accessToken: TOKEN, to: OTHER_LINE_USER, text: "本文" }),
    ).toEqual({ status: "not_allowed" });
    expect(
      await notifier.replyLine({ accessToken: TOKEN, replyToken: "r1", text: "あいさつ" }),
    ).toEqual({
      status: "sent",
    });
    expect(
      await notifier.sendEmail({
        to: "taro@example.com",
        fromName: "飲食チーム（kanaeru）",
        replyTo: null,
        subject: "題",
        text: "本文",
      }),
    ).toEqual({ status: "not_allowed" });
    const outbox = notifier.fakeOutbox() ?? [];
    expect(outbox.map((message) => message.method)).toEqual(["line_reply", "line_push"]);
    expect(outbox[1]).toMatchObject({ to: LINE_USER, text: "ひみつの本文" });
    const logged = log.text();
    expect(logged).not.toContain(LINE_USER);
    expect(logged).not.toContain("ひみつの本文");
    expect(logged).not.toContain(TOKEN);
  });

  it("off では reply も送らない。ボット情報は偽の答え（invalid で始まるトークンは合わない）", async () => {
    const { notifier } = build({ mode: "off", fakeOnly: true });
    expect(await notifier.replyLine({ accessToken: TOKEN, replyToken: "r", text: "x" })).toEqual({
      status: "off",
    });
    expect(await notifier.pushLine({ accessToken: TOKEN, to: LINE_USER, text: "x" })).toEqual({
      status: "off",
    });
    expect(notifier.fakeOutbox()).toEqual([]);
    expect(await notifier.getLineBotInfo(TOKEN)).toEqual({ ok: true, basicId: "@fake" });
    expect(await notifier.getLineBotInfo("invalid-token-xxxxxxxxxxxx")).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  it(`覚えるのは新しいものから ${FAKE_OUTBOX_MAX} 件まで`, async () => {
    const { notifier } = build({ fakeOnly: true });
    for (let index = 0; index < FAKE_OUTBOX_MAX + 5; index += 1) {
      await notifier.pushLine({ accessToken: TOKEN, to: LINE_USER, text: `本文${index}` });
    }
    const outbox = notifier.fakeOutbox() ?? [];
    expect(outbox).toHaveLength(FAKE_OUTBOX_MAX);
    expect(outbox[0]?.text).toBe(`本文${FAKE_OUTBOX_MAX + 4}`);
  });
});

describe("本物の送り手（staging・production）", () => {
  it("push は決まった宛先に、トークンのヘッダーと送り直しの鍵をつけて送る", async () => {
    const { fetch, calls } = fakeFetch(() => new Response("{}", { status: 200 }));
    const { notifier, log } = build({ mode: "on" }, fetch);
    expect(notifier.fake).toBe(false);
    expect(notifier.fakeOutbox()).toBeNull();
    expect(await notifier.pushLine({ accessToken: TOKEN, to: LINE_USER, text: "本文" })).toEqual({
      status: "sent",
    });
    const [call] = calls;
    expect(call?.url).toBe("https://api.line.me/v2/bot/message/push");
    expect(call?.init.method).toBe("POST");
    const headers = new Headers(call?.init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-line-retry-key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(call?.init.body as string)).toEqual({
      to: LINE_USER,
      messages: [{ type: "text", text: "本文" }],
    });
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
    expect(log.text()).not.toContain(TOKEN);
  });

  it("reply は replyToken で送る", async () => {
    const { fetch, calls } = fakeFetch(() => new Response("{}", { status: 200 }));
    const { notifier } = build({ mode: "allowlist", allowlist: [] }, fetch);
    expect(
      await notifier.replyLine({ accessToken: TOKEN, replyToken: "rt", text: "あいさつ" }),
    ).toEqual({
      status: "sent",
    });
    expect(calls[0]?.url).toBe("https://api.line.me/v2/bot/message/reply");
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      replyToken: "rt",
      messages: [{ type: "text", text: "あいさつ" }],
    });
  });

  it("off・許可リストにない宛先は、外へ出ない", async () => {
    const off = build({ mode: "off" });
    expect(await off.notifier.pushLine({ accessToken: TOKEN, to: LINE_USER, text: "x" })).toEqual({
      status: "off",
    });
    expect(
      await off.notifier.replyLine({ accessToken: TOKEN, replyToken: "r", text: "x" }),
    ).toEqual({
      status: "off",
    });
    const allow = build({ mode: "allowlist", allowlist: [OTHER_LINE_USER] });
    expect(await allow.notifier.pushLine({ accessToken: TOKEN, to: LINE_USER, text: "x" })).toEqual(
      {
        status: "not_allowed",
      },
    );
  });

  it("401・429・5xx・届かないは failed にし、ログには状態の番号だけを出す", async () => {
    for (const status of [401, 403, 429, 500]) {
      const { fetch } = fakeFetch(() => new Response(JSON.stringify({ message: "x" }), { status }));
      const { notifier, log } = build({ mode: "on" }, fetch);
      expect(await notifier.pushLine({ accessToken: TOKEN, to: LINE_USER, text: "本文" })).toEqual({
        status: "failed",
      });
      expect(log.text()).toContain(String(status));
      expect(log.text()).not.toContain(LINE_USER);
    }
    const broken = fakeFetch(() => Promise.reject(new Error("network")));
    const { notifier } = build({ mode: "on" }, broken.fetch);
    expect(await notifier.pushLine({ accessToken: TOKEN, to: LINE_USER, text: "x" })).toEqual({
      status: "failed",
    });
  });

  it("ボット情報：200 はベーシック ID・401 は合わない・ほかと届かないは unreachable", async () => {
    const ok = fakeFetch(() =>
      Response.json({ userId: "Uxxx", basicId: "@abc1234", displayName: "飲食チーム" }),
    );
    expect(await build({ mode: "off" }, ok.fetch).notifier.getLineBotInfo(TOKEN)).toEqual({
      ok: true,
      basicId: "@abc1234",
    });
    expect(ok.calls[0]?.url).toBe("https://api.line.me/v2/bot/info");
    expect(new Headers(ok.calls[0]?.init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    const unauthorized = fakeFetch(() => new Response("{}", { status: 401 }));
    expect(await build({}, unauthorized.fetch).notifier.getLineBotInfo(TOKEN)).toEqual({
      ok: false,
      reason: "unauthorized",
    });
    const down = fakeFetch(() => new Response("{}", { status: 503 }));
    expect(await build({}, down.fetch).notifier.getLineBotInfo(TOKEN)).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("メールは送り手がなければ unavailable。送り手があれば守りを通して渡す", async () => {
    const message = {
      to: "Hanako@Example.com",
      fromName: "飲食チーム（kanaeru）",
      replyTo: "reply@example.com",
      subject: "題",
      text: "本文",
    };
    expect(await build({ mode: "on" }).notifier.sendEmail(message)).toEqual({
      status: "unavailable",
    });
    const sent: unknown[] = [];
    const sender: EmailSender = {
      send: (value) => {
        sent.push(value);
        return Promise.resolve("sent");
      },
    };
    const { notifier } = build(
      { mode: "allowlist", allowlist: ["hanako@example.com"] },
      forbiddenFetch,
      sender,
    );
    expect(await notifier.sendEmail(message)).toEqual({ status: "sent" });
    expect(await notifier.sendEmail({ ...message, to: "taro@example.com" })).toEqual({
      status: "not_allowed",
    });
    expect(sent).toEqual([message]);
    expect(
      await build({ mode: "off" }, forbiddenFetch, sender).notifier.sendEmail(message),
    ).toEqual({
      status: "off",
    });
  });
});

describe("Webhook の署名", () => {
  const seed = "0123456789abcdef".repeat(2);
  const body = '{"events":[]}';
  const signature = createHmac("sha256", seed).update(body).digest("base64");

  it("同じシークレットの HMAC-SHA256（base64）だけを通す", () => {
    expect(verifyLineSignature(seed, body, signature)).toBe(true);
    expect(verifyLineSignature(seed, `${body} `, signature)).toBe(false);
    expect(verifyLineSignature("f".repeat(32), body, signature)).toBe(false);
    expect(verifyLineSignature(seed, body, undefined)).toBe(false);
    expect(verifyLineSignature(seed, body, "")).toBe(false);
    expect(verifyLineSignature(seed, body, signature.slice(0, 10))).toBe(false);
    expect(verifyLineSignature(seed, body, "!!!not-base64!!!")).toBe(false);
  });
});
