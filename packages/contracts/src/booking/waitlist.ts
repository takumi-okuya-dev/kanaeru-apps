// 定員・媒体の枠・キャンセル待ち・打診の窓口の入出力の形と値（booking-004 contracts）。ふつうの zod で書く（OpenAPI の名前は
// API の側で付ける）。入力の誤りの文は、欄のそばにそのまま出せる日本語。日時は時差つきの ISO 8601 だけ。
// 受付の約束（reception）を読まない（読むと画面の束の分け方が変わり、zod の設定より先に形が作られる。booking-003 R23）。
// 参加者に返す形には、ほかの人の名前を入れない（自分の何番目かと人数だけ。research S13）。
import { z } from "zod";
import { NOTICE_KINDS, NOTICE_METHODS, NOTICE_RESULTS } from "./notify-options.ts";
import { QUOTA_SOURCES } from "./options.ts";

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/** 定員と枠の席の数の上限（research R1）。 */
export const CAPACITY_MAX = 1000;

/** 媒体の枠の数の上限（直接を除く媒体の数）。 */
export const QUOTAS_MAX = QUOTA_SOURCES.length;

/** 媒体の管理ページの URL の文字数の上限。 */
export const QUOTA_MANAGE_URL_MAX = 500;

/** 打診の返事の期限（打診からの時間。research R6）。 */
export const OFFER_TTL_HOURS = 24;

/** 夜の終わり（日本時間の時。0時より後・この時より前に切れる期限は、この時に動かす。research R6）。 */
export const OFFER_MORNING_HOUR = 9;

/** 期限は始まりのこの時間前まで（research R6）。 */
export const OFFER_START_MARGIN_HOURS = 2;

/** 期限がこの時間取れなければ打診しない（当日の空き。research R7）。 */
export const OFFER_MIN_HOURS = 1;

/** 日時や場所の変更に気づいてから、定期の仕事が知らせるまでの時間（分。research R10）。 */
export const CHANGE_NOTICE_DELAY_MINUTES = 30;

/** 送った知らせの一覧の上限（research R13）。 */
export const NOTICE_LOG_MAX = 200;

/**
 * 席の数の形。
 * @param label 欄の名前
 * @returns 形
 */
function seatCount(label: string) {
  return z
    .number({ error: `${label}は数で入れてください。` })
    .int({ error: `${label}は整数で入れてください。` })
    .min(1, { error: `${label}は1以上にしてください。` })
    .max(CAPACITY_MAX, { error: `${label}は${CAPACITY_MAX}までにしてください。` });
}

/** 枠の媒体の形。 */
export const QuotaSourceSchema = z.enum(QUOTA_SOURCES, {
  error: "枠を置ける媒体を選んでください（直接には置けません）。",
});

/** 媒体の管理ページの URL の形（http か https で始まる・500文字まで）。 */
const ManageUrl = z
  .string({ error: "URL は文字で入れてください。" })
  .trim()
  .max(QUOTA_MANAGE_URL_MAX, { error: `URL は${QUOTA_MANAGE_URL_MAX}文字までにしてください。` })
  .regex(/^https?:\/\/\S+$/, { error: "URL は http:// か https:// で始めてください。" });

/** 媒体の枠の1行（入力）。 */
export const QuotaInput = z.strictObject({
  applicationSource: QuotaSourceSchema,
  seats: seatCount("枠の席の数"),
  /** 媒体の管理ページの URL（なければ null） */
  manageUrl: ManageUrl.nullable(),
});

/** 媒体の枠の1行の型。 */
export type QuotaInput = z.infer<typeof QuotaInput>;

/** 定員と枠を変える入力（丸ごと置きかえる。research R1）。 */
export const CapacityInput = z
  .strictObject({
    /** 定員（null＝定員なし） */
    capacity: seatCount("定員").nullable(),
    quotas: z
      .array(QuotaInput)
      .max(QUOTAS_MAX, { error: `枠は${QUOTAS_MAX}つまでにしてください。` }),
  })
  .superRefine((value, context) => {
    const sources = value.quotas.map((quota) => quota.applicationSource);
    if (new Set(sources).size !== sources.length) {
      context.addIssue({
        code: "custom",
        path: ["quotas"],
        message: "同じ媒体の枠が2つあります。1つにしてください。",
      });
    }
    const total = value.quotas.reduce((sum, quota) => sum + quota.seats, 0);
    if (value.capacity === null && value.quotas.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["capacity"],
        message: "枠を置くときは、定員を入れてください。",
      });
    } else if (value.capacity !== null && total > value.capacity) {
      context.addIssue({
        code: "custom",
        path: ["quotas"],
        message: `枠の合計（${total}席）が定員を超えています。定員までにしてください。`,
      });
    }
  });

/** 定員と枠を変える入力の型。 */
export type CapacityInput = z.infer<typeof CapacityInput>;

