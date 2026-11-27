// 人物メモの選択肢（specs/person/001-notes/data-model.md）。DB の CHECK と同じ並び（食い違いは schema.test.ts が見張る）。

/** 会った場の作り方（作ったあと変えない。この版は manual だけを作る。event は kanaeru の交流会から作るもの。AD-31）。 */
export const PERSON_MEETING_SOURCES = ["manual", "event"] as const;

/** 会った場の作り方。 */
export type PersonMeetingSource = (typeof PERSON_MEETING_SOURCES)[number];
