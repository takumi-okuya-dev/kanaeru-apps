// 人物メモ（person）の約束の入口。ほかからは @workspace/contracts/person として読む。
export {
  PERSON_MEETING_LIMITS,
  PERSON_NOTE_LIMITS,
  PERSON_RECENT_APPEND_IDS_MAX,
  countChars,
} from "./limits.ts";
export {
  PERSON_MATCH_FIELDS,
  PERSON_MATCH_FIELD_LABELS,
  PERSON_MEETING_SOURCES,
} from "./options.ts";
export type { PersonMatchField, PersonMeetingSource } from "./options.ts";
export { PERSON_ERRORS } from "./errors.ts";
export {
  SEARCH_VERSION,
  escapeLike,
  findMatches,
  normalizeForSearch,
  normalizeMeetingName,
  normalizeTag,
} from "./search.ts";
export type { SearchMatchRange } from "./search.ts";
export { PERSON_ACCOUNT_KINDS, PERSON_ACCOUNT_LABELS, accountUrl, isHttpUrl } from "./accounts.ts";
export type { PersonAccountKind } from "./accounts.ts";
export { appendHeading, appendTalk } from "./heading.ts";
export type { HeadingMeeting } from "./heading.ts";
export { MeetingCreateInput, MeetingDate, MeetingList, MeetingSummary } from "./meeting.ts";
export {
  Meeting,
  Note,
  NoteAccounts,
  NoteAccountsInput,
  NoteAppendInput,
  NoteCreateInput,
  NoteList,
  NoteSearchInput,
  NoteSummary,
  NoteUpdateInput,
  PERSON_LIST_MAX,
  PERSON_SEARCH_MAX,
  PERSON_SEARCH_QUERY_MAX,
  SearchMatch,
  SearchResult,
  uniqueTags,
} from "./note.ts";