/** 媒体の枠（答え）。 */
export const QuotaView = z.object({
  applicationSource: QuotaSourceSchema,
  seats: z.number().int(),
  manageUrl: z.string().nullable(),
});

/** 媒体の枠（答え）の型。 */
export type QuotaView = z.infer<typeof QuotaView>;

/** 席の内訳（主催者・受付係。research R3）。 */
export const SeatSummary = z.object({
  capacity: z.number().int(),
  /** 埋まった席（確定＋打診中） */
  filled: z.number().int(),
  confirmed: z.number().int(),
  offered: z.number().int(),
  waitlisted: z.number().int(),
  /** 自前のページの残り（負なら0） */
  selfRemaining: z.number().int(),
  /** 定員を超えた人数 */
  over: z.number().int(),
  /** 埋まった席が定員に届いたか */
  full: z.boolean(),
  /** 一度満員になって、枠を押さえるのをやめたか */
  quotasReleased: z.boolean(),
  /** 当日の空き（打診の期限が1時間取れず、先着にしている） */
  sameDay: z.boolean(),
  quotas: z.array(
    z.object({
      applicationSource: QuotaSourceSchema,
      seats: z.number().int(),
      filled: z.number().int(),
      remaining: z.number().int(),
      manageUrl: z.string().nullable(),
    }),
  ),
  /** 満員のとき、受付を止める媒体 */
  stopSources: z.array(
    z.object({ applicationSource: QuotaSourceSchema, manageUrl: z.string().nullable() }),
  ),
});

/** 席の内訳の型。 */
export type SeatSummary = z.infer<typeof SeatSummary>;

/** 日時や場所の変更（最後に知らせたものと今が違うとき。research R10）。 */
export const ScheduleChange = z.object({
  previousStartsAt: isoDateTime,
  previousVenue: z.string().nullable(),
  startsAt: isoDateTime,
  venue: z.string().nullable(),
  /** 定期の仕事が知らせる予定の時刻（気づいていれば） */
  autoNoticeAt: isoDateTime.nullable(),
});

/** 日時や場所の変更の型。 */
export type ScheduleChange = z.infer<typeof ScheduleChange>;

/** 変更を知らせるか（主催者。research R10）。 */
export const ChangeNoticeInput = z.strictObject({
  notify: z.boolean({ error: "知らせるかを選んでください。" }),
});

/** 変更を知らせるかの型。 */
export type ChangeNoticeInput = z.infer<typeof ChangeNoticeInput>;

/** 打診への返事（research R8）。 */
export const OfferAnswerInput = z.strictObject({
  answer: z.enum(["accept", "decline"], { error: "参加するか辞退するかを選んでください。" }),
});

/** 打診への返事の型。 */
export type OfferAnswerInput = z.infer<typeof OfferAnswerInput>;

/** 送った知らせの一覧（種類・手段・結果・時刻だけ。research R13）。 */
export const NoticeLog = z.object({
  notices: z.array(
    z.object({
      kind: z.enum(NOTICE_KINDS),
      method: z.enum(NOTICE_METHODS),
      result: z.enum(NOTICE_RESULTS),
      createdAt: isoDateTime,
    }),
  ),
});

/** 送った知らせの一覧の型。 */
export type NoticeLog = z.infer<typeof NoticeLog>;

/** 定期の仕事の答え（数だけ。research R9）。 */
export const WaitlistJobSummary = z.object({
  events: z.number().int(),
  expired: z.number().int(),
  offered: z.number().int(),
  sameDay: z.number().int(),
  changed: z.number().int(),
});

/** 定期の仕事の答えの型。 */
export type WaitlistJobSummary = z.infer<typeof WaitlistJobSummary>;

/** 申込みページの席の欄（定員があるとき。参加者に見せてよい数だけ）。 */
export const PageSeats = z.object({
  capacity: z.number().int(),
  /** 新しく申し込む人の残り（キャンセル待ちがいて当日の空きでなければ0） */
  remaining: z.number().int(),
  /** キャンセル待ちの人数 */
  waitlist: z.number().int(),
  /** 当日の空き（先着） */
  sameDay: z.boolean(),
});

/** 申込みページの席の欄の型。 */
export type PageSeats = z.infer<typeof PageSeats>;

/** 本人の申込みの並びと打診（自分の申込み・完了の画面・札のページ）。 */
export const EntryStanding = z.object({
  /** キャンセル待ちの何番目か（並んでいなければ null） */
  waitlistPosition: z.number().int().nullable(),
  /** 打診の返事の期限（打診中のとき） */
  offerDeadline: isoDateTime.nullable(),
  /** 打診の期限が過ぎたか（定期の仕事がまだ片付けていないとき） */
  offerExpired: z.boolean(),
  /** 「参加する」を押せるか（打診中で期限の前、か、キャンセル待ちで当日の空きがある） */
  canAccept: z.boolean(),
});

/** 本人の申込みの並びと打診の型。 */
export type EntryStanding = z.infer<typeof EntryStanding>;
