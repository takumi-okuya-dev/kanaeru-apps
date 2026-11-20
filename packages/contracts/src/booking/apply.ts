// 自前の申込みページの窓口の入出力の形（申込みページ・申し込む・取り消す・自分の申込み・部の予定・案内の同意・メールで申し込む・
// 札のページ・申込みページの設定。booking-003 contracts）。ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。
// 入力の誤りの文は、欄のそばにそのまま出せる日本語。日時は時差つきの ISO 8601 だけ。
// 席の残り・キャンセル待ちの欄は置かない（定員は booking-004 で足す。research R18）。ほかの人の名前・メールアドレスは返さない。
import { z } from "zod";
import { EmailAddress } from "./notify.ts";
import { ENTRY_STATUSES, PAGE_STATES, VISIBILITIES } from "./options.ts";

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/**
 * 申込みの名前の文字数の上限（受付のチェックインの名前 CHECKIN_NAME_MAX と同じ値。apply.test.ts が食い違いを見張る）。
 * 受付の約束（checkin.ts）を読むと、申込みページの画面の束に受付の zod の形が入り、組み立ての束の分け方が変わって
 * 画面の zod の設定（jitless）より先に形が作られる（CSP の eval の違反）ため、ここに値を持つ。
 */
export const APPLY_NAME_MAX = 50;

/** 申込みの名前の形（受付のチェックインの名前・名簿の名前と同じ。前後の空白を消す）。 */
const EntryName = z
  .string({ error: "名前を入れてください。" })
  .trim()
  .min(1, { error: "名前を入れてください。" })
  .max(APPLY_NAME_MAX, { error: `名前は${APPLY_NAME_MAX}文字までにしてください。` });

/** 確認の札の期限（時間。research R10）。 */
export const EMAIL_REQUEST_TTL_HOURS = 24;

/** 同じ交流会・同じアドレスに確認のメールを送り直せるまでの時間（分。research R11）。 */
export const EMAIL_REQUEST_RESEND_MINUTES = 10;

/** 交流会ごとの期限内の確認の待ちの上限（research R11）。 */
export const EMAIL_REQUESTS_PER_EVENT_MAX = 200;

/** 見せる範囲の形。 */
export const VisibilitySchema = z.enum(VISIBILITIES, { error: "見せる範囲を選んでください。" });

/** 受付の状態の形。 */
export const PageStateSchema = z.enum(PAGE_STATES);

/** 申込みの状態の形。 */
const EntryStatusSchema = z.enum(ENTRY_STATUSES);

/** 申込みページの設定を変える入力（主催者だけ。research R13）。 */
export const SelfPageInput = z.strictObject({
  accepting: z.boolean({ error: "受付を開くかを選んでください。" }),
  visibility: VisibilitySchema,
});

/** 申込みページの設定を変える入力の型。 */
export type SelfPageInput = z.infer<typeof SelfPageInput>;

/** LINE ログインで申し込む入力（research R4・R5）。 */
export const ApplyInput = z.strictObject({
  /** 名前（初めの値は前の申込みの名前か LINE の表示名） */
  name: EntryName,
  /** 主催から次の会の案内を受け取るか（初めは外す。false でもすでにある同意は消さない） */
  consent: z.boolean({ error: "案内を受け取るかを選んでください。" }).optional(),
});

/** LINE ログインで申し込む入力の型。 */
export type ApplyInput = z.infer<typeof ApplyInput>;

/** LINE を使わずにメールで申し込む入力（research R10）。 */
export const EmailApplyInput = z.strictObject({
  name: EntryName,
  email: EmailAddress,
});

/** メールで申し込む入力の型。 */
export type EmailApplyInput = z.infer<typeof EmailApplyInput>;

/** メールで申し込む答え（申込みがあるかどうかにかかわらず同じ。research R10）。 */
export const EmailApplyAccepted = z.object({ accepted: z.literal(true) });

/** 申込みページに出す交流会（参加者に見せてよい欄だけ）。 */
export const ApplyEvent = z.object({
  id: z.guid(),
  name: z.string(),
  startsAt: isoDateTime,
  venue: z.string().nullable(),
  fee: z.number().int(),
});

/** 申込みページに出す交流会の型。 */
export type ApplyEvent = z.infer<typeof ApplyEvent>;

/** カレンダーに追加のリンク。 */
export const CalendarLinks = z.object({
  /** Google カレンダーの追加の画面 */
  googleUrl: z.string(),
  /** .ics の窓口の道（同じ源） */
  icsPath: z.string(),
});

/** カレンダーに追加のリンクの型。 */
export type CalendarLinks = z.infer<typeof CalendarLinks>;

