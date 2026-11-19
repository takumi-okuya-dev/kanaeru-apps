// アンケートの値の見せ方（チップの選択肢・一覧の言葉）。言葉と並びは約束（@workspace/contracts/survey）の1か所から読む。
// 任意の設問（仕事の立場・職種）のチップには「答えない」を最後に足し、値は none で持つ（API へは null で送る。research R2）。
import {
  JOB_ROLES,
  JOB_ROLE_LABELS,
  JOB_TYPES,
  JOB_TYPE_LABELS,
  MONTHLY_PRICES,
  MONTHLY_PRICE_LABELS,
  NOT_ANSWERED_LABEL,
  TESTER_ANSWERS,
  TESTER_ANSWER_LABELS,
} from "@workspace/contracts/survey";
import type { JobRole, JobType, MonthlyPrice, TesterAnswer } from "@workspace/contracts/survey";
import type { ChoiceOption } from "@workspace/ui/components/choice-chips";

/** 「答えない」のチップの値。 */
export const NOT_ANSWERED = "none";

/** 「答えない」のチップの値の型。 */
export type NotAnswered = typeof NOT_ANSWERED;

/**
 * code の並びを、チップの選択肢にする。
 * @param values code の並び
 * @param labels code から言葉
 * @returns チップの選択肢
 */
function optionsOf<V extends string>(
  values: readonly V[],
  labels: Record<V, string>,
): readonly ChoiceOption<V>[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

/** 月いくらのチップ。 */
export const MONTHLY_PRICE_OPTIONS = optionsOf<MonthlyPrice>(MONTHLY_PRICES, MONTHLY_PRICE_LABELS);

/** テスターになるかのチップ。 */
export const TESTER_OPTIONS = optionsOf<TesterAnswer>(TESTER_ANSWERS, TESTER_ANSWER_LABELS);

/** 「答えない」のチップ。 */
const NOT_ANSWERED_OPTION: ChoiceOption<NotAnswered> = {
  value: NOT_ANSWERED,
  label: NOT_ANSWERED_LABEL,
};

/** 仕事の立場のチップ（最後に「答えない」）。 */
export const JOB_ROLE_OPTIONS: readonly ChoiceOption<JobRole | NotAnswered>[] = [
  ...optionsOf<JobRole>(JOB_ROLES, JOB_ROLE_LABELS),
  NOT_ANSWERED_OPTION,
];

/** 職種のチップ（最後に「答えない」）。 */
export const JOB_TYPE_OPTIONS: readonly ChoiceOption<JobType | NotAnswered>[] = [
  ...optionsOf<JobType>(JOB_TYPES, JOB_TYPE_LABELS),
  NOT_ANSWERED_OPTION,
];
