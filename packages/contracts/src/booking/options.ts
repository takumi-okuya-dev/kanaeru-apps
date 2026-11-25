// 予約（booking）の選択肢：使い方・名簿の行の入口と状態・来たか（PRD 受付アプリの予約 3章のことば。booking-001 research R1・R2）。
// 値は英語の短い code、画面の言葉と並び順はここの1か所に持つ（Consistency Conventions「選択肢」）。DB は text と CHECK。
// 媒体は受付の「申し込みの媒体」（@workspace/contracts/reception の APPLICATION_SOURCES）をそのまま使う（AD-23。research R3）。
// zod を読まない（画面が言葉だけを読んでも zod を束に入れないため）。

/** 使い方の code（並びは画面の順。行がない交流会は reception〈受付だけ〉。自前で申込みを受ける〈self_page〉は booking-003）。 */
export const BOOKING_MODES = ["reception", "roster", "self_page"] as const;

/** 使い方。 */
export type BookingMode = (typeof BOOKING_MODES)[number];

/** 使い方の画面の言葉。 */
export const BOOKING_MODE_LABELS = {
  reception: "受付だけ",
  roster: "名簿を使う",
  self_page: "自前で申込みを受ける",
} as const satisfies Record<BookingMode, string>;

/** 使い方の説明（準備の画面の選ぶカード）。 */
export const BOOKING_MODE_DESCRIPTIONS = {
  reception: "当日のチェックインだけ。今までと同じです。",
  roster: "申込みは Google フォームや掲載サイトで集め、名簿に入れて当日の受付に使います。",
  self_page:
    // 名前は core の PRODUCT_NAME と同じ（約束どうしは読めない決まりなので、文字で持つ）
    "PaletKit の申込みページで LINE ログインかメールで申し込んでもらい、名簿に入れます。外で集めた申込みも同じ名簿に入れられます。",
} as const satisfies Record<BookingMode, string>;

/**
 * 名簿を使う使い方か（名簿を使う・自前で申込みを受ける。受付だけでない。booking-003 research R1）。
 * @param mode 使い方
 * @returns 名簿を使うなら true
 */
export function usesRoster(mode: BookingMode): boolean {
  return mode !== "reception";
}

/** 申込みページの見せる範囲の code（誰でも・部員だけ。booking-003 research R8）。 */
export const VISIBILITIES = ["public", "members"] as const;

/** 申込みページの見せる範囲。 */
export type Visibility = (typeof VISIBILITIES)[number];

/** 見せる範囲の画面の言葉。 */
export const VISIBILITY_LABELS = {
  public: "誰でも",
  members: "部員だけ",
} as const satisfies Record<Visibility, string>;

/**
 * 申込みページの受付の状態の code（受付中・閉じている・始まりを過ぎた・中止〈booking-004〉。保存せず、読むときに決める。
 * research R1）。
 */
export const PAGE_STATES = ["open", "closed", "started", "cancelled"] as const;

/** 申込みページの受付の状態。 */
export type PageState = (typeof PAGE_STATES)[number];

/** 受付の状態の画面の言葉。 */
export const PAGE_STATE_LABELS = {
  open: "受付中",
  closed: "受付を閉じています",
  started: "受付を終えました",
  cancelled: "この会は中止になりました",
} as const satisfies Record<PageState, string>;

/** 名簿の行の入口の code（手で足す・取り込み〈貼る・CSV〉・飛び入り・自前のページ〈booking-003〉）。 */
export const ENTRY_KINDS = ["manual", "import", "walk_in", "self_page"] as const;

/** 名簿の行の入口。 */
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** 名簿の行の入口の画面の言葉。 */
export const ENTRY_KIND_LABELS = {
  manual: "手で足す",
  import: "取り込み",
  walk_in: "飛び入り",
  self_page: "自前",
} as const satisfies Record<EntryKind, string>;

/** 名簿の行の状態の code（確定・キャンセル待ち・打診中〈booking-004〉・取り消し）。 */
export const ENTRY_STATUSES = ["confirmed", "waitlisted", "offered", "cancelled"] as const;

/** 名簿の行の状態。 */
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** 名簿の行の状態の画面の言葉。 */
export const ENTRY_STATUS_LABELS = {
  confirmed: "確定",
  waitlisted: "キャンセル待ち",
  offered: "打診中",
  cancelled: "取り消し",
} as const satisfies Record<EntryStatus, string>;

/** 主催者が名簿で選べる状態（確定・取り消し。キャンセル待ち・打診中は窓口が決める。booking-004 research R14）。 */
export const SETTABLE_ENTRY_STATUSES = ["confirmed", "cancelled"] as const;

/** 席を押さえる状態（埋まった席＝確定＋打診中。booking-004 research R2）。 */
export const SEAT_STATUSES = ["confirmed", "offered"] as const;

/** 打診の状態の code（待っている・参加・辞退・期限切れ・取り下げ。booking-004 research R5）。 */
export const OFFER_STATUSES = ["pending", "accepted", "declined", "expired", "withdrawn"] as const;

/** 打診の状態。 */
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/**
 * 媒体の枠を置ける媒体の code（受付の申し込みの媒体から直接〈direct〉を除いたもの。並びは受付と同じ。booking-004 research R1）。
 * 受付の約束を読まずに値を書く（options.test.ts が受付の値と食い違わないかを見張る）。
 */
export const QUOTA_SOURCES = ["connpass", "peatix", "other"] as const;

/** 媒体の枠を置ける媒体。 */
export type QuotaSource = (typeof QUOTA_SOURCES)[number];

/** 枠を置ける媒体の画面の言葉（受付の申し込みの媒体の言葉と同じ。options.test.ts が見張る）。 */
export const QUOTA_SOURCE_LABELS = {
  connpass: "connpass",
  peatix: "Peatix",
  other: "その他",
} as const satisfies Record<QuotaSource, string>;

/** 来たかの code（来た・来なかった・まだ。保存せず、読むときに決める。research R8）。 */
export const ATTENDANCES = ["came", "no_show", "pending"] as const;

/** 来たか。 */
export type Attendance = (typeof ATTENDANCES)[number];

/** 来たかの画面の言葉。 */
export const ATTENDANCE_LABELS = {
  came: "来た",
  no_show: "来なかった",
  pending: "まだ",
} as const satisfies Record<Attendance, string>;
