// 受付の問い合わせ（TanStack Query）の鍵と読みこみ。鍵はどれも "reception" で始める
// （ログインし直したときに account が読み直させる。手でのチェックイン・直す・取り消すのあとは all をまとめて読み直す）。
// 一覧画面の問い合わせは5秒おきに読み直す（Consistency Conventions「一覧画面の更新」）。夜間の停止では止める（research R13）。
// 止めるのは、夜間の停止の時間帯（日本時間 0時〜8時）に DB に届かない 503 を受けたときだけ。昼の 503 やほかの失敗は一時的なので、
// 読み直しを続け、つながれば自然に最新に戻る。
import { isNightStopWindow } from "@workspace/contracts/core";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/api.ts";
import { fetchBreakdown, fetchCheckins, fetchMyCheckin, fetchTotals } from "./api.ts";

/** 一覧画面の読み直しの間（ミリ秒）。 */
export const RECEPTION_REFETCH_MS = 5000;

/** 受付の問い合わせの鍵。 */
export const RECEPTION_QUERY_KEYS = {
  /** 受付のすべての問い合わせ（まとめて読み直すとき） */
  all: ["reception"] as const,
  /**
   * 自分のチェックインと初期値。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  mine: (eventId: string) => ["reception", "mine", eventId] as const,
  /**
   * 一覧画面のチェックイン。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  list: (eventId: string) => ["reception", "list", eventId] as const,
  /**
   * 支払い方法ごとの合計。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  totals: (eventId: string) => ["reception", "totals", eventId] as const,
  /**
   * 内訳。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  breakdown: (eventId: string) => ["reception", "breakdown", eventId] as const,
};

/**
 * 夜間の停止か（夜間の停止の時間帯に、DB に届かない 503 DB_UNAVAILABLE を受けた）。昼の 503 は一時的なので false。
 * @param error 投げられたもの
 * @param now 今（既定は今の時刻。テストで差しかえる）
 * @returns 夜間の停止なら true
 */
export function isNightStop(error: unknown, now: Date = new Date()): boolean {
  return error instanceof ApiError && error.code === "DB_UNAVAILABLE" && isNightStopWindow(now);
}

/**
 * 5秒おきに読み直す間。夜間の停止のときだけ止め、ほかの失敗では続ける（つながれば次の読み直しで最新に戻る）。
 * @param query 問い合わせ
 * @param query.state 問い合わせの状態（最後の失敗）
 * @param now 今（既定は今の時刻。テストで差しかえる）
 * @returns 間（止めるなら false）
 */
export function receptionPollInterval(
  query: { state: { error: unknown } },
  now: Date = new Date(),
): number | false {
  return isNightStop(query.state.error, now) ? false : RECEPTION_REFETCH_MS;
}

/**
 * 自分のチェックインと初期値を読む（チェックインの画面）。
 * @param eventId 交流会の ID
 * @returns 問い合わせ
 */
export function useMyCheckin(eventId: string) {
  return useQuery({
    queryKey: RECEPTION_QUERY_KEYS.mine(eventId),
    queryFn: () => fetchMyCheckin(eventId),
  });
}

/**
 * 一覧画面のチェックインを読む（5秒おき）。
 * @param eventId 交流会の ID
 * @returns 問い合わせ
 */
export function useCheckinList(eventId: string) {
  return useQuery({
    queryKey: RECEPTION_QUERY_KEYS.list(eventId),
    queryFn: () => fetchCheckins(eventId),
    refetchInterval: (query) => receptionPollInterval(query),
  });
}

/**
 * 支払い方法ごとの合計を読む（5秒おき）。
 * @param eventId 交流会の ID
 * @returns 問い合わせ
 */
export function useTotals(eventId: string) {
  return useQuery({
    queryKey: RECEPTION_QUERY_KEYS.totals(eventId),
    queryFn: () => fetchTotals(eventId),
    refetchInterval: (query) => receptionPollInterval(query),
  });
}

/**
 * 内訳を読む（主催者だけ。5秒おき）。
 * @param eventId 交流会の ID
 * @param enabled 読むか（主催者のときだけ true）
 * @returns 問い合わせ
 */
export function useBreakdown(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: RECEPTION_QUERY_KEYS.breakdown(eventId),
    queryFn: () => fetchBreakdown(eventId),
    refetchInterval: (query) => receptionPollInterval(query),
    enabled,
  });
}
