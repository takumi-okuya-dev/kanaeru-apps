// 予約の知らせの選択肢：送り方（運営の設定）・知らせの種類・手段・結果（PRD 受付アプリの予約 4.6。booking-002 research R12）。
// 値は英語の短い code、画面の言葉と並び順はここの1か所に持つ（Consistency Conventions「選択肢」）。DB は text と CHECK。
// zod を読まない（画面が言葉だけを読んでも zod を束に入れないため）。

/** 送り方の code（設定 NOTIFY_MODE。AD-24。本番の既定は off）。 */
export const NOTIFY_MODES = ["off", "allowlist", "on"] as const;

/** 送り方。 */
export type NotifyMode = (typeof NOTIFY_MODES)[number];

/** 送り方の画面の言葉（設定の画面の帯）。 */
export const NOTIFY_MODE_LABELS = {
  off: "いまは知らせを止めています（運営の設定）。設定と紐づけはできますが、LINE とメールは送りません。",
  allowlist:
    "いまは確かめの間です（運営の設定）。運営が許可した宛先にだけ送ります。友だち追加へのあいさつは送ります。",
  on: "知らせを送ります。",
} as const satisfies Record<NotifyMode, string>;

/** 知らせの種類の code（6つの知らせと、設定の画面の確かめのメッセージ。PRD FR-B80）。 */
export const NOTICE_KINDS = [
  "confirmed",
  "waitlisted",
  "offered",
  "offer_expired",
  "changed",
  "cancelled_event",
  "test",
] as const;

/** 知らせの種類。 */
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** 知らせの種類の画面の言葉。 */
export const NOTICE_KIND_LABELS = {
  confirmed: "申込みの確定",
  waitlisted: "キャンセル待ちに入った",
  offered: "打診",
  offer_expired: "打診の期限が過ぎた",
  changed: "日時や場所の変更",
  cancelled_event: "中止",
  test: "確かめのメッセージ",
} as const satisfies Record<NoticeKind, string>;

/** 知らせの手段の code（LINE・メール・なし）。 */
export const NOTICE_METHODS = ["line", "email", "none"] as const;

/** 知らせの手段。 */
export type NoticeMethod = (typeof NOTICE_METHODS)[number];

/** 知らせの手段の画面の言葉。 */
export const NOTICE_METHOD_LABELS = {
  line: "LINE",
  email: "メール",
  none: "なし",
} as const satisfies Record<NoticeMethod, string>;

/** 知らせの結果の code（research R12）。 */
export const NOTICE_RESULTS = [
  "sent",
  "off",
  "not_allowed",
  "no_destination",
  "failed",
  "unavailable",
] as const;

/** 知らせの結果。 */
export type NoticeResult = (typeof NOTICE_RESULTS)[number];

/** 知らせの結果の画面の言葉。 */
export const NOTICE_RESULT_LABELS = {
  sent: "送った",
  off: "止めている",
  not_allowed: "許可リストにない",
  no_destination: "送り先がない",
  failed: "送れなかった",
  unavailable: "メールの準備がない",
} as const satisfies Record<NoticeResult, string>;
