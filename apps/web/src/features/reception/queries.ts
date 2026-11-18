// 受付の問い合わせ（TanStack Query）の鍵と読みこみ。鍵はどれも "reception" で始める
// （ログインし直したときに account が読み直させる。手でのチェックイン・直す・取り消すのあとは all をまとめて読み直す）。
// 一覧画面の問い合わせは5秒おきに読み直す（Consistency Conventions「一覧画面の更新」）。夜間の停止では止める（research R13）。
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
 * 夜間の停止（503 DB_UNAVAILABLE）か。
 * @param error 投げられたもの
 * @returns 夜間の停止なら true
 */
export function isNightStop(error: unknown): boolean {
  return error instanceof ApiError && error.code === "DB_UNAVAILABLE";
}

/**
 * 5秒おきに読み直す間（夜間の停止のあとは止める）。
 * @param query 問い合わせ
 * @returns 間（止めるなら false）
 */
function pollInterval(query: { state: { error: unknown } }): number | false {
  return isNightStop(query.state.error) ? false : RECEPTION_REFETCH_MS;
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
    refetchInterval: pollInterval,
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
    refetchInterval: pollInterval,
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
    refetchInterval: pollInterval,
    enabled,
  });
}
