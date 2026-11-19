// アンケートの窓口（自分の回答・主催者の代わりの入力・困りごとの一覧・困りごとの CSV）。
// 道はすべて createRoute で書き、道の頭は /api/v1/events/{eventId}/survey-answers（Consistency Conventions）。
// どの道もログインが要る（account の requireSession）。主催者の道は event の requireEventRole で、要求のたびに役目を引く（AD-5）。
// 参加者の回答は、書くたびに event の getEventSummary で開閉を読み、閉じていれば断る。主催者の代わりの入力は閉じていても受ける（AD-13）。
// 名前はいつも reception のチェックインの名前（AD-6）。困りごとの本文はログに出さない（このファイルは logger を使わない）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { jstDate } from "@workspace/contracts/core";
import { EVENT_ERRORS } from "@workspace/contracts/event";
import { RECEPTION_ERRORS } from "@workspace/contracts/reception";
import * as contract from "@workspace/contracts/survey";
import { SURVEY_ERRORS, normalizeSurveyAnswer } from "@workspace/contracts/survey";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import {
  eventForbiddenResponse,
  eventNotFoundResponse,
  getEventSummary,
  requireEventRole,
} from "../event/index.ts";
import { findCheckin, getCheckin, listCheckins } from "../reception/index.ts";
import type { CheckinRecord } from "../reception/index.ts";
import { buildConcernsCsv } from "./csv.ts";
import { findAnswerByCheckin, listAnswersByCheckins, upsertAnswer } from "./repository.ts";
import { applyListQuery, pairWithCheckins, toSurveyAnswer, toSurveyAnswerRow } from "./views.ts";
import type { AnswerWithCheckin } from "./views.ts";

/** 回答の入力（文書の名前と例つき）。 */
const SurveyAnswerInput = contract.SurveyAnswerInput.openapi("SurveyAnswerInput", {
  example: {
    concern: "部下にAIをどう使わせればいいか分からない",
    monthlyPrice: "jpy1000",
    tester: "yes",
    jobRole: "manager",
    jobType: null,
  },
});

/** 回答（文書の名前つき）。 */
const SurveyAnswer = contract.SurveyAnswer.openapi("SurveyAnswer");

/** 自分の回答とチェックイン済みか（文書の名前つき）。 */
const MySurveyState = contract.MySurveyState.openapi("MySurveyState");

/** 代わりに入れるときに読む回答（文書の名前つき）。 */
const ProxySurveyState = contract.ProxySurveyState.openapi("ProxySurveyState");

/** 困りごとの一覧（文書の名前つき）。 */
const SurveyAnswerList = contract.SurveyAnswerList.openapi("SurveyAnswerList");

/** 道の eventId。 */
const EventParams = z.object({ eventId: uuidParam("eventId", "交流会の ID") });

/** 道の eventId と checkinId。 */
const CheckinParams = z.object({
  eventId: uuidParam("eventId", "交流会の ID"),
  checkinId: uuidParam("checkinId", "チェックインの ID"),
});

/** 一覧の問い合わせ（文書の説明つき）。 */
const ListQuery = z.object({
  tester: contract.SurveyListQuery.shape.tester.openapi({
    param: { name: "tester", in: "query" },
    description: "yes なら、テスターに「はい」の回答だけ",
  }),
  sort: contract.SurveyListQuery.shape.sort.openapi({
    param: { name: "sort", in: "query" },
    description: "並べ方（newest：回答の新しい順〈既定〉・price：月いくらの高い順）",
  }),
});

/** チェックインがない応答。 */
const checkinNotFoundResponse = domainErrorResponse(
  RECEPTION_ERRORS.CHECKIN_NOT_FOUND,
  "その交流会にチェックインがない（取り消された・別の交流会の ID・ID の形が違う）",
);

/**
 * 交流会がないか、その交流会にチェックインがない応答（主催者の代わりの入力）。requireEventRole は event の NOT_FOUND を、
 * チェックインを探す処理は CHECKIN_NOT_FOUND を返すので、文書には両方を例として書く（本文の形は同じ。reception と同じ形）。
 */
