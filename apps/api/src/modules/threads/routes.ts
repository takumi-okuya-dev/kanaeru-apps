// Threads の運用の窓口（運用アカウント・戦略・プロンプト・投稿のルール・投稿の案・承認と却下）。threads-001。
// threads-011：承認・却下はできるものだけ変える・まとめて消す・ためたのを取り消す・承認済みも直せる・NG ワードをまとめて足す・投稿済みは50件ずつ。
// 道はすべて createRoute で書き、道の頭は /api/v1/threads（AD-15）。どの道もログインが要る（account の requireSession）。
// 記録は持ち主の kanaeru のアカウントのもので、ほかの人の運用アカウントは、ないのと同じ 404 にする（AD-19）。
// アプリの台帳（suite の app_setting）で見えなければ、どの道も 404（組み立てが requireApp を付ける。AD-16）。
// 投稿の本文・戦略・NG ワードはログに出さない（このファイルは logger を使わない）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import {
  PROMPT_RECENT_DRAFTS,
  PROMPT_REJECTED_DRAFTS,
  THREADS_ACCOUNT_LIMIT,
  THREADS_ERRORS,
  buildPrompt,
  findPasteProblem,
  isOverThreadsLimit,
  jstToday,
  rejectReasonLabel,
  splitDrafts,
} from "@workspace/contracts/threads";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount } from "../account/index.ts";
import {
  countDrafts,
  createAccount,
  createBatch,
  deleteAccount,
  deleteNgWord,
  emptyDraftCounts,
  findDraft,
  findStrategy,
  listAccounts,
  listCompareBodies,
  listDrafts,
  listNgWords,
  listRecentDraftBodies,
  listRecentRejected,
  renameAccount,
  saveCoreRules,
  savePromptSettings,
  saveStrategy,
  toPromptSettings,
  toStrategyValues,
} from "./repository.ts";
import type { ThreadsAccountRecord } from "./repository.ts";
import {
  addNgWords,
  deleteDraftsLocked,
  editDraft,
  listPublishedPage,
  reviewDrafts,
  undoBatch,
} from "./drafts.ts";
import {
  ACCOUNTS_BASE,
  AccountParams,
  COMMON_ERRORS,
  DraftParams,
  TAGS,
  accountMiddleware,
  body,
  coreRuleLines,
  accountAccess,
  json,
  ownedAccount,
} from "./route-helpers.ts";
import {
  deletableDraftIds,
  draftActorNames,
  listAssignedAccounts,
  withDraftActors,
} from "./team.ts";
import { recordActivity } from "./activity-log.ts";
import { queueSchedule } from "./auto-post-status.ts";
import { trendsForAccountPrompt } from "./analysis.ts";
import { loadMentions } from "./mention.ts";
import { listPoorForPrompt } from "./performance.ts";
import { listPromptPromotions, listPromptReferencePosts } from "./research.ts";
import { readPostingSchedule } from "./posting-schedule.ts";
import { toDraftCounts, toNgWord, toPostDraft, toStrategy, toThreadsAccount } from "./views.ts";

/** 道の accountId と ngWordId。 */
const NgWordParams = z.object({
  accountId: uuidParam("accountId", "運用アカウントの ID"),
  ngWordId: uuidParam("ngWordId", "NG ワードの ID"),
});

/** 道の accountId と batchId。 */
const BatchParams = z.object({
  accountId: uuidParam("accountId", "運用アカウントの ID"),
  batchId: uuidParam("batchId", "ためたまとまりの ID"),
});

/** 案の一覧の問い合わせ（文書の説明つき）。 */
const DraftQuery = z.object({
  status: contract.DraftListQuery.shape.status.openapi({
    param: { name: "status", in: "query" },
    description:
      "状態（needs_review：承認待ち・approved：承認済み〈投稿中を含む〉・published：投稿済み・publish_failed：投稿に失敗・rejected：却下）",
  }),
  before: contract.DraftListQuery.shape.before.openapi({
    param: { name: "before", in: "query" },
    description: "投稿済みの続きを読むときの、前の応答の nextCursor（threads-011）",
  }),
});

/** 版が合わない応答。 */
const versionConflictResponse = domainErrorResponse(
  THREADS_ERRORS.THREADS_VERSION_CONFLICT,
  "ほかの画面で先に直された（版が合わない）",
);

