// 回数の制限の入口。
export { clientKeyOf, resolveClientIp } from "./client-ip.ts";
export { createCounter, createRateLimiter, rateLimitedResponse } from "./rate-limit.ts";
export type { RateCounter, RateLimitRule } from "./rate-limit.ts";
