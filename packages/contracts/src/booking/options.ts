// 予約（booking）の選択肢：使い方・名簿の行の入口と状態・来たか（PRD 受付アプリの予約 3章のことば。booking-001 research R1・R2）。
// 値は英語の短い code、画面の言葉と並び順はここの1か所に持つ（Consistency Conventions「選択肢」）。DB は text と CHECK。
// 媒体は受付の「申し込みの媒体」（@workspace/contracts/reception の APPLICATION_SOURCES）をそのまま使う（AD-23。research R3）。
// zod を読まない（画面が言葉だけを読んでも zod を束に入れないため）。

/** 使い方の code（並びは画面の順。行がない交流会は reception〈受付だけ〉。自前で申込みを受けるは、その仕様で足す）。 */
export const BOOKING_MODES = ["reception", "roster"] as const;

/** 使い方。 */
export type BookingMode = (typeof BOOKING_MODES)[number];

/** 使い方の画面の言葉。 */
export const BOOKING_MODE_LABELS = {
  reception: "受付だけ",
  roster: "名簿を使う",
} as const satisfies Record<BookingMode, string>;

/** 使い方の説明（準備の画面の選ぶカード）。 */
export const BOOKING_MODE_DESCRIPTIONS = {
  reception: "当日のチェックインだけ。今までと同じです。",
  roster: "申込みは Google フォームや掲載サイトで集め、名簿に入れて当日の受付に使います。",
} as const satisfies Record<BookingMode, string>;

/** 名簿の行の入口の code（手で足す・取り込み〈貼る・CSV〉・飛び入り。自前のページは、その仕様で足す）。 */
export const ENTRY_KINDS = ["manual", "import", "walk_in"] as const;

/** 名簿の行の入口。 */
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** 名簿の行の入口の画面の言葉。 */
export const ENTRY_KIND_LABELS = {
  manual: "手で足す",
  import: "取り込み",
  walk_in: "飛び入り",
} as const satisfies Record<EntryKind, string>;

/** 名簿の行の状態の code（確定・取り消し。キャンセル待ち・打診中は、定員の仕様で足す）。 */
export const ENTRY_STATUSES = ["confirmed", "cancelled"] as const;

/** 名簿の行の状態。 */
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** 名簿の行の状態の画面の言葉。 */
export const ENTRY_STATUS_LABELS = {
  confirmed: "確定",
  cancelled: "取り消し",
} as const satisfies Record<EntryStatus, string>;

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
