// 読書記録の選択肢（specs/reading/001-bookshelf-import/data-model.md）。DB の CHECK と同じ並び（食い違いは schema.test.ts が見張る）。

/** 本の状態（PRD FR-R3）。 */
export const READING_BOOK_STATUSES = ["reading", "finished", "dropped"] as const;

/** 本の状態。 */
export type ReadingBookStatus = (typeof READING_BOOK_STATUSES)[number];

/** 本の状態の画面の言葉。 */
export const READING_BOOK_STATUS_LABELS = {
  reading: "読んでいる",
  finished: "読み終えた",
  dropped: "やめた",
} as const satisfies Record<ReadingBookStatus, string>;

/** 本の読む場所（いくつでも。PRD FR-R3）。 */
export const READING_SOURCES = ["kindle", "goodnotes", "other"] as const;

/** 本の読む場所。 */
export type ReadingSource = (typeof READING_SOURCES)[number];

/** 読む場所の画面の言葉。 */
export const READING_SOURCE_LABELS = {
  kindle: "Kindle",
  goodnotes: "GoodNotes",
  other: "そのほか",
} as const satisfies Record<ReadingSource, string>;

/** マーカーをどこから取りこんだか（paste は貼り付け。本の読む場所では other になる）。 */
export const READING_MARKER_SOURCES = ["goodnotes", "kindle", "paste"] as const;

/** マーカーをどこから取りこんだか。 */
export type ReadingMarkerSource = (typeof READING_MARKER_SOURCES)[number];

/** 本の書誌の出どころ（作ったあと変えない。AD-33）。 */
export const READING_CATALOG_SOURCES = ["ndl", "openbd", "manual"] as const;

/** 本の書誌の出どころ。 */
export type ReadingCatalogSource = (typeof READING_CATALOG_SOURCES)[number];

/** 書影の URL の頭（openBD の書影の置き場所だけ。画面の CSP の img-src と同じ。AD-33） */
export const READING_COVER_URL_PREFIX = "https://cover.openbd.jp/";
