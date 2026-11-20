// Threads への接続と自動投稿の窓口（threads-002）。道の頭は /api/v1/threads（AD-15）。
// 運用アカウントの道はログインが要り、持ち主だけ（ほかの人のものは 404。AD-19）。台帳でアプリが見えなければ 404（組み立ての requireApp。定期の仕事は切のときだけ 404）。
// 定期の仕事の窓口（POST /api/v1/threads/jobs/tick）は、Cloud Scheduler が合言葉（Authorization: Bearer）を付けて呼ぶ。
// 合言葉がない・違うときは、窓口があることを知らせないよう 404 にする。
// トークン・投稿の本文はログに出さない。
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import {
  AUTOPOST_JITTER_SECONDS,
  AUTOPOST_MIN_GAP_MINUTES,
  AUTOPOST_SLOT_LIMIT,
  AUTOPOST_SLOT_WINDOW_MINUTES,
  THREADS_ERRORS,
  minutesToTime,
} from "@workspace/contracts/threads";
import { createMiddleware } from "hono/factory";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, notFoundResponse } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount } from "../account/index.ts";
import { getAutoPostStatus } from "./auto-post-status.ts";
import {
  checkPublish,
  connectWithToken,
  disconnect,
  readConnection,
  threadsClientOf,
  toConnection,
  verifyConnection,
} from "./connection.ts";
import { runJob } from "./job-runner.ts";
import {
  markBlockedNoticeSeen,
  readPostingSchedule,
  savePostingSchedule,
  toPostingSchedule,
} from "./posting-schedule.ts";
import { findDraft, setPriority } from "./repository.ts";
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
import { toPostDraft } from "./views.ts";

