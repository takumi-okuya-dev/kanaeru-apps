// 人物メモの書き足しの見出し（specs/person/001-notes/research.md R8【仮決め。持ち主の確かめを待つ】）。zod を読まない。
// 見出しの日付は書き足した日（日本時間。API が決め、画面の時計に頼らない）。会った場を選んだときは、その名前と日付も入れる。
import { jstDate } from "../core/index.ts";

/** 見出しに入れる会った場。 */
export type HeadingMeeting = {
  /** 会った場の名前 */
  name: string;
  /** 会った日（YYYY-MM-DD） */
  metOn: string;
};

/**
 * 書き足しの見出しの1行（`── 2026-12-03 ──`。会った場つきは `── 2026-12-03 12月の勉強会（2026-12-03）──`）。
 * @param now 書き足した時刻
 * @param meeting 選んだ会った場（なければ null）
 * @returns 見出しの1行
 */
export function appendHeading(now: Date, meeting?: HeadingMeeting | null): string {
  const date = jstDate(now);
  return meeting ? `── ${date} ${meeting.name}（${meeting.metOn}）──` : `── ${date} ──`;
}

/**
 * 話したことに書き足したあとの文（前の文のあとに空の行・見出し・書き足した文。前の文が空なら見出しから始める）。
 * @param current 今の話したこと
 * @param text 書き足す文
 * @param now 書き足した時刻
 * @param meeting 選んだ会った場（なければ null）
 * @returns 書き足したあとの話したこと
 */
export function appendTalk(
  current: string,
  text: string,
  now: Date,
  meeting?: HeadingMeeting | null,
): string {
  const block = `${appendHeading(now, meeting)}\n${text}`;
  return current.trim() === "" ? block : `${current}\n\n${block}`;
}
