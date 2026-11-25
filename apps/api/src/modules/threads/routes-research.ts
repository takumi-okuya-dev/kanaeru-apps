// 宣伝とリサーチの窓口（threads-004）。道の頭は /api/v1/threads（AD-15）。ログインが要り、持ち主だけ（ほかの人のものは 404）。
// 解説とキーワードの案は、外の AI に貼るプロンプトを返すだけ（AI の段階1。アプリは外の AI に何も送らない。AD-20）。
// 貼り戻した答えは画面が読み取って利用者に見せ（parseExplanations・parseKeywordIdeas）、選んだものだけをここに送る。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import {
  KEYWORD_LIMIT,
  PROMOTION_LIMIT,
  REFERENCE_POST_LIMIT,
  THREADS_ERRORS,
  buildKeywordIdeaPrompt,
} from "@workspace/contracts/threads";
import { eq } from "drizzle-orm";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { findStrategy, toStrategyValues } from "./repository.ts";
import {
  createKeywords,
  createPromotion,
  createReferencePosts,
  deleteKeyword,
  deletePromotion,
  deleteReferencePost,
  explainPrompt,
  listKeywords,
  listPromotions,
  listReferencePosts,
  saveExplanations,
  toPromotion,
  updateKeyword,
  updatePromotion,
  updateReferencePost,
} from "./research.ts";
import {
  ACCOUNTS_BASE,
  AccountParams,
  COMMON_ERRORS,
  TAGS,
  accountMiddleware,
  body,
  json,
  ownedAccount,
} from "./route-helpers.ts";
import { threadsAccount } from "./schema.ts";

/**
 * 道の accountId と、もう1つの ID。
 * @param name 道の名前
 * @param description 説明
 * @returns zod の形
 */
function itemParams(name: string, description: string) {
  return z.object({
    accountId: uuidParam("accountId", "運用アカウントの ID"),
    itemId: uuidParam(name, description),
  });
}

/** 解説のプロンプトの問い合わせ。 */
const ExplainQuery = z.object({
  id: z
    .guid()
    .optional()
    .openapi({ param: { name: "id", in: "query" }, description: "1件だけのときの参考の投稿の ID" }),
});

/** 版が合わない・上限・同じものの応答。 */
const conflict = domainErrorResponse(
  THREADS_ERRORS.THREADS_VERSION_CONFLICT,
  "版が合わない（THREADS_VERSION_CONFLICT）・上限（THREADS_ITEM_LIMIT）・同じキーワード（THREADS_KEYWORD_DUPLICATE）",
);

