// 交流会（event）の窓口の入出力の形（API の入力の確かめ・OpenAPI の文書・画面の入力の確かめが、同じ形を使う）。
// ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。入力の誤りの文は、欄のそばにそのまま出せる日本語にする。
// 日時は時差つきの ISO 8601 だけ（Consistency Conventions）。金額は円の整数。
import { z } from "zod";
import { EVENT_ROLES } from "./roles.ts";

/** 交流会の名前の文字数の上限。 */
export const EVENT_NAME_MAX = 100;

/** 会場の文字数の上限。 */
export const EVENT_VENUE_MAX = 200;

/** 参加費の上限（円）。 */
export const EVENT_FEE_MAX = 1_000_000;

/** URL の文字数の上限。 */
export const EVENT_URL_MAX = 2000;

/** 割引の名前の文字数の上限（チップに「紹介割（−1,000円）」と出すので短く。reception-002 research R3）。 */
export const EVENT_DISCOUNT_NAME_MAX = 30;

/** 1つの交流会に置ける割引の数の上限。 */
export const EVENT_DISCOUNTS_MAX = 10;

/**
 * https の URL か（参加者の画面のリンクに javascript: などを入れさせない）。
 * @param value 文字
 * @returns https で、宛先があれば true
 */
function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * 任意の https の URL の欄（空の文字と null は「なし」。API が null にそろえる）。
 * @param label 欄の名前（誤りの文に入れる）
 * @returns zod の形
 */
function optionalHttpsUrl(label: string) {
  return z
    .string({ error: `${label}は文字で入れてください。` })
    .trim()
    .max(EVENT_URL_MAX, { error: `${label}は${EVENT_URL_MAX}文字までにしてください。` })
    .refine((value) => value === "" || isHttpsUrl(value), {
      error: `${label}は https:// で始まる URL を入れてください。`,
    })
    .nullable()
    .optional();
}

/**
 * 割引の1行の入力（reception-002）。id があればその割引を直し、なければ足す。
 * 額は円の整数（1円以上）。紹介者の名前を聞くかは、送らなければ聞かない。
 */
export const EventDiscountInput = z.strictObject({
  id: z.guid({ error: "割引の ID の形が違います。" }).nullable().optional(),
  name: z
    .string({ error: "割引の名前を入れてください。" })
    .trim()
    .min(1, { error: "割引の名前を入れてください。" })
    .max(EVENT_DISCOUNT_NAME_MAX, {
      error: `割引の名前は${EVENT_DISCOUNT_NAME_MAX}文字までにしてください。`,
    }),
  amount: z
    .number({ error: "割引の額を数字で入れてください。" })
    .int({ error: "割引の額は円の整数で入れてください。" })
    .min(1, { error: "割引の額は1円以上にしてください。" })
    .max(EVENT_FEE_MAX, { error: "割引の額は1,000,000円までにしてください。" }),
  asksReferrer: z.boolean({ error: "紹介者の名前を聞くかを送ってください。" }).optional(),
});

/** 割引の1行の入力の型（確かめたあと）。 */
export type EventDiscountInput = z.infer<typeof EventDiscountInput>;

/**
 * 割引の並び（10まで・同じ名前を重ねない。重なりは2つ目の名前の欄の誤りにする）。
 * 送った並びが、その交流会で使う割引のすべて（並びにない割引は使うのをやめる。reception-002 research R2）。
 */
export const EventDiscountsInput = z
  .array(EventDiscountInput, { error: "割引の並びを送ってください。" })
  .max(EVENT_DISCOUNTS_MAX, { error: `割引は${EVENT_DISCOUNTS_MAX}個までにしてください。` })
  .superRefine((discounts, ctx) => {
    const seen = new Set<string>();
    discounts.forEach((discount, index) => {
      if (seen.has(discount.name)) {
        ctx.addIssue({
          code: "custom",
          message: "同じ名前の割引があります。別の名前にしてください。",
          path: [index, "name"],
        });
      }
      seen.add(discount.name);
    });
  });

