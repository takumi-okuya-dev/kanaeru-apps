// アプリの Meta のアプリでの接続（OAuth）と Meta の Webhook の窓口（threads-010）。道の頭は /api/v1/threads（AD-15）。
// どれも台帳でアプリが見え（Webhook は切でなければ）、機能の印 threads.oauth（既定は切）が入で、Meta のアプリの設定（THREADS_APP_ID・THREADS_APP_SECRET）があるときだけ。
// 切なら、窓口があることを知らせないよう 404。
// - 始める・完了・使えるか：ログインが要る（完了は state を作った同じ人だけ）
// - Threads からの戻り（callback）：ログインなし。DB にも Threads にも触らず、state と code を画面へ渡すだけ
// - Webhook（連携の解除・データの削除）：Meta がフォームの形の signed_request を送る。署名を確かめ、合わなければ中身のない 400。
//   クッキーを使わないので、組み立ての csrf の確かめを通さない道（/api/v1/threads/webhooks/…）に置く
// - データの削除の状況：ログインなし（確認のコードは推測できない乱数）
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, notFoundResponse } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount, requireSession } from "../account/index.ts";
import { recordActivity } from "./activity-log.ts";
import { threadsClientOf } from "./connection.ts";
import {
  OAUTH_UNAVAILABLE,
  THREADS_OAUTH_FEATURE,
  completeOauth,
  deletionStatus,
  handleUninstall,
  oauthApp,
  receiveDeletion,
  startOauth,
} from "./oauth.ts";
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

/** Webhook の本文の上限（署名を確かめる前に読む量を縛る。signed_request は1KB未満）。 */
const WEBHOOK_BODY_MAX_BYTES = 8192;

/** 道の頭（運用アカウントの外）。 */
const BASE = "/api/v1/threads";

/** Threads から戻った人を受け止める画面の道。 */
const COMPLETE_PATH = "/threads/oauth/complete";

/** データの削除の状況の画面の道。 */
const DELETION_PAGE_PATH = "/threads/data-deletion";

/** callback の問い合わせ。 */
const CallbackQuery = z.object({
  state: z
    .string()
    .max(200)
    .optional()
    .openapi({ param: { name: "state", in: "query" } }),
  code: z
    .string()
    .max(2000)
    .optional()
    .openapi({ param: { name: "code", in: "query" } }),
  error: z
    .string()
    .max(200)
    .optional()
    .openapi({ param: { name: "error", in: "query" } }),
});

/** データの削除の状況の道の値。 */
const DeletionParams = z.object({
  code: z
    .string()
    .max(64)
    .openapi({ param: { name: "code", in: "path" }, description: "確認のコード" }),
});

/**
 * フォームの本文から signed_request を読む。
 * @param c 要求の文脈
 * @param c.req 要求
 * @returns signed_request（なければ null）
 */
async function readSignedRequest(c: {
  req: { parseBody: () => Promise<Record<string, unknown>> };
}): Promise<string | null> {
  const empty: Record<string, unknown> = {};
  const parsed = await c.req.parseBody().catch(() => empty);
  const value = parsed.signed_request;
  return typeof value === "string" ? value : null;
}

