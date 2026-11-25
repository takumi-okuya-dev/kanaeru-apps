// チーム運用の窓口（threads-013。PRD 組織 5章）。道の頭は /api/v1/threads（AD-15）。どれもログインが要る。
// - 運用アカウントの関わり・チーム・チームに入れる・見せる・承認を任せる：/api/v1/threads/accounts/{accountId}/…（判定は access.ts）
// - Threads の組織の画面・担当・運用状況：/api/v1/threads/organizations/{organizationId}/…（組織の人でなければ 404）
// - Threads のチームの一覧・チームの画面・チームの運用状況：/api/v1/threads/teams/…（threads-016。組織の管理者かチームの人でなければ 404）
// - はじめの画面の知らせ：/api/v1/threads/team-notices
// 組織の役割は要求のたびに suite の index.ts から引く。suite の表には書かない。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import { THREADS_ERRORS } from "@workspace/contracts/threads";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import { presentAccess, resolveAccess } from "./access.ts";
import {
  ACCOUNTS_BASE,
  AccountParams,
  COMMON_ERRORS,
  TAGS,
  accountAccess,
  accountMiddleware,
  body,
  json,
} from "./route-helpers.ts";
import {
  getAccountTeam,
  getOrganizationView,
  getTeamView,
  listVisibleTeams,
  requireTeamViewer,
  teamStatusScopeOf,
  listTeamNotices,
  listTeamOrganizations,
  markTeamNoticesSeen,
  placeAccount,
  requireTeamMember,
  setAssignment,
  setDelegation,
  setShared,
  statusScopeOf,
} from "./team.ts";
import { getTeamStatus } from "./team-status.ts";

/** 組織の道の頭。 */
const ORGANIZATIONS_BASE = "/api/v1/threads/organizations";

/** 道の organizationId。 */
const OrganizationParams = z.object({
  organizationId: uuidParam("organizationId", "組織の ID"),
});

/** チームの道の頭（threads-016）。 */
const TEAMS_BASE = "/api/v1/threads/teams";

/** 道の teamId。 */
const TeamParams = z.object({
  teamId: uuidParam("teamId", "チームの ID"),
});

/** 道の accountId と personId。 */
const DelegationParams = z.object({
  accountId: uuidParam("accountId", "運用アカウントの ID"),
  personId: uuidParam("personId", "担当の人の account の ID"),
});

/** 権限が足りない応答。 */
const forbidden = domainErrorResponse(THREADS_ERRORS.THREADS_TEAM_FORBIDDEN, "権限が足りない");

/** 組織がない・組織の人でない応答。 */
const teamNotFound = domainErrorResponse(
  THREADS_ERRORS.THREADS_TEAM_NOT_FOUND,
  "組織がない・組織の人でない",
);

