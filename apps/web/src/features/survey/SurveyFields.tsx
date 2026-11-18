// アンケートの設問の欄（困りごと・月いくら・テスター・任意〈仕事の立場・職種〉）。P2 と主催者の代わりの入力で同じものを使う。
// どれも必須にしない（決定 A7）。月いくらには「答えるだけで、実際には払いません」を書く（FR-10）。
// 任意の設問は「任意」の見出し（fieldset の legend）でまとめ、どちらも「答えない」を最初に選んでおく（EXPERIENCE）。
import { SURVEY_QUESTION_LABELS } from "@workspace/contracts/survey";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { Field } from "@workspace/ui/components/field";
import { Textarea } from "@workspace/ui/components/textarea";
import type { FieldErrors } from "../../lib/form.ts";
import {
  JOB_ROLE_OPTIONS,
  JOB_TYPE_OPTIONS,
  MONTHLY_PRICE_OPTIONS,
  TESTER_OPTIONS,
} from "./format.ts";
import type { SurveyFormValues } from "./survey-form.ts";

/** SurveyFields が受け取るもの。 */
export type SurveyFieldsProps = {
  /** 欄の値 */
  values: SurveyFormValues;
  /** 欄の値が変わったとき */
  onChange: (values: SurveyFormValues) => void;
  /** 欄の名前ごとの誤り */
  errors: FieldErrors;
};

/**
 * アンケートの設問の欄。
 * @param props 欄の値（values）・変わったとき（onChange）・誤り（errors）
 * @returns 欄の要素
 */
export function SurveyFields({ values, onChange, errors }: SurveyFieldsProps) {
  return (
    <div className="flex flex-col gap-s">
      <Field
        label={SURVEY_QUESTION_LABELS.concern}
        description="仕事でめんどくさいこと・困っていることを、自由に書いてください。"
        error={errors.concern}
      >
        <Textarea
          name="concern"
          rows={5}
          value={values.concern}
          onChange={(event) => onChange({ ...values, concern: event.target.value })}
        />
      </Field>
      <ChoiceChips
        label={SURVEY_QUESTION_LABELS.monthlyPrice}
        description="答えるだけで、実際には払いません"
        options={MONTHLY_PRICE_OPTIONS}
        value={values.monthlyPrice}
        onValueChange={(monthlyPrice) => onChange({ ...values, monthlyPrice })}
        error={errors.monthlyPrice}
      />
      <ChoiceChips
        label={SURVEY_QUESTION_LABELS.tester}
        description="アプリや勉強会を試してもらうときに、主催者から公式LINEで連絡します。"
        options={TESTER_OPTIONS}
        value={values.tester}
        onValueChange={(tester) => onChange({ ...values, tester })}
        error={errors.tester}
      />
      <fieldset className="flex flex-col gap-s rounded-md border border-border p-xs">
        <legend className="px-x3s text-m font-bold">任意</legend>
        <ChoiceChips
          label={SURVEY_QUESTION_LABELS.jobRole}
          options={JOB_ROLE_OPTIONS}
          value={values.jobRole}
          onValueChange={(jobRole) => onChange({ ...values, jobRole })}
          error={errors.jobRole}
        />
        <ChoiceChips
          label={SURVEY_QUESTION_LABELS.jobType}
          options={JOB_TYPE_OPTIONS}
          value={values.jobType}
          onValueChange={(jobType) => onChange({ ...values, jobType })}
          error={errors.jobType}
        />
      </fieldset>
    </div>
  );
}
