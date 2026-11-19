// 受付（reception）の選択肢：申し込みの媒体・知ったきっかけ・支払い方法（PRD FR-4・決定 A2・A3。research R8）。
// 値は英語の短い code、画面の言葉と並び順はここの1か所に持つ（Consistency Conventions「選択肢」）。DB は text と CHECK。
// zod を読まない（画面が言葉だけを読んでも zod を束に入れないため）。

/** 申し込みの媒体の code（並びは画面の順）。 */
export const APPLICATION_SOURCES = ["connpass", "peatix", "direct", "other"] as const;

/** 申し込みの媒体。 */
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

/** 申し込みの媒体の画面の言葉。 */
export const APPLICATION_SOURCE_LABELS = {
  connpass: "connpass",
  peatix: "Peatix",
  direct: "直接",
  other: "その他",
} as const satisfies Record<ApplicationSource, string>;

/** 知ったきっかけの code（並びは画面の順）。 */
export const REFERRALS = ["friend", "sns", "announcement", "other"] as const;

/** 知ったきっかけ。 */
export type Referral = (typeof REFERRALS)[number];

/** 知ったきっかけの画面の言葉。 */
export const REFERRAL_LABELS = {
  friend: "知人の紹介",
  sns: "SNS",
  announcement: "connpass などの告知",
  other: "その他",
} as const satisfies Record<Referral, string>;

/** 支払い方法の code（並びは画面と合計の順）。 */
export const PAYMENT_METHODS = ["paypay", "cash", "free"] as const;

/** 支払い方法。 */
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** 支払い方法の画面の言葉。 */
export const PAYMENT_METHOD_LABELS = {
  paypay: "PayPay",
  cash: "現金",
  free: "無料（招待など）",
} as const satisfies Record<PaymentMethod, string>;

/** 設問の名前（画面の見出しと、選んでいないときの誤りの文に使う）。 */
export const CHECKIN_QUESTION_LABELS = {
  applicationSource: "申し込みの媒体",
  referral: "知ったきっかけ",
  paymentMethod: "支払い方法",
} as const;

/** チェックインの入れ方（LINE ログイン・手）。 */
export const CHECKIN_METHODS = ["line", "manual"] as const;

/** チェックインの入れ方。 */
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];