/**
 * OAuth と Meta の Webhook の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function oauthRoutes(deps: DomainRouteDeps) {
  const tags = TAGS;
  /** threads.oauth と Meta のアプリがそろっていなければ 404 にする middleware。 */
  const oauthEnabled = createMiddleware<ApiEnv>(async (_c, next) => {
    if (!deps.features.enabled(THREADS_OAUTH_FEATURE) || !deps.metaApp)
      throw new AppError("NOT_FOUND");
    await next();
  });
  const limit = bodyLimit({
    maxSize: WEBHOOK_BODY_MAX_BYTES,
    onError: (c) => c.body(null, 400),
  });
  const publicMiddleware = [oauthEnabled];
  const sessionMiddleware = [oauthEnabled, requireSession(deps)];
  const emptyBadRequest = { description: "署名・形が合わない（本文なし）" } as const;
  const routes = {
    availability: createRoute({
      method: "get",
      path: `${BASE}/oauth/availability`,
      tags,
      operationId: "threadsOauthAvailability",
      summary: "OAuth の接続が使えるか（機能の印・Meta のアプリ・鍵の設定）。機能の印が切なら 404",
      middleware: [requireSession(deps)],
      responses: {
        200: json(contract.OauthAvailability.openapi("ThreadsOauthAvailability"), "使えるか"),
        ...COMMON_ERRORS,
      },
    }),
    start: createRoute({
      method: "post",
      path: `${ACCOUNTS_BASE}/{accountId}/oauth/start`,
      tags,
      operationId: "threadsOauthStart",
      summary:
        "アプリの Meta のアプリで接続を始め、Threads の認可の URL を返す（state は10分・1回だけ）",
      middleware: [...publicMiddleware, ...accountMiddleware(deps)],
      request: { params: AccountParams },
      responses: {
        200: json(contract.OauthStartResult.openapi("ThreadsOauthStartResult"), "認可の URL"),
        503: domainErrorResponse(OAUTH_UNAVAILABLE, "鍵の設定がない"),
        ...COMMON_ERRORS,
      },
    }),
    callback: createRoute({
      method: "get",
      path: `${BASE}/oauth/callback`,
      tags,
      operationId: "threadsOauthCallback",
      summary:
        "Threads からの戻り（ログインなし）。接続はここでは済ませず、state と code を画面の完了の画面へ渡す",
      middleware: publicMiddleware,
      request: { query: CallbackQuery },
      responses: {
        302: { description: "画面の完了の画面へ" },
        404: notFoundResponse,
      },
    }),
    complete: createRoute({
      method: "post",
      path: `${BASE}/oauth/complete`,
      tags,
      operationId: "threadsOauthComplete",
      summary:
        "OAuth の接続を完了する（ログインした同じ人だけ。code を長期のトークンに替え、トークンを貼るときと同じ確かめでつなぐ）",
      middleware: sessionMiddleware,
      request: { body: body(contract.OauthCompleteInput.openapi("ThreadsOauthCompleteInput")) },
      responses: {
        200: json(
          contract.OauthCompleteResult.openapi("ThreadsOauthCompleteResult"),
          "画面が移る先",
        ),
        400: invalidInputResponse,
        503: domainErrorResponse(OAUTH_UNAVAILABLE, "鍵の設定がない"),
        ...COMMON_ERRORS,
      },
    }),
    uninstall: createRoute({
      method: "post",
      path: `${BASE}/webhooks/uninstall`,
      tags,
      operationId: "threadsWebhookUninstall",
      summary: "Meta の連携の解除の知らせ（フォームの signed_request。署名が合えば接続を解く）",
      middleware: [...publicMiddleware, limit],
      responses: {
        200: { description: "受け取った" },
        400: emptyBadRequest,
        404: notFoundResponse,
      },
    }),
    dataDeletion: createRoute({
      method: "post",
      path: `${BASE}/webhooks/data-deletion`,
      tags,
      operationId: "threadsWebhookDataDeletion",
      summary:
        "Meta のデータの削除の要求（フォームの signed_request）。運用アカウントを消し、状況の URL と確認のコードを返す",
      middleware: [...publicMiddleware, limit],
      responses: {
        200: json(
          z
            .object({ url: z.string(), confirmation_code: z.string() })
            .openapi("ThreadsDataDeletionReceipt"),
          "状況の URL と確認のコード",
        ),
        400: emptyBadRequest,
        404: notFoundResponse,
      },
    }),
    deletionStatus: createRoute({
      method: "get",
      path: `${BASE}/data-deletion/{code}`,
      tags,
      operationId: "threadsDataDeletionStatus",
      summary: "データの削除の状況（ログインなし。識別子は返さない）",
      middleware: publicMiddleware,
      request: { params: DeletionParams },
      responses: {
        200: json(contract.DataDeletionStatus.openapi("ThreadsDataDeletionStatus"), "状況"),
        404: notFoundResponse,
      },
    }),
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.availability, (c) => {
      c.header("Cache-Control", "no-store");
      return c.json({ available: oauthApp(deps) !== null }, 200);
    })
    .openapi(routes.start, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      const app = oauthApp(deps);
      if (!app) throw new AppError(OAUTH_UNAVAILABLE);
      const authorizeUrl = await startOauth(
        deps,
        app,
        currentAccount(c).accountId,
        account.id,
        new Date(),
      );
      return c.json({ authorizeUrl }, 200);
    })
    .openapi(routes.callback, (c) => {
      const { state, code, error } = c.req.valid("query");
      const params: Record<string, string> = error
        ? { ...(state ? { state } : {}), error: "cancelled" }
        : state && code
          ? { state, code }
          : { error: "failed" };
      return c.redirect(
        `${deps.config.webUrl}${COMPLETE_PATH}?${new URLSearchParams(params).toString()}`,
        302,
      );
    })
    .openapi(routes.complete, async (c) => {
      const app = oauthApp(deps);
      if (!app) throw new AppError(OAUTH_UNAVAILABLE);
      const result = await completeOauth(
        deps,
        app,
        currentAccount(c).accountId,
        c.req.valid("json"),
        new Date(),
      );
      if (result.outcome) {
        await recordActivity(deps, result.outcome.account.id, {
          kind: "settings",
          action: result.outcome.kind === "connect" ? "threads_connected" : "threads_reconnected",
        });
      }
      return c.json({ redirectTo: result.redirectTo }, 200);
    })
    .openapi(routes.uninstall, async (c) => {
      const signed = await readSignedRequest(c);
      const payload = signed ? deps.metaApp?.verifySignedRequest(signed) : null;
      if (!payload) return c.body(null, 400);
      await handleUninstall(deps, threadsClientOf(deps), payload);
      return c.body(null, 200);
    })
    .openapi(routes.dataDeletion, async (c) => {
      const signed = await readSignedRequest(c);
      const payload = signed ? deps.metaApp?.verifySignedRequest(signed) : null;
      if (!signed || !payload) return c.body(null, 400);
      const code = await receiveDeletion(deps, signed, payload.userId, new Date());
      return c.json(
        { url: `${deps.config.webUrl}${DELETION_PAGE_PATH}/${code}`, confirmation_code: code },
        200,
      );
    })
    .openapi(routes.deletionStatus, async (c) => {
      const status = await deletionStatus(deps.db, c.req.valid("param").code);
      if (!status) throw new AppError("NOT_FOUND");
      c.header("Cache-Control", "no-store");
      return c.json(status, 200);
    });
}
