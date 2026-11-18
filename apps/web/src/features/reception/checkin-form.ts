// チェックインの入力の欄の値と確かめ（P1・手でのチェックイン・直す枠で同じ。EXPERIENCE.md の入力の誤り）。
// 約束（CheckinInput）で確かめ、欄の名前ごとの誤りの文にする。送ったときは最初の誤りの欄・設問へフォーカスを移す。
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
};

/** 空の欄の値。 */
export const EMPTY_CHECKIN_FORM: CheckinFormValues = {
  name: "",
  applicationSource: null,
  referral: null,
  paymentMethod: null,
};

/** 確かめた結果。 */
export type CheckinFormResult =
  { ok: true; input: CheckinInput } | { ok: false; errors: FieldErrors };

/**
 * 欄の値を約束で確かめる。
 * @param values 欄の値
 * @returns 送る入力か、欄の名前ごとの誤り
 */
export function validateCheckinForm(values: CheckinFormValues): CheckinFormResult {
  const parsed = CheckinInput.safeParse({
    name: values.name,
    applicationSource: values.applicationSource ?? undefined,
    referral: values.referral ?? undefined,
    paymentMethod: values.paymentMethod ?? undefined,
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