/** 自分の申込み（本人だけが読む形）。 */
export const MyEntry = z.object({
  id: z.guid(),
  name: z.string(),
  status: EntryStatusSchema,
  appliedAt: isoDateTime,
  /** 取り消せるか（確定かつ始まりの前） */
  cancellable: z.boolean(),
});

/** 自分の申込みの型。 */
export type MyEntry = z.infer<typeof MyEntry>;

/** 申込みページを開いた人（ログインしていれば、本人のことだけ）。 */
export const ApplyViewer = z.discriminatedUnion("signedIn", [
  z.object({ signedIn: z.literal(false) }),
  z.object({
    signedIn: z.literal(true),
    /** 名前の初めの値（前の申込みの名前か LINE の表示名） */
    defaultName: z.string(),
    /** この交流会の自分の申込み */
    myEntry: MyEntry.nullable(),
    /** 主催への案内の同意があるか */
    consented: z.boolean(),
    /** 当てはまる公式アカウントと紐づいているか */
    lineLinked: z.boolean(),
    /** 連絡のメールアドレスを入れているか（中身は返さない） */
    hasContactEmail: z.boolean(),
  }),
]);

/** 申込みページを開いた人の型。 */
export type ApplyViewer = z.infer<typeof ApplyViewer>;

/** 申込みページ（ログインなしでも読める。research R3）。 */
export const ApplyPage = z.object({
  event: ApplyEvent,
  /** 主催（組織の名前か持ち主の表示名。なければ空） */
  hostName: z.string(),
  /** 受付の状態 */
  state: PageStateSchema,
  /** 見せる範囲 */
  visibility: VisibilitySchema,
  calendar: CalendarLinks,
  /** 公式アカウントを友だちに追加する URL（ベーシック ID があるとき） */
  lineFriendUrl: z.string().nullable(),
  viewer: ApplyViewer,
});

/** 申込みページの型。 */
export type ApplyPage = z.infer<typeof ApplyPage>;

/** 申し込んだ答え。 */
export const ApplyResult = z.object({ entry: MyEntry, page: ApplyPage });

/** 申し込んだ答えの型。 */
export type ApplyResult = z.infer<typeof ApplyResult>;

/** 札のページ（メールで申し込んだ人。research R10）。 */
export const EntryTokenView = z.object({
  /** 確認の前か、申込みがあるか */
  state: z.enum(["pending", "entry"]),
  event: ApplyEvent,
  hostName: z.string(),
  /** 入れた名前（札を知る本人だけが読む） */
  name: z.string(),
  /** 申込み（state が entry のとき） */
  entry: z.object({ status: EntryStatusSchema, cancellable: z.boolean() }).nullable(),
  /** 確認の前なら、確定できるか（受付中か） */
  confirmable: z.boolean(),
  calendar: CalendarLinks,
});

/** 札のページの型。 */
export type EntryTokenView = z.infer<typeof EntryTokenView>;

/** 一覧に出す交流会。 */
const ListedEvent = z.object({
  id: z.guid(),
  name: z.string(),
  startsAt: isoDateTime,
  venue: z.string().nullable(),
});

/** 自分の申込みの一覧の1行（research R19）。 */
export const MyEntryItem = z.object({
  entryId: z.guid(),
  status: EntryStatusSchema,
  cancellable: z.boolean(),
  event: ListedEvent,
  hostName: z.string(),
  googleCalendarUrl: z.string(),
});

/** 自分の申込みの一覧の1行の型。 */
export type MyEntryItem = z.infer<typeof MyEntryItem>;

/** 自分の申込みの一覧。 */
export const MyEntryList = z.object({ entries: z.array(MyEntryItem) });

/** 自分の申込みの一覧の型。 */
export type MyEntryList = z.infer<typeof MyEntryList>;

/** 部の予定の1行（research R9）。 */
export const ScheduleItem = z.object({
  event: ListedEvent,
  hostName: z.string(),
  state: PageStateSchema,
  visibility: VisibilitySchema,
  /** 自分の申込みの状態（なければ null） */
  myStatus: EntryStatusSchema.nullable(),
});

/** 部の予定の1行の型。 */
export type ScheduleItem = z.infer<typeof ScheduleItem>;

/** 部の予定。 */
export const MySchedule = z.object({ events: z.array(ScheduleItem) });

/** 部の予定の型。 */
export type MySchedule = z.infer<typeof MySchedule>;

/** 案内の同意の一覧（本人だけ）。 */
export const ConsentList = z.object({
  consents: z.array(
    z.object({
      id: z.guid(),
      /** 相手の名前（組織の名前か持ち主の表示名） */
      holderName: z.string(),
      holderKind: z.enum(["organization", "personal"]),
    }),
  ),
});

/** 案内の同意の一覧の型。 */
export type ConsentList = z.infer<typeof ConsentList>;