/**
 * Threads の運用の窓口の道の定義（middleware に deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  // 機能の印が切なら、ログインの確かめより先に 404（窓口があることを知らせない）
  const middleware = accountMiddleware(deps);
  const tags = TAGS;
  const base = ACCOUNTS_BASE;
  const errors = COMMON_ERRORS;
  return {
    listAccounts: createRoute({
      method: "get",
      path: base,
      tags,
      operationId: "threadsListAccounts",
      summary: "自分の運用アカウントの一覧（作った古い順。状態ごとの案の数つき）",
      middleware,
      responses: {
        200: json(
          contract.ThreadsAccountList.openapi("ThreadsAccountList"),
          "運用アカウントの一覧",
        ),
        ...errors,
      },
    }),
    createAccount: createRoute({
      method: "post",
      path: base,
      tags,
      operationId: "threadsCreateAccount",
      summary: "運用アカウントを作る（名前だけ。Threads への接続はあとで）",
      middleware,
      request: { body: body(contract.ThreadsAccountInput.openapi("ThreadsAccountInput")) },
      responses: {
        201: json(contract.ThreadsAccount.openapi("ThreadsAccount"), "作った運用アカウント"),
        400: invalidInputResponse,
        409: domainErrorResponse(THREADS_ERRORS.THREADS_ACCOUNT_LIMIT, "持てる数の上限"),
        ...errors,
      },
    }),
    getAccount: createRoute({
      method: "get",
      path: `${base}/{accountId}`,
      tags,
      operationId: "threadsGetAccount",
      summary: "運用アカウント（自分のものだけ）",
      middleware,
      request: { params: AccountParams },
      responses: { 200: json(contract.ThreadsAccount, "運用アカウント"), ...errors },
    }),
    renameAccount: createRoute({
      method: "patch",
      path: `${base}/{accountId}`,
      tags,
      operationId: "threadsRenameAccount",
      summary: "運用アカウントの名前を直す",
      middleware,
      request: { params: AccountParams, body: body(contract.ThreadsAccountInput) },
      responses: {
        200: json(contract.ThreadsAccount, "直した運用アカウント"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    deleteAccount: createRoute({
      method: "delete",
      path: `${base}/{accountId}`,
      tags,
      operationId: "threadsDeleteAccount",
      summary:
        "運用アカウントを消す（戦略・案・NG ワードも一緒に消える。元に戻せない。アカウントの名前を入れて確かめる）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ThreadsAccountDeleteInput.openapi("ThreadsAccountDeleteInput")),
      },
      responses: {
        204: { description: "消した" },
        400: domainErrorResponse(
          THREADS_ERRORS.THREADS_ACCOUNT_NAME_MISMATCH,
          "入れた名前が合わない（THREADS_ACCOUNT_NAME_MISMATCH）・入力の誤り",
        ),
        ...errors,
      },
    }),
    getStrategy: createRoute({
      method: "get",
      path: `${base}/{accountId}/strategy`,
      tags,
      operationId: "threadsGetStrategy",
      summary: "戦略（まだ保存していなければ空の値と版 0）",
      middleware,
      request: { params: AccountParams },
      responses: { 200: json(contract.Strategy.openapi("ThreadsStrategy"), "戦略"), ...errors },
    }),
    putStrategy: createRoute({
      method: "put",
      path: `${base}/{accountId}/strategy`,
      tags,
      operationId: "threadsPutStrategy",
      summary: "戦略を保存する（全部を置きかえる。読んだ版と同じときだけ）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.StrategyInput.openapi("ThreadsStrategyInput")),
      },
      responses: {
        200: json(contract.Strategy, "保存した戦略"),
        400: invalidInputResponse,
        409: versionConflictResponse,
        ...errors,
      },
    }),
    getPromptSettings: createRoute({
      method: "get",
      path: `${base}/{accountId}/prompt-settings`,
      tags,
      operationId: "threadsGetPromptSettings",
      summary: "プロンプトの設定（作る件数と文字数）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.PromptSettings.openapi("ThreadsPromptSettings"), "プロンプトの設定"),
        ...errors,
      },
    }),
    putPromptSettings: createRoute({
      method: "put",
      path: `${base}/{accountId}/prompt-settings`,
      tags,
      operationId: "threadsPutPromptSettings",
      summary: "プロンプトの設定を保存する",
      middleware,
      request: { params: AccountParams, body: body(contract.PromptSettings) },
      responses: {
        200: json(contract.PromptSettings, "保存した設定"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    getPrompt: createRoute({
      method: "get",
      path: `${base}/{accountId}/prompt`,
      tags,
      operationId: "threadsGetPrompt",
      summary:
        "外の AI に貼るプロンプト（戦略・投稿のルール・NG ワード・最近の案・却下の理由・低調の投稿から作る。アプリは外の AI に何も送らない）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(
          contract.GeneratedPrompt.openapi("ThreadsPrompt"),
          "プロンプトと、入れたものの要約",
        ),
        ...errors,
      },
    }),
    getPostingRules: createRoute({
      method: "get",
      path: `${base}/{accountId}/posting-rules`,
      tags,
      operationId: "threadsGetPostingRules",
      summary: "投稿のルールと NG ワード",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.PostingRules.openapi("ThreadsPostingRules"), "投稿のルールと NG ワード"),
        ...errors,
      },
    }),
    putCoreRules: createRoute({
      method: "put",
      path: `${base}/{accountId}/core-rules`,
      tags,
      operationId: "threadsPutCoreRules",
      summary: "投稿のルールを保存する（1行に1つ）",
      middleware,
      request: { params: AccountParams, body: body(contract.CoreRulesInput) },
      responses: {
        200: json(contract.PostingRules, "保存したあとの投稿のルールと NG ワード"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    addNgWords: createRoute({
      method: "post",
      path: `${base}/{accountId}/ng-words`,
      tags,
      operationId: "threadsAddNgWords",
      summary:
        "NG ワードをまとめて足す（照合の形で同じものは足さずに返す。足した語を含む承認済みの案は承認待ちに戻す。threads-011）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.NgWordsInput.openapi("ThreadsNgWordsInput")),
      },
      responses: {
        201: json(contract.NgWordsResult.openapi("ThreadsNgWordsResult"), "足した結果"),
        400: invalidInputResponse,
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_NG_WORD_LIMIT,
          "上限を超える（何も足さない）",
        ),
        ...errors,
      },
    }),
    deleteNgWord: createRoute({
      method: "delete",
      path: `${base}/{accountId}/ng-words/{ngWordId}`,
      tags,
      operationId: "threadsDeleteNgWord",
      summary: "NG ワードを外す",
      middleware,
      request: { params: NgWordParams },
      responses: { 204: { description: "外した" }, ...errors },
    }),
    createBatch: createRoute({
      method: "post",
      path: `${base}/{accountId}/draft-batches`,
      tags,
      operationId: "threadsCreateDraftBatch",
      summary:
        "外の AI の答えを貼って、案をまとめてためる（@@@ の行で分ける。区切りがなければ1件。同じ clientRequestId は二重にためない）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.DraftBatchInput.openapi("ThreadsDraftBatchInput")),
      },
      responses: {
        201: json(contract.DraftBatchResult.openapi("ThreadsDraftBatchResult"), "ためた案"),
        400: invalidInputResponse,
        409: domainErrorResponse(THREADS_ERRORS.THREADS_DRAFT_LIMIT, "承認待ちの案が多すぎる"),
        ...errors,
      },
    }),
    undoBatch: createRoute({
      method: "delete",
      path: `${base}/{accountId}/draft-batches/{batchId}`,
      tags,
      operationId: "threadsUndoDraftBatch",
      summary:
        "ためた1回分を取り消す（そのまとまりの承認待ちの案だけを消す。承認・却下したものは残す。threads-011）",
      middleware,
      request: { params: BatchParams },
      responses: {
        200: json(contract.DeletedCount.openapi("ThreadsDeletedCount"), "消した数"),
        ...errors,
      },
    }),
    deleteDrafts: createRoute({
      method: "post",
      path: `${base}/{accountId}/drafts/delete`,
      tags,
      operationId: "threadsDeleteDrafts",
      summary:
        "案をまとめて消す（承認待ちと却下だけ。ほかの状態・ない ID は無視する。元に戻せない。threads-011）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.DraftDeleteInput.openapi("ThreadsDraftDeleteInput")),
      },
      responses: {
        200: json(contract.DeletedCount, "消した数"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    listDrafts: createRoute({
      method: "get",
      path: `${base}/{accountId}/drafts`,
      tags,
      operationId: "threadsListDrafts",
      summary:
        "投稿の案の一覧（状態ごと。投稿済みは50件ずつ）と、似ている度合いを比べる相手（承認待ち・承認済み・却下）",
      middleware,
      request: { params: AccountParams, query: DraftQuery },
      responses: {
        200: json(contract.DraftList.openapi("ThreadsDraftList"), "投稿の案の一覧"),
        400: invalidInputResponse,
        ...errors,
      },
    }),
    updateDraft: createRoute({
      method: "put",
      path: `${base}/{accountId}/drafts/{draftId}`,
      tags,
      operationId: "threadsUpdateDraft",
      summary:
        "承認待ち・承認済みの案の本文を直す（読んだ版と同じときだけ。承認済みは承認待ちに戻る。threads-011）",
      middleware,
      request: { params: DraftParams, body: body(contract.DraftUpdateInput) },
      responses: {
        200: json(contract.PostDraft.openapi("ThreadsPostDraft"), "直した案"),
        400: invalidInputResponse,
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_VERSION_CONFLICT,
          "版が合わない（THREADS_VERSION_CONFLICT）・承認待ちでも承認済みでもない（THREADS_DRAFT_STATE）・投稿中（THREADS_PUBLISHING）",
        ),
        ...errors,
      },
    }),
    deleteDraft: createRoute({
      method: "delete",
      path: `${base}/{accountId}/drafts/{draftId}`,
      tags,
      operationId: "threadsDeleteDraft",
      summary:
        "投稿の案を消す（承認待ち・却下だけ。承認済み・投稿に失敗は承認待ちに戻してから。投稿済み・投稿中は消せない。threads-011）",
      middleware,
      request: { params: DraftParams },
      responses: {
        204: { description: "消した" },
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_DRAFT_STATE,
          "今の状態では消せない（THREADS_DRAFT_STATE）・投稿中（THREADS_PUBLISHING）",
        ),
        ...errors,
      },
    }),
    review: createRoute({
      method: "post",
      path: `${base}/{accountId}/drafts/review`,
      tags,
      operationId: "threadsReviewDrafts",
      summary:
        "案を承認する・却下する・承認待ちに戻す（まとめて。1件ずつ確かめ、できるものだけ変え、できなかったものは理由を返す。同じ requestId の送り直しは二重に変えない。threads-011）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ReviewInput.openapi("ThreadsReviewInput")),
      },
      responses: {
        200: json(
          contract.ReviewResult.openapi("ThreadsReviewResult"),
          "変えた案・変えなかった案と理由（NOT_FOUND・STALE・PUBLISHING・NG_WORD・OVER_THREADS_LIMIT・POLICY_CONFIRM_REQUIRED・LIMIT）・変えたあとの数",
        ),
        400: invalidInputResponse,
        ...errors,
      },
    }),
  };
}

/**
 * 投稿のルールと NG ワードを読む。
 * @param deps 土台が渡す道具
 * @param account 運用アカウント
 * @returns 投稿のルールと NG ワード
 */
