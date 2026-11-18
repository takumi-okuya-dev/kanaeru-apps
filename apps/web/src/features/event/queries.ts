// 交流会の問い合わせ（TanStack Query）の鍵と、ほかの領域も使う読みこみ（useEvent・useEventSummary）。
// 鍵はどれも "event" で始める（ログインし直したときに account が読み直させる。features/account/session.ts）。
import { useQuery } from "@tanstack/react-query";
import { fetchEvent, fetchEventSummary, fetchEvents } from "./api.ts";

/** 交流会の問い合わせの鍵。 */
export const EVENT_QUERY_KEYS = {
  /** 交流会のすべての問い合わせ（まとめて読み直すとき） */
  all: ["event"] as const,
  /** 交流会の一覧 */
  list: ["event", "list"] as const,
  /**
   * 交流会（自分の役目つき）。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  detail: (eventId: string) => ["event", "detail", eventId] as const,
  /**
   * 交流会の要約。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  summary: (eventId: string) => ["event", "summary", eventId] as const,
  /**
   * 今の招待のリンク。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  invite: (eventId: string) => ["event", "invite", eventId] as const,
  /**
   * 受付係の一覧。
   * @param eventId 交流会の ID
   * @returns 鍵
   */
  staff: (eventId: string) => ["event", "staff", eventId] as const,
  /**
   * 招待の中身。
   * @param inviteToken 招待の印
   * @returns 鍵
   */
  invitePreview: (inviteToken: string) => ["event", "invite-preview", inviteToken] as const,
};

/**
 * 交流会の一覧を読む。
 * @returns 問い合わせ
 */
export function useEventList() {
  return useQuery({ queryKey: EVENT_QUERY_KEYS.list, queryFn: fetchEvents });
}

/**
 * 交流会を読む（主催者と、その交流会の受付係だけ。自分の役目 myRole つき）。reception・survey の管理の画面も使う。
 * 403（主催者でも受付係でもない）・404 は ApiError で失敗する（読み直さない）。
 * @param eventId 交流会の ID
 * @returns 問い合わせ
 */
export function useEvent(eventId: string) {
  return useQuery({
    queryKey: EVENT_QUERY_KEYS.detail(eventId),
    queryFn: () => fetchEvent(eventId),
  });
}

/**
 * 交流会の要約を読む（ログインしていれば誰でも。参加者の画面が使う）。
 * @param eventId 交流会の ID
 * @returns 問い合わせ
 */
export function useEventSummary(eventId: string) {
  return useQuery({
    queryKey: EVENT_QUERY_KEYS.summary(eventId),
    queryFn: () => fetchEventSummary(eventId),
  });
}
