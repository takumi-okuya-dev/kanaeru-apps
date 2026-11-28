// 人物メモの選択肢（specs/person/001-notes/data-model.md）。会った場の作り方は DB の CHECK と同じ並び（食い違いは schema.test.ts が見張る）。
// 検索で当たった欄と、その画面の言葉も置く（zod を読まない）。

/** 会った場の作り方（作ったあと変えない。この版は manual だけを作る。event は PaletKit の交流会から作るもの。AD-31）。 */
export const PERSON_MEETING_SOURCES = ["manual", "event"] as const;

/** 会った場の作り方。 */
export type PersonMeetingSource = (typeof PERSON_MEETING_SOURCES)[number];

/** 検索で当たった欄（contracts/person.md の matches の field。並びは画面と結果の順）。 */
export const PERSON_MATCH_FIELDS = [
  "fullName",
  "reading",
  "lineName",
  "appearance",
  "talk",
  "nextTopic",
  "tags",
  "meeting",
] as const;

/** 検索で当たった欄。 */
export type PersonMatchField = (typeof PERSON_MATCH_FIELDS)[number];

/** 検索で当たった欄の画面の言葉。 */
export const PERSON_MATCH_FIELD_LABELS = {
  fullName: "フルネーム",
  reading: "よみ",
  lineName: "LINE の名前",
  appearance: "見た目の特徴",
  talk: "話したこと",
  nextTopic: "次に話したいこと",
  tags: "タグ",
  meeting: "会った場",
} as const satisfies Record<PersonMatchField, string>;
