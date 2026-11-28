// 人物メモ（person）の約束の入口。ほかからは @workspace/contracts/person として読む。
export {
  PERSON_MEETING_LIMITS,
  PERSON_NOTE_LIMITS,
  PERSON_RECENT_APPEND_IDS_MAX,
  countChars,
} from "./limits.ts";
export { PERSON_MEETING_SOURCES } from "./options.ts";
export type { PersonMeetingSource } from "./options.ts";
