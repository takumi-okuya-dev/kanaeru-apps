// アンケート（survey）の窓口の入出力の形（API の入力の確かめ・OpenAPI の文書・画面の入力の確かめが、同じ形を使う）。
// ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。どの設問も必須にしない（決定 A7。research R3）。
// 日時は時差つきの ISO 8601 だけ（Consistency Conventions）。
import { z } from "zod";
import { CHECKIN_METHODS } from "../reception/index.ts";
import {
  JOB_ROLES,
  JOB_TYPES,
  MONTHLY_PRICES,
  SURVEY_QUESTION_LABELS,
  SURVEY_SORTS,
  TESTER_ANSWERS,
} from "./options.ts";
import type { JobRole, JobType, MonthlyPrice, TesterAnswer } from "./options.ts";

/** 困りごとの文字数の上限（research R3）。 */
export const CONCERN_MAX = 2000;

/** 月いくらの形。 */
export const MonthlyPriceSchema = z.enum(MONTHLY_PRICES, {
  error: `${SURVEY_QUESTION_LABELS.monthlyPrice}は、選択肢から選んでください。`,
});

/** テスターになるかの形。 */
export const TesterAnswerSchema = z.enum(TESTER_ANSWERS, {
  error: `${SURVEY_QUESTION_LABELS.tester}は、選択肢から選んでください。`,
});

/** 仕事の立場の形。 */
export const JobRoleSchema = z.enum(JOB_ROLES, {
  error: `${SURVEY_QUESTION_LABELS.jobRole}は、選択肢から選んでください。`,
});

/** 職種の形。 */
export const JobTypeSchema = z.enum(JOB_TYPES, {
  error: `${SURVEY_QUESTION_LABELS.jobType}は、選択肢から選んでください。`,
});

/**
 * アンケートの回答の入力（参加者の回答・主催者の代わりの入力で同じ。知らない欄は誤り）。
 * どの欄も省略でき、null も受ける（省略・null は「答えていない」）。全部を置きかえる（research R3）。
 */
export const SurveyAnswerInput = z.strictObject({
  concern: z
    .string({ error: `${SURVEY_QUESTION_LABELS.concern}は文字で入れてください。` })
    .trim()
    .max(CONCERN_MAX, {
      error: `${SURVEY_QUESTION_LABELS.concern}は${CONCERN_MAX.toLocaleString("ja-JP")}文字までにしてください。`,
    })
    .nullable()
    .optional(),
  monthlyPrice: MonthlyPriceSchema.nullable().optional(),
  tester: TesterAnswerSchema.nullable().optional(),
  jobRole: JobRoleSchema.nullable().optional(),
  jobType: JobTypeSchema.nullable().optional(),
});

/** アンケートの回答の入力の型（確かめたあと）。 */
export type SurveyAnswerInput = z.infer<typeof SurveyAnswerInput>;

/** 5つの欄がそろった回答の値（省略と空の困りごとは null）。 */
export type SurveyAnswerValues = {
  /** 困りごと */
  concern: string | null;
  /** 月いくら */
  monthlyPrice: MonthlyPrice | null;
  /** テスターになるか */
  tester: TesterAnswer | null;
  /** 仕事の立場 */
  jobRole: JobRole | null;
  /** 職種 */
  jobType: JobType | null;
};

/**
 * 確かめた入力を、5つの欄がそろった値にする（省略は null、前後の空白を除いて空の困りごとも null）。
 * @param input 確かめた入力
 * @returns 回答の値
 */
export function normalizeSurveyAnswer(input: SurveyAnswerInput): SurveyAnswerValues {
  const concern = input.concern?.trim() ?? "";
  return {
    concern: concern.length > 0 ? concern : null,
    monthlyPrice: input.monthlyPrice ?? null,
    tester: input.tester ?? null,
    jobRole: input.jobRole ?? null,
    jobType: input.jobType ?? null,
  };
}

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/** アンケートの回答（参加者・主催者が読む形）。 */
export const SurveyAnswer = z.object({
  /** 困りごと（なければ null） */
  concern: z.string().nullable(),
  /** 月いくら（答えていない・「答えない」なら null） */
  monthlyPrice: MonthlyPriceSchema.nullable(),
  /** テスターになるか（答えていない・「答えない」なら null） */
  tester: TesterAnswerSchema.nullable(),
  /** 仕事の立場（「答えない」なら null） */
  jobRole: JobRoleSchema.nullable(),
  /** 職種（「答えない」なら null） */
  jobType: JobTypeSchema.nullable(),
  /** 回答の時刻（直した時刻） */
  answeredAt: isoDateTime,
});

/** アンケートの回答の型。 */
export type SurveyAnswer = z.infer<typeof SurveyAnswer>;

/** アンケートの画面が読む、チェックイン済みかと自分の回答。 */
export const MySurveyState = z.object({
  /** その交流会にチェックインしているか */
  checkedIn: z.boolean(),
  /** 自分の回答（まだなら null） */
  answer: SurveyAnswer.nullable(),
});

/** アンケートの画面が読む形の型。 */
export type MySurveyState = z.infer<typeof MySurveyState>;

/** 主催者が代わりに入れるときに読む、そのチェックインの回答。 */
export const ProxySurveyState = z.object({
  /** 回答（まだなら null） */
  answer: SurveyAnswer.nullable(),
});

/** 代わりに入れるときに読む形の型。 */
export type ProxySurveyState = z.infer<typeof ProxySurveyState>;

/** 困りごとの一覧の行（主催者だけ）。 */
export const SurveyAnswerRow = SurveyAnswer.extend({
  /** 回答の ID */
  id: z.guid(),
  /** チェックインの ID */
  checkinId: z.guid(),
  /** 名前（いつもチェックインの名前。AD-6） */
  name: z.string(),
  /** チェックインの入れ方（LINE ログイン・手） */
  method: z.enum(CHECKIN_METHODS),
  /** 初めて答えた時刻（一覧の並び） */
  createdAt: isoDateTime,
});

/** 困りごとの一覧の行の型。 */
export type SurveyAnswerRow = z.infer<typeof SurveyAnswerRow>;

/** 困りごとの一覧。 */
export const SurveyAnswerList = z.object({ answers: z.array(SurveyAnswerRow) });

/** 困りごとの一覧の型。 */
export type SurveyAnswerList = z.infer<typeof SurveyAnswerList>;

/** 困りごとの一覧の問い合わせ（絞りこみと並べ方。research R7）。 */
export const SurveyListQuery = z.object({
  /** "yes" ならテスターに「はい」の回答だけ */
  tester: z.enum(["yes"], { error: "絞りこみの値が正しくありません。" }).optional(),
  /** 並べ方（既定は回答の新しい順） */
  sort: z.enum(SURVEY_SORTS, { error: "並べ方の値が正しくありません。" }).optional(),
});

/** 困りごとの一覧の問い合わせの型。 */
export type SurveyListQuery = z.infer<typeof SurveyListQuery>;
