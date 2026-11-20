// 組織の窓口（suite-001。AD-22・PRD 組織 4章）。道は /api/v1/suite/organizations・/api/v1/suite/organization-invites の下。
// - どの道もログインが要る。組織の人でない人には、組織があることを知らせない（404 ORGANIZATION_NOT_FOUND）
// - 組織の操作（招待・役割・外す・引き継ぐ・名前・消す）は管理者だけ（403 ORGANIZATION_ADMIN_ONLY）。判定は requireOrganizationRole の1か所
// - 役割は要求のたびに表から引き、セッションに写さない（FR-O14）
// - 組織の操作は契約の状態で止めない（PRD O7）
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/suite";
import {
  ORGANIZATION_ADMIN_LIMIT,
  ORGANIZATION_EDITOR_LIMIT,
  ORGANIZATION_ERRORS,
  ORGANIZATION_MEMBER_LIMIT,
} from "@workspace/contracts/suite";
import type { Executor } from "../../kernel/db.ts";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import {
  countMembers,
  createOrganization,
  deleteOrganization,
  findMembership,
  findOrganization,
  joinByInvite,
  leaveOrganization,
  listMembers,
  listMemberships,
  markAdminSeen,
  previewInvite,
  readInvite,
  removeMember,
  renameOrganization,
  rotateInvite,
  setMemberRole,
  transferAdmin,
} from "./organizations.ts";
import type { OrganizationMembership } from "./organizations.ts";

/** 道の頭。 */
const BASE = "/api/v1/suite/organizations";

/** 窓口の文書のまとまり。 */
const TAGS = ["suite"];

/** 道の organizationId。 */
const OrganizationParams = z.object({
  organizationId: uuidParam("organizationId", "組織の ID"),
});

/** 道の organizationId と accountId。 */
const MemberParams = z.object({
  organizationId: uuidParam("organizationId", "組織の ID"),
  accountId: uuidParam("accountId", "組織の人の account の ID"),
});

/** 道の招待の札（形の確かめは処理の中で行い、使えないリンクとして答える）。 */
const InviteParams = z.object({
  token: z
    .string()
    .max(100)
    .openapi({ param: { name: "token", in: "path" }, description: "招待の札" }),
});

/** 組織がない・組織の人でない応答。 */
const notFound = domainErrorResponse(
  ORGANIZATION_ERRORS.ORGANIZATION_NOT_FOUND,
  "組織がない・組織の人でない",
);

/** 管理者でない応答。 */
const adminOnly = domainErrorResponse(
  ORGANIZATION_ERRORS.ORGANIZATION_ADMIN_ONLY,
  "管理者だけができる操作",
);

/** よくある応答。 */
const COMMON = { 401: unauthenticatedResponse, 404: notFound } as const;

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
 * JSON の本文の書き方。
 * @param schema 本文の形
 * @returns OpenAPI の本文の定義
 */
function body<T>(schema: T) {
  return { required: true, content: { "application/json": { schema } } } as const;
}

/**
 * 組織の操作の判定の1か所（AD-22）。組織の人でなければ 404、管理者が要るのに管理者でなければ 403。
 * @param db DB
 * @param organizationId 組織の ID
 * @param accountId 今の利用者
 * @param need 要る役割（member：組織の人ならだれでも・admin：管理者だけ）
 * @returns 今の利用者の組織の人の行
 * @throws {AppError} 組織の人でない（ORGANIZATION_NOT_FOUND）・管理者でない（ORGANIZATION_ADMIN_ONLY）
 */
export async function requireOrganizationRole(
  db: Executor,
  organizationId: string,
  accountId: string,
  need: "member" | "admin",
): Promise<OrganizationMembership> {
  const membership = await findMembership(db, organizationId, accountId);
  if (!membership) throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_NOT_FOUND);
  if (need === "admin" && membership.role !== "admin") {
    throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_ADMIN_ONLY);
  }
  return membership;
}

