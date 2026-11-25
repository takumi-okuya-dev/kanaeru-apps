// 受付（reception）の窓口の入出力の形（API の入力の確かめ・OpenAPI の文書・画面の入力の確かめが、同じ形を使う）。
// ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。入力の誤りの文は、欄のそばにそのまま出せる日本語にする。
// 日時は時差つきの ISO 8601 だけ。金額は円の整数（Consistency Conventions）。
import { z } from "zod";
import {
  APPLICATION_SOURCES,
  CHECKIN_METHODS,
  CHECKIN_QUESTION_LABELS,
  PAYMENT_METHODS,
  REFERRALS,
} from "./options.ts";

/** 名前の文字数の上限（account の表示名と同じ。research R9）。 */
export const CHECKIN_NAME_MAX = 50;

/** 紹介者の名前の文字数の上限（チェックインの名前と同じ。reception-002）。 */
export const REFERRER_NAME_MAX = 50;

/** 申し込みの媒体の形。 */
export const ApplicationSourceSchema = z.enum(APPLICATION_SOURCES, {
  error: `${CHECKIN_QUESTION_LABELS.applicationSource}を選んでください。`,
});

/** 知ったきっかけの形。 */
export const ReferralSchema = z.enum(REFERRALS, {
  error: `${CHECKIN_QUESTION_LABELS.referral}を選んでください。`,
});

/** 支払い方法の形。 */
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS, {
  error: `${CHECKIN_QUESTION_LABELS.paymentMethod}を選んでください。`,
});

/**
 * チェックインの入力（自分でのチェックイン・手でのチェックイン・直すで同じ。知らない欄は誤り）。
 * 金額は送らない（API が支払い方法・参加費・割引から決める。AD-6・reception-002）。
 * 割引（discountId）は送らないか null なら割引なし。紹介者の名前（referrerName）は任意で、割引を選んだときだけ記録する。
 * 直すとき referrerName を送らなければ、割引が同じなら前の名前を残す（受付係は前の名前を読めないため。research R7）。
 * null か空の文字なら消す。
 */
export const CheckinInput = z.strictObject({
  name: z
    .string({ error: "名前を入れてください。" })
    .trim()
    .min(1, { error: "名前を入れてください。" })
    .max(CHECKIN_NAME_MAX, { error: `名前は${CHECKIN_NAME_MAX}文字までにしてください。` }),
  applicationSource: ApplicationSourceSchema,
  referral: ReferralSchema,
  paymentMethod: PaymentMethodSchema,
  discountId: z
    .guid({ error: `${CHECKIN_QUESTION_LABELS.discount}を選び直してください。` })
    .nullable()
    .optional(),
  referrerName: z
    .string({ error: `${CHECKIN_QUESTION_LABELS.referrerName}は文字で入れてください。` })
    .trim()
    .max(REFERRER_NAME_MAX, {
      error: `${CHECKIN_QUESTION_LABELS.referrerName}は${REFERRER_NAME_MAX}文字までにしてください。`,
    })
    .nullable()
    .optional(),
});

/** チェックインの入力の型（確かめたあと）。 */
export type CheckinInput = z.infer<typeof CheckinInput>;

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/** 自分のチェックイン（参加者が読む形）。 */
export const MyCheckin = z.object({
  /** チェックインの ID */
  id: z.guid(),
  /** 名前（チェックインのときに写したもの） */
  name: z.string(),
  /** 申し込みの媒体 */
  applicationSource: ApplicationSourceSchema,
  /** 知ったきっかけ */
  referral: ReferralSchema,
  /** 支払い方法 */
  paymentMethod: PaymentMethodSchema,
  /** 金額（円の整数。チェックインのときと、支払い方法か割引を直したときに決めたもの） */
  amount: z.number().int(),
  /** 選んだ割引の ID（割引なしは null。reception-002） */
  discountId: z.guid().nullable(),
  /** 選んだときの割引の名前の写し（割引なしは null） */
  discountName: z.string().nullable(),
  /** 選んだときの割引の額の写し（円の整数。割引なしは null） */
  discountAmount: z.number().int().nullable(),
  /** チェックインの時刻 */
  checkedInAt: isoDateTime,
});

/** 自分のチェックインの型。 */
export type MyCheckin = z.infer<typeof MyCheckin>;

