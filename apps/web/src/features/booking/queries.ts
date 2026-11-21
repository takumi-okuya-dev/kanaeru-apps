// 予約の問い合わせ（TanStack Query）の鍵と読みこみ。鍵はどれも "booking" で始める（書いたあとは all をまとめて読み直す）。
// 名簿に当てる画面は、受付の一覧画面と同じく5秒おきに読み直す（夜間の停止の 503 だけ止める。reception の receptionPollInterval）。
import { useQuery } from "@tanstack/react-query";
import { receptionPollInterval } from "../reception/index.ts";
import { fetchMatches, fetchRoster, fetchSetting } from "./api.ts";

/** 予約の問い合わせの鍵。 */
export const BOOKING_QUERY_KEYS = {
  /** 予約のすべての問い合わせ（まとめて読み直すとき） */
  all: ["booking"] as const,
  /**
   * 交流会の使い方（ナビもこの鍵を読む）。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  setting: (eventId: string) => ["booking", "setting", eventId] as const,
  /**
   * 名簿。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  roster: (eventId: string) => ["booking", "roster", eventId] as const,
  /**
   * 名簿に当てる画面。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  matches: (eventId: string) => ["booking", "matches", eventId] as const,
  /**
   * 列の対応。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  mappings: (eventId: string) => ["booking", "mappings", eventId] as const,
};

/**
 * 交流会の使い方を読む。
 * @param eventId 交流会の ID
 * @returns 問い合わせ
 */
export function useBookingSetting(eventId: string) {
  return useQuery({
    queryKey: BOOKING_QUERY_KEYS.setting(eventId),
    queryFn: () => fetchSetting(eventId),
  });
}

/**
 * 名簿を読む。
 * @param eventId 交流会の ID
 * @returns 問い合わせ
 */
export function useRoster(eventId: string) {
  return useQuery({
    queryKey: BOOKING_QUERY_KEYS.roster(eventId),
    queryFn: () => fetchRoster(eventId),
  });
}

/**
 * 名簿に当てる画面を読む（5秒おき）。
 * @param eventId 交流会の ID
 * @returns 問い合わせ
 */
export function useMatchBoard(eventId: string) {
  return useQuery({
    queryKey: BOOKING_QUERY_KEYS.matches(eventId),
    queryFn: () => fetchMatches(eventId),
    refetchInterval: (query) => receptionPollInterval(query),
  });
}
