// 時間差のメンションの窓口（threads-007）。道の頭は /api/v1/threads（AD-15）。ログインが要り、持ち主だけ（ほかの人のものは 404）。
// 返信そのものは定期の仕事（job-runner.ts → mention-runner.ts）が出す。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import { THREADS_ERRORS } from "@workspace/contracts/threads";
import { domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import {
  addMentionPerson,
  attachMention,
  detachMention,
  getMentionSettings,
  loadMentions,
  removeMentionPerson,
  saveMentionSettings,
  updateMentionPerson,
} from "./mention.ts";
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

/** 道の accountId と personId。 */
const PersonParams = z.object({
  accountId: uuidParam("accountId", "運用アカウントの ID"),
  personId: uuidParam("personId", "メンションする人の ID"),
});

/**
 * 時間差のメンションの窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function mentionRoutes(deps: DomainRouteDeps) {
  const middleware = accountMiddleware(deps);
  const base = ACCOUNTS_BASE;
  const tags = TAGS;
  const errors = COMMON_ERRORS;
  const settingsResponse = json(
    contract.MentionSettings.openapi("ThreadsMentionSettings"),
    "メンションの設定",
  );
  const routes = {
    getSettings: createRoute({
      method: "get",
      path: `${base}/{accountId}/mention-settings`,
      tags,
      operationId: "threadsGetMentionSettings",
      summary:
        "時間差のメンションの設定（ひとこと・時間差・メンションする人・今は選べない人・返信の権限）",
      middleware,
      request: { params: AccountParams },
      responses: { 200: settingsResponse, ...errors },
    }),
    putSettings: createRoute({
      method: "put",
      path: `${base}/{accountId}/mention-settings`,
      tags,
      operationId: "threadsPutMentionSettings",
      summary:
        "ひとことと時間差を保存する（読んだ版と同じときだけ。NG ワードを含むひとことは 400）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.MentionSettingsInput.openapi("ThreadsMentionSettingsInput")),
      },
      responses: {
        200: settingsResponse,
        400: invalidInputResponse,
        409: domainErrorResponse(THREADS_ERRORS.THREADS_VERSION_CONFLICT, "版が合わない"),
        ...errors,
      },
    }),
    addPerson: createRoute({
      method: "post",
      path: `${base}/{accountId}/mention-people`,
      tags,
      operationId: "threadsAddMentionPerson",
      summary: "メンションする人を足す（形が違う・自分・同じ人は 400。20人まで）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.MentionPersonInput.openapi("ThreadsMentionPersonInput")),
      },
      responses: {
        201: settingsResponse,
        400: invalidInputResponse,
        409: domainErrorResponse(THREADS_ERRORS.THREADS_ITEM_LIMIT, "人数の上限"),
        ...errors,
      },
    }),
    updatePerson: createRoute({
      method: "put",
      path: `${base}/{accountId}/mention-people/{personId}`,
      tags,
      operationId: "threadsUpdateMentionPerson",
      summary: "メンションする人の呼び名と「いつも付ける」を直す",
      middleware,
      request: {
        params: PersonParams,
        body: body(contract.MentionPersonUpdateInput.openapi("ThreadsMentionPersonUpdateInput")),
      },
      responses: { 200: settingsResponse, 400: invalidInputResponse, ...errors },
    }),
    removePerson: createRoute({
      method: "delete",
      path: `${base}/{accountId}/mention-people/{personId}`,
      tags,
      operationId: "threadsRemoveMentionPerson",
      summary:
        "メンションする人を消す（承認待ち・承認済みの案は文からその人を外して承認待ちに。投稿済みの予定はやめる）",
      middleware,
      request: { params: PersonParams },
      responses: { 200: settingsResponse, ...errors },
    }),
    attach: createRoute({
      method: "put",
      path: `${base}/{accountId}/drafts/{draftId}/mention`,
      tags,
      operationId: "threadsAttachMention",
      summary:
        "案に時間差のメンションを付ける・直す（承認待ち・承認済みは投稿の時間差のあと〈承認済みは承認し直し〉、投稿済み〈7日以内〉は今から返信する）",
      middleware,
      request: {
        params: DraftParams,
        body: body(contract.MentionAttachInput.openapi("ThreadsMentionAttachInput")),
      },
      responses: {
        200: json(contract.PostDraft.openapi("ThreadsPostDraft"), "直したあとの案"),
        400: invalidInputResponse,
        409: domainErrorResponse(
          THREADS_ERRORS.THREADS_MENTION_BLOCKED,
          "版が合わない・今は選べない人・付けられない",
        ),
        ...errors,
      },
    }),
    detach: createRoute({
      method: "delete",
      path: `${base}/{accountId}/drafts/{draftId}/mention`,
      tags,
      operationId: "threadsDetachMention",
      summary: "案の時間差のメンションを外す・やめる（もう出した・出している途中は 409）",
      middleware,
      request: { params: DraftParams },
      responses: {
        200: json(contract.PostDraft.openapi("ThreadsPostDraft"), "直したあとの案"),
        409: domainErrorResponse(THREADS_ERRORS.THREADS_MENTION_SENT, "もう出した"),
        ...errors,
      },
    }),
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getSettings, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      c.header("Cache-Control", "no-store");
      return c.json(await getMentionSettings(deps.db, account, new Date()), 200);
    })
    .openapi(routes.putSettings, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(await saveMentionSettings(deps.db, account, c.req.valid("json")), 200);
    })
    .openapi(routes.addPerson, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId);
      return c.json(await addMentionPerson(deps.db, account, c.req.valid("json")), 201);
    })
    .openapi(routes.updatePerson, async (c) => {
      const { accountId, personId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      return c.json(
        await updateMentionPerson(deps.db, account, personId, c.req.valid("json")),
        200,
      );
    })
    .openapi(routes.removePerson, async (c) => {
      const { accountId, personId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      return c.json(await removeMentionPerson(deps.db, account, personId), 200);
    })
    .openapi(routes.attach, async (c) => {
      const { accountId, draftId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      const { draft, mention } = await attachMention(
        deps.db,
        account,
        draftId,
        c.req.valid("json"),
        new Date(),
      );
      return c.json(toPostDraft(draft, mention), 200);
    })
    .openapi(routes.detach, async (c) => {
      const { accountId, draftId } = c.req.valid("param");
      const account = await ownedAccount(deps, c, accountId);
      const draft = await detachMention(deps.db, account, draftId);
      const mentions = await loadMentions(deps.db, [draft], account.username);
      return c.json(toPostDraft(draft, mentions.get(draft.id) ?? null), 200);
    });
}
