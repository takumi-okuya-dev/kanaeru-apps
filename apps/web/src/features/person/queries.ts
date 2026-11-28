// 人物メモの問い合わせ（TanStack Query）の鍵と読みこみ。鍵はどれも "person" で始める。
// 検索の言葉とタグは鍵に入れない（画面の状態だけに持つ。AD-31）。5秒おきの読み直しは使わない（AD-31）。
import { useQuery } from "@tanstack/react-query";
import { fetchEventCandidates, fetchMeeting, fetchMeetings, fetchNote, fetchNotes } from "./api.ts";

/** 人物メモの問い合わせの鍵。 */
export const PERSON_QUERY_KEYS = {
  /** 人物メモのすべての問い合わせ（書いたら、まとめて読み直す） */
  all: ["person"] as const,
  /** 人の一覧 */
  notes: ["person", "notes"] as const,
  /**
   * 人のメモ。
   * @param noteId 人の ID
   * @returns 鍵
   */
  note: (noteId: string) => ["person", "note", noteId] as const,
  /** 会った場の一覧 */
  meetings: ["person", "meetings"] as const,
  /**
   * 会った場。
   * @param meetingId 会った場の ID
   * @returns 鍵
   */
  meeting: (meetingId: string) => ["person", "meeting", meetingId] as const,
  /** 会った場に選べる PaletKit の交流会 */
  eventCandidates: ["person", "event-candidates"] as const,
};

/**
 * 人の一覧を読む。
 * @returns 問い合わせ
 */
export function useNotes() {
  return useQuery({ queryKey: PERSON_QUERY_KEYS.notes, queryFn: fetchNotes });
}

/**
 * 人のメモを読む（画面が直している間に上書きしないよう、窓に戻っても読み直さない）。
 * @param noteId 人の ID
 * @returns 問い合わせ
 */
export function useNote(noteId: string) {
  return useQuery({
    queryKey: PERSON_QUERY_KEYS.note(noteId),
    queryFn: () => fetchNote(noteId),
    refetchOnWindowFocus: false,
  });
}

/**
 * 会った場の一覧を読む。
 * @returns 問い合わせ
 */
export function useMeetings() {
  return useQuery({ queryKey: PERSON_QUERY_KEYS.meetings, queryFn: fetchMeetings });
}

/**
 * 会った場を読む。
 * @param meetingId 会った場の ID
 * @returns 問い合わせ
 */
export function useMeeting(meetingId: string) {
  return useQuery({
    queryKey: PERSON_QUERY_KEYS.meeting(meetingId),
    queryFn: () => fetchMeeting(meetingId),
  });
}

/**
 * 会った場に選べる PaletKit の交流会を読む。
 * @returns 問い合わせ
 */
export function useEventCandidates() {
  return useQuery({ queryKey: PERSON_QUERY_KEYS.eventCandidates, queryFn: fetchEventCandidates });
}
