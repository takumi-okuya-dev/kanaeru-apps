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
