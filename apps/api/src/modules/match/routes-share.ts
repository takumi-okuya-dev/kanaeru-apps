// 試合表を見せる・受け付ける窓口（match-004 contracts）。
// - 運営（ログインと権限が要る）：見るだけの札を作り直す・受付の札を作り直す・受付を締める・受付の一覧・受付の行を消す
// - 参加者（ログインなし。AD-26・AD-30）：見るだけのページ・その版の番号・受付のページ・受け付ける
// ログインなしの道は、札の SHA-256 で試合表を見つけ、期限を過ぎた・締めた・ない札はみな同じ 404 にする（あるかを漏らさない）。
// 答えには Cache-Control: no-store と X-Robots-Tag: noindex を付ける。回数の制限は、組み立ての IP ごとの制限（状態を変える道。
// 受け付ける POST）を使う（research R6）。アプリが見えないときの 404 は組み立ての requireApp。呼び名はログに出さない。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import * as contract from "@workspace/contracts/match";
import { JOIN_MAX, MATCH_ERRORS, MATCH_LEVELS } from "@workspace/contracts/match";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import { requireTableAccess } from "./access.ts";
import { readContent } from "./repository.ts";
import {
  closeJoin,
  countJoins,
  deleteJoin,
  findJoinTarget,
  insertJoin,
  listJoins,
  readView,
  readViewVersion,
  setJoinToken,
  setViewToken,
} from "./share-repository.ts";
import { TOKEN_PATTERN, hashToken, newToken, tokenExpiry } from "./tokens.ts";

/** 作った札。 */
const MatchLinkIssued = contract.MatchLinkIssued.openapi("MatchLinkIssued");
/** 受付の一覧。 */
const MatchJoinList = contract.MatchJoinList.openapi("MatchJoinList");
/** 見るだけのページの中身。 */
const MatchView = contract.MatchView.openapi("MatchView");
/** 見るだけのページの版の番号。 */
const MatchViewVersion = contract.MatchViewVersion.openapi("MatchViewVersion");
/** 受付のページの中身。 */
const MatchJoinInfo = contract.MatchJoinInfo.openapi("MatchJoinInfo");
/** 受付の入力。 */
const MatchJoinInput = contract.MatchJoinInput.openapi("MatchJoinInput", {
  example: { nickname: "高橋", level: "advanced" },
});
/** 受け付けた答え。 */
const MatchJoinAccepted = contract.MatchJoinAccepted.openapi("MatchJoinAccepted");

/** 道の tableId。 */
const TableParams = z.object({ tableId: uuidParam("tableId", "試合表の ID") });
/** 道の tableId と joinId。 */
const JoinEntryParams = z.object({
  tableId: uuidParam("tableId", "試合表の ID"),
  joinId: uuidParam("joinId", "受付の ID"),
});
/**
 * 道の札（形が違えば、組み立てが DB を引かずに 404 にする）。
 * @param name 道の名前
 * @param description 説明
 * @returns 道の値の形
 */
function tokenParam(name: string, description: string) {
  return z
    .string()
    .regex(TOKEN_PATTERN)
    .openapi({ param: { name, in: "path" }, description });
}

/** 道の viewToken。 */
const ViewParams = z.object({ viewToken: tokenParam("viewToken", "見るだけの札") });
/** 道の joinToken。 */
const JoinParams = z.object({ joinToken: tokenParam("joinToken", "受付の札") });

/** 試合表がない応答。 */
const notFoundResponse = domainErrorResponse(MATCH_ERRORS.NOT_FOUND, "試合表がない");
/** 権限がない応答。 */
const forbiddenResponse = domainErrorResponse(MATCH_ERRORS.FORBIDDEN, "権限がない");
/** 見るだけのページがない応答。 */
const viewNotFoundResponse = domainErrorResponse(
  MATCH_ERRORS.VIEW_NOT_FOUND,
  "札がない・期限を過ぎた・作り直された",
);
/** 受付がない応答。 */
const joinNotFoundResponse = domainErrorResponse(
  MATCH_ERRORS.JOIN_NOT_FOUND,
  "札がない・期限を過ぎた・締めた・作り直された",
);

/**
 * JSON の応答の書き方。
 * @param schema 本文の形
 * @param description いつ返すか
 * @returns OpenAPI の応答の定義
 */
