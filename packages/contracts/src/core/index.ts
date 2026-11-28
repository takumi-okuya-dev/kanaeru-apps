// 土台（core）の約束の入口。ほかからは @workspace/contracts/core として読む。
export { PRODUCT_NAME } from "./brand.ts";
export { ErrorBody, FieldError } from "./errors.ts";
export { Health } from "./health.ts";
export { JobTickResult, JobTickStatus } from "./jobs.ts";
export { calendarStamp, googleCalendarUrl } from "./calendar.ts";
export type { GoogleCalendarEntry } from "./calendar.ts";
export { endOfJstDate, jstDate, jstDateTime } from "./jst.ts";
export {
  CORE_ERROR_MESSAGES,
  DB_UNAVAILABLE_MESSAGES,
  coreErrorMessage,
  dbUnavailableMessage,
} from "./messages.ts";
export type { CoreErrorCode } from "./messages.ts";
export { NIGHT_STOP_END_HOUR_JST, isNightStopWindow } from "./night-stop.ts";
export {
  MINI_APP_URL_BASE,
  PARTICIPANT_ROUTE_PATTERNS,
  miniAppPermalink,
  participantPaths,
} from "./participant-paths.ts";
export { APP_ICONS, defineApp } from "./app-definition.ts";
export type { AppDefinition, AppIcon } from "./app-definition.ts";
export {
  APP_KEY_FORMAT,
  COMMON_DOMAINS,
  RESERVED_APP_KEYS,
  appOfDomain,
  appRegistryProblems,
  listApps,
  unassignedDomains,
} from "./apps.ts";
