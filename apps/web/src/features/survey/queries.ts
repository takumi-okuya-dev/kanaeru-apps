// アンケートの問い合わせ（TanStack Query）の鍵と読みこみ。鍵はどれも "survey" で始める
// （ログインし直したときに account が読み直させる。回答を書いたあとは all をまとめて読み直す）。
// 困りごとの一覧は5秒おきに読み直す（Consistency Conventions「一覧画面の更新」）。夜間の停止では止める。
// 止めるのは、夜間の停止の時間帯（日本時間 0時〜8時）に DB に届かない 503 を受けたときだけ（reception・event と同じ）。
// 昼の 503 やほかの失敗は一時的なので、読み直しを続け、つながれば自然に最新に戻る。
// 絞りこみ・並べ方を変えたときに前の鍵の行を仮に出さない（placeholderData を使わない）。前の行が新しい絞りこみの結果に見え、
// 新しい鍵の初めの読みこみが失敗しても誤りが出ないため。
import { isNightStopWindow } from "@workspace/contracts/core";
import type { SurveyListQuery } from "@workspace/contracts/survey";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/api.ts";
import { fetchMySurvey, fetchProxySurvey, fetchSurveyAnswers } from "./api.ts";

/** 一覧の読み直しの間（ミリ秒）。 */
export const SURVEY_REFETCH_MS = 5000;

/** アンケートの問い合わせの鍵。 */
export const SURVEY_QUERY_KEYS = {
  /** アンケートのすべての問い合わせ（まとめて読み直すとき） */
  all: ["survey"] as const,
  /**
   * 自分の回答とチェックイン済みか。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  mine: (eventId: string) => ["survey", "mine", eventId] as const,
  /**
   * チェックインの回答（代わりに入れるとき）。
   * @param eventId 交流会の ID
   * @param checkinId チェックインの ID
   * @returns 鍵
   */
  proxy: (eventId: string, checkinId: string) => ["survey", "proxy", eventId, checkinId] as const,
  /**
   * 困りごとの一覧。
   * @param eventId 交流会の ID
   * @param query 絞りこみと並べ方
   * @returns 鍵
   */
  list: (eventId: string, query: SurveyListQuery) => ["survey", "list", eventId, query] as const,
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
 * 困りごとの一覧を5秒おきに読み直す間。夜間の停止のときだけ止め、ほかの失敗では続ける。
 * @param query 問い合わせ
 * @param query.state 問い合わせの状態（最後の失敗）
 * @param now 今（既定は今の時刻。テストで差しかえる）
 * @returns 間（止めるなら false）
 */
export function surveyPollInterval(
  query: { state: { error: unknown } },
  now: Date = new Date(),
): number | false {
  return isNightStop(query.state.error, now) ? false : SURVEY_REFETCH_MS;
}

/**
 * 自分の回答とチェックイン済みかを読む（アンケートの画面）。
 * @param eventId 交流会の ID
 * @returns 問い合わせ
 */
export function useMySurvey(eventId: string) {
  return useQuery({
    queryKey: SURVEY_QUERY_KEYS.mine(eventId),
    queryFn: () => fetchMySurvey(eventId),
  });
}

/**
 * チェックインの回答を読む（主催者が代わりに入れるとき）。
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @returns 問い合わせ
 */
export function useProxySurvey(eventId: string, checkinId: string) {
  return useQuery({
    queryKey: SURVEY_QUERY_KEYS.proxy(eventId, checkinId),
    queryFn: () => fetchProxySurvey(eventId, checkinId),
  });
}

/**
 * 困りごとの一覧を読む（主催者だけ。5秒おき。夜間の停止のあとは止める）。
 * @param eventId 交流会の ID
 * @param query 絞りこみと並べ方
 * @returns 問い合わせ
 */
export function useSurveyAnswers(eventId: string, query: SurveyListQuery) {
  return useQuery({
    queryKey: SURVEY_QUERY_KEYS.list(eventId, query),
    queryFn: () => fetchSurveyAnswers(eventId, query),
    refetchInterval: (current) => surveyPollInterval(current),
  });
}