function json<T>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } } as const;
}

/**
 * ログインなしの道の答えの見出し（持たせない・検索に載せない）。
 * @param c Hono の文脈
 */
function publicHeaders(c: Context): void {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
}

/**
 * 見せる・受け付ける窓口の道の定義。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const tags = ["match"];
  const table = "/api/v1/match/tables/{tableId}";
  const tableErrors = {
    401: unauthenticatedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
  } as const;
  return {
    issueView: createRoute({
      method: "put",
      path: `${table}/view-link`,
      tags,
      operationId: "matchIssueViewLink",
      summary:
        "見るだけの札を作り直す（前の札・QR は使えなくなる。札はこのときだけ返す。期限は試合の日と今日の遅いほうの終わり）",
      middleware: [session] as const,
      request: { params: TableParams },
      responses: { 200: json(MatchLinkIssued, "作った札"), ...tableErrors },
    }),
    issueJoin: createRoute({
      method: "put",
      path: `${table}/join-link`,
      tags,
      operationId: "matchIssueJoinLink",
      summary: "受付の札を作り直して受付を開く（前の札は使えなくなる。札はこのときだけ返す）",
      middleware: [session] as const,
      request: { params: TableParams },
      responses: { 200: json(MatchLinkIssued, "作った札"), ...tableErrors },
    }),
    closeJoin: createRoute({
      method: "post",
      path: `${table}/join-link/close`,
      tags,
      operationId: "matchCloseJoin",
      summary: "受付を締める（受付のページは 404 になる。受け付けた行は残る）",
      middleware: [session] as const,
      request: { params: TableParams },
      responses: { 200: json(MatchJoinList, "締めたあとの受付の一覧"), ...tableErrors },
    }),
    listJoins: createRoute({
      method: "get",
      path: `${table}/joins`,
      tags,
      operationId: "matchListJoins",
      summary: "受付の一覧（受け付けた順・同じ呼び名の印・札の期限と締めた時刻）",
      middleware: [session] as const,
      request: { params: TableParams },
      responses: { 200: json(MatchJoinList, "受付の一覧"), ...tableErrors },
    }),
    deleteJoin: createRoute({
      method: "delete",
      path: `${table}/joins/{joinId}`,
      tags,
      operationId: "matchDeleteJoin",
      summary: "受付の行を消す（名簿から消すのは担当の端末）",
      middleware: [session] as const,
      request: { params: JoinEntryParams },
      responses: { 204: { description: "消した" }, ...tableErrors },
    }),
    view: createRoute({
      method: "get",
      path: "/api/v1/match/views/{viewToken}",
      tags,
      operationId: "matchGetView",
      summary:
        "見るだけのページ（ログインなし。呼び名・組み合わせ・進み具合だけ。レベルと氏名は出さない。no-store・noindex）",
      request: { params: ViewParams },
      responses: { 200: json(MatchView, "見るだけのページの中身"), 404: viewNotFoundResponse },
    }),
    viewVersion: createRoute({
      method: "get",
      path: "/api/v1/match/views/{viewToken}/version",
      tags,
      operationId: "matchGetViewVersion",
      summary: "見るだけのページの版の番号（ログインなし。30秒おきに確かめる）",
      request: { params: ViewParams },
      responses: { 200: json(MatchViewVersion, "版の番号"), 404: viewNotFoundResponse },
    }),
    joinInfo: createRoute({
      method: "get",
      path: "/api/v1/match/joins/{joinToken}",
      tags,
      operationId: "matchGetJoin",
      summary: "受付のページ（ログインなし。試合表の名前と日付・選べるレベル。no-store・noindex）",
      request: { params: JoinParams },
      responses: { 200: json(MatchJoinInfo, "受付のページの中身"), 404: joinNotFoundResponse },
    }),
    join: createRoute({
      method: "post",
      path: "/api/v1/match/joins/{joinToken}",
      tags,
      operationId: "matchJoin",
      summary: `受け付ける（ログインなし。呼び名とレベルだけ。試合表ごとに${JOIN_MAX}人まで）`,
      request: {
        params: JoinParams,
        body: { required: true, content: { "application/json": { schema: MatchJoinInput } } },
      },
      responses: {
        201: json(MatchJoinAccepted, "受け付けた"),
        400: invalidInputResponse,
        404: joinNotFoundResponse,
        409: domainErrorResponse(MATCH_ERRORS.JOIN_FULL, `${JOIN_MAX}人を超える`),
      },
    }),
  };
}

/**
 * 見せる・受け付ける窓口。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function matchShareRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);

  /**
   * 受付の一覧を読む（名簿の呼び名と比べて同じ名前の印を付ける）。
   * @param tableId 試合表の ID
   * @returns 受付の一覧
   */
  const joinList = async (tableId: string) => {
    const state = await readContent(db, tableId);
    return {
      joins: await listJoins(db, tableId, state.content),
      expiresAt: state.links.joinExpiresAt,
      closedAt: state.links.joinClosedAt,
    };
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.issueView, async (c) => {
      const { tableId } = c.req.valid("param");
      await requireTableAccess(db, tableId, currentAccount(c).accountId);
      const state = await readContent(db, tableId);
      const token = newToken();
      const expiresAt = tokenExpiry(state.playDate, new Date());
      await setViewToken(db, tableId, hashToken(token), expiresAt);
      c.header("Cache-Control", "no-store");
      return c.json({ token, expiresAt: expiresAt.toISOString() }, 200);
    })
    .openapi(routes.issueJoin, async (c) => {
      const { tableId } = c.req.valid("param");
      await requireTableAccess(db, tableId, currentAccount(c).accountId);
      const state = await readContent(db, tableId);
      const token = newToken();
      const expiresAt = tokenExpiry(state.playDate, new Date());
      await setJoinToken(db, tableId, hashToken(token), expiresAt);
      c.header("Cache-Control", "no-store");
      return c.json({ token, expiresAt: expiresAt.toISOString() }, 200);
    })
    .openapi(routes.closeJoin, async (c) => {
      const { tableId } = c.req.valid("param");
      await requireTableAccess(db, tableId, currentAccount(c).accountId);
      await closeJoin(db, tableId, new Date());
      return c.json(await joinList(tableId), 200);
    })
    .openapi(routes.listJoins, async (c) => {
      const { tableId } = c.req.valid("param");
      await requireTableAccess(db, tableId, currentAccount(c).accountId);
      return c.json(await joinList(tableId), 200);
    })
    .openapi(routes.deleteJoin, async (c) => {
      const { tableId, joinId } = c.req.valid("param");
      await requireTableAccess(db, tableId, currentAccount(c).accountId);
      if (!(await deleteJoin(db, tableId, joinId))) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    })
    .openapi(routes.view, async (c) => {
      publicHeaders(c);
      const view = await readView(db, hashToken(c.req.valid("param").viewToken), new Date());
      if (!view) throw new AppError(MATCH_ERRORS.VIEW_NOT_FOUND);
      return c.json(view, 200);
    })
    .openapi(routes.viewVersion, async (c) => {
      publicHeaders(c);
      const version = await readViewVersion(
        db,
        hashToken(c.req.valid("param").viewToken),
        new Date(),
      );
      if (version === undefined) throw new AppError(MATCH_ERRORS.VIEW_NOT_FOUND);
      return c.json({ version }, 200);
    })
    .openapi(routes.joinInfo, async (c) => {
      publicHeaders(c);
      const target = await findJoinTarget(
        db,
        hashToken(c.req.valid("param").joinToken),
        new Date(),
      );
      if (!target) throw new AppError(MATCH_ERRORS.JOIN_NOT_FOUND);
      return c.json(
        { name: target.name, playDate: target.playDate, levels: [...MATCH_LEVELS] },
        200,
      );
    })
    .openapi(routes.join, async (c) => {
      publicHeaders(c);
      const hash = hashToken(c.req.valid("param").joinToken);
      const input = c.req.valid("json");
      await db.transaction(async (tx) => {
        // 試合表の行を押さえてから数える（同時に来ても上限を超えない）
        const target = await findJoinTarget(tx, hash, new Date(), true);
        if (!target) throw new AppError(MATCH_ERRORS.JOIN_NOT_FOUND);
        if ((await countJoins(tx, target.tableId)) >= JOIN_MAX) {
          throw new AppError(MATCH_ERRORS.JOIN_FULL);
        }
        await insertJoin(tx, target.tableId, input);
      });
      return c.json({ nickname: input.nickname, level: input.level }, 201);
    });
}