/**
 * チーム運用の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function teamRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const middleware = accountMiddleware(deps);
  const routes = {
    getAccess: createRoute({
      method: "get",
      path: `${ACCOUNTS_BASE}/{accountId}/access`,
      tags: TAGS,
      operationId: "threadsGetAccountAccess",
      summary:
        "今の利用者の、この運用アカウントでの関わりとできること（画面の出し分け。判定の正は各窓口）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.ThreadsAccountAccess.openapi("ThreadsAccountAccess"), "関わり"),
        ...COMMON_ERRORS,
      },
    }),
    getTeam: createRoute({
      method: "get",
      path: `${ACCOUNTS_BASE}/{accountId}/team`,
      tags: TAGS,
      operationId: "threadsGetAccountTeam",
      summary:
        "このアカウントのチーム（組織・管理者・持ち主・担当の人）と、入れられる組織（持ち主と担当の人だけ）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.ThreadsAccountTeam.openapi("ThreadsAccountTeam"), "チーム"),
        ...COMMON_ERRORS,
      },
    }),
    putPlacement: createRoute({
      method: "put",
      path: `${ACCOUNTS_BASE}/{accountId}/team/placement`,
      tags: TAGS,
      operationId: "threadsPutAccountPlacement",
      summary:
        "運用アカウントを組織の中のチームに入れる・外す（持ち主だけ。持ち主が入っているチームだけ。外す・移すと担当・任せる・見せる設定は消える）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ThreadsPlacementInput.openapi("ThreadsPlacementInput")),
      },
      responses: {
        200: json(contract.ThreadsAccountTeam, "変えたあとのチーム"),
        400: invalidInputResponse,
        ...COMMON_ERRORS,
      },
    }),
    putShared: createRoute({
      method: "put",
      path: `${ACCOUNTS_BASE}/{accountId}/team/shared`,
      tags: TAGS,
      operationId: "threadsPutAccountShared",
      summary:
        "チームに見せるを切り替える（持ち主だけ。オンのとき、チームの人と組織の管理者が投稿の案と戦略を読むだけで見られる）",
      middleware,
      request: {
        params: AccountParams,
        body: body(contract.ThreadsSharedInput.openapi("ThreadsSharedInput")),
      },
      responses: {
        200: json(contract.ThreadsAccountTeam, "変えたあとのチーム"),
        400: invalidInputResponse,
        ...COMMON_ERRORS,
      },
    }),
    putDelegation: createRoute({
      method: "put",
      path: `${ACCOUNTS_BASE}/{accountId}/team/delegations/{personId}`,
      tags: TAGS,
      operationId: "threadsPutAccountDelegation",
      summary: "担当の人に承認を任せる・やめる（持ち主だけ。任せられるのは承認・却下だけ）",
      middleware,
      request: {
        params: DelegationParams,
        body: body(contract.ThreadsDelegationInput.openapi("ThreadsDelegationInput")),
      },
      responses: {
        200: json(contract.ThreadsAccountTeam, "変えたあとのチーム"),
        400: invalidInputResponse,
        ...COMMON_ERRORS,
        409: domainErrorResponse(THREADS_ERRORS.THREADS_DELEGATION_NOT_ALLOWED, "担当の人でない"),
      },
    }),
    listOrganizations: createRoute({
      method: "get",
      path: ORGANIZATIONS_BASE,
      tags: TAGS,
      operationId: "threadsListOrganizations",
      summary: "入っている組織と、組織に入っている運用アカウントの数（どこにも入っていなければ空）",
      middleware: [requireSession(deps)] as const,
      responses: {
        200: json(contract.ThreadsOrganizationList.openapi("ThreadsOrganizationList"), "組織"),
        401: unauthenticatedResponse,
      },
    }),
    getOrganization: createRoute({
      method: "get",
      path: `${ORGANIZATIONS_BASE}/{organizationId}`,
      tags: TAGS,
      operationId: "threadsGetOrganization",
      summary:
        "Threads の組織の画面（運用アカウントの名前・持ち主・見せる状態。担当の表は管理者だけ）",
      middleware: [requireSession(deps)] as const,
      request: { params: OrganizationParams },
      responses: {
        200: json(contract.ThreadsOrganizationView.openapi("ThreadsOrganizationView"), "組織"),
        401: unauthenticatedResponse,
        404: teamNotFound,
      },
    }),
    putAssignment: createRoute({
      method: "put",
      path: `${ORGANIZATIONS_BASE}/{organizationId}/assignments`,
      tags: TAGS,
      operationId: "threadsPutAssignment",
      summary:
        "担当を付け外しする（管理者だけ。相手は編集者か管理者で、運用アカウントの持ち主でない人）",
      middleware: [requireSession(deps)] as const,
      request: {
        params: OrganizationParams,
        body: body(contract.ThreadsAssignmentInput.openapi("ThreadsAssignmentInput")),
      },
      responses: {
        200: json(contract.ThreadsOrganizationView, "変えたあとの組織の画面"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        403: forbidden,
        404: teamNotFound,
        409: domainErrorResponse(THREADS_ERRORS.THREADS_ASSIGNMENT_NOT_ALLOWED, "担当にできない"),
      },
    }),
    listTeams: createRoute({
      method: "get",
      path: TEAMS_BASE,
      tags: TAGS,
      operationId: "threadsListTeams",
      summary: "見られるチーム（入っているチームと、管理者の組織のすべてのチーム。threads-016）",
      middleware: [requireSession(deps)] as const,
      responses: {
        200: json(contract.ThreadsTeamList.openapi("ThreadsTeamList"), "チーム"),
        401: unauthenticatedResponse,
      },
    }),
    getTeamPage: createRoute({
      method: "get",
      path: `${TEAMS_BASE}/{teamId}`,
      tags: TAGS,
      operationId: "threadsGetTeam",
      summary:
        "Threads のチームの画面（運用アカウント・担当を決める表〈管理者とリーダー〉・運用状況を見られるか）",
      middleware: [requireSession(deps)] as const,
      request: { params: TeamParams },
      responses: {
        200: json(contract.ThreadsTeamView.openapi("ThreadsTeamView"), "チーム"),
        401: unauthenticatedResponse,
        404: teamNotFound,
      },
    }),
    getTeamStatus: createRoute({
      method: "get",
      path: `${TEAMS_BASE}/{teamId}/status`,
      tags: TAGS,
      operationId: "threadsGetTeamOnlyStatus",
      summary:
        "チームの運用状況（数と日付だけ。管理者とリーダーはチームの全部、担当のある編集者は担当の分だけ）",
      middleware: [requireSession(deps)] as const,
      request: { params: TeamParams },
      responses: {
        200: json(contract.ThreadsTeamStatus, "運用状況"),
        401: unauthenticatedResponse,
        403: forbidden,
        404: teamNotFound,
      },
    }),
    getStatus: createRoute({
      method: "get",
      path: `${ORGANIZATIONS_BASE}/{organizationId}/status`,
      tags: TAGS,
      operationId: "threadsGetTeamStatus",
      summary: "運用状況（数と日付だけ。管理者はすべて、担当が1つ以上ある編集者は担当の分だけ）",
      middleware: [requireSession(deps)] as const,
      request: { params: OrganizationParams },
      responses: {
        200: json(contract.ThreadsTeamStatus.openapi("ThreadsTeamStatus"), "運用状況"),
        401: unauthenticatedResponse,
        403: forbidden,
        404: teamNotFound,
      },
    }),
    getNotices: createRoute({
      method: "get",
      path: "/api/v1/threads/team-notices",
      tags: TAGS,
      operationId: "threadsGetTeamNotices",
      summary: "はじめの画面に1回だけ出す知らせ（担当が付いた・退会で引き継いだ）",
      middleware: [requireSession(deps)] as const,
      responses: {
        200: json(contract.ThreadsTeamNotices.openapi("ThreadsTeamNotices"), "知らせ"),
        401: unauthenticatedResponse,
      },
    }),
    seeNotices: createRoute({
      method: "post",
      path: "/api/v1/threads/team-notices/seen",
      tags: TAGS,
      operationId: "threadsSeeTeamNotices",
      summary: "知らせを見たことにする（もう出さない）",
      middleware: [requireSession(deps)] as const,
      responses: { 204: { description: "見たことにした" }, 401: unauthenticatedResponse },
    }),
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getAccess, async (c) => {
      const access = await resolveAccess(
        db,
        currentAccount(c).accountId,
        c.req.valid("param").accountId,
      );
      if (!access) throw new AppError("NOT_FOUND");
      return c.json(await presentAccess(db, access), 200);
    })
    .openapi(routes.getTeam, async (c) => {
      const access = await accountAccess(deps, c, c.req.valid("param").accountId, "team_card");
      return c.json(await getAccountTeam(db, access), 200);
    })
    .openapi(routes.putPlacement, async (c) => {
      const access = await accountAccess(deps, c, c.req.valid("param").accountId, "manage");
      await placeAccount(deps, access, c.req.valid("json").teamId);
      return c.json(await getAccountTeam(db, access), 200);
    })
    .openapi(routes.putShared, async (c) => {
      const access = await accountAccess(deps, c, c.req.valid("param").accountId, "manage");
      await setShared(deps, access, c.req.valid("json").shared);
      return c.json(await getAccountTeam(db, access), 200);
    })
    .openapi(routes.putDelegation, async (c) => {
      const { accountId, personId } = c.req.valid("param");
      const access = await accountAccess(deps, c, accountId, "manage");
      await setDelegation(deps, access, personId, c.req.valid("json").delegated);
      return c.json(await getAccountTeam(db, access), 200);
    })
    .openapi(routes.listOrganizations, async (c) => {
      return c.json(
        { organizations: await listTeamOrganizations(db, currentAccount(c).accountId) },
        200,
      );
    })
    .openapi(routes.getOrganization, async (c) => {
      const { organizationId } = c.req.valid("param");
      const membership = await requireTeamMember(db, organizationId, currentAccount(c).accountId);
      return c.json(await getOrganizationView(db, organizationId, membership), 200);
    })
    .openapi(routes.putAssignment, async (c) => {
      const { organizationId } = c.req.valid("param");
      const membership = await requireTeamMember(db, organizationId, currentAccount(c).accountId);
      await setAssignment(deps, organizationId, membership, c.req.valid("json"));
      return c.json(await getOrganizationView(db, organizationId, membership), 200);
    })
    .openapi(routes.getStatus, async (c) => {
      const { organizationId } = c.req.valid("param");
      const me = currentAccount(c).accountId;
      const membership = await requireTeamMember(db, organizationId, me);
      const scope = await statusScopeOf(db, organizationId, membership);
      // メンバーと担当のない編集者は、直接求めても断る（FR-T40）
      if (!scope) throw new AppError(THREADS_ERRORS.THREADS_TEAM_FORBIDDEN);
      return c.json(await getTeamStatus(db, organizationId, me, scope), 200);
    })
    .openapi(routes.listTeams, async (c) => {
      return c.json(await listVisibleTeams(db, currentAccount(c).accountId), 200);
    })
    .openapi(routes.getTeamPage, async (c) => {
      return c.json(
        await getTeamView(db, c.req.valid("param").teamId, currentAccount(c).accountId),
        200,
      );
    })
    .openapi(routes.getTeamStatus, async (c) => {
      const { teamId } = c.req.valid("param");
      const me = currentAccount(c).accountId;
      const { team, membership } = await requireTeamViewer(db, teamId, me);
      const scope = await teamStatusScopeOf(db, teamId, membership);
      if (!scope) throw new AppError(THREADS_ERRORS.THREADS_TEAM_FORBIDDEN);
      return c.json(await getTeamStatus(db, team.organizationId, me, scope), 200);
    })
    .openapi(routes.getNotices, async (c) => {
      return c.json(await listTeamNotices(db, currentAccount(c).accountId), 200);
    })
    .openapi(routes.seeNotices, async (c) => {
      await markTeamNoticesSeen(db, currentAccount(c).accountId);
      return c.body(null, 204);
    });
}