async function postingRules(
  deps: DomainRouteDeps,
  account: ThreadsAccountRecord,
): Promise<contract.PostingRules> {
  const ngWords = await listNgWords(deps.db, account.id);
  return { coreRules: account.coreRules, ngWords: ngWords.map(toNgWord) };
}

/**
 * Threads の運用の窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function threadsRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.listAccounts, async (c) => {
      const me = currentAccount(c).accountId;
      const rows = await listAccounts(db, me);
      // 担当している運用アカウント（ほかの人のもの。持ち主の上限に数えない。threads-013 FR-T24）
      const assigned = await listAssignedAccounts(db, me);
      return c.json(
        {
          accounts: rows.map(({ account, counts }) => toThreadsAccount(account, counts)),
          limit: THREADS_ACCOUNT_LIMIT,
          assigned: assigned.map((row) => ({
            ...toThreadsAccount(row.account, row.counts),
            // 持ち主の「最後に開いた」は担当の人に見せない
            lastOpenedAt: null,
            ownerName: row.ownerName,
            organizationName: row.organizationName,
          })),
        },
        200,
      );
    })
    .openapi(routes.createAccount, async (c) => {
      const { name } = c.req.valid("json");
      const account = await createAccount(db, currentAccount(c).accountId, name);
      if (!account) throw new AppError(THREADS_ERRORS.THREADS_ACCOUNT_LIMIT);
      return c.json(toThreadsAccount(account, emptyDraftCounts()), 201);
    })
    .openapi(routes.getAccount, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_content");
      return c.json(toThreadsAccount(account, await countDrafts(db, account.id)), 200);
    })
    .openapi(routes.renameAccount, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const renamed = await renameAccount(db, account.id, c.req.valid("json").name);
      if (!renamed) throw new AppError("NOT_FOUND");
      return c.json(toThreadsAccount(renamed, await countDrafts(db, renamed.id)), 200);
    })
    .openapi(routes.deleteAccount, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      // 消す前に、アカウントの名前をそのまま入れてもらう（めぐるの account-service.ts。threads-012）
      if (!contract.confirmNameMatches(c.req.valid("json").confirmName, account.name))
        throw new AppError(THREADS_ERRORS.THREADS_ACCOUNT_NAME_MISMATCH);
      if (!(await deleteAccount(db, account.id))) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    })
    .openapi(routes.getStrategy, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_content");
      return c.json(toStrategy(await findStrategy(db, account.id)), 200);
    })
    .openapi(routes.putStrategy, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "write_content");
      const { version, ...values } = c.req.valid("json");
      const saved = await saveStrategy(db, account.id, values, version);
      if (!saved) throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
      return c.json(toStrategy(saved), 200);
    })
    .openapi(routes.getPromptSettings, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      return c.json(toPromptSettings(account), 200);
    })
    .openapi(routes.putPromptSettings, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const saved = await savePromptSettings(db, account.id, c.req.valid("json"));
      if (!saved) throw new AppError("NOT_FOUND");
      return c.json(toPromptSettings(saved), 200);
    })
    .openapi(routes.getPrompt, async (c) => {
      // 段階1（コピーして貼る）は担当の人も使える（PRD 組織 O13。kanaeru からは何も送らない）
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      const [strategy, ngWords, recentDrafts, rejected, poorPosts, schedule] = await Promise.all([
        findStrategy(db, account.id),
        listNgWords(db, account.id),
        listRecentDraftBodies(db, account.id, PROMPT_RECENT_DRAFTS),
        listRecentRejected(db, account.id, PROMPT_REJECTED_DRAFTS),
        // 反応が低調だった投稿（threads-003）と、1日の投稿の数（threads-002）
        listPoorForPrompt(db, account.id),
        readPostingSchedule(db, account.id),
      ]);
      // 宣伝と参考の投稿（threads-004）
      const now = new Date();
      const settings = toPromptSettings(account);
      const coreRules = coreRuleLines(account.coreRules);
      const ngWordList = ngWords.map((ngWord) => ngWord.word);
      // 伸びた傾向（threads-006。分析の設定で「入れる」のときだけ）
      const [promotions, referencePosts, trends] = await Promise.all([
        listPromptPromotions(db, account.id, now),
        listPromptReferencePosts(db, account.id, now),
        trendsForAccountPrompt(db, account.id, settings.length, coreRules, ngWordList, now),
      ]);
      const built = buildPrompt({
        count: settings.count,
        displayName: account.name,
        strategy: toStrategyValues(strategy),
        today: jstToday(now),
        promotions,
        promotionRatioPercent: account.promotionRatioPercent,
        referencePosts,
        recentDrafts,
        coreRules,
        ngWords: ngWordList,
        rejectedDrafts: rejected.map((draft) => ({
          body: draft.body,
          reasonLabels: (draft.rejectReasons ?? []).map(rejectReasonLabel),
          note: draft.rejectNote,
        })),
        lengthSettings: settings.length,
        dailyPostCount: schedule?.enabled ? schedule.slotMinutes.length : 0,
        poorPosts: poorPosts.map(({ body: poorBody, memo }) => ({ body: poorBody, memo })),
        trends,
      });
      return c.json(
        {
          prompt: built.prompt,
          parts: built.parts.filter((part) => part !== ""),
          summary: built.summary,
          count: settings.count,
        },
        200,
      );
    })
    .openapi(routes.getPostingRules, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      return c.json(await postingRules(deps, account), 200);
    })
    .openapi(routes.putCoreRules, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const saved = await saveCoreRules(db, account.id, c.req.valid("json").coreRules);
      if (!saved) throw new AppError("NOT_FOUND");
      return c.json(await postingRules(deps, saved), 200);
    })
    .openapi(routes.addNgWords, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const result = await addNgWords(db, account.id, c.req.valid("json").words);
      if (result.kind === "limit") throw new AppError(THREADS_ERRORS.THREADS_NG_WORD_LIMIT);
      // すべてもうある語なら、変えていないので記録しない
      if (result.added.length > 0) {
        await recordActivity(deps, account.id, {
          kind: "settings",
          action: "ng_word_added",
          itemCount: result.added.length,
          summary: result.added.map((row) => row.word).join("、"),
          actorAccountId: currentAccount(c).accountId,
        });
      }
      return c.json(
        {
          added: result.added.map(toNgWord),
          duplicates: result.duplicates,
          reopenedCount: result.reopened,
        },
        201,
      );
    })
    .openapi(routes.deleteNgWord, async (c) => {
      const { accountId, ngWordId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      if (!(await deleteNgWord(db, account.id, ngWordId))) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    })
    .openapi(routes.createBatch, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "write_content");
      const input = c.req.valid("json");
      const { parts, delimiterFound } = splitDrafts(input.text);
      const problem = parts.length === 0 ? "empty" : findPasteProblem(input.text, parts);
      if (problem) {
        const message =
          problem === "empty"
            ? "貼り付ける文を入れてください。"
            : problem === "text"
              ? `1回に貼れるのは${contract.PASTE_MAX_CHARS.toLocaleString("ja-JP")}文字までです。`
              : problem === "drafts"
                ? `1回にためられるのは${contract.PASTE_MAX_DRAFTS}件までです。分けて貼ってください。`
                : `${problem.slice("draft:".length)}件目が${contract.DRAFT_BODY_MAX.toLocaleString("ja-JP")}文字を超えています。区切り（@@@）を確かめてください。`;
        throw new AppError("INVALID_INPUT", { fields: [{ path: "text", message }] });
      }
      const result = await createBatch(db, account.id, {
        clientRequestId: input.clientRequestId,
        parts,
        delimiterFound,
        actorAccountId: currentAccount(c).accountId,
      });
      if (result.kind === "limit") throw new AppError(THREADS_ERRORS.THREADS_DRAFT_LIMIT);
      return c.json(
        {
          batchId: result.batchId,
          draftCount: result.draftCount,
          delimiterFound: result.delimiterFound,
          overLimitCount: result.drafts.filter((draft) => isOverThreadsLimit(draft.body)).length,
          drafts: result.drafts.map((draft) => toPostDraft(draft)),
        },
        201,
      );
    })
    .openapi(routes.undoBatch, async (c) => {
      const { accountId, batchId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "write_content");
      const deleted = await undoBatch(db, account.id, batchId);
      if (!deleted) throw new AppError("NOT_FOUND");
      if (deleted.length > 0) {
        await recordActivity(deps, account.id, {
          kind: "draft",
          action: "batch_undone",
          itemCount: deleted.length,
          summary: deleted[0]?.body ?? null,
          actorAccountId: currentAccount(c).accountId,
        });
      }
      return c.json({ deletedCount: deleted.length }, 200);
    })
    .openapi(routes.deleteDrafts, async (c) => {
      const access = await accountAccess(deps, c, c.req.valid("param").accountId, "write_content");
      const { account } = access;
      // 承認を任されていない担当の人は、承認待ちの案だけを消せる（却下の案を消すのは承認と同じ扱い。PRD 組織 5.2）
      const ids = await deletableDraftIds(db, access, c.req.valid("json").ids);
      const deleted = await deleteDraftsLocked(db, account.id, ids);
      if (deleted.length > 0) {
        await recordActivity(deps, account.id, {
          kind: "draft",
          action: "drafts_deleted",
          itemCount: deleted.length,
          summary: deleted[0]?.body ?? null,
          actorAccountId: currentAccount(c).accountId,
        });
      }
      return c.json({ deletedCount: deleted.length }, 200);
    })
    .openapi(routes.listDrafts, async (c) => {
      const access = await accountAccess(deps, c, c.req.valid("param").accountId, "read_content");
      const { account } = access;
      const { status, before } = c.req.valid("query");
      // 投稿済みは50件ずつ読む（タブを開いたときだけ。めぐるの 005 research.md R14）
      const [page, compareWith] = await Promise.all([
        status === "published"
          ? listPublishedPage(db, account.id, before)
          : listDrafts(db, account.id, status).then((rows) => ({
              drafts: rows,
              nextCursor: null,
            })),
        listCompareBodies(db, account.id),
      ]);
      const { drafts } = page;
      const [schedule, mentions] = await Promise.all([
        status === "approved" ? queueSchedule(db, account, drafts, new Date()) : {},
        // 時間差のメンション（threads-007）
        loadMentions(db, drafts, account.username),
      ]);
      // 組織に入っている運用アカウントでは、作った人・最後に直した人の表示名を出す（threads-013 FR-T50）
      const actors = access.placed ? await draftActorNames(db, drafts) : null;
      return c.json(
        {
          drafts: drafts.map((draft) =>
            withDraftActors(toPostDraft(draft, mentions.get(draft.id) ?? null), draft, actors),
          ),
          schedule,
          compareWith,
          nextCursor: page.nextCursor,
        },
        200,
      );
    })
    .openapi(routes.updateDraft, async (c) => {
      const { accountId, draftId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "write_content");
      const outcome = await editDraft(
        db,
        account.id,
        draftId,
        c.req.valid("json"),
        currentAccount(c).accountId,
      );
      // 直せなかった理由を分ける（ない・投稿中・今の状態・版が合わない）
      if (outcome.kind === "not_found") throw new AppError("NOT_FOUND");
      if (outcome.kind === "publishing") throw new AppError(THREADS_ERRORS.THREADS_PUBLISHING);
      if (outcome.kind === "state") throw new AppError(THREADS_ERRORS.THREADS_DRAFT_STATE);
      if (outcome.kind === "conflict") throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
      const mentions = await loadMentions(db, [outcome.draft], account.username);
      return c.json(toPostDraft(outcome.draft, mentions.get(outcome.draft.id) ?? null), 200);
    })
    .openapi(routes.deleteDraft, async (c) => {
      const { accountId, draftId } = c.req.valid("param");
      const access = await accountAccess(deps, c, accountId, "write_content");
      const { account } = access;
      if ((await deletableDraftIds(db, access, [draftId])).length === 0) {
        throw new AppError(THREADS_ERRORS.THREADS_TEAM_FORBIDDEN);
      }
      const [deleted] = await deleteDraftsLocked(db, account.id, [draftId]);
      if (!deleted) {
        // 消せなかった理由を分ける（ない・投稿中・今の状態では消せない）
        const current = await findDraft(db, account.id, draftId);
        if (!current) throw new AppError("NOT_FOUND");
        if (current.status === "publishing") throw new AppError(THREADS_ERRORS.THREADS_PUBLISHING);
        throw new AppError(THREADS_ERRORS.THREADS_DRAFT_STATE);
      }
      return c.body(null, 204);
    })
    .openapi(routes.review, async (c) => {
      // 承認・却下は持ち主か、承認を任された担当の人だけ。どちらも同じ確かめ（NG ワード・上限・規約の注意）を通る（FR-T11）
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "review");
      const input = c.req.valid("json");
      const actorAccountId = currentAccount(c).accountId;
      const outcome = await reviewDrafts(db, account.id, input, actorAccountId);
      // 1回の操作を1行で記録する。同じ requestId の送り直しでは変えていないので書かない
      if (outcome.changed.length > 0) {
        await recordActivity(deps, account.id, {
          kind: "review",
          action:
            input.action === "approve"
              ? outcome.requeuedOnly
                ? "drafts_requeued"
                : "drafts_approved"
              : input.action === "reject"
                ? "drafts_rejected"
                : "drafts_reopened",
          itemCount: outcome.changed.length,
          summary: outcome.changed[0]?.body ?? null,
          actorAccountId,
        });
      }
      const mentions = await loadMentions(db, outcome.updated, account.username);
      return c.json(
        {
          drafts: outcome.updated.map((draft) =>
            toPostDraft(draft, mentions.get(draft.id) ?? null),
          ),
          skipped: outcome.skipped,
          counts: toDraftCounts(outcome.counts),
        },
        200,
      );
    });
}
