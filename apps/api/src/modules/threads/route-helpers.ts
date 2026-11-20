// threads の窓口で共に使う手伝い（ログインの middleware・JSON の応答と本文の書き方・持ち主の運用アカウントの読み方）。
// アプリを見せるか（台帳の公開の状態）は、組み立てが suite の requireApp を付ける（AD-16。ここでは付けない）。
// 道のファイル（routes.ts・routes-autopost.ts など。仕様ごとに分ける）が読む。
import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import type { ActivityAction, ActivityKind } from "@workspace/contracts/threads";
import { AppError } from "../../kernel/errors.ts";
import { notFoundResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import { recordActivity } from "./activity-log.ts";
import { findOwnedAccount } from "./repository.ts";
import type { ThreadsAccountRecord } from "./repository.ts";

/** 運用アカウントの道の頭。 */
export const ACCOUNTS_BASE = "/api/v1/threads/accounts";

/** 窓口の文書のまとまりの名前。 */
export const TAGS = ["threads"];

/** ログインが要る道のよくあるエラーの応答。 */
export const COMMON_ERRORS = { 401: unauthenticatedResponse, 404: notFoundResponse } as const;

/** 道の accountId。 */
export const AccountParams = z.object({ accountId: uuidParam("accountId", "運用アカウントの ID") });

/** 道の accountId と draftId。 */
export const DraftParams = z.object({
  accountId: uuidParam("accountId", "運用アカウントの ID"),
  draftId: uuidParam("draftId", "投稿の案の ID"),
});

/**
 * JSON の応答の書き方。
 * @param schema 本文の形
 * @param description いつ返すか
 * @returns OpenAPI の応答の定義
 */
export function json<T>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } } as const;
}

/**
 * JSON の本文の書き方。
 * @param schema 本文の形
 * @returns OpenAPI の本文の定義
 */
export function body<T>(schema: T) {
  return { required: true, content: { "application/json": { schema } } } as const;
}

/** 書きこみの道（動き と 運用アカウントの道の頭のあとの形）から、操作の記録の種類と操作へ（threads-005）。 */
const ACTIVITY_ROUTES: Record<string, { kind: ActivityKind; action: ActivityAction }> = {
  "PATCH ": { kind: "settings", action: "account_renamed" },
  "POST /draft-batches": { kind: "draft", action: "drafts_added" },
  "PUT /drafts/:draftId": { kind: "draft", action: "draft_edited" },
  "DELETE /drafts/:draftId": { kind: "draft", action: "draft_deleted" },
  "PUT /drafts/:draftId/priority": { kind: "review", action: "draft_prioritized" },
  "PUT /strategy": { kind: "content", action: "strategy_saved" },
  "PUT /prompt-settings": { kind: "settings", action: "prompt_settings_saved" },
  "PUT /core-rules": { kind: "settings", action: "core_rules_saved" },
  "POST /ng-words": { kind: "settings", action: "ng_word_added" },
  "DELETE /ng-words/:ngWordId": { kind: "settings", action: "ng_word_removed" },
  "POST /connection": { kind: "settings", action: "threads_connected" },
  "DELETE /connection": { kind: "settings", action: "threads_disconnected" },
  "PUT /posting-schedule": { kind: "settings", action: "schedule_saved" },
  "POST /promotions": { kind: "content", action: "promotion_saved" },
  "PUT /promotions/:itemId": { kind: "content", action: "promotion_saved" },
  "DELETE /promotions/:itemId": { kind: "content", action: "promotion_deleted" },
  "PUT /promotion-ratio": { kind: "content", action: "promotion_ratio_saved" },
  "POST /reference-posts": { kind: "content", action: "reference_posts_added" },
  "POST /reference-posts/explanations": { kind: "content", action: "reference_posts_explained" },
  "DELETE /reference-posts/:itemId": { kind: "content", action: "reference_post_deleted" },
  "POST /research-keywords": { kind: "content", action: "keywords_added" },
  "DELETE /research-keywords/:itemId": { kind: "content", action: "keyword_deleted" },
  "PUT /performance/:draftId/feedback": { kind: "content", action: "feedback_saved" },
  "PUT /analysis/settings": { kind: "content", action: "analysis_settings_saved" },
  "PUT /analysis/classifications": { kind: "content", action: "posts_classified" },
  "PUT /mention-settings": { kind: "settings", action: "mention_settings_saved" },
  "POST /mention-people": { kind: "settings", action: "mention_person_added" },
  "PUT /mention-people/:personId": { kind: "settings", action: "mention_person_updated" },
  "DELETE /mention-people/:personId": { kind: "settings", action: "mention_person_removed" },
  "PUT /drafts/:draftId/mention": { kind: "review", action: "mention_attached" },
  "DELETE /drafts/:draftId/mention": { kind: "review", action: "mention_detached" },
  "POST /external-media/:promotionId/:media/generate": {
    kind: "content",
    action: "listing_generated",
  },
  "PUT /external-media/:promotionId/:media": { kind: "content", action: "listing_saved" },
  "PUT /media-defaults/:media": { kind: "content", action: "media_defaults_saved" },
};

/**
 * 書きこみが済んだら操作を記録する middleware（threads-005。承認・却下は道の中で、操作ごとに記録する）。
 * @param deps 土台が渡す道具
 * @returns middleware
 */
function activityRecorder(deps: DomainRouteDeps) {
  const prefix = `${ACCOUNTS_BASE}/:accountId`;
  return createMiddleware<ApiEnv>(async (c, next) => {
    await next();
    if (c.req.method === "GET" || c.res.status < 200 || c.res.status >= 300) return;
    const path = routePath(c);
    if (!path.startsWith(prefix)) return;
    const found = ACTIVITY_ROUTES[`${c.req.method} ${path.slice(prefix.length)}`];
    const accountId = c.req.param("accountId");
    if (found && accountId) await recordActivity(deps, accountId, found);
  });
}

/**
 * ログインが要る道の middleware（機能の印 → ログイン → 操作の記録）。
 * @param deps 土台が渡す道具
 * @returns middleware の並び
 */
export function accountMiddleware(deps: DomainRouteDeps) {
  return [requireSession(deps), activityRecorder(deps)];
}

/**
 * 道の運用アカウントを、今の利用者のものとして読む（ない・ほかの人のものは 404）。
 * @param deps 土台が渡す道具
 * @param c 要求の文脈
 * @param accountId 運用アカウントの ID
 * @returns 運用アカウント
 * @throws {AppError} ない・ほかの人のものとき（NOT_FOUND）
 */
export async function ownedAccount(
  deps: DomainRouteDeps,
  c: Context,
  accountId: string,
): Promise<ThreadsAccountRecord> {
  const account = await findOwnedAccount(deps.db, currentAccount(c).accountId, accountId);
  if (!account) throw new AppError("NOT_FOUND");
  return account;
}

/**
 * 投稿のルールの空でない行。
 * @param coreRules 投稿のルール
 * @returns 行
 */
export function coreRuleLines(coreRules: string): string[] {
  return coreRules
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
