// Threads の運用の窓口（運用アカウント・戦略・プロンプト・投稿のルール・投稿の案・承認と却下）。threads-001。
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
  checkPublishable,
  findPasteProblem,
  jstToday,
  rejectReasonLabel,
  splitDrafts,
} from "@workspace/contracts/threads";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount } from "../account/index.ts";
import {
  addNgWord,
  changeDraftState,
  countDrafts,
  createAccount,
  createBatch,
  deleteAccount,
  deleteDraft,
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
  lockDrafts,
  renameAccount,
  saveCoreRules,
  savePromptSettings,
  saveStrategy,
  toPromptSettings,
  toStrategyValues,
  updateDraftBody,
} from "./repository.ts";
import type { PostDraftRecord, ThreadsAccountRecord } from "./repository.ts";
import {
  ACCOUNTS_BASE,
  AccountParams,
  COMMON_ERRORS,
  DraftParams,
  TAGS,
  accountMiddleware,
  body,
  coreRuleLines,
  json,
  ownedAccount,
} from "./route-helpers.ts";
import { recordActivity } from "./activity-log.ts";
import { queueSchedule } from "./auto-post-status.ts";
import { trendsForAccountPrompt } from "./analysis.ts";
import { dropPendingMentions, loadMentions, pendingMentionTexts } from "./mention.ts";
import { listPoorForPrompt } from "./performance.ts";
import { listPromptPromotions, listPromptReferencePosts } from "./research.ts";
import { readPostingSchedule } from "./posting-schedule.ts";
import { toNgWord, toPostDraft, toStrategy, toThreadsAccount } from "./views.ts";

/** 道の accountId と ngWordId。 */
const NgWordParams = z.object({
  accountId: uuidParam("accountId", "運用アカウントの ID"),
  ngWordId: uuidParam("ngWordId", "NG ワードの ID"),
});

