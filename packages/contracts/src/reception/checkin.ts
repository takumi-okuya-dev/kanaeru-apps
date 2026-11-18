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
 * 金額は送らない（API が支払い方法と参加費から決める。AD-6）。
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
  /** 金額（円の整数。チェックインのときと支払い方法を直したときに決めたもの） */
  amount: z.number().int(),
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
});

/** 内訳の型。 */
export type CheckinBreakdown = z.infer<typeof CheckinBreakdown>;