/**
 * 接続と自動投稿の窓口の道の定義。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const middleware = accountMiddleware(deps);
  const tags = TAGS;
  const base = ACCOUNTS_BASE;
  const errors = COMMON_ERRORS;
  // 定期の仕事：機能の印 → 合言葉（違えば 404）
  const jobAuth = createMiddleware<ApiEnv>(async (c, next) => {
    if (!deps.isJobRequest(c.req.header("authorization"))) {
      deps.logger.warn({}, "Threads の定期の仕事の窓口に、合言葉の合わない要求が来ました");
      throw new AppError("NOT_FOUND");
    }
    await next();
  });
  return {
    getConnection: createRoute({
      method: "get",
      path: `${base}/{accountId}/connection`,
      tags,
      operationId: "threadsGetConnection",
      summary: "Threads への接続（状態・ユーザー名・期限。トークンは返さない）",
      middleware,
      request: { params: AccountParams },
      responses: { 200: json(contract.Connection.openapi("ThreadsConnection"), "接続"), ...errors },
    }),
    connect: createRoute({
      method: "post",
      path: `${base}/{accountId}/connection`,
      tags,
      operationId: "threadsConnect",
      summary:
        "長期のアクセストークンを貼ってつなぐ（未接続ならはじめての接続、ほかは同じ Threads のアカウントでつなぎ直す）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ConnectInput.openapi("ThreadsConnectInput")),
      },
      responses: {
        200: json(contract.ConnectResult.openapi("ThreadsConnectResult"), "つないだ結果"),
        400: domainErrorResponse(
          THREADS_ERRORS.THREADS_TOKEN_INVALID,
          "トークンを確かめられない（THREADS_TOKEN_INVALID）・期限が短い（THREADS_TOKEN_SHORT_LIVED）・入力が合わない（INVALID_INPUT）",
        ),
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_RECONNECT_MISMATCH,
          "前と違うアカウント（THREADS_RECONNECT_MISMATCH）・ほかの人の運用アカウントがつないでいる（THREADS_ACCOUNT_TAKEN）・自分の別の運用アカウントがつないでいる（THREADS_ACCOUNT_REGISTERED）",
        ),
        429: domainErrorResponse(THREADS_ERRORS.THREADS_TOKEN_CHECK_LOCKED, "確かめの失敗が続いた"),
        503: domainErrorResponse(
          THREADS_ERRORS.THREADS_UNAVAILABLE,
          "Threads が答えない（THREADS_UNAVAILABLE）・鍵の設定がない（THREADS_CONNECTION_UNAVAILABLE）",
        ),
        ...errors,
      },
    }),
    disconnect: createRoute({
      method: "delete",
      path: `${base}/{accountId}/connection`,
      tags,
      operationId: "threadsDisconnect",
      summary: "接続を切る（トークンを消し、未接続に戻し、自動投稿をオフにする。投稿の途中は断る）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.Connection, "切ったあとの接続"),
        409: domainErrorResponse(THREADS_ERRORS.THREADS_PUBLISHING, "投稿の途中"),
        ...errors,
      },
    }),
    checkConnection: createRoute({
      method: "post",
      path: `${base}/{accountId}/connection/check`,
      tags,
      operationId: "threadsCheckConnection",
      summary: "持っているトークンで接続を確かめる（使えなければ「接続し直しが要る」にする）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.Connection, "確かめたあとの接続"),
        503: domainErrorResponse(THREADS_ERRORS.THREADS_UNAVAILABLE, "Threads が答えない"),
        ...errors,
      },
    }),
    threadsCheck: createRoute({
      method: "post",
      path: `${base}/{accountId}/threads-check`,
      tags,
      operationId: "threadsCheckPublish",
      summary:
        "Threads に投稿できる状態かと、直近24時間の投稿の数を確かめる（投稿はしない。認証のエラーなら「接続し直しが要る」にする。threads-012）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.ThreadsCheck.openapi("ThreadsCheck"), "確かめた結果"),
        ...errors,
      },
    }),
    getSchedule: createRoute({
      method: "get",
      path: `${base}/{accountId}/posting-schedule`,
      tags,
      operationId: "threadsGetPostingSchedule",
      summary: "投稿の設定（時刻・ずらすか・オンかオフか）と決まり",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.PostingScheduleView.openapi("ThreadsPostingScheduleView"), "投稿の設定"),
        ...errors,
      },
    }),
    putSchedule: createRoute({
      method: "put",
      path: `${base}/{accountId}/posting-schedule`,
      tags,
      operationId: "threadsPutPostingSchedule",
      summary:
        "投稿の設定を保存する（時刻は 8:30〜23:00。オンにするときは投稿の権限を確かめる。読んだ版と同じときだけ）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.PostingScheduleSaveInput.openapi("ThreadsPostingScheduleInput")),
      },
      responses: {
        200: json(
          contract.PostingScheduleSaved.openapi("ThreadsPostingScheduleSaved"),
          "保存した設定",
        ),
        400: invalidInputResponse,
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_NOT_READY,
          "投稿できる状態でない（THREADS_NOT_READY）・版が合わない（THREADS_VERSION_CONFLICT）",
        ),
        ...errors,
      },
    }),
    getAutoPost: createRoute({
      method: "get",
      path: `${base}/{accountId}/auto-post`,
      tags,
      operationId: "threadsGetAutoPost",
      summary: "自動投稿の状態・次の投稿・知らせ",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.AutoPostStatus.openapi("ThreadsAutoPostStatus"), "自動投稿の状態"),
        ...errors,
      },
    }),
    seeBlockedNotice: createRoute({
      method: "post",
      path: `${base}/{accountId}/auto-post/blocked-notice-seen`,
      tags,
      operationId: "threadsSeeBlockedNotice",
      summary: "「投稿の直前に承認待ちへ戻した」の知らせを閉じる",
      middleware,
      request: { params: AccountParams },
      responses: { 204: { description: "閉じた" }, ...errors },
    }),
    setPriority: createRoute({
      method: "put",
      path: `${base}/{accountId}/drafts/{draftId}/priority`,
      tags,
      operationId: "threadsSetDraftPriority",
      summary: "承認済みの案に「次に投稿する」を付ける・外す（読んだ版と同じときだけ）",
      middleware,
      request: {
        params: DraftParams,
        body: body(contract.PriorityInput.openapi("ThreadsPriorityInput")),
      },
      responses: {
        200: json(contract.PostDraft, "変えた案"),
        400: invalidInputResponse,
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_VERSION_CONFLICT,
          "版が合わない（THREADS_VERSION_CONFLICT）・承認済みでない（THREADS_DRAFT_STATE）",
        ),
        ...errors,
      },
    }),
    tick: createRoute({
      method: "post",
      path: "/api/v1/threads/jobs/tick",
      tags,
      operationId: "threadsJobTick",
      summary:
        "定期の仕事を1回行う（Cloud Scheduler が5分おきに呼ぶ。自動投稿・トークンの確かめ直しと延長・片付け）",
      description: "見出し Authorization: Bearer <JOB_TRIGGER_SECRET> が要る。合わなければ 404。",
      middleware: [jobAuth],
      responses: {
        200: json(contract.JobRunSummary.openapi("ThreadsJobRunSummary"), "この回の結果（数だけ）"),
        404: notFoundResponse,
      },
    }),
  };
}

/**
 * 接続と自動投稿の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function autopostRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);
  const [earliest, latest] = AUTOPOST_SLOT_WINDOW_MINUTES.map(minutesToTime);
  const limits = {
    slots: AUTOPOST_SLOT_LIMIT,
    minGapMinutes: AUTOPOST_MIN_GAP_MINUTES,
    jitterMinutes: AUTOPOST_JITTER_SECONDS / 60,
    earliest: earliest ?? "08:30",
    latest: latest ?? "23:00",
  };

  /**
   * 接続を読む（ないときは 404）。
   * @param threadsAccountId 運用アカウントの ID
   * @returns 接続
   */
  const connectionOf = async (threadsAccountId: string) => {
    const connection = await readConnection(db, threadsAccountId);
    if (!connection) throw new AppError("NOT_FOUND");
    return connection;
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getConnection, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      return c.json(await connectionOf(account.id), 200);
    })
    .openapi(routes.connect, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const outcome = await connectWithToken(
        deps,
        currentAccount(c).accountId,
        account,
        c.req.valid("json").token,
      );
      return c.json(
        {
          kind: outcome.kind,
          connection: toConnection(outcome.account, outcome.expiresAt),
          warnings: outcome.warnings,
        },
        200,
      );
    })
    .openapi(routes.disconnect, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(toConnection(await disconnect(db, account.id), null), 200);
    })
    .openapi(routes.checkConnection, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      await verifyConnection(deps, account.id);
      return c.json(await connectionOf(account.id), 200);
    })
    .openapi(routes.threadsCheck, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(await checkPublish(deps, account.id), 200);
    })
    .openapi(routes.getSchedule, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      const schedule = toPostingSchedule(await readPostingSchedule(db, account.id));
      return c.json({ schedule, limits }, 200);
    })
    .openapi(routes.putSchedule, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(await savePostingSchedule(deps, account.id, c.req.valid("json")), 200);
    })
    .openapi(routes.getAutoPost, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      return c.json(await getAutoPostStatus(db, account), 200);
    })
    .openapi(routes.seeBlockedNotice, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      await markBlockedNoticeSeen(db, account.id, new Date());
      return c.body(null, 204);
    })
    .openapi(routes.setPriority, async (c) => {
      const { accountId, draftId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId, "review");
      const input = c.req.valid("json");
      const updated = await setPriority(db, account.id, draftId, input.prioritized, input.version);
      if (updated) return c.json(toPostDraft(updated), 200);
      const current = await findDraft(db, account.id, draftId);
      if (!current) throw new AppError("NOT_FOUND");
      if (current.status !== "approved") throw new AppError(THREADS_ERRORS.THREADS_DRAFT_STATE);
      throw new AppError(THREADS_ERRORS.THREADS_VERSION_CONFLICT);
    })
    .openapi(routes.tick, async (c) => {
      return c.json(await runJob(deps, threadsClientOf(deps)), 200);
    });
}