/**
 * 組織の窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function organizationRoutes(deps: DomainRouteDeps) {
  const { db } = deps;

  const listRoute = createRoute({
    method: "get",
    path: BASE,
    tags: TAGS,
    operationId: "suiteListOrganizations",
    summary: "入っている組織の一覧（入った順）",
    middleware: [requireSession(deps)] as const,
    responses: {
      200: json(contract.OrganizationList.openapi("SuiteOrganizationList"), "入っている組織"),
      401: unauthenticatedResponse,
    },
  });

  const createOrgRoute = createRoute({
    method: "post",
    path: BASE,
    tags: TAGS,
    operationId: "suiteCreateOrganization",
    summary: "組織を作る（作った人が管理者。管理者として持てる組織は20まで）",
    middleware: [requireSession(deps)] as const,
    request: { body: body(contract.OrganizationNameInput.openapi("SuiteOrganizationNameInput")) },
    responses: {
      201: json(z.object({ id: z.guid() }).openapi("SuiteOrganizationCreated"), "作った"),
      400: invalidInputResponse,
      401: unauthenticatedResponse,
      409: domainErrorResponse(ORGANIZATION_ERRORS.ORGANIZATION_LIMIT, "上限"),
    },
  });

  const detailRoute = createRoute({
    method: "get",
    path: `${BASE}/{organizationId}`,
    tags: TAGS,
    operationId: "suiteGetOrganization",
    summary: "組織の画面（人の表示名・役割・入った日。組織の人の全員）",
    middleware: [requireSession(deps)] as const,
    request: { params: OrganizationParams },
    responses: {
      200: json(contract.OrganizationDetail.openapi("SuiteOrganizationDetail"), "組織"),
      ...COMMON,
    },
  });

  const renameRoute = createRoute({
    method: "patch",
    path: `${BASE}/{organizationId}`,
    tags: TAGS,
    operationId: "suiteRenameOrganization",
    summary: "組織の名前を直す（管理者だけ）",
    middleware: [requireSession(deps)] as const,
    request: { params: OrganizationParams, body: body(contract.OrganizationNameInput) },
    responses: {
      204: { description: "直した" },
      400: invalidInputResponse,
      403: adminOnly,
      ...COMMON,
    },
  });

  const deleteRoute = createRoute({
    method: "delete",
    path: `${BASE}/{organizationId}`,
    tags: TAGS,
    operationId: "suiteDeleteOrganization",
    summary: "組織を消す（管理者だけ。アプリの記録は持ち主の個人のものとして残る）",
    middleware: [requireSession(deps)] as const,
    request: { params: OrganizationParams },
    responses: { 204: { description: "消した" }, 403: adminOnly, ...COMMON },
  });

  const inviteRoute = createRoute({
    method: "get",
    path: `${BASE}/{organizationId}/invite`,
    tags: TAGS,
    operationId: "suiteGetOrganizationInvite",
    summary: "招待のリンクの札（管理者だけ。まだないとき・出し直せないときは null）",
    middleware: [requireSession(deps)] as const,
    request: { params: OrganizationParams },
    responses: {
      200: json(contract.OrganizationInviteView.openapi("SuiteOrganizationInvite"), "札"),
      403: adminOnly,
      ...COMMON,
    },
  });

  const rotateInviteRoute = createRoute({
    method: "post",
    path: `${BASE}/{organizationId}/invite`,
    tags: TAGS,
    operationId: "suiteRotateOrganizationInvite",
    summary: "招待のリンクを作る・作り直す（管理者だけ。前のリンクはすぐ使えなくなる）",
    middleware: [requireSession(deps)] as const,
    request: { params: OrganizationParams },
    responses: {
      200: json(contract.OrganizationInviteView, "新しい札"),
      403: adminOnly,
      ...COMMON,
    },
  });

  const roleRoute = createRoute({
    method: "put",
    path: `${BASE}/{organizationId}/members/{accountId}`,
    tags: TAGS,
    operationId: "suiteSetOrganizationMemberRole",
    summary: "自分以外の人の役割を、メンバー⇔編集者に切り替える（管理者だけ）",
    middleware: [requireSession(deps)] as const,
    request: {
      params: MemberParams,
      body: body(contract.OrganizationMemberRoleInput.openapi("SuiteOrganizationMemberRoleInput")),
    },
    responses: {
      204: { description: "切り替えた" },
      400: invalidInputResponse,
      403: adminOnly,
      ...COMMON,
      409: domainErrorResponse(ORGANIZATION_ERRORS.ORGANIZATION_EDITOR_LIMIT, "編集者の上限・自分"),
    },
  });

  const removeRoute = createRoute({
    method: "delete",
    path: `${BASE}/{organizationId}/members/{accountId}`,
    tags: TAGS,
    operationId: "suiteRemoveOrganizationMember",
    summary: "自分以外の人を組織から外す（管理者だけ）",
    middleware: [requireSession(deps)] as const,
    request: { params: MemberParams },
    responses: {
      204: { description: "外した" },
      403: adminOnly,
      ...COMMON,
      409: domainErrorResponse(ORGANIZATION_ERRORS.ORGANIZATION_SELF_NOT_ALLOWED, "自分"),
    },
  });

  const transferRoute = createRoute({
    method: "post",
    path: `${BASE}/{organizationId}/transfer`,
    tags: TAGS,
    operationId: "suiteTransferOrganizationAdmin",
    summary: "管理者を引き継ぐ（管理者だけ。前の管理者は編集者になる）",
    middleware: [requireSession(deps)] as const,
    request: {
      params: OrganizationParams,
      body: body(contract.OrganizationTransferInput.openapi("SuiteOrganizationTransferInput")),
    },
    responses: {
      204: { description: "引き継いだ" },
      400: invalidInputResponse,
      403: adminOnly,
      ...COMMON,
      409: domainErrorResponse(ORGANIZATION_ERRORS.ORGANIZATION_SELF_NOT_ALLOWED, "自分"),
    },
  });

  const leaveRoute = createRoute({
    method: "post",
    path: `${BASE}/{organizationId}/leave`,
    tags: TAGS,
    operationId: "suiteLeaveOrganization",
    summary: "組織を抜ける（管理者は引き継ぐ人を選んでから）",
    middleware: [requireSession(deps)] as const,
    request: {
      params: OrganizationParams,
      body: body(contract.OrganizationLeaveInput.openapi("SuiteOrganizationLeaveInput")),
    },
    responses: {
      204: { description: "抜けた" },
      400: invalidInputResponse,
      ...COMMON,
      409: domainErrorResponse(
        ORGANIZATION_ERRORS.ORGANIZATION_SUCCESSOR_REQUIRED,
        "管理者が引き継ぐ人を選んでいない",
      ),
    },
  });

  const invalidInvite = domainErrorResponse(
    ORGANIZATION_ERRORS.ORGANIZATION_INVITE_INVALID,
    "使えないリンク",
  );

  const invitePreviewRoute = createRoute({
    method: "get",
    path: "/api/v1/suite/organization-invites/{token}",
    tags: TAGS,
    operationId: "suitePreviewOrganizationInvite",
    summary: "招待の確かめの画面の中身（組織の名前・管理者・人数）",
    middleware: [requireSession(deps)] as const,
    request: { params: InviteParams },
    responses: {
      200: json(
        contract.OrganizationInvitePreview.openapi("SuiteOrganizationInvitePreview"),
        "中身",
      ),
      401: unauthenticatedResponse,
      404: invalidInvite,
    },
  });

  const joinRoute = createRoute({
    method: "post",
    path: "/api/v1/suite/organization-invites/{token}",
    tags: TAGS,
    operationId: "suiteJoinOrganization",
    summary: "招待から、メンバーとして入る（同じ人が2回押しても1回だけ入る）",
    middleware: [requireSession(deps)] as const,
    request: { params: InviteParams },
    responses: {
      200: json(contract.OrganizationJoinResult.openapi("SuiteOrganizationJoinResult"), "入った"),
      401: unauthenticatedResponse,
      404: invalidInvite,
      409: domainErrorResponse(ORGANIZATION_ERRORS.ORGANIZATION_FULL, "人数の上限"),
    },
  });

  return new OpenAPIHono<ApiEnv>()
    .openapi(listRoute, async (c) => {
      const me = currentAccount(c).accountId;
      const rows = await listMemberships(db, me);
      const organizations = [];
      for (const row of rows) {
        organizations.push({
          id: row.organizationId,
          name: row.organizationName,
          myRole: row.role,
          memberCount: await countMembers(db, row.organizationId),
          joinedAt: row.joinedAt.toISOString(),
        });
      }
      return c.json(
        {
          organizations,
          adminCount: rows.filter((row) => row.role === "admin").length,
          adminLimit: ORGANIZATION_ADMIN_LIMIT,
        },
        200,
      );
    })
    .openapi(createOrgRoute, async (c) => {
      const id = await createOrganization(
        db,
        currentAccount(c).accountId,
        c.req.valid("json").name,
      );
      return c.json({ id }, 201);
    })
    .openapi(detailRoute, async (c) => {
      const { organizationId } = c.req.valid("param");
      const me = currentAccount(c).accountId;
      const mine = await requireOrganizationRole(db, organizationId, me, "member");
      const found = await findOrganization(db, organizationId);
      if (!found) throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_NOT_FOUND);
      const members = await listMembers(db, organizationId);
      const seenAt = found.adminSeenAt ?? found.createdAt;
      const isAdmin = mine.role === "admin";
      if (isAdmin) await markAdminSeen(db, organizationId);
      return c.json(
        {
          id: found.id,
          name: found.name,
          myRole: mine.role,
          members: members.map((member) => ({
            accountId: member.accountId,
            displayName: member.displayName,
            role: member.role,
            joinedAt: member.joinedAt.toISOString(),
            isMe: member.accountId === me,
            isNew: isAdmin && member.accountId !== me && member.joinedAt > seenAt,
          })),
          memberLimit: ORGANIZATION_MEMBER_LIMIT,
          editorLimit: ORGANIZATION_EDITOR_LIMIT,
          createdAt: found.createdAt.toISOString(),
        },
        200,
      );
    })
    .openapi(renameRoute, async (c) => {
      const { organizationId } = c.req.valid("param");
      await requireOrganizationRole(db, organizationId, currentAccount(c).accountId, "admin");
      await renameOrganization(db, organizationId, c.req.valid("json").name);
      return c.body(null, 204);
    })
    .openapi(deleteRoute, async (c) => {
      const { organizationId } = c.req.valid("param");
      await requireOrganizationRole(db, organizationId, currentAccount(c).accountId, "admin");
      await deleteOrganization(db, organizationId);
      return c.body(null, 204);
    })
    .openapi(inviteRoute, async (c) => {
      const { organizationId } = c.req.valid("param");
      await requireOrganizationRole(db, organizationId, currentAccount(c).accountId, "admin");
      const invite = await readInvite(db, deps.secretBox, organizationId);
      return c.json(
        { token: invite.token, createdAt: invite.createdAt?.toISOString() ?? null },
        200,
      );
    })
    .openapi(rotateInviteRoute, async (c) => {
      const { organizationId } = c.req.valid("param");
      await requireOrganizationRole(db, organizationId, currentAccount(c).accountId, "admin");
      const invite = await rotateInvite(db, deps.secretBox, organizationId);
      return c.json({ token: invite.token, createdAt: invite.createdAt.toISOString() }, 200);
    })
    .openapi(roleRoute, async (c) => {
      const { organizationId, accountId } = c.req.valid("param");
      const me = currentAccount(c).accountId;
      await requireOrganizationRole(db, organizationId, me, "admin");
      if (accountId === me) throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_SELF_NOT_ALLOWED);
      await setMemberRole(db, organizationId, accountId, c.req.valid("json").role);
      return c.body(null, 204);
    })
    .openapi(removeRoute, async (c) => {
      const { organizationId, accountId } = c.req.valid("param");
      const me = currentAccount(c).accountId;
      await requireOrganizationRole(db, organizationId, me, "admin");
      if (accountId === me) throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_SELF_NOT_ALLOWED);
      await removeMember(db, organizationId, accountId);
      return c.body(null, 204);
    })
    .openapi(transferRoute, async (c) => {
      const { organizationId } = c.req.valid("param");
      const me = currentAccount(c).accountId;
      await requireOrganizationRole(db, organizationId, me, "admin");
      await transferAdmin(db, organizationId, me, c.req.valid("json").accountId);
      return c.body(null, 204);
    })
    .openapi(leaveRoute, async (c) => {
      const { organizationId } = c.req.valid("param");
      const me = currentAccount(c).accountId;
      await requireOrganizationRole(db, organizationId, me, "member");
      await leaveOrganization(db, organizationId, me, c.req.valid("json").successorAccountId);
      return c.body(null, 204);
    })
    .openapi(invitePreviewRoute, async (c) => {
      const preview = await previewInvite(
        db,
        c.req.valid("param").token,
        currentAccount(c).accountId,
      );
      return c.json(preview, 200);
    })
    .openapi(joinRoute, async (c) => {
      const joined = await joinByInvite(
        db,
        c.req.valid("param").token,
        currentAccount(c).accountId,
      );
      return c.json(joined, 200);
    });
}
