// 受付（reception）の約束の入口。ほかからは @workspace/contracts/reception として読む。
export {
  ApplicationSourceSchema,
  CHECKIN_NAME_MAX,
  CheckinBreakdown,
  CheckinInput,
  CheckinList,
  CheckinTotals,
  CheckinView,
  MyCheckin,
  MyCheckinResult,
  MyCheckinState,
  PaymentMethodSchema,
  REFERRER_NAME_MAX,
  ReferralSchema,
} from "./checkin.ts";
export { RECEPTION_ERRORS } from "./errors.ts";
export type { ReceptionErrorKey } from "./errors.ts";
export { normalizeCheckinName } from "./name.ts";
export {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_LABELS,
  CHECKIN_METHODS,
  CHECKIN_QUESTION_LABELS,
  DISCOUNT_NONE_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  REFERRALS,
  REFERRAL_LABELS,
} from "./options.ts";
export type { ApplicationSource, CheckinMethod, PaymentMethod, Referral } from "./options.ts";
