// 人物メモの欄の長さの上限（specs/person/001-notes/research.md R10・data-model.md）。
// DB の CHECK（apps/api/src/modules/person/schema.ts）と同じ値。食い違いは schema.test.ts が見張る。
// ただしタグ1つの長さ（tag）は、DB の CHECK を書けないので、約束（zod）だけで確かめる。
// 字はコードポイントで数える（絵文字も1字。DB の char_length と同じ）。

/** 人のメモの欄の上限（字）。 */
export const PERSON_NOTE_LIMITS = {
  /** フルネーム（1字以上） */
  fullName: 100,
  /** よみ */
  reading: 100,
  /** LINE の名前 */
  lineName: 100,
  /** 見た目の特徴 */
  appearance: 200,
  /** アカウント（1つずつ） */
  account: 200,
  /** 話したこと（書き足しの見出しを含む） */
  talk: 20_000,
  /** 次に話したいこと */
  nextTopic: 2_000,
  /** タグ1つ（数の上限は置かない。PRD FR-P2） */
  tag: 30,
} as const;

/** 会った場の欄の上限（字）。 */
export const PERSON_MEETING_LIMITS = {
  /** 名前（1字以上） */
  name: 100,
  /** そろえた名前（name_key。NFKC で字が増えうるので広く取る。DB の CHECK と同じ） */
  nameKey: 400,
} as const;

/**
 * 字の数（コードポイントで数える。絵文字も1字。DB の char_length と同じ）。
 * @param value 文字
 * @returns 字の数
 */
export function countChars(value: string): number {
  return [...value].length;
}