/** 案の一覧の問い合わせ（文書の説明つき）。 */
const DraftQuery = z.object({
  status: contract.DraftListQuery.shape.status.openapi({
    param: { name: "status", in: "query" },
    description:
      "状態（needs_review：承認待ち・approved：承認済み〈投稿中を含む〉・published：投稿済み・publish_failed：投稿に失敗・rejected：却下）",
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
      summary: "運用アカウントを消す（戦略・案・NG ワードも一緒に消える。元に戻せない）",
      middleware,
      request: { params: AccountParams },
      responses: { 204: { description: "消した" }, ...errors },
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
    addNgWord: createRoute({
      method: "post",
      path: `${base}/{accountId}/ng-words`,
      tags,
      operationId: "threadsAddNgWord",
      summary: "NG ワードを足す（照合の形で同じものは1つ）",
      middleware,
      request: { params: AccountParams, body: body(contract.NgWordInput) },
      responses: {
        201: json(contract.NgWord.openapi("ThreadsNgWord"), "足した NG ワード"),
        400: invalidInputResponse,
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_NG_WORD_DUPLICATE,
          "同じ NG ワードがある（THREADS_NG_WORD_DUPLICATE）か、上限（THREADS_NG_WORD_LIMIT）",
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
    listDrafts: createRoute({
      method: "get",
      path: `${base}/{accountId}/drafts`,
      tags,
      operationId: "threadsListDrafts",
      summary: "投稿の案の一覧（状態ごと）と、似ている度合いを比べる相手",
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
      summary: "承認待ちの案の本文を直す（読んだ版と同じときだけ）",
      middleware,
      request: { params: DraftParams, body: body(contract.DraftUpdateInput) },
      responses: {
        200: json(contract.PostDraft.openapi("ThreadsPostDraft"), "直した案"),
        400: invalidInputResponse,
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_VERSION_CONFLICT,
          "版が合わない（THREADS_VERSION_CONFLICT）か、承認待ちでない（THREADS_DRAFT_STATE）",
        ),
        ...errors,
      },
    }),
    deleteDraft: createRoute({
      method: "delete",
      path: `${base}/{accountId}/drafts/{draftId}`,
      tags,
      operationId: "threadsDeleteDraft",
      summary: "投稿の案を消す（投稿中は消せない）",
      middleware,
      request: { params: DraftParams },
      responses: {
        204: { description: "消した" },
        409: domainErrorResponse(THREADS_ERRORS.THREADS_PUBLISHING, "投稿中"),
        ...errors,
      },
    }),
    review: createRoute({
      method: "post",
      path: `${base}/{accountId}/drafts/review`,
      tags,
      operationId: "threadsReviewDrafts",
      summary:
        "案を承認する・却下する・承認待ちに戻す（まとめて。どれか1つでも合わなければ、どれも変えない）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ReviewInput.openapi("ThreadsReviewInput")),
      },
      responses: {
        200: json(contract.ReviewResult.openapi("ThreadsReviewResult"), "変えた案"),
        400: invalidInputResponse,
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_DRAFT_STATE,
          "今の状態ではできない（THREADS_DRAFT_STATE）・版が合わない（THREADS_VERSION_CONFLICT）・NG ワードや文字数で承認できない（THREADS_DRAFT_NOT_APPROVABLE）",
        ),
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

/** 操作ごとに、変えてよい今の状態。 */
const REVIEW_FROM: Record<contract.ReviewInput["action"], readonly contract.DraftStatus[]> = {
  approve: ["needs_review", "publish_failed"],
  reject: ["needs_review", "approved", "publish_failed"],
  reopen: ["approved", "rejected", "publish_failed"],
};

/**
 * 承認・却下・承認待ちに戻すを確かめて、変える（どれか1つでも合わなければ、どれも変えない）。
 * @param deps 土台が渡す道具
 * @param account 運用アカウント
 * @param input 承認・却下の入力
 * @returns 変えた案
 * @throws {AppError} ない案（NOT_FOUND）・版が合わない・今の状態ではできない・承認できない本文
 */
async function reviewDrafts(
  deps: DomainRouteDeps,
  account: ThreadsAccountRecord,
  input: contract.ReviewInput,
): Promise<PostDraftRecord[]> {
  const ids = [...new Set(input.items.map((item) => item.id))];
  const ngWords = input.action === "approve" ? await listNgWords(deps.db, account.id) : [];
  return deps.db.transaction(async (tx) => {
    const drafts = await lockDrafts(tx, account.id, ids);
    if (drafts.length !== ids.length) throw new AppError("NOT_FOUND");
    const byId = new Map(drafts.map((draft) => [draft.id, draft]));
    // 時間差のメンション（threads-007）：承認では返信の文も確かめ、却下ではまだ出していないものを消す
    const mentionTexts =
      input.action === "approve" ? await pendingMentionTexts(tx, ids) : new Map<string, string>();
    for (const item of input.items) {
      const draft = byId.get(item.id);
      if (!draft || draft.version !== item.version) {
        throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
      }
      // 投稿中・投稿済みは変えない。投稿に失敗は、承認（もう一度投稿の順に入れる）・却下・承認待ちに戻すができる
      const allowed = REVIEW_FROM[input.action].includes(draft.status);
      if (!allowed) throw new AppError(THREADS_ERRORS.THREADS_DRAFT_STATE);
      if (input.action === "approve" && !checkPublishable(draft.body, ngWords).approvable) {
        throw new AppError(THREADS_ERRORS.THREADS_DRAFT_NOT_APPROVABLE);
      }
      const mentionText = mentionTexts.get(draft.id);
      if (mentionText !== undefined && !checkPublishable(mentionText, ngWords).approvable) {
        throw new AppError(THREADS_ERRORS.THREADS_DRAFT_NOT_APPROVABLE);
      }
    }
    const change =
      input.action === "approve"
        ? ({ status: "approved" } as const)
        : input.action === "reject"
          ? ({
              status: "rejected",
              reasons:
                input.reasons && input.reasons.length > 0 ? [...new Set(input.reasons)] : null,
              note: input.note ? input.note : null,
            } as const)
          : ({ status: "needs_review" } as const);
    if (input.action === "reject") await dropPendingMentions(tx, ids);
    return changeDraftState(tx, ids, change);
  });
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
      const rows = await listAccounts(db, currentAccount(c).accountId);
      return c.json(
        {
          accounts: rows.map(({ account, counts }) => toThreadsAccount(account, counts)),
          limit: THREADS_ACCOUNT_LIMIT,
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
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
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
      if (!(await deleteAccount(db, account.id))) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    })
    .openapi(routes.getStrategy, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(toStrategy(await findStrategy(db, account.id)), 200);
    })
    .openapi(routes.putStrategy, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const { version, ...values } = c.req.valid("json");
      const saved = await saveStrategy(db, account.id, values, version);
      if (!saved) throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
      return c.json(toStrategy(saved), 200);
    })
    .openapi(routes.getPromptSettings, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(toPromptSettings(account), 200);
    })
    .openapi(routes.putPromptSettings, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const saved = await savePromptSettings(db, account.id, c.req.valid("json"));
      if (!saved) throw new AppError("NOT_FOUND");
      return c.json(toPromptSettings(saved), 200);
    })
    .openapi(routes.getPrompt, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
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
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(await postingRules(deps, account), 200);
    })
    .openapi(routes.putCoreRules, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const saved = await saveCoreRules(db, account.id, c.req.valid("json").coreRules);
      if (!saved) throw new AppError("NOT_FOUND");
      return c.json(await postingRules(deps, saved), 200);
    })
    .openapi(routes.addNgWord, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const result = await addNgWord(db, account.id, c.req.valid("json").word);
      if (result.kind === "duplicate") throw new AppError(THREADS_ERRORS.THREADS_NG_WORD_DUPLICATE);
      if (result.kind === "limit") throw new AppError(THREADS_ERRORS.THREADS_NG_WORD_LIMIT);
      return c.json(toNgWord(result.ngWord), 201);
    })
    .openapi(routes.deleteNgWord, async (c) => {
      const { accountId, ngWordId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      if (!(await deleteNgWord(db, account.id, ngWordId))) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    })
    .openapi(routes.createBatch, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
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
      });
      if (result.kind === "limit") throw new AppError(THREADS_ERRORS.THREADS_DRAFT_LIMIT);
      return c.json(
        {
          batchId: result.batchId,
          delimiterFound: result.delimiterFound,
          drafts: result.drafts.map((draft) => toPostDraft(draft)),
        },
        201,
      );
    })
    .openapi(routes.listDrafts, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const { status } = c.req.valid("query");
      const [drafts, compareWith] = await Promise.all([
        listDrafts(db, account.id, status),
        listCompareBodies(db, account.id),
      ]);
      const [schedule, mentions] = await Promise.all([
        status === "approved" ? queueSchedule(db, account, drafts, new Date()) : {},
        // 時間差のメンション（threads-007）
        loadMentions(db, drafts, account.username),
      ]);
      return c.json(
        {
          drafts: drafts.map((draft) => toPostDraft(draft, mentions.get(draft.id) ?? null)),
          schedule,
          compareWith,
        },
        200,
      );
    })
    .openapi(routes.updateDraft, async (c) => {
      const { accountId, draftId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      const input = c.req.valid("json");
      const updated = await updateDraftBody(db, account.id, draftId, input.body, input.version);
      if (updated) return c.json(toPostDraft(updated), 200);
      // 直せなかった理由を分ける（ない・承認待ちでない・版が合わない）
      const current = await findDraft(db, account.id, draftId);
      if (!current) throw new AppError("NOT_FOUND");
      if (current.status !== "needs_review") throw new AppError(THREADS_ERRORS.THREADS_DRAFT_STATE);
      throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
    })
    .openapi(routes.deleteDraft, async (c) => {
      const { accountId, draftId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      if (!(await deleteDraft(db, account.id, draftId))) {
        // 投稿中の案は消さない（投稿の試みが使っている）
        const current = await findDraft(db, account.id, draftId);
        if (current) throw new AppError(THREADS_ERRORS.THREADS_PUBLISHING);
        throw new AppError("NOT_FOUND");
      }
      return c.body(null, 204);
    })
    .openapi(routes.review, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const input = c.req.valid("json");
      const drafts = await reviewDrafts(deps, account, input);
      await recordActivity(deps, account.id, {
        kind: "review",
        action:
          input.action === "approve"
            ? "drafts_approved"
            : input.action === "reject"
              ? "drafts_rejected"
              : "drafts_reopened",
        itemCount: drafts.length,
        summary: drafts[0]?.body ?? null,
      });
      return c.json({ drafts: drafts.map((draft) => toPostDraft(draft)) }, 200);
    });
}
