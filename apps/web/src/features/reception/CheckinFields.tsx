// チェックインの入力の欄（名前と、申し込みの媒体・知ったきっかけ・支払い方法のチップ）。
// P1・A3 の手でのチェックイン・直す枠で同じものを使う（EXPERIENCE.md Component Patterns）。
// 誤りは欄・設問のそば（Field・ChoiceChips の error）に出す。
// 割引（reception-002）：交流会に割引があるときだけ、支払い方法のあとに「割引」のチップ（割引なし＋割引ごと）。
// 選んだ割引が紹介者の名前を聞くときだけ、その下に「紹介してくれた人の名前」（任意）。割引を変えると紹介者の欄は空にする。
import { CHECKIN_QUESTION_LABELS } from "@workspace/contracts/reception";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Field } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import type { FieldErrors } from "../../lib/form.ts";
import type { CheckinFormValues } from "./checkin-form.ts";
import {
  APPLICATION_SOURCE_OPTIONS,
  NO_DISCOUNT_VALUE,
  PAYMENT_METHOD_OPTIONS,
  REFERRAL_OPTIONS,
  discountOptions,
} from "./format.ts";
import type { DiscountChoice } from "./format.ts";

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
  /** 選べる割引（なければ割引の設問を出さない） */
  discounts?: readonly DiscountChoice[];
  /** 紹介者の欄の説明（任意。既定は「任意」） */
  referrerDescription?: string;
  /** 選んだ割引が聞かなくても、紹介者の欄を出すか（主催者の直す枠で、今の名前があるとき） */
  forceReferrerField?: boolean;
};

/**
 * チェックインの入力の欄。
 * @param props 欄の値（values）・変わったとき（onChange）・誤り（errors）・名前の説明（nameDescription）・
 *   割引（discounts）・紹介者の説明（referrerDescription）・紹介者の欄を出し続けるか（forceReferrerField）
 * @returns 欄の要素
 */
export function CheckinFields({
  values,
  onChange,
  errors,
  nameDescription,
  discounts = [],
  referrerDescription = "任意",
  forceReferrerField = false,
}: CheckinFieldsProps) {
  const selected = discounts.find((discount) => discount.id === values.discountId);
  const showReferrer = values.discountId !== null && (selected?.asksReferrer || forceReferrerField);
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
      {discounts.length > 0 ? (
        <ChoiceChips
          label={CHECKIN_QUESTION_LABELS.discount}
          options={discountOptions(discounts)}
          value={values.discountId ?? NO_DISCOUNT_VALUE}
          onValueChange={(value) =>
            onChange({
              ...values,
              discountId: value === NO_DISCOUNT_VALUE ? null : value,
              referrerName: "",
            })
          }
          error={errors.discountId}
        />
      ) : null}
      {showReferrer ? (
        <Field
          label={CHECKIN_QUESTION_LABELS.referrerName}
          description={referrerDescription}
          error={errors.referrerName}
        >
          <Input
            name="referrerName"
            autoComplete="off"
            value={values.referrerName}
            onChange={(event) => onChange({ ...values, referrerName: event.target.value })}
          />
        </Field>
      ) : null}
    </div>
  );
}