const eventOrCheckinNotFoundResponse = {
  description:
    "交流会がない（event の NOT_FOUND。ID の形が違うときも）か、その交流会にチェックインがない（CHECKIN_NOT_FOUND。取り消された・別の交流会の ID・ID の形が違う）",
  content: {
    "application/json": {
      schema: checkinNotFoundResponse.content["application/json"].schema,
      examples: {
        eventNotFound: {
          summary: "交流会がない",
          value: eventNotFoundResponse.content["application/json"].example,
        },
        checkinNotFound: {
          summary: "その交流会にチェックインがない",
          value: checkinNotFoundResponse.content["application/json"].example,
        },
      },
    },
  },
} as const;

/**
 * JSON の応答の書き方。
 * @param schema 本文の形
 * @param description いつ返すか
 * @returns OpenAPI の応答の定義
 */
function json<T>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } } as const;
}

/**
 * アンケートの窓口の道の定義（middleware に deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const organizerOnly = requireEventRole(deps, ["organizer"]);
  const tags = ["survey"];
  const base = "/api/v1/events/{eventId}/survey-answers";
  const body = { required: true, content: { "application/json": { schema: SurveyAnswerInput } } };
  const manageErrors = {
    401: unauthenticatedResponse,
    403: eventForbiddenResponse,
    404: eventNotFoundResponse,
  } as const;
  return {
    getMine: createRoute({
      method: "get",
      path: `${base}/me`,
      tags,
      operationId: "surveyGetMyAnswer",
      summary:
        "その交流会の自分の回答と、チェックイン済みか（ログインした人。開閉にかかわらず読める）",
      middleware: [session] as const,
      request: { params: EventParams },
      responses: {
        200: json(MySurveyState, "チェックイン済みかと自分の回答（まだなら null）"),
        401: unauthenticatedResponse,
        404: eventNotFoundResponse,
      },
    }),
    putMine: createRoute({
      method: "put",
      path: `${base}/me`,
      tags,
      operationId: "surveyPutMyAnswer",
      summary: "自分の回答を作る・直す（チェックインした人。アンケートが開いている間だけ）",
      description:
        "書くたびに交流会の開閉を読む（AD-13）。どの欄も省略でき、全部を置きかえる。同じチェックインの回答は1つ。",
      middleware: [session] as const,
      request: { params: EventParams, body },
      responses: {
        200: json(SurveyAnswer, "作った・直した回答"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        403: domainErrorResponse(
          SURVEY_ERRORS.SURVEY_NOT_CHECKED_IN,
          "その交流会にチェックインしていない",
        ),
        404: eventNotFoundResponse,
        409: domainErrorResponse(SURVEY_ERRORS.SURVEY_CLOSED, "アンケートが閉じている"),
      },
    }),
    getProxy: createRoute({
      method: "get",
      path: `${base}/checkins/{checkinId}`,
      tags,
      operationId: "surveyGetAnswerOfCheckin",
      summary: "チェックインの回答（主催者だけ。代わりに入れるとき）",
      middleware: [session, organizerOnly] as const,
      request: { params: CheckinParams },
      responses: {
        200: json(ProxySurveyState, "そのチェックインの回答（まだなら null）"),
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventOrCheckinNotFoundResponse,
      },
    }),
    putProxy: createRoute({
      method: "put",
      path: `${base}/checkins/{checkinId}`,
      tags,
      operationId: "surveyPutAnswerOfCheckin",
      summary:
        "チェックインの回答を代わりに作る・直す（主催者だけ。アンケートが閉じていても受ける）",
      middleware: [session, organizerOnly] as const,
      request: { params: CheckinParams, body },
      responses: {
        200: json(SurveyAnswer, "作った・直した回答"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventOrCheckinNotFoundResponse,
      },
    }),
    list: createRoute({
      method: "get",
      path: base,
      tags,
      operationId: "surveyListAnswers",
      summary:
        "困りごとの一覧（主催者だけ。名前はチェックインの名前。テスターの絞りこみと月いくらの高い順）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams, query: ListQuery },
      responses: {
        200: json(SurveyAnswerList, "困りごとの一覧"),
        400: invalidInputResponse,
        ...manageErrors,
      },
    }),
    exportCsv: createRoute({
      method: "get",
      path: `${base}/export`,
      tags,
      operationId: "surveyExportConcerns",
      summary: "困りごとの CSV（主催者だけ。UTF-8 の BOM つき・回答の古い順）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams },
      responses: {
        200: {
          description: "困りごとの CSV",
          content: { "text/csv": { schema: z.string().openapi({ format: "binary" }) } },
        },
        ...manageErrors,
      },
    }),
  };
}

/**
 * その交流会のチェックインを ID で読む（ない・別の交流会は 404）。
 * @param deps 土台が渡す道具
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @returns チェックイン
 * @throws {AppError} その交流会にないとき（reception の CHECKIN_NOT_FOUND）
 */
