// チェックインの入力の欄（名前と、申し込みの媒体・知ったきっかけ・支払い方法のチップ）。
// P1・A3 の手でのチェックイン・直す枠で同じものを使う（EXPERIENCE.md Component Patterns）。
// 誤りは欄・設問のそば（Field・ChoiceChips の error）に出す。
import { CHECKIN_QUESTION_LABELS } from "@workspace/contracts/reception";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import type { FieldErrors } from "../../lib/form.ts";
import type { CheckinFormValues } from "./checkin-form.ts";
import { APPLICATION_SOURCE_OPTIONS, PAYMENT_METHOD_OPTIONS, REFERRAL_OPTIONS } from "./format.ts";

/** CheckinFields が受け取るもの。 */
export type CheckinFieldsProps = {
  /** 欄の値 */
  values: CheckinFormValues;
  /** 欄の値が変わったとき */
  onChange: (values: CheckinFormValues) => void;
  /** 欄の名前ごとの誤り */
  errors: FieldErrors;
  /** 名前の欄の説明（任意） */
  nameDescription?: string;
};

/**
 * チェックインの入力の欄。
 * @param props 欄の値（values）・変わったとき（onChange）・誤り（errors）・名前の説明（nameDescription）
 * @returns 欄の要素
 */
export function CheckinFields({ values, onChange, errors, nameDescription }: CheckinFieldsProps) {
  return (
    <div className="flex flex-col gap-s">
      <Field label="名前" description={nameDescription} error={errors.name}>
        <Input
          name="name"
          autoComplete="name"
          value={values.name}
          onChange={(event) => onChange({ ...values, name: event.target.value })}
        />
      </Field>
      <ChoiceChips
        label={CHECKIN_QUESTION_LABELS.applicationSource}
        options={APPLICATION_SOURCE_OPTIONS}
        value={values.applicationSource}
        onValueChange={(applicationSource) => onChange({ ...values, applicationSource })}
        error={errors.applicationSource}
      />
      <ChoiceChips
        label={CHECKIN_QUESTION_LABELS.referral}
        options={REFERRAL_OPTIONS}
        value={values.referral}
        onValueChange={(referral) => onChange({ ...values, referral })}
        error={errors.referral}
      />
      <ChoiceChips
        label={CHECKIN_QUESTION_LABELS.paymentMethod}
        options={PAYMENT_METHOD_OPTIONS}
        value={values.paymentMethod}
        onValueChange={(paymentMethod) => onChange({ ...values, paymentMethod })}
        error={errors.paymentMethod}
      />
    </div>
  );
}
