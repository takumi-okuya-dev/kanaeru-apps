// チェックインの入力の欄の値と確かめ（P1・手でのチェックイン・直す枠で同じ。EXPERIENCE.md の入力の誤り）。
// 約束（CheckinInput）で確かめ、欄の名前ごとの誤りの文にする。送ったときは最初の誤りの欄・設問へフォーカスを移す。
// 割引（reception-002）：discountId が null なら割引なし。紹介者の名前は割引を選んだときだけ送る。空のときは、
// 受付係が直す枠では送らない（前の名前を残す。research R7）、ほかでは null を送る（主催者が空にすると消える）。
import { CheckinInput } from "@workspace/contracts/reception";
import type { ApplicationSource, PaymentMethod, Referral } from "@workspace/contracts/reception";
import { focusChoiceGroup } from "@workspace/ui/components/choice-chips";
import { fieldErrorsFromIssues } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";

/** 入力の欄の値（まだ選んでいない設問は null）。 */
export type CheckinFormValues = {
  /** 名前 */
  name: string;
  /** 申し込みの媒体 */
  applicationSource: ApplicationSource | null;
  /** 知ったきっかけ */
  referral: Referral | null;
  /** 支払い方法 */
  paymentMethod: PaymentMethod | null;
  /** 割引の ID（割引なしは null。reception-002） */
  discountId: string | null;
  /** 紹介者の名前（任意） */
  referrerName: string;
};

/** 空の欄の値。 */
export const EMPTY_CHECKIN_FORM: CheckinFormValues = {
  name: "",
  applicationSource: null,
  referral: null,
  paymentMethod: null,
  discountId: null,
  referrerName: "",
};

/** 確かめた結果。 */
export type CheckinFormResult =
  { ok: true; input: CheckinInput } | { ok: false; errors: FieldErrors };

/** 確かめ方の選び。 */
export type CheckinFormOptions = {
  /** 紹介者の名前が空なら送らない（受付係が直す枠。前の名前を残す） */
  omitEmptyReferrer?: boolean;
};

/**
 * 送る紹介者の名前を決める（割引なしなら送らない・空なら null か送らない）。
 * @param values 欄の値
 * @param options 確かめ方の選び
 * @returns 送る値（undefined なら送らない）
 */
function referrerToSend(
  values: CheckinFormValues,
  options: CheckinFormOptions,
): string | null | undefined {
  if (values.discountId === null) return undefined;
  if (values.referrerName.trim() !== "") return values.referrerName;
  return options.omitEmptyReferrer ? undefined : null;
}

/**
 * 欄の値を約束で確かめる。
 * @param values 欄の値
 * @param options 確かめ方の選び（既定は、紹介者が空なら null を送る）
 * @returns 送る入力か、欄の名前ごとの誤り
 */
export function validateCheckinForm(
  values: CheckinFormValues,
  options: CheckinFormOptions = {},
): CheckinFormResult {
  const referrerName = referrerToSend(values, options);
  const parsed = CheckinInput.safeParse({
    name: values.name,
    applicationSource: values.applicationSource ?? undefined,
    referral: values.referral ?? undefined,
    paymentMethod: values.paymentMethod ?? undefined,
    discountId: values.discountId,
    ...(referrerName === undefined ? {} : { referrerName }),
  });
  return parsed.success
    ? { ok: true, input: parsed.data }
    : { ok: false, errors: fieldErrorsFromIssues(parsed.error.issues) };
}

/**
 * フォームの中で、最初に誤りのある欄か設問（aria-invalid）にフォーカスを移す。描き直したあとに呼ぶ。
 * 設問（チップのまとまり）なら、選んだチップか最初のチップに移す。
 * @param form フォーム
 */
export function focusFirstCheckinError(form: HTMLFormElement | null): void {
  const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!target) return;
  if (target.getAttribute("role") === "radiogroup") focusChoiceGroup(target);
  else target.focus();
}
