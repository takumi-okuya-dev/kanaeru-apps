// テストの手伝い：アンケートの回答を作る（survey のテストが使う）。
import type { SurveyAnswer } from "@workspace/contracts/survey";
import type { TestApp } from "./app.ts";
import { call } from "./event.ts";

/** 回答の入力の見本。 */
export const SAMPLE_ANSWER = {
  concern: "部下にAIをどう使わせればいいか分からない",
  monthlyPrice: "jpy1000",
  tester: "yes",
  jobRole: "manager",
  jobType: "sales",
} as const;

/**
 * 主催者のクッキーで、アンケートを開く・閉じる。
 * @param app 組み立てた API
 * @param organizerCookie 主催者のクッキー
 * @param eventId 交流会の ID
 * @param open 開くなら true
 * @throws {Error} できなかったとき
 */
export async function setSurveyOpen(
  app: TestApp,
  organizerCookie: string,
  eventId: string,
  open: boolean,
): Promise<void> {
  const response = await call(app, organizerCookie, `/api/v1/events/${eventId}/survey`, "PUT", {
    open,
  });
  if (response.status !== 200) {
    throw new Error(`アンケートを開け閉めできませんでした（${response.status}）。`);
  }
}

/**
 * 参加者のクッキーで、自分の回答を送る（チェックイン済み・アンケートが開いていること）。
 * @param app 組み立てた API
 * @param cookie 参加者のクッキー
 * @param eventId 交流会の ID
 * @param input 入力（足りない欄は見本）
 * @returns 回答
 * @throws {Error} 送れなかったとき
 */
export async function answerSurvey(
  app: TestApp,
  cookie: string,
  eventId: string,
  input: Record<string, unknown> = {},
): Promise<SurveyAnswer> {
  const response = await call(app, cookie, `/api/v1/events/${eventId}/survey-answers/me`, "PUT", {
    ...SAMPLE_ANSWER,
    ...input,
  });
  if (response.status !== 200) throw new Error(`回答を送れませんでした（${response.status}）。`);
  return (await response.json()) as SurveyAnswer;
}