/** チェックインの画面が読む、自分のチェックインと初期値。 */
export const MyCheckinState = z.object({
  /** その交流会の自分のチェックイン（まだなら null） */
  checkin: MyCheckin.nullable(),
  /** 欄の初期値（AD-6・決定 A4） */
  prefill: z.object({
    /** 名前（前回のチェックインの名前。なければ LINE の表示名） */
    name: z.string(),
    /** 知ったきっかけ（前回の答え。なければ null） */
    referral: ReferralSchema.nullable(),
  }),
});

/** チェックインの画面が読む形の型。 */
export type MyCheckinState = z.infer<typeof MyCheckinState>;

/** 自分でチェックインした結果（すでにあれば、記録を増やさずにそれを返す。research R3）。 */
export const MyCheckinResult = z.object({
  /** チェックイン */
  checkin: MyCheckin,
  /** 前からチェックイン済みだったか */
  alreadyCheckedIn: z.boolean(),
});

/** 自分でチェックインした結果の型。 */
export type MyCheckinResult = z.infer<typeof MyCheckinResult>;

/** 一覧画面の行（主催者と受付係が読む形）。 */
export const CheckinView = MyCheckin.extend({
  /** 入れ方（LINE ログイン・手） */
  method: z.enum(CHECKIN_METHODS),
  /** LINE のときの account の ID（手なら null。参加者のデータを消すときに使う） */
  accountId: z.guid().nullable(),
  /** 手で入れた人の表示名（LINE・入れた人のアカウントが消えたときは null） */
  enteredByName: z.string().nullable(),
  /** 同じ名前の手でのチェックインがあるか（research R4） */
  sameName: z.boolean(),
  /** 紹介者の名前（主催者のときだけ値。受付係・なければ null。reception-002 research R7） */
  referrerName: z.string().nullable(),
});

/** 一覧画面の行の型。 */
export type CheckinView = z.infer<typeof CheckinView>;

/** 一覧画面のチェックイン（新しい順）。 */
export const CheckinList = z.object({ checkins: z.array(CheckinView) });

/** 一覧画面のチェックインの型。 */
export type CheckinList = z.infer<typeof CheckinList>;

/** 人数と金額。 */
const CountAndAmount = z.object({
  /** 人数 */
  count: z.number().int(),
  /** 金額（円の整数） */
  amount: z.number().int(),
});

/** 支払い方法ごとの合計（FR-12）。 */
export const CheckinTotals = z.object({
  /** 支払い方法ごと（PayPay・現金・無料の順。0人も出す） */
  byPaymentMethod: z.array(CountAndAmount.extend({ paymentMethod: PaymentMethodSchema })),
  /** 全体 */
  total: CountAndAmount,
});

/** 支払い方法ごとの合計の型。 */
export type CheckinTotals = z.infer<typeof CheckinTotals>;

/** 申し込みの媒体と知ったきっかけの内訳（FR-13。主催者だけ）。 */
export const CheckinBreakdown = z.object({
  /** 申し込みの媒体ごとの人数（選択肢の順。0人も出す） */
  applicationSource: z.array(z.object({ value: ApplicationSourceSchema, count: z.number().int() })),
  /** 知ったきっかけごとの人数（選択肢の順。0人も出す） */
  referral: z.array(z.object({ value: ReferralSchema, count: z.number().int() })),
  /** チェックインの数 */
  total: z.number().int(),
  /**
   * 割引ごとの人数と割引の額の合計（使っている割引と使われた割引を作った順・最後に割引なし。reception-002 research R8）。
   * 割引の額の合計は、無料でないチェックインの写した割引の額の和
   */
  discounts: z.array(
    z.object({
      /** 割引の ID（割引なしは null） */
      discountId: z.guid().nullable(),
      /** 割引の今の名前（割引なしは null） */
      name: z.string().nullable(),
      /** 使っているか（使うのをやめた割引は false。割引なしは true） */
      active: z.boolean(),
      /** 人数 */
      count: z.number().int(),
      /** 割引の額の合計（円の整数） */
      discountTotal: z.number().int(),
    }),
  ),
  /** 紹介者ごとの人数（そろえた名前で数え、多い順） */
  referrers: z.array(z.object({ name: z.string(), count: z.number().int() })),
});

/** 内訳の型。 */
export type CheckinBreakdown = z.infer<typeof CheckinBreakdown>;
