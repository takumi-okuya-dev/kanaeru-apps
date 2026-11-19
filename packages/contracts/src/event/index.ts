// 交流会（event）の約束の入口。ほかからは @workspace/contracts/event として読む。
export { ADMIN_ROUTE_PATTERNS, QR_KINDS, adminPaths } from "./admin-paths.ts";
export type { QrKind } from "./admin-paths.ts";
export { EVENT_ERRORS } from "./errors.ts";
export type { EventErrorKey } from "./errors.ts";
export {
  EVENT_DISCOUNTS_MAX,
  EVENT_DISCOUNT_NAME_MAX,
  EVENT_FEE_MAX,
  EVENT_NAME_MAX,
  EVENT_URL_MAX,
  EVENT_VENUE_MAX,
  EventDiscountInput,
  EventDiscountView,
  EventDiscountsInput,
  EventInput,
  EventList,
  EventRoleSchema,
  EventSummary,
  EventView,
  InviteAccepted,
  InvitePreview,
  STAFF_INVITE_TOKEN_FORMAT,
  StaffInviteState,
  StaffInviteView,
  StaffList,
  StaffMember,
  SurveyState,
  SurveyStateInput,
} from "./event.ts";
export { EVENT_ROLES, EVENT_ROLE_LABELS } from "./roles.ts";
export type { EventRole } from "./roles.ts";
