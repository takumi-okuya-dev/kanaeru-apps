// 土台（core）の約束の入口。ほかからは @workspace/contracts/core として読む。
export { ErrorBody, FieldError } from "./errors.ts";
export { Health } from "./health.ts";
export { endOfJstDate, jstDate } from "./jst.ts";
export { CORE_ERROR_MESSAGES } from "./messages.ts";
export type { CoreErrorCode } from "./messages.ts";
export {
  MINI_APP_URL_BASE,
  PARTICIPANT_ROUTE_PATTERNS,
  miniAppPermalink,
  participantPaths,
} from "./participant-paths.ts";