/**
 * 宣伝とリサーチの窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function researchRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const middleware = accountMiddleware(deps);
  const base = ACCOUNTS_BASE;
  const tags = TAGS;
  const errors = COMMON_ERRORS;
  const PromotionParams = itemParams("itemId", "宣伝の ID");
  const ReferenceParams = itemParams("itemId", "参考の投稿の ID");
  const KeywordParams = itemParams("itemId", "キーワードの ID");
  const routes = {
    listPromotions: createRoute({
      method: "get",
      path: `${base}/{accountId}/promotions`,
      tags,
      operationId: "threadsListPromotions",
      summary: "宣伝の一覧（宣伝の対象を先に）と、宣伝の投稿の割合",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.PromotionList.openapi("ThreadsPromotionList"), "宣伝の一覧"),
        ...errors,
      },
    }),
    createPromotion: createRoute({
      method: "post",
      path: `${base}/{accountId}/promotions`,
      tags,
      operationId: "threadsCreatePromotion",
      summary: "宣伝を足す（イベントの情報は任意）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.PromotionInput.openapi("ThreadsPromotionInput")),
      },
      responses: {
        201: json(contract.Promotion.openapi("ThreadsPromotion"), "足した宣伝"),
        400: invalidInputResponse,
        409: conflict,
        ...errors,
      },
    }),
    updatePromotion: createRoute({
      method: "put",
      path: `${base}/{accountId}/promotions/{itemId}`,
      tags,
      operationId: "threadsUpdatePromotion",
      summary: "宣伝を直す（読んだ版と同じときだけ）",
      middleware,
      request: { params: PromotionParams, body: body(contract.PromotionUpdateInput) },
      responses: {
        200: json(contract.Promotion, "直した宣伝"),
        400: invalidInputResponse,
        409: conflict,
        ...errors,
      },
    }),
    deletePromotion: createRoute({
      method: "delete",
      path: `${base}/{accountId}/promotions/{itemId}`,
      tags,
      operationId: "threadsDeletePromotion",
      summary: "宣伝を消す",
      middleware,
      request: { params: PromotionParams },
      responses: { 204: { description: "消した" }, ...errors },
    }),
    putRatio: createRoute({
      method: "put",
      path: `${base}/{accountId}/promotion-ratio`,
      tags,
      operationId: "threadsPutPromotionRatio",
      summary: "宣伝の投稿の割合（％）を保存する",
      middleware,
      request: { params: AccountParams, body: body(contract.PromotionRatioInput) },
      responses: {
        200: json(contract.PromotionRatioInput, "保存した割合"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    listReferences: createRoute({
      method: "get",
      path: `${base}/{accountId}/reference-posts`,
      tags,
      operationId: "threadsListReferencePosts",
      summary: "参考の投稿の一覧（足した新しい順）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(
          contract.ReferencePostList.openapi("ThreadsReferencePostList"),
          "参考の投稿の一覧",
        ),
        ...errors,
      },
    }),
    createReferences: createRoute({
      method: "post",
      path: `${base}/{accountId}/reference-posts`,
      tags,
      operationId: "threadsCreateReferencePosts",
      summary: "参考の投稿を足す（まとめて20件まで）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ReferencePostBatchInput.openapi("ThreadsReferencePostBatchInput")),
      },
      responses: {
        201: json(
          z.object({ items: z.array(contract.ReferencePost.openapi("ThreadsReferencePost")) }),
          "足した参考の投稿",
        ),
        400: invalidInputResponse,
        409: conflict,
        ...errors,
      },
    }),
    updateReference: createRoute({
      method: "put",
      path: `${base}/{accountId}/reference-posts/{itemId}`,
      tags,
      operationId: "threadsUpdateReferencePost",
      summary: "参考の投稿を直す（読んだ版と同じときだけ）",
      middleware,
      request: { params: ReferenceParams, body: body(contract.ReferencePostUpdateInput) },
      responses: {
        200: json(contract.ReferencePost, "直した参考の投稿"),
        400: invalidInputResponse,
        409: conflict,
        ...errors,
      },
    }),
    deleteReference: createRoute({
      method: "delete",
      path: `${base}/{accountId}/reference-posts/{itemId}`,
      tags,
      operationId: "threadsDeleteReferencePost",
      summary: "参考の投稿を消す",
      middleware,
      request: { params: ReferenceParams },
      responses: { 204: { description: "消した" }, ...errors },
    }),
    explainPrompt: createRoute({
      method: "get",
      path: `${base}/{accountId}/reference-posts/explain-prompt`,
      tags,
      operationId: "threadsExplainPrompt",
      summary:
        "「なぜ良いか」の解説を外の AI に頼むプロンプト（id で1件、なしで解説がまだのものを10件まで）",
      middleware,
      request: { params: AccountParams, query: ExplainQuery },
      responses: {
        200: json(contract.ExplainPrompt.openapi("ThreadsExplainPrompt"), "プロンプト"),
        ...errors,
      },
    }),
    saveExplanations: createRoute({
      method: "post",
      path: `${base}/{accountId}/reference-posts/explanations`,
      tags,
      operationId: "threadsSaveExplanations",
      summary: "貼り戻した解説を保存する（解説がまだのものだけ。ほかは飛ばす）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ExplanationsInput.openapi("ThreadsExplanationsInput")),
      },
      responses: {
        200: json(contract.ExplanationsResult.openapi("ThreadsExplanationsResult"), "保存した結果"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    listKeywords: createRoute({
      method: "get",
      path: `${base}/{accountId}/research-keywords`,
      tags,
      operationId: "threadsListResearchKeywords",
      summary: "リサーチのキーワードの一覧",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(
          contract.ResearchKeywordList.openapi("ThreadsResearchKeywordList"),
          "キーワードの一覧",
        ),
        ...errors,
      },
    }),
    createKeywords: createRoute({
      method: "post",
      path: `${base}/{accountId}/research-keywords`,
      tags,
      operationId: "threadsCreateResearchKeywords",
      summary: "キーワードを足す（まとめて20個まで。同じものがあれば、どれも足さない）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ResearchKeywordBatchInput.openapi("ThreadsResearchKeywordBatchInput")),
      },
      responses: {
        201: json(
          z.object({ items: z.array(contract.ResearchKeyword.openapi("ThreadsResearchKeyword")) }),
          "足したキーワード",
        ),
        400: invalidInputResponse,
        409: conflict,
        ...errors,
      },
    }),
    updateKeyword: createRoute({
      method: "put",
      path: `${base}/{accountId}/research-keywords/{itemId}`,
      tags,
      operationId: "threadsUpdateResearchKeyword",
      summary: "キーワードを直す（読んだ版と同じときだけ）",
      middleware,
      request: { params: KeywordParams, body: body(contract.ResearchKeywordUpdateInput) },
      responses: {
        200: json(contract.ResearchKeyword, "直したキーワード"),
        400: invalidInputResponse,
        409: conflict,
        ...errors,
      },
    }),
    deleteKeyword: createRoute({
      method: "delete",
      path: `${base}/{accountId}/research-keywords/{itemId}`,
      tags,
      operationId: "threadsDeleteResearchKeyword",
      summary: "キーワードを消す",
      middleware,
      request: { params: KeywordParams },
      responses: { 204: { description: "消した" }, ...errors },
    }),
    ideaPrompt: createRoute({
      method: "get",
      path: `${base}/{accountId}/research-keywords/idea-prompt`,
      tags,
      operationId: "threadsKeywordIdeaPrompt",
      summary: "キーワードの案を外の AI に頼むプロンプト（戦略から作る）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.KeywordIdeaPrompt.openapi("ThreadsKeywordIdeaPrompt"), "プロンプト"),
        ...errors,
      },
    }),
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.listPromotions, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      const items = await listPromotions(db, account.id, new Date());
      return c.json(
        { items, limit: PROMOTION_LIMIT, ratioPercent: account.promotionRatioPercent },
        200,
      );
    })
    .openapi(routes.createPromotion, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "write_content");
      const row = await createPromotion(db, account.id, c.req.valid("json"));
      return c.json(toPromotion(row, new Date()), 201);
    })
    .openapi(routes.updatePromotion, async (c) => {
      const { accountId, itemId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "write_content");
      const { version, ...input } = c.req.valid("json");
      const row = await updatePromotion(db, account.id, itemId, input, version);
      return c.json(toPromotion(row, new Date()), 200);
    })
    .openapi(routes.deletePromotion, async (c) => {
      const { accountId, itemId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "write_content");
      if (!(await deletePromotion(db, account.id, itemId))) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    })
    .openapi(routes.putRatio, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const { ratioPercent } = c.req.valid("json");
      await db
        .update(threadsAccount)
        .set({ promotionRatioPercent: ratioPercent })
        .where(eq(threadsAccount.id, account.id));
      return c.json({ ratioPercent }, 200);
    })
    .openapi(routes.listReferences, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      return c.json(
        {
          items: await listReferencePosts(db, account.id, new Date()),
          limit: REFERENCE_POST_LIMIT,
        },
        200,
      );
    })
    .openapi(routes.createReferences, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "write_content");
      const items = await createReferencePosts(
        db,
        account.id,
        c.req.valid("json").items,
        new Date(),
      );
      return c.json({ items }, 201);
    })
    .openapi(routes.updateReference, async (c) => {
      const { accountId, itemId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "write_content");
      const { post, version } = c.req.valid("json");
      return c.json(
        await updateReferencePost(db, account.id, itemId, post, version, new Date()),
        200,
      );
    })
    .openapi(routes.deleteReference, async (c) => {
      const { accountId, itemId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "write_content");
      if (!(await deleteReferencePost(db, account.id, itemId))) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    })
    .openapi(routes.explainPrompt, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      const strategy = toStrategyValues(await findStrategy(db, account.id));
      return c.json(
        await explainPrompt(db, account.id, strategy, c.req.valid("query").id, new Date()),
        200,
      );
    })
    .openapi(routes.saveExplanations, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "write_content");
      return c.json(await saveExplanations(db, account.id, c.req.valid("json").items), 200);
    })
    .openapi(routes.listKeywords, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      return c.json({ items: await listKeywords(db, account.id), limit: KEYWORD_LIMIT }, 200);
    })
    .openapi(routes.createKeywords, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "write_content");
      const items = await createKeywords(db, account.id, c.req.valid("json").items, new Date());
      return c.json({ items }, 201);
    })
    .openapi(routes.updateKeyword, async (c) => {
      const { accountId, itemId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "write_content");
      const { version, ...input } = c.req.valid("json");
      return c.json(await updateKeyword(db, account.id, itemId, input, version), 200);
    })
    .openapi(routes.deleteKeyword, async (c) => {
      const { accountId, itemId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "write_content");
      if (!(await deleteKeyword(db, account.id, itemId))) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    })
    .openapi(routes.ideaPrompt, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      const strategy = toStrategyValues(await findStrategy(db, account.id));
      return c.json({ prompt: buildKeywordIdeaPrompt(strategy) }, 200);
    });
}
