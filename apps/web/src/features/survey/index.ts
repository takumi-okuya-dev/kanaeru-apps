// アンケートの画面の入口（docs/apps/survey.md・docs/rules/coding.md 6-6）。組み立て（router.tsx）は feature を読む。
// reception の差しこみの場所に、A3 の直す枠の節（主催者の代わりの入力）と A5 の節（困りごとの CSV）を、ここで1度だけ登録する。
// routes は型を消さないよう、並びのまま出す（satisfies で形だけ確かめる）。
import type { WebFeature } from "../../lib/feature.ts";
import { registerCheckinPanelSection, registerEventDataSection } from "../reception/index.ts";
import { ConcernsCsvSection } from "./ConcernsCsvSection.tsx";
import { ProxyAnswerSection } from "./ProxyAnswerSection.tsx";
import { concernsRoute, surveyRoute } from "./routes.ts";

export { SURVEY_QUERY_KEYS } from "./queries.ts";

registerCheckinPanelSection({ id: "survey-proxy-answer", Component: ProxyAnswerSection });
registerEventDataSection({ id: "survey-concerns-csv", Component: ConcernsCsvSection });

/** アンケートの領域が出すもの（ナビには出さない。管理の画面の行き来は外枠のナビ。event が出す）。 */
export const feature = {
  id: "survey",
  routes: [surveyRoute, concernsRoute],
} satisfies WebFeature;
