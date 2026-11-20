// 反応の分析の窓口（threads-003）。道の頭は /api/v1/threads（AD-15）。ログインが要り、持ち主だけ（ほかの人のものは 404）。
// 反応の取りこみそのものは定期の仕事（job-runner.ts → metrics-runner.ts）が行う。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import { THREADS_ERRORS } from "@workspace/contracts/threads";
import { domainErrorResponse } from "../../kernel/errors.ts";
import { csvAttachment, invalidInputResponse } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { buildPerformanceCsv, getPerformanceView, updateFeedback } from "./performance.ts";
import {
  ACCOUNTS_BASE,
  AccountParams,
  COMMON_ERRORS,
  DraftParams,
  TAGS,
  accountMiddleware,
  body,
  json,
  ownedAccount,
} from "./route-helpers.ts";

/** 反応の一覧の問い合わせ（文書の説明つき）。 */
const PerformanceQuery = z.object({
  tab: contract.PerformanceQuery.shape.tab.openapi({
    param: { name: "tab", in: "query" },
    description: "絞りこみ（all・good・normal・poor・pending）",
  }),
  before: contract.PerformanceQuery.shape.before.openapi({
    param: { name: "before", in: "query" },
    description: "続きを読むときの、前の応答の nextCursor（threads-012）",
  }),
});

/** 書き出しの問い合わせ（文書の説明つき）。 */
const ExportQuery = z.object({
  kind: contract.PerformanceExportQuery.shape.kind.openapi({
    param: { name: "kind", in: "query" },
    description: "posts：投稿ごと・snapshots：取りこみごと",
  }),
});

/**
 * 反応の分析の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function metricsRoutes(deps: DomainRouteDeps) {
  const middleware = accountMiddleware(deps);
  const base = ACCOUNTS_BASE;
  const tags = TAGS;
  const errors = COMMON_ERRORS;
  const routes = {
    getPerformance: createRoute({
      method: "get",
      path: `${base}/{accountId}/performance`,
      tags,
      operationId: "threadsGetPerformance",
      summary: "反応の画面（基準値・判定ごとの数・投稿ごとの反応。投稿した新しい順に50件ずつ）",
      middleware,
      request: { params: AccountParams, query: PerformanceQuery },
      responses: {
        200: json(contract.PerformanceView.openapi("ThreadsPerformanceView"), "反応の画面"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    putFeedback: createRoute({
      method: "put",
      path: `${base}/{accountId}/performance/{draftId}/feedback`,
      tags,
      operationId: "threadsPutFeedback",
      summary:
        "低調の投稿の改善のメモと「次のプロンプトに入れる」を保存する（読んだ版と同じときだけ）",
      middleware,
      request: {
        params: DraftParams,
        body: body(contract.FeedbackInput.openapi("ThreadsFeedbackInput")),
      },
      responses: {
        200: json(contract.PerformanceItem.openapi("ThreadsPerformanceItem"), "保存したあとの項目"),
        400: invalidInputResponse,
        409: domainErrorResponse(THREADS_ERRORS.THREADS_VERSION_CONFLICT, "版が合わない"),
        ...errors,
      },
    }),
    exportCsv: createRoute({
      method: "get",
      path: `${base}/{accountId}/performance/export`,
      tags,
      operationId: "threadsExportPerformance",
      summary: "反応の CSV（投稿ごと37列・取りこみごと13列。めぐると同じ列。UTF-8 の BOM つき）",
      middleware,
      request: { params: AccountParams, query: ExportQuery },
      responses: {
        200: {
          description: "反応の CSV",
          content: { "text/csv": { schema: z.string().openapi({ format: "binary" }) } },
        },
        400: invalidInputResponse,
        ...errors,
      },
    }),
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getPerformance, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      const { tab, before } = c.req.valid("query");
      return c.json(await getPerformanceView(deps.db, account, tab, before), 200);
    })
    .openapi(routes.putFeedback, async (c) => {
      const { accountId, draftId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "write_content");
      return c.json(await updateFeedback(deps.db, account.id, draftId, c.req.valid("json")), 200);
    })
    .openapi(routes.exportCsv, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      const { kind } = c.req.valid("query");
      const csv = await buildPerformanceCsv(deps.db, account.id, kind);
      return c.body(
        csv,
        200,
        csvAttachment(kind === "posts" ? "threads-posts" : "threads-snapshots"),
      );
    });
}