/** 交流会を作る・直すときの入力（知らない欄は誤り）。アンケートの開閉は別の窓口。 */
export const EventInput = z.strictObject({
  name: z
    .string({ error: "交流会の名前を入れてください。" })
    .trim()
    .min(1, { error: "交流会の名前を入れてください。" })
    .max(EVENT_NAME_MAX, { error: `交流会の名前は${EVENT_NAME_MAX}文字までにしてください。` }),
  startsAt: z.iso.datetime({ offset: true, error: "日時を入れてください。" }),
  venue: z
    .string({ error: "会場を入れてください。" })
    .trim()
    .min(1, { error: "会場を入れてください。" })
    .max(EVENT_VENUE_MAX, { error: `会場は${EVENT_VENUE_MAX}文字までにしてください。` }),
  fee: z
    .number({ error: "参加費を数字で入れてください。" })
    .int({ error: "参加費は円の整数で入れてください。" })
    .min(0, { error: "参加費は0円以上にしてください。" })
    .max(EVENT_FEE_MAX, { error: "参加費は1,000,000円までにしてください。" }),
  googleFormUrl: optionalHttpsUrl("GoogleフォームのURL"),
  lineGroupUrl: optionalHttpsUrl("LINEグループの招待リンク"),
  /** 割引（任意。送らなければ割引は変えない。reception-002） */
  discounts: EventDiscountsInput.optional(),
});

/** 交流会を作る・直すときの入力の型（確かめたあと）。 */
export type EventInput = z.infer<typeof EventInput>;

/** 交流会ごとの役目（主催者・受付係）。 */
export const EventRoleSchema = z.enum(EVENT_ROLES);

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/** 使っている割引（交流会・要約に出す。作った順。参加者に見せてよい欄だけ）。 */
export const EventDiscountView = z.object({
  /** 割引の ID */
  id: z.guid(),
  /** 名前 */
  name: z.string(),
  /** 額（円の整数） */
  amount: z.number().int(),
  /** 紹介者の名前を聞くか */
  asksReferrer: z.boolean(),
});

/** 使っている割引の型。 */
export type EventDiscountView = z.infer<typeof EventDiscountView>;

/** 交流会の持ち主（表示名は account から引いたもの。event-002）。 */
export const EventOwnerView = z.object({
  /** account の ID */
  accountId: z.guid(),
  /** 表示名（LINE の名前） */
  displayName: z.string(),
});

/** 交流会の持ち主の型。 */
export type EventOwnerView = z.infer<typeof EventOwnerView>;

/** 交流会を入れた組織・選べる組織（event-002）。 */
export const EventOrganizationView = z.object({
  /** 組織の ID */
  id: z.guid(),
  /** 組織の名前 */
  name: z.string(),
});

/** 組織の型。 */
export type EventOrganizationView = z.infer<typeof EventOrganizationView>;

/** 交流会（主催者と受付係が読む形。自分の役目つき）。 */
export const EventView = z.object({
  /** 交流会の ID */
  id: z.guid(),
  /** 名前 */
  name: z.string(),
  /** 始まりの日時 */
  startsAt: isoDateTime,
  /** 会場 */
  venue: z.string(),
  /** 参加費（円の整数） */
  fee: z.number().int(),
  /** GoogleフォームのURL（なければ null） */
  googleFormUrl: z.string().nullable(),
  /** LINEグループの招待リンク（なければ null） */
  lineGroupUrl: z.string().nullable(),
  /** アンケートが開いているか */
  surveyOpen: z.boolean(),
  /** 使っている割引（作った順。reception-002） */
  discounts: z.array(EventDiscountView),
  /** 作った時刻 */
  createdAt: isoDateTime,
  /** 直した時刻 */
  updatedAt: isoDateTime,
  /** 今の利用者の、この交流会での役目 */
  myRole: EventRoleSchema,
  /** 持ち主（持ち主のない今の交流会は null。event-002） */
  owner: EventOwnerView.nullable(),
  /** 入れた組織（入れていなければ null） */
  organization: EventOrganizationView.nullable(),
  /** 今の利用者が持ち主か */
  isOwner: z.boolean(),
});

/** 交流会の型。 */
export type EventView = z.infer<typeof EventView>;

/** 交流会の一覧（日時の新しい順）。 */
export const EventList = z.object({ events: z.array(EventView) });

/** 交流会の一覧の型。 */
export type EventList = z.infer<typeof EventList>;

/**
 * 交流会の要約（ログインしていれば誰でも読める。AD-5）。参加者の画面・survey・reception が読む。
 * 受付係・招待・作った時刻などは含めない。招待のリンクを絞る交流会（予約の「部員だけ」の回）では、交流会の役目のない人に
 * googleFormUrl・lineGroupUrl を null で返す。
 */
export const EventSummary = z.object({
  /** 交流会の ID */
  id: z.guid(),
  /** 名前 */
  name: z.string(),
  /** 始まりの日時 */
  startsAt: isoDateTime,
  /** 会場 */
  venue: z.string(),
  /** 参加費（円の整数） */
  fee: z.number().int(),
  /** アンケートが開いているか */
  surveyOpen: z.boolean(),
  /** GoogleフォームのURL（なければ null。FR-10・A20） */
  googleFormUrl: z.string().nullable(),
  /** LINEグループの招待リンク（なければ null。FR-22・A21） */
  lineGroupUrl: z.string().nullable(),
  /** コミュニティのオープンチャットの URL（設定 OPEN_CHAT_URL。なければ null。FR-17・A22） */
  openChatUrl: z.string().nullable(),
  /** 使っている割引（作った順。チェックインの画面のチップ。reception-002） */
  discounts: z.array(EventDiscountView),
});

