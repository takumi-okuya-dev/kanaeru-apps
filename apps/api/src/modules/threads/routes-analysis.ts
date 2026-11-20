// アルゴリズムの分析の窓口（threads-006）。道の頭は /api/v1/threads（AD-15）。ログインが要り、持ち主だけ（ほかの人のものは 404）。
// 分析は読むたびに計算する（保存しない）。内容の分類は、画面が外の AI に貼るプロンプトを作り、貼り戻した答えを読んで保存する。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import { THREADS_ERRORS } from "@workspace/contracts/threads";
import { domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import {
  getAnalysisView,
  listClassificationTargets,
  saveAnalysisSettings,
  saveClassifications,
} from "./analysis.ts";
import { listNgWords, toPromptSettings } from "./repository.ts";
import {
  ACCOUNTS_BASE,
  AccountParams,
  COMMON_ERRORS,
  TAGS,
  accountMiddleware,
  body,
  coreRuleLines,
  json,
  ownedAccount,
} from "./route-helpers.ts";

/** 分析の問い合わせ（文書の説明つき）。 */
const AnalysisQuery = z.object({
  scope: contract.AnalysisQuery.shape.scope.openapi({
    param: { name: "scope", in: "query" },
    description: "all：すべての投稿・regular：宣伝を除いたふだんの投稿",
  }),
});

/** 分類の一覧の問い合わせ（文書の説明つき）。 */
const ClassificationsQuery = z.object({
  mode: contract.ClassificationsQuery.shape.mode.openapi({
    param: { name: "mode", in: "query" },
    description: "unclassified：まだの投稿（新しい50件）・classified：分類済み（新しい200件）",
  }),
});

/**
 * アルゴリズムの分析の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function analysisRoutes(deps: DomainRouteDeps) {
  const middleware = accountMiddleware(deps);
  const base = ACCOUNTS_BASE;
  const tags = TAGS;
  const errors = COMMON_ERRORS;
  const routes = {
    getAnalysis: createRoute({
      method: "get",
      path: `${base}/{accountId}/analysis`,
      tags,
      operationId: "threadsGetAnalysis",
      summary:
        "アルゴリズムの分析（直近90日の確定した投稿の、時間帯・曜日・長さ・本文の特徴・書き出しの型・テーマごとの中央値と傾向、おすすめに乗った目安）",
      middleware,
      request: { params: AccountParams, query: AnalysisQuery },
      responses: {
        200: json(contract.AnalysisView.openapi("ThreadsAnalysisView"), "分析の画面"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    putSettings: createRoute({
      method: "put",
      path: `${base}/{accountId}/analysis/settings`,
      tags,
      operationId: "threadsPutAnalysisSettings",
      summary:
        "分析の設定（テーマ・伸びた傾向をプロンプトに入れるか）を保存する（読んだ版と同じときだけ。消したテーマの分類はテーマなしにする）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.AnalysisSettingsInput.openapi("ThreadsAnalysisSettingsInput")),
      },
      responses: {
        200: json(contract.AnalysisSettings.openapi("ThreadsAnalysisSettings"), "保存した設定"),
        400: invalidInputResponse,
        409: domainErrorResponse(THREADS_ERRORS.THREADS_VERSION_CONFLICT, "版が合わない"),
        ...errors,
      },
    }),
    getClassifications: createRoute({
      method: "get",
      path: `${base}/{accountId}/analysis/classifications`,
      tags,
      operationId: "threadsGetClassifications",
      summary: "分類する・直す投稿の一覧（直近90日の確定した投稿）とテーマ",
      middleware,
      request: { params: AccountParams, query: ClassificationsQuery },
      responses: {
        200: json(contract.ClassificationsList.openapi("ThreadsClassificationsList"), "一覧"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    putClassifications: createRoute({
      method: "put",
      path: `${base}/{accountId}/analysis/classifications`,
      tags,
      operationId: "threadsPutClassifications",
      summary:
        "投稿の分類（書き出しの型・テーマ）を保存する（50件まで。期間の確定した投稿でないもの・知らないテーマは飛ばす）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ClassificationsInput.openapi("ThreadsClassificationsInput")),
      },
      responses: {
        200: json(
          contract.ClassificationsSaveResult.openapi("ThreadsClassificationsSaveResult"),
          "保存した数と飛ばした投稿",
        ),
        400: invalidInputResponse,
        ...errors,
      },
    }),
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getAnalysis, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const ngWords = await listNgWords(deps.db, account.id);
      const view = await getAnalysisView(deps.db, {
        threadsAccountId: account.id,
        scope: c.req.valid("query").scope,
        lengthSettings: toPromptSettings(account).length,
        coreRules: coreRuleLines(account.coreRules),
        ngWords: ngWords.map((ngWord) => ngWord.word),
        now: new Date(),
      });
      c.header("Cache-Control", "no-store");
      return c.json(view, 200);
    })
    .openapi(routes.putSettings, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(await saveAnalysisSettings(deps.db, account.id, c.req.valid("json")), 200);
    })
    .openapi(routes.getClassifications, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const { mode } = c.req.valid("query");
      c.header("Cache-Control", "no-store");
      return c.json(await listClassificationTargets(deps.db, account.id, mode, new Date()), 200);
    })
    .openapi(routes.putClassifications, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(
        await saveClassifications(deps.db, account.id, c.req.valid("json"), new Date()),
        200,
      );
    });
}
