// 読書記録（reading）の約束の入口。ほかからは @workspace/contracts/reading として読む。
export {
  READING_BOOK_LIMITS,
  READING_IMPORT_LIMITS,
  READING_MARKER_LIMITS,
  countChars,
} from "./limits.ts";
export {
  READING_BOOK_STATUSES,
  READING_BOOK_STATUS_LABELS,
  READING_CATALOG_SOURCES,
  READING_COVER_URL_PREFIX,
  READING_MARKER_SOURCES,
  READING_SOURCES,
  READING_SOURCE_LABELS,
} from "./options.ts";
export type {
  ReadingBookStatus,
  ReadingCatalogSource,
  ReadingMarkerSource,
  ReadingSource,
} from "./options.ts";
