// 困りごとの一覧の読み直し：夜間の停止の時間帯（日本時間 0時〜8時）の 503 DB_UNAVAILABLE だけ止め、昼の 503 やほかの失敗では続ける。
import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api.ts";
import { SURVEY_REFETCH_MS, isNightStop, surveyPollInterval } from "./queries.ts";

/** 夜間の停止の時間帯（日本時間 3時）。 */
const NIGHT = new Date("2026-11-25T03:00:00+09:00");

/** 昼（日本時間 19時）。 */
const DAY = new Date("2026-11-25T19:00:00+09:00");

/** DB に届かない 503。 */
const DB_UNAVAILABLE = new ApiError(503, {
  code: "DB_UNAVAILABLE",
  message: "つながりません。",
  requestId: "r",
});

describe("困りごとの一覧の読み直し", () => {
  it("夜間の停止は、時間帯の中の DB_UNAVAILABLE だけ", () => {
    expect(isNightStop(DB_UNAVAILABLE, NIGHT)).toBe(true);
    expect(isNightStop(DB_UNAVAILABLE, DAY)).toBe(false);
    expect(isNightStop(new Error("x"), NIGHT)).toBe(false);
  });

  it("夜間の停止のときだけ読み直しを止め、昼の 503 では5秒おきに続ける", () => {
    expect(surveyPollInterval({ state: { error: DB_UNAVAILABLE } }, NIGHT)).toBe(false);
    expect(surveyPollInterval({ state: { error: DB_UNAVAILABLE } }, DAY)).toBe(SURVEY_REFETCH_MS);
    expect(surveyPollInterval({ state: { error: null } }, NIGHT)).toBe(SURVEY_REFETCH_MS);
  });
});