/** 交流会の要約の型。 */
export type EventSummary = z.infer<typeof EventSummary>;

/** アンケートを開く・閉じるの入力。 */
export const SurveyStateInput = z.strictObject({
  open: z.boolean({ error: "開くか閉じるかを送ってください。" }),
});

/** アンケートを開く・閉じるの入力の型。 */
export type SurveyStateInput = z.infer<typeof SurveyStateInput>;

/** アンケートの開閉の今の状態。 */
export const SurveyState = z.object({ surveyOpen: z.boolean() });

/** アンケートの開閉の今の状態の型。 */
export type SurveyState = z.infer<typeof SurveyState>;

/** 交流会の持ち主と組織の状態（準備の画面の「持ち主と組織」。event-002）。 */
export const EventOrganizationState = z.object({
  /** 持ち主（持ち主のない今の交流会は null） */
  owner: EventOwnerView.nullable(),
  /** 入れた組織（入れていなければ null） */
  organization: EventOrganizationView.nullable(),
  /** 今の利用者が持ち主か（組織に入れる・外すのは持ち主だけ） */
  isOwner: z.boolean(),
  /** 選べる組織（持ち主が入っている組織を入った順。持ち主でなければ空） */
  options: z.array(EventOrganizationView),
});

/** 交流会の持ち主と組織の状態の型。 */
export type EventOrganizationState = z.infer<typeof EventOrganizationState>;

/** 交流会を組織に入れる・外すの入力（null で外す）。 */
export const EventOrganizationInput = z.strictObject({
  organizationId: z.guid({ error: "組織を選んでください。" }).nullable(),
});

/** 交流会を組織に入れる・外すの入力の型。 */
export type EventOrganizationInput = z.infer<typeof EventOrganizationInput>;

/** 招待の印の形（32 バイトの base64url。形が違えば DB を引かない）。 */
export const STAFF_INVITE_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** 招待のリンク（主催者が読む）。 */
export const StaffInviteView = z.object({
  /** 招待の印（リンクに入れる） */
  token: z.string(),
  /** 作った時刻（作り直すと替わる） */
  createdAt: isoDateTime,
  /** 使える期限（今の交流会の日時の、日本時間の日付の終わり。含まない） */
  expiresAt: isoDateTime,
});

/** 招待のリンクの型。 */
export type StaffInviteView = z.infer<typeof StaffInviteView>;

/** 交流会の今の招待のリンク（まだなければ null）。 */
export const StaffInviteState = z.object({ invite: StaffInviteView.nullable() });

/** 交流会の今の招待のリンクの型。 */
export type StaffInviteState = z.infer<typeof StaffInviteState>;

/** 招待の中身（受ける前に、招待のリンクを開いた人が読む）。 */
export const InvitePreview = z.object({
  /** 交流会の ID */
  eventId: z.guid(),
  /** 交流会の名前 */
  eventName: z.string(),
  /** 交流会の始まりの日時 */
  startsAt: isoDateTime,
  /** 使える期限 */
  expiresAt: isoDateTime,
  /** 期限を過ぎたか */
  expired: z.boolean(),
  /** 今の利用者の、受ける前の役目（どちらでもなければ null） */
  myRole: EventRoleSchema.nullable(),
});

/** 招待の中身の型。 */
export type InvitePreview = z.infer<typeof InvitePreview>;

/** 招待を受けた結果。 */
export const InviteAccepted = z.object({
  /** 交流会の ID */
  eventId: z.guid(),
  /** 受けたあとの役目 */
  role: EventRoleSchema,
});

/** 招待を受けた結果の型。 */
export type InviteAccepted = z.infer<typeof InviteAccepted>;

/** 受付係の1人。 */
export const StaffMember = z.object({
  /** account の ID */
  accountId: z.guid(),
  /** 表示名（LINE の名前） */
  displayName: z.string(),
  /** 受付係になった時刻 */
  addedAt: isoDateTime,
});

/** 受付係の1人の型。 */
export type StaffMember = z.infer<typeof StaffMember>;

/** 受付係の一覧（受付係になった順）。 */
export const StaffList = z.object({ staff: z.array(StaffMember) });

/** 受付係の一覧の型。 */
export type StaffList = z.infer<typeof StaffList>;
