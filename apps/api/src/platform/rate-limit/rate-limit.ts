// 回数の制限。利用者の IP ごと（IPv6 は /64 ごと。client-ip.ts の clientKeyOf）に、決めた秒の間の回数を数え、超えたら 429 を返す。
// 数える中身（createCounter）と鍵の選び方（key）を分ける（ほかの鍵で数えるときも、同じ数える中身を使う）。
// 数はこの API の仕組みの中（メモリー）に持つ。鍵の数に上限があり、超えたら、いちばん長く使っていない鍵から捨てる
// （Map を使った順に並べ、使うたびに後ろへ移す）。終わった数は、数える秒に1度まとめて捨てる。
// API を2つ以上動かすときは、共通の置き場所へ移す。
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import { AppError, toErrorBody } from "../../kernel/errors.ts";
import { clientKeyOf, resolveClientIp } from "./client-ip.ts";

/** IP を決められない要求をまとめて数える鍵。 */
const UNKNOWN_CLIENT = "unknown";

/** メモリーに持つ鍵の上限の既定（超えたら、いちばん長く使っていない鍵から捨てる）。 */
const DEFAULT_MAX_ENTRIES = 10_000;

/** 回数の制限の決め方。 */
export type RateLimitRule = {
  /** 制限するか */
  enabled: boolean;
  /** 数える秒 */
  windowSeconds: number;
  /** その秒の間に許す回数 */
  max: number;
  /** 前に置いた中継の数（利用者の IP の決め方。client-ip.ts） */
  trustedProxyHops: number;
};

/**
 * 回数が多すぎるときの応答（エラーの本文の形と、待つ秒の見出し Retry-After）。
 * @param c Hono の文脈
 * @param retryAfterSeconds 待つ秒
 * @returns 429 の応答
 */
export function rateLimitedResponse(c: Context, retryAfterSeconds: number): Response {
  const error = new AppError("RATE_LIMITED");
  const { requestId } = c.var as Partial<RequestIdVariables>;
  c.header("Retry-After", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  return c.json(toErrorBody(error, requestId ?? ""), error.status);
}

/** 鍵ごとに回数を数える道具（メモリー）。 */
export type RateCounter = {
  /**
   * 1回数え、許すかを決める。
   * @param key 数える鍵
   * @param now 今の時刻（ミリ秒。既定は Date.now()）
   * @returns 許さないときは待つ秒、許すときは undefined
   */
  consume(key: string, now?: number): number | undefined;
  /**
   * 今持っている鍵の数（テストと見張りのため）。
   * @returns 鍵の数
   */
  size(): number;
};

/**
 * 鍵ごとに、決めた秒の間の回数を数える道具を作る。作るたびに別の数を持つ。enabled が false なら数えない。
 * @param rule 数える決まり（制限するか・数える秒・許す回数）
 * @param options 鍵の数の上限（既定 1万。テストで小さくする）
 * @param options.maxEntries 鍵の数の上限
 * @returns 数える道具
 */
export function createCounter(
  rule: Pick<RateLimitRule, "enabled" | "windowSeconds" | "max">,
  options: { maxEntries?: number } = {},
): RateCounter {
  const windowMs = rule.windowSeconds * 1000;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  // 使った順（古いものが先頭）
  const counts = new Map<string, { count: number; startedAt: number }>();
  let lastSweep = 0;

  /**
   * 終わった数をまとめて捨てる（数える秒に1度だけ。毎回すべてを見ない）。
   * @param now 今の時刻（ミリ秒）
   */
  const sweep = (now: number) => {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, entry] of counts) {
      if (now - entry.startedAt >= windowMs) counts.delete(key);
    }
  };

  return {
    consume(key, now = Date.now()) {
      if (!rule.enabled) return undefined;
      sweep(now);
      const entry = counts.get(key);
      // 使った順の後ろへ移す
      counts.delete(key);
      if (!entry || now - entry.startedAt >= windowMs) {
        // いっぱいなら、いちばん長く使っていない鍵を1つ捨てる（先頭を見るだけ）
        if (counts.size >= maxEntries) {
          const oldest = counts.keys().next();
          if (!oldest.done) counts.delete(oldest.value);
        }
        counts.set(key, { count: 1, startedAt: now });
        return undefined;
      }
      counts.set(key, entry);
      if (entry.count >= rule.max) return (entry.startedAt + windowMs - now) / 1000;
      entry.count += 1;
      return undefined;
    },
    size: () => counts.size,
  };
}

/**
 * 回数を数える middleware を作る（既定は利用者の IP ごと。IPv6 は /64 ごと）。作るたびに別の数を持つ。
 * @param rule 回数の制限の決め方
 * @param options 数える要求と鍵の選び方
 * @param options.applies 数える要求か（既定はすべて）
 * @param options.key 数える鍵（既定は利用者の IP のまとまり。undefined は1つにまとめて数える）
 * @returns middleware
 */
export function createRateLimiter(
  rule: RateLimitRule,
  options: {
    applies?: (c: Context) => boolean;
    key?: (c: Context) => string | undefined;
  } = {},
) {
  const counter = createCounter(rule);
  const keyOf =
    options.key ??
    ((c: Context) => {
      const ip = resolveClientIp(c, rule.trustedProxyHops);
      return ip ? clientKeyOf(ip) : undefined;
    });
  return createMiddleware<{ Variables: RequestIdVariables }>(async (c, next) => {
    if (options.applies?.(c) ?? true) {
      const retryAfter = counter.consume(keyOf(c) ?? UNKNOWN_CLIENT);
      if (retryAfter !== undefined) return rateLimitedResponse(c, retryAfter);
    }
    await next();
  });
}
