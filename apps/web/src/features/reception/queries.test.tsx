// 一覧画面の読み直し：夜間の停止の時間帯（日本時間 0時〜8時）の 503 DB_UNAVAILABLE だけ止め、
// 昼の 503 やほかの失敗では5秒おきの読み直しを続け、つながれば最新に戻る。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api.ts";
import {
  RECEPTION_REFETCH_MS,
  isNightStop,
  receptionPollInterval,
  useCheckinList,
} from "./queries.ts";

/** 交流会の ID。 */
const EVENT_ID = "0193a1b2-0000-7000-8000-000000000001";

/** 夜間の停止の時間帯（日本時間 3時）。 */
const NIGHT = new Date("2026-11-25T03:00:00+09:00");

/** 昼（日本時間 19時）。 */
const DAY = new Date("2026-11-25T19:00:00+09:00");

/** 読み直しの時計と今の時刻だけを差しかえる（答えの読みこみは、ほんとうの時計で進める）。 */
const FAKE_TIMERS: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ["setInterval", "clearInterval", "Date"],
};

/**
 * DB に届かない 503 を作る。
 * @returns エラー
 */
function dbUnavailable(): ApiError {
  return new ApiError(503, { code: "DB_UNAVAILABLE", message: "つながりません。", requestId: "r" });
}

/**
 * DB に届かない 503 の応答。
 * @returns 応答
 */
function dbUnavailableResponse(): Response {
  return Response.json(
    { error: { code: "DB_UNAVAILABLE", message: "一時的につながりません。", requestId: "r" } },
    { status: 503 },
  );
}

/**
 * 一覧の問い合わせを描く（読み直さない設定の QueryClient の中で）。
 * @returns renderHook の結果
 */
function renderCheckinList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCheckinList(EVENT_ID), { wrapper });
}

/**
 * 読み直しの時計（setInterval）を進める（答えを受けるのは、ほんとうの時計の waitFor で待つ）。
 * @param ms 進める時間（ミリ秒）
 */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * 答えを受けるまで待つ（setInterval を差しかえているので、ほんとうの時計で待つ vi.waitFor を act の中で使う）。
 * @param check 確かめ
 */
async function settle(check: () => void): Promise<void> {
  await act(() => vi.waitFor(check));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("一覧画面の読み直しの間", () => {
  it("夜間の停止の時間帯の 503 だけ止め、昼の 503・ほかの失敗・成功では5秒おき", () => {
    expect(isNightStop(dbUnavailable(), NIGHT)).toBe(true);
    expect(isNightStop(dbUnavailable(), DAY)).toBe(false);
    expect(receptionPollInterval({ state: { error: dbUnavailable() } }, NIGHT)).toBe(false);
    expect(receptionPollInterval({ state: { error: dbUnavailable() } }, DAY)).toBe(
      RECEPTION_REFETCH_MS,
    );
    const internal = new ApiError(500, { code: "INTERNAL", message: "失敗", requestId: "r" });
    expect(receptionPollInterval({ state: { error: internal } }, NIGHT)).toBe(RECEPTION_REFETCH_MS);
    expect(receptionPollInterval({ state: { error: null } }, NIGHT)).toBe(RECEPTION_REFETCH_MS);
  });

  it("昼の 503 のあとも読み直しを続け、つながれば最新の一覧に戻る", async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    vi.setSystemTime(DAY);
    const checkins = [{ id: "a" }];
    let calls = 0;
    vi.stubGlobal("fetch", () => {
      calls += 1;
      // 1回目は成功、2回目は一時的に届かない、3回目からはつながる
      if (calls === 2) return Promise.resolve(dbUnavailableResponse());
      return Promise.resolve(Response.json({ checkins: calls === 1 ? [] : checkins }));
    });
    const { result } = renderCheckinList();
    await settle(() => expect(result.current.data).toEqual({ checkins: [] }));

    advance(RECEPTION_REFETCH_MS);
    await settle(() => expect(result.current.isRefetchError).toBe(true));
    expect(result.current.data).toEqual({ checkins: [] });

    advance(RECEPTION_REFETCH_MS);
    await settle(() => expect(result.current.data).toEqual({ checkins }));
    expect(result.current.isError).toBe(false);
    expect(calls).toBe(3);
  });

  it("夜間の停止の時間帯の 503 のあとは読み直さない", async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    vi.setSystemTime(NIGHT);
    let calls = 0;
    vi.stubGlobal("fetch", () => {
      calls += 1;
      return Promise.resolve(
        calls === 1 ? Response.json({ checkins: [] }) : dbUnavailableResponse(),
      );
    });
    const { result } = renderCheckinList();
    await settle(() => expect(result.current.data).toEqual({ checkins: [] }));

    advance(RECEPTION_REFETCH_MS);
    await settle(() => expect(result.current.isRefetchError).toBe(true));
    advance(RECEPTION_REFETCH_MS * 3);
    expect(calls).toBe(2);
  });
});
