// 予約（booking）の約束の入口。ほかからは @workspace/contracts/booking として読む。
export {
  ATTENDANCES,
  ATTENDANCE_LABELS,
  BOOKING_MODES,
  BOOKING_MODE_DESCRIPTIONS,
  BOOKING_MODE_LABELS,
  ENTRY_KINDS,
  ENTRY_KIND_LABELS,
  ENTRY_STATUSES,
  ENTRY_STATUS_LABELS,
} from "./options.ts";
export type { Attendance, BookingMode, EntryKind, EntryStatus } from "./options.ts";
export { BOOKING_ERRORS } from "./errors.ts";
export type { BookingErrorKey } from "./errors.ts";
export { BOOKING_ROUTE_PATTERNS, bookingPaths } from "./paths.ts";
export {
  AttendanceSchema,
  BookingModeSchema,
  BookingSetting,
  BookingSettingInput,
  ENTRY_MEMO_MAX,
  IMPORT_HEADERS_MAX,
  IMPORT_HEADER_MAX,
  IMPORT_OUTCOMES,
  importMappingFits,
  ImportMappingList,
  MATCH_STATES,
  MatchBoard,
  MatchInput,
  ROSTER_IMPORT_FILE_MAX_BYTES,
  ROSTER_IMPORT_ROWS_MAX,
  Roster,
  RosterEntry,
  RosterEntryInput,
  RosterImportInput,
  RosterImportPreview,
  RosterImportResult,
  RosterMergeInput,
  RosterStatusInput,
} from "./roster.ts";
export type { ImportOutcome, MatchState } from "./roster.ts";
