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
export { READING_ERRORS } from "./errors.ts";
export { toIsbn13 } from "./isbn.ts";
export { markerKey, markerKeySource, normalizeMarkerText } from "./marker-key.ts";
export type { MarkerKeyInput } from "./marker-key.ts";
export { isQuestionComment, parsePastedMarkers } from "./paste.ts";
export type { PasteResult, PastedMarker } from "./paste.ts";
export {
  BookCreateInput,
  BookList,
  BookMergeInput,
  BookSummary,
  BookUpdateInput,
  CoverUrlInput,
  IsbnInput,
  SourcesInput,
} from "./book.ts";
export {
  Book,
  BookMergeResult,
  Marker,
  MarkerImportInput,
  MarkerImportItem,
  MarkerImportResult,
  MarkerKeyList,
  MarkerUpdateInput,
} from "./marker.ts";
export { CatalogItem, CatalogResult, CatalogSearchInput } from "./catalog.ts";
export { escapeLike, findMatches, normalizeForSearch } from "./search.ts";
export type { SearchMatch } from "./search.ts";
export {
  RESEARCH_TARGETS,
  RESEARCH_TARGET_KEYS,
  RESEARCH_URL_MAX,
  buildResearchPrompt,
  researchUrl,
} from "./research-prompt.ts";
export type { ResearchInput, ResearchTarget } from "./research-prompt.ts";
