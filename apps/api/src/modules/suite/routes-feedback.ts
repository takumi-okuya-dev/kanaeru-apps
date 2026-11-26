// 改善点の窓口（suite-004）。道は /api/v1/suite/feedback の下。
// - 送る：ログインした人（本文1〜2000文字・アプリの key は任意で、その人に見えるアプリ・1人1日20件まで〈人ごとの鍵で数える〉）
// - 一覧・済み：運営者（AD-5 の主催者）だけ
// 本文はログに書かない（Constitution II）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { endOfJstDate } from "@workspace/contracts/core";
import * as contract from "@workspace/contracts/suite";
import { FEEDBACK_DAILY_MAX, FEEDBACK_ERRORS } from "@workspace/contracts/suite";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, notFoundResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import {
  currentAccount,
  forbiddenResponse,
  isOrganizer,
  requireOrganizer,
  requireSession,
  unauthenticatedResponse,
} from "../account/index.ts";
import { insertFeedbackWithinLimit, listFeedback, setFeedbackDone } from "./feedback.ts";
import { isAppVisible } from "./visibility.ts";

/** 1日の長さ（ミリ秒）。 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 送る入力（文書の名前と例つき）。 */
const FeedbackInput = contract.FeedbackInput.openapi("SuiteFeedbackInput", {
  example: { body: "名簿を初めは閉じておいてほしい", appKey: "match" },
});

/** 送った答え（文書の名前つき）。 */
const FeedbackAccepted = contract.FeedbackAccepted.openapi("SuiteFeedbackAccepted");

/** 一覧（文書の名前つき）。 */
const FeedbackList = contract.FeedbackList.openapi("SuiteFeedbackList");

/** 1行（文書の名前つき）。 */
const FeedbackEntry = contract.FeedbackEntry.openapi("SuiteFeedbackEntry");

/** 済みを付け外す入力（文書の名前つき）。 */
const FeedbackDoneInput = contract.FeedbackDoneInput.openapi("SuiteFeedbackDoneInput");

/** 一覧の絞り方。 */
const FeedbackListQuery = z.object({
  app: z.string().max(40).optional().openapi({ description: "アプリの key で絞る" }),
  pending: z.enum(["true", "false"]).optional().openapi({ description: "まだのものだけ" }),
});

/** 道の feedbackId。 */
const FeedbackParams = z.object({ feedbackId: uuidParam("feedbackId", "改善点の ID") });

/**
 * 改善点の窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function feedbackRoutes(deps: DomainRouteDeps) {
  const { db, apps } = deps;
  return new OpenAPIHono<ApiEnv>()
    .openapi(
      createRoute({
        method: "post",
        path: "/api/v1/suite/feedback",
        tags: ["suite"],
        operationId: "suiteSendFeedback",
        summary: "改善点を送る（ログインした人。1人1日20件まで）",
        middleware: [requireSession(deps)] as const,
        request: {
          body: { required: true, content: { "application/json": { schema: FeedbackInput } } },
        },
        responses: {
          201: {
            description: "送った",
            content: { "application/json": { schema: FeedbackAccepted } },
          },
          400: invalidInputResponse,
          401: unauthenticatedResponse,
          429: domainErrorResponse(
            FEEDBACK_ERRORS.DAILY_LIMIT,
            `1日に${FEEDBACK_DAILY_MAX}件を超えた`,
          ),
        },
      }),
      async (c) => {
        const { body, appKey } = c.req.valid("json");
        const account = currentAccount(c);
        // 選べるのは、その人に見えるアプリだけ（画面の選ぶ欄と同じ。AD-16）
        const viewer = { isOperator: isOrganizer(deps.config, account) };
        if (
          appKey &&
          (!apps.some((app) => app.key === appKey) || !(await isAppVisible(db, appKey, viewer)))
        ) {
          throw new AppError("INVALID_INPUT", {
            fields: [{ path: "appKey", message: "アプリを一覧から選んでください。" }],
          });
        }
        const startOfDay = new Date(endOfJstDate(new Date()).getTime() - DAY_MS);
        const id = await insertFeedbackWithinLimit(
          db,
          { accountId: account.accountId, appKey: appKey ?? null, body },
          { since: startOfDay, max: FEEDBACK_DAILY_MAX },
        );
        if (!id) throw new AppError(FEEDBACK_ERRORS.DAILY_LIMIT);
        return c.json({ id }, 201);
      },
    )
    .openapi(
      createRoute({
        method: "get",
        path: "/api/v1/suite/feedback",
        tags: ["suite"],
        operationId: "suiteListFeedback",
        summary: "届いた改善点（運営者だけ。新しい順・500件まで）",
        middleware: [requireSession(deps), requireOrganizer(deps)] as const,
        request: { query: FeedbackListQuery },
        responses: {
          200: {
            description: "改善点",
            content: { "application/json": { schema: FeedbackList } },
          },
          401: unauthenticatedResponse,
          403: forbiddenResponse,
        },
      }),
      async (c) => {
        const query = c.req.valid("query");
        const names = new Map(apps.map((app) => [app.key, app.name]));
        const { rows, truncated } = await listFeedback(db, {
          appKey: query.app,
          pending: query.pending === "true",
        });
        return c.json(
          {
            truncated,
            items: rows.map((row) => ({
              id: row.id,
              createdAt: row.createdAt.toISOString(),
              appKey: row.appKey,
              appName: row.appKey ? (names.get(row.appKey) ?? null) : null,
              body: row.body,
              sender: row.sender,
              done: row.done,
            })),
          },
          200,
        );
      },
    )
    .openapi(
      createRoute({
        method: "put",
        path: "/api/v1/suite/feedback/{feedbackId}/done",
        tags: ["suite"],
        operationId: "suiteSetFeedbackDone",
        summary: "改善点に済みを付け外す（運営者だけ）",
        middleware: [requireSession(deps), requireOrganizer(deps)] as const,
        request: {
          params: FeedbackParams,
          body: { required: true, content: { "application/json": { schema: FeedbackDoneInput } } },
        },
        responses: {
          200: {
            description: "付け外したあとの1行",
            content: { "application/json": { schema: FeedbackEntry } },
          },
          400: invalidInputResponse,
          401: unauthenticatedResponse,
          403: forbiddenResponse,
          404: notFoundResponse,
        },
      }),
      async (c) => {
        const { feedbackId } = c.req.valid("param");
        const { done } = c.req.valid("json");
        if (!(await setFeedbackDone(db, feedbackId, done))) throw new AppError("NOT_FOUND");
        const [row] = (await listFeedback(db, { id: feedbackId })).rows;
        if (!row) throw new AppError("NOT_FOUND");
        const app = apps.find((candidate) => candidate.key === row.appKey);
        return c.json(
          {
            id: row.id,
            createdAt: row.createdAt.toISOString(),
            appKey: row.appKey,
            appName: app?.name ?? null,
            body: row.body,
            sender: row.sender,
            done: row.done,
          },
          200,
        );
      },
    );
}
