// 受付の値の見せ方（選択肢の言葉・チェックインの時刻・人数）。選択肢の言葉は約束（@workspace/contracts/reception）の1か所から読む。
// 時刻はいつも日本時間で見せ、端末の時刻帯に頼らない。
import {
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  REFERRALS,
  REFERRAL_LABELS,
} from "@workspace/contracts/reception";
import type { ApplicationSource, PaymentMethod, Referral } from "@workspace/contracts/reception";
import type { ChoiceOption } from "@workspace/ui/components/choice-chips";

/** 申し込みの媒体のチップ。 */
export const APPLICATION_SOURCE_OPTIONS: readonly ChoiceOption<ApplicationSource>[] =
  APPLICATION_SOURCES.map((value) => ({ value, label: APPLICATION_SOURCE_LABELS[value] }));

/** 知ったきっかけのチップ。 */
export const REFERRAL_OPTIONS: readonly ChoiceOption<Referral>[] = REFERRALS.map((value) => ({
  value,
  label: REFERRAL_LABELS[value],
}));

/** 支払い方法のチップ。 */
export const PAYMENT_METHOD_OPTIONS: readonly ChoiceOption<PaymentMethod>[] = PAYMENT_METHODS.map(
  (value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }),
);

/** 日本時間の時刻の部品を取り出す道具。 */
const JST_TIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * チェックインの時刻（日本時間の HH:mm）。
 * @param iso 時差つきの ISO 8601
 * @returns 時刻の文字
 */
export function formatCheckinTime(iso: string): string {
  return JST_TIME.format(new Date(iso));
}

/**
 * 人数（例：3人）。
 * @param count 人数
 * @returns 人数の文字
 */
export function formatCount(count: number): string {
  return `${count.toLocaleString("ja-JP")}人`;
}
