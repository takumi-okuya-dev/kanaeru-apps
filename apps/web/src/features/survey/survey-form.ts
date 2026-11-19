// アンケートの欄の値と入力の行き来（P2 と主催者の代わりの入力で同じ）。
// 選択肢の設問（月いくら・テスター・仕事の立場・職種）は「答えない」（none）を最初に選んでおき、送るときに null にする。困りごとの確かめは約束（SurveyAnswerInput）で行う。
import { SurveyAnswerInput, normalizeSurveyAnswer } from "@workspace/contracts/survey";
import type {
  JobRole,
  JobType,
  MonthlyPrice,
  SurveyAnswer,
  TesterAnswer,
} from "@workspace/contracts/survey";
import { fieldErrorsFromIssues } from "../../lib/form.ts";
import type { FieldErrors } from "../../lib/form.ts";
import { NOT_ANSWERED } from "./format.ts";
import type { NotAnswered } from "./format.ts";

/** 欄の値（選択肢の設問の「答えない」は none）。 */
export type SurveyFormValues = {
  /** 困りごと */
  concern: string;
  /** 月いくら */
  monthlyPrice: MonthlyPrice | NotAnswered;
  /** テスターになるか */
  tester: TesterAnswer | NotAnswered;
  /** 仕事の立場 */
  jobRole: JobRole | NotAnswered;
  /** 職種 */
  jobType: JobType | NotAnswered;
};

/** 初めの欄の値（選択肢の設問は「答えない」）。 */
export const EMPTY_SURVEY_FORM: SurveyFormValues = {
  concern: "",
  monthlyPrice: NOT_ANSWERED,
  tester: NOT_ANSWERED,
  jobRole: NOT_ANSWERED,
  jobType: NOT_ANSWERED,
};

/**
 * 前の回答から欄の値を作る（なければ初めの値）。
 * @param answer 前の回答（なければ null）
 * @returns 欄の値
 */
export function surveyFormFromAnswer(answer: SurveyAnswer | null): SurveyFormValues {
  if (!answer) return EMPTY_SURVEY_FORM;
  return {
    concern: answer.concern ?? "",
    monthlyPrice: answer.monthlyPrice ?? NOT_ANSWERED,
    tester: answer.tester ?? NOT_ANSWERED,
    jobRole: answer.jobRole ?? NOT_ANSWERED,
    jobType: answer.jobType ?? NOT_ANSWERED,
  };
}

/** 確かめた結果。 */
export type SurveyFormResult =
  { ok: true; input: SurveyAnswerInput } | { ok: false; errors: FieldErrors };

/**
 * 欄の値を約束で確かめ、送る入力にする（「答えない」は null。前後の空白を除いて空の困りごとも、約束の
 * normalizeSurveyAnswer で null にする。API と同じ正規化）。
 * @param values 欄の値
 * @returns 送る入力か、欄の名前ごとの誤り
 */
export function validateSurveyForm(values: SurveyFormValues): SurveyFormResult {
  const parsed = SurveyAnswerInput.safeParse({
    concern: values.concern,
    monthlyPrice: values.monthlyPrice === NOT_ANSWERED ? null : values.monthlyPrice,
    tester: values.tester === NOT_ANSWERED ? null : values.tester,
    jobRole: values.jobRole === NOT_ANSWERED ? null : values.jobRole,
    jobType: values.jobType === NOT_ANSWERED ? null : values.jobType,
  });
  return parsed.success
    ? { ok: true, input: normalizeSurveyAnswer(parsed.data) }
    : { ok: false, errors: fieldErrorsFromIssues(parsed.error.issues) };
}