async function checkinInEvent(
  deps: DomainRouteDeps,
  eventId: string,
  checkinId: string,
): Promise<CheckinRecord> {
  const checkin = await getCheckin(deps.db, checkinId);
  if (!checkin || checkin.eventId !== eventId) {
    throw new AppError(RECEPTION_ERRORS.CHECKIN_NOT_FOUND);
  }
  return checkin;
}

/**
 * その交流会の回答を、チェックインと組にして読む。
 * @param deps 土台が渡す道具
 * @param eventId 交流会の ID
 * @returns 回答とチェックインの組（並びは決めない）
 */
async function answersInEvent(
  deps: DomainRouteDeps,
  eventId: string,
): Promise<AnswerWithCheckin[]> {
  const checkins = await listCheckins(deps.db, eventId);
  const answers = await listAnswersByCheckins(
    deps.db,
    checkins.map((checkin) => checkin.id),
  );
  return pairWithCheckins(answers, checkins);
}

/**
 * アンケートの窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function surveyRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getMine, async (c) => {
      const { eventId } = c.req.valid("param");
      if (!(await getEventSummary(db, deps.config, eventId))) {
        throw new AppError(EVENT_ERRORS.NOT_FOUND);
      }
      const checkin = await findCheckin(db, eventId, currentAccount(c).accountId);
      const answer = checkin ? await findAnswerByCheckin(db, checkin.id) : null;
      const state: contract.MySurveyState = {
        checkedIn: checkin !== null,
        answer: answer ? toSurveyAnswer(answer) : null,
      };
      return c.json(state, 200);
    })
    .openapi(routes.putMine, async (c) => {
      const { eventId } = c.req.valid("param");
      const values = normalizeSurveyAnswer(c.req.valid("json"));
      // 開閉は書くたびに event から読む（自分の表に写さない。AD-13）。閉じていれば、チェックインの有無より先に断る（research R5）
      const summary = await getEventSummary(db, deps.config, eventId);
      if (!summary) throw new AppError(EVENT_ERRORS.NOT_FOUND);
      if (!summary.surveyOpen) throw new AppError(SURVEY_ERRORS.SURVEY_CLOSED);
      const checkin = await findCheckin(db, eventId, currentAccount(c).accountId);
      if (!checkin) throw new AppError(SURVEY_ERRORS.SURVEY_NOT_CHECKED_IN);
      const record = await upsertAnswer(db, checkin.id, values);
      return c.json(toSurveyAnswer(record), 200);
    })
    .openapi(routes.getProxy, async (c) => {
      const { eventId, checkinId } = c.req.valid("param");
      const checkin = await checkinInEvent(deps, eventId, checkinId);
      const answer = await findAnswerByCheckin(db, checkin.id);
      return c.json({ answer: answer ? toSurveyAnswer(answer) : null }, 200);
    })
    .openapi(routes.putProxy, async (c) => {
      const { eventId, checkinId } = c.req.valid("param");
      const values = normalizeSurveyAnswer(c.req.valid("json"));
      // 主催者の代わりの入力は、閉じていても受ける（AD-13・A9）
      const checkin = await checkinInEvent(deps, eventId, checkinId);
      const record = await upsertAnswer(db, checkin.id, values);
      return c.json(toSurveyAnswer(record), 200);
    })
    .openapi(routes.list, async (c) => {
      const { eventId } = c.req.valid("param");
      const query = c.req.valid("query");
      const rows = applyListQuery(await answersInEvent(deps, eventId), query);
      return c.json({ answers: rows.map(toSurveyAnswerRow) }, 200);
    })
    .openapi(routes.exportCsv, async (c) => {
      const { eventId } = c.req.valid("param");
      // 回答の古い順（新しい順を逆にする）
      const rows = applyListQuery(await answersInEvent(deps, eventId), {}).reverse();
      const filename = `concerns-${jstDate(new Date())}.csv`;
      return c.body(buildConcernsCsv(rows), 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
    });
}
