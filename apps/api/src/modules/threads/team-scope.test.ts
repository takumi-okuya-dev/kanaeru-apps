// チーム運用をチームの単位にする（threads-016）の結合のテスト（本物の PostgreSQL・偽の Threads）：
// 持ち主が入っているチームにだけ入れる・チームの外の人には見えない・リーダーの担当の付け外し・担当の人／持ち主がチームから外れる・
// チームを消す・リーダーの運用状況・退会の引き継ぎで管理者をチームに入れる。
import "@hono/zod-openapi";
import type {
  ThreadsAccountList,
  ThreadsOrganizationList,
  ThreadsOrganizationView,
  ThreadsTeamList,
  ThreadsTeamStatus,
  ThreadsTeamView,
} from "@workspace/contracts/threads";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import {
  rotateInviteToken,
  joinOrganization,
  setOrganizationRole,
  setTeamMember,
  setUpTeam,
} from "../../../test/helpers/organization.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { listTeams } from "../suite/index.ts";
import { countStoppedByTeam, getTeamStatus } from "./team-status.ts";
import {
  THREADS_BASE,
  THREADS_ORG_BASE,
  assignThreadsAccount,
  createThreadsAccount,
  placeThreadsAccount,
  setUpTeamScene,
  teamPerson,
} from "../../../test/helpers/threads-team.ts";
import type { TeamPerson, TeamScene } from "../../../test/helpers/threads-team.ts";

const database = useTestDatabase();

/** 組織の道の頭（suite）。 */
const ORG_BASE = "/api/v1/suite/organizations";

/**
 * 応答のエラーの code。
 * @param response 応答
 * @returns code
 */
async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as ErrorBody).error.code;
}

describe("チームの単位（threads-016）", () => {
  let scene: TeamScene;
  /** 店舗B だけに入っている編集者 */
  let other: TeamPerson;
  /** 店舗B */
  let teamB: string;

  /**
   * 運用アカウントの道を、その人として呼ぶ。
   * @param who 呼ぶ人
   * @param path 運用アカウントの道の続き
   * @returns 応答
   */
  function send(who: TeamPerson, path: string): Promise<Response> {
    return call(scene.app, who.cookie, `${THREADS_BASE}/${scene.account.id}${path}`);
  }

  /**
   * Threads の組織の画面を、その人として読む。
   * @param who 読む人
   * @returns 組織の画面
   */
  async function orgView(who: TeamPerson): Promise<ThreadsOrganizationView> {
    const response = await call(
      scene.app,
      who.cookie,
      `${THREADS_ORG_BASE}/${scene.organizationId}`,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as ThreadsOrganizationView;
  }

  /**
   * 担当の行があるか。
   * @param accountId 担当の人
   * @returns あれば true
   */
  async function hasAssignment(accountId: string): Promise<boolean> {
    const result = await database.pool.query(
      "SELECT 1 FROM threads_assignment WHERE account_id = $1",
      [accountId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    scene = await setUpTeamScene(database);
    other = await teamPerson(scene.app, "店舗Bの人");
    const token = await rotateInviteToken(scene.app, scene.admin.cookie, scene.organizationId);
    expect((await joinOrganization(scene.app, other.cookie, token)).status).toBe(200);
    expect(
      (
        await setOrganizationRole(
          scene.app,
          scene.admin.cookie,
          scene.organizationId,
          other.id,
          "editor",
        )
      ).status,
    ).toBe(204);
    teamB = await setUpTeam(scene.app, scene.admin.cookie, scene.organizationId, [other.id], {
      name: "店舗B",
    });
  });

  it("持ち主が入っていないチームには入れられない", async () => {
    const response = await placeThreadsAccount(
      scene.app,
      scene.owner.cookie,
      scene.account.id,
      teamB,
    );
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("THREADS_TEAM_NOT_FOUND");
  });

  it("チームの外の人（管理者でない）には、運用アカウントがあることを知らせない", async () => {
    // 見せていても、チームの外の人は読めない
    expect(
      (
        await call(
          scene.app,
          scene.owner.cookie,
          `${THREADS_BASE}/${scene.account.id}/team/shared`,
          "PUT",
          { shared: true },
        )
      ).status,
    ).toBe(200);
    expect((await send(other, "")).status).toBe(404);
    expect((await send(other, "/drafts?status=needs_review")).status).toBe(404);
    expect((await send(scene.member, "/drafts?status=needs_review")).status).toBe(200);
    expect((await send(scene.admin, "/drafts?status=needs_review")).status).toBe(200);
    const forOther = await orgView(other);
    expect(forOther.teams.map((row) => row.name)).toEqual(["店舗B"]);
    expect(forOther.accounts).toEqual([]);
    const list = (await (
      await call(scene.app, other.cookie, THREADS_ORG_BASE)
    ).json()) as ThreadsOrganizationList;
    expect(list.organizations[0]?.accountCount).toBe(0);
    const forAdmin = await orgView(scene.admin);
    expect(forAdmin.teams.map((row) => [row.name, row.canAssign])).toEqual([
      ["店舗A", true],
      ["店舗B", true],
    ]);
    expect(forAdmin.accounts.map((row) => [row.name, row.teamId])).toEqual([
      ["カフェB店", scene.teamId],
    ]);
  });

  it("リーダーは自分のチームの担当を付け外しでき、ほかのチームとリーダーでない人は 403", async () => {
    expect(
      (
        await setTeamMember(
          scene.app,
          scene.admin.cookie,
          scene.organizationId,
          scene.teamId,
          scene.editor.id,
          true,
        )
      ).status,
    ).toBe(204);
    const byLeader = await assignThreadsAccount(
      scene.app,
      scene.editor.cookie,
      scene.organizationId,
      scene.account.id,
      scene.editor.id,
    );
    expect(byLeader.status).toBe(200);
    const view = (await byLeader.json()) as ThreadsOrganizationView;
    expect(view.teams).toEqual([
      expect.objectContaining({ id: scene.teamId, leader: true, canAssign: true }),
    ]);
    expect(
      view.teams[0]?.assignments.find((row) => row.accountId === scene.editor.id)
        ?.assignedAccountIds,
    ).toEqual([scene.account.id]);
    // チームの人でない人は担当にできない
    const outsideTeam = await assignThreadsAccount(
      scene.app,
      scene.editor.cookie,
      scene.organizationId,
      scene.account.id,
      other.id,
    );
    expect(outsideTeam.status).toBe(409);
    expect(await codeOf(outsideTeam)).toBe("THREADS_ASSIGNMENT_NOT_ALLOWED");
    // リーダーでない人
    const notLeader = await assignThreadsAccount(
      scene.app,
      scene.assignee.cookie,
      scene.organizationId,
      scene.account.id,
      scene.editor.id,
      false,
    );
    expect(notLeader.status).toBe(403);
    expect(await codeOf(notLeader)).toBe("THREADS_TEAM_FORBIDDEN");
    // 店舗A のリーダーは、店舗B の運用アカウントの担当を決められない
    const bAccount = await createThreadsAccount(scene.app, other.cookie, "B店");
    expect((await placeThreadsAccount(scene.app, other.cookie, bAccount.id, teamB)).status).toBe(
      200,
    );
    expect(
      (
        await assignThreadsAccount(
          scene.app,
          scene.editor.cookie,
          scene.organizationId,
          bAccount.id,
          scene.editor.id,
        )
      ).status,
    ).toBe(403);
  });

  it("担当の人がチームから外れると担当が消え、持ち主が外れると運用アカウントがチームから外れる", async () => {
    expect(await hasAssignment(scene.assignee.id)).toBe(true);
    const removeFromTeam = (accountId: string) =>
      call(
        scene.app,
        scene.admin.cookie,
        `${ORG_BASE}/${scene.organizationId}/teams/${scene.teamId}/members/${accountId}`,
        "DELETE",
      );
    expect((await removeFromTeam(scene.assignee.id)).status).toBe(204);
    expect(await hasAssignment(scene.assignee.id)).toBe(false);
    expect((await send(scene.assignee, "")).status).toBe(404);
    expect((await removeFromTeam(scene.owner.id)).status).toBe(204);
    const placed = await database.pool.query(
      "SELECT 1 FROM threads_organization_account WHERE threads_account_id = $1",
      [scene.account.id],
    );
    expect(placed.rowCount).toBe(0);
    expect(await hasAssignment(scene.delegatee.id)).toBe(false);
    expect((await send(scene.member, "")).status).toBe(404);
    expect((await send(scene.owner, "")).status).toBe(200);
  });

  it("チームを消すと、運用アカウントはチームから外れ、持ち主に残る", async () => {
    expect(
      (
        await call(
          scene.app,
          scene.admin.cookie,
          `${ORG_BASE}/${scene.organizationId}/teams/${scene.teamId}`,
          "DELETE",
        )
      ).status,
    ).toBe(204);
    expect((await send(scene.owner, "")).status).toBe(200);
    expect((await send(scene.assignee, "")).status).toBe(404);
    expect((await send(scene.admin, "")).status).toBe(404);
  });

  it("リーダーの運用状況は、リーダーのチームの運用アカウントと人だけ", async () => {
    expect(
      (
        await setTeamMember(
          scene.app,
          scene.admin.cookie,
          scene.organizationId,
          scene.teamId,
          scene.member.id,
          true,
        )
      ).status,
    ).toBe(204);
    const bAccount = await createThreadsAccount(scene.app, other.cookie, "B店");
    await placeThreadsAccount(scene.app, other.cookie, bAccount.id, teamB);
    const status = async (who: TeamPerson) =>
      call(scene.app, who.cookie, `${THREADS_ORG_BASE}/${scene.organizationId}/status`);
    const forLeader = (await (await status(scene.member)).json()) as ThreadsTeamStatus;
    expect(forLeader.scope).toBe("team");
    expect(forLeader.accounts.map((row) => [row.name, row.teamName])).toEqual([
      ["カフェB店", "店舗A"],
    ]);
    expect(forLeader.people.map((row) => row.displayName).sort()).toEqual(
      ["佐藤", "山口", "山田", "高橋", "鈴木"].sort(),
    );
    const forAdmin = (await (await status(scene.admin)).json()) as ThreadsTeamStatus;
    expect(forAdmin.accounts.map((row) => row.name).sort()).toEqual(["B店", "カフェB店"].sort());
    // リーダーでも担当でもない店舗B の編集者は見られない
    expect((await status(other)).status).toBe(403);
  });

  it("退会の引き継ぎで、チームにいない管理者をチームに入れてから持ち主を替える", async () => {
    const inTeam = async (accountId: string) =>
      (
        await database.pool.query(
          "SELECT 1 FROM team_member WHERE team_id = $1 AND account_id = $2",
          [scene.teamId, accountId],
        )
      ).rowCount;
    expect(await inTeam(scene.admin.id)).toBe(0);
    expect(
      (await call(scene.app, scene.owner.cookie, "/api/v1/accounts/me", "DELETE")).status,
    ).toBe(204);
    expect(await inTeam(scene.admin.id)).toBe(1);
    const placed = await database.pool.query(
      "SELECT team_id, owner_account_id FROM threads_organization_account WHERE threads_account_id = $1",
      [scene.account.id],
    );
    expect(placed.rows).toEqual([{ team_id: scene.teamId, owner_account_id: scene.admin.id }]);
  });

  it("チームの一覧は、入っているチーム（管理者は組織のすべてのチーム）を、運用アカウントの数と出す", async () => {
    const list = async (who: TeamPerson) =>
      (await (
        await call(scene.app, who.cookie, "/api/v1/threads/teams")
      ).json()) as ThreadsTeamList;
    const forAdmin = await list(scene.admin);
    expect(forAdmin.teams.map((row) => [row.name, row.member, row.accountCount])).toEqual([
      ["店舗A", false, 1],
      ["店舗B", false, 0],
    ]);
    expect(forAdmin.adminOrganizations).toEqual([{ id: scene.organizationId, name: "飲食チーム" }]);
    // 運用状況の要約（threads-020）：管理者は数、運用状況を見られない人は null
    // まとめて数えた数は、チームの運用状況の stoppedCount と同じ
    for (const row of forAdmin.teams) {
      const status = (await (
        await call(scene.app, scene.admin.cookie, `/api/v1/threads/teams/${row.id}/status`)
      ).json()) as { stoppedCount: number };
      expect(row.stoppedCount).toBe(status.stoppedCount);
    }
    const forOther = await list(other);
    expect(forOther.teams.map((row) => [row.name, row.member, row.leader])).toEqual([
      ["店舗B", true, false],
    ]);
    expect(forOther).toMatchObject({ organizationCount: 1, adminOrganizations: [] });
    expect(forOther.teams[0]?.stoppedCount).toBeNull();
    const forOutsider = await list(scene.outsider);
    expect(forOutsider).toEqual({ teams: [], organizationCount: 0, adminOrganizations: [] });
  });

  it("一覧の要約の止まっている数は、チームごとの運用状況の数と同じ（日が経って止まったあとも。threads-020）", async () => {
    const later = new Date(Date.now() + 30 * 86_400_000);
    const teams = await listTeams(database.db, scene.organizationId);
    const counted = await countStoppedByTeam(
      database.db,
      scene.organizationId,
      teams.map((row) => ({
        id: row.id,
        memberIds: row.members.map((member) => member.accountId),
      })),
      later,
    );
    let total = 0;
    for (const row of teams) {
      const status = await getTeamStatus(
        database.db,
        scene.organizationId,
        scene.admin.id,
        { kind: "team", teamIds: [row.id], accountIds: [] },
        later,
      );
      expect(counted.get(row.id)).toBe(status.stoppedCount);
      total += status.stoppedCount;
    }
    expect(total).toBeGreaterThan(0);
  });

  it("運用アカウントの一覧に、入っているチームの名前を添える（切り替えとホームの印。threads-021）", async () => {
    const list = async (who: TeamPerson) =>
      (await (await call(scene.app, who.cookie, THREADS_BASE)).json()) as ThreadsAccountList;
    const forOwner = await list(scene.owner);
    expect(forOwner.placements).toEqual([
      {
        threadsAccountId: scene.account.id,
        teamId: scene.teamId,
        teamName: "店舗A",
        organizationName: "飲食チーム",
      },
    ]);
    // 担当の人の一覧（担当している運用アカウント）にも添える
    const forAssignee = await list(scene.assignee);
    expect(forAssignee.placements?.map((row) => row.teamName)).toEqual(["店舗A"]);
    // どこにも入れていなければ空
    expect((await list(scene.outsider)).placements).toEqual([]);
  });

  it("チームの画面は管理者とチームの人だけ。運用状況はリーダー・管理者・担当の人だけ", async () => {
    const page = (who: TeamPerson, teamId: string, suffix = "") =>
      call(scene.app, who.cookie, `/api/v1/threads/teams/${teamId}${suffix}`);
    const forAssignee = (await (
      await page(scene.assignee, scene.teamId)
    ).json()) as ThreadsTeamView;
    expect(forAssignee).toMatchObject({
      name: "店舗A",
      organization: { id: scene.organizationId, name: "飲食チーム" },
      canAssign: false,
      canSeeStatus: true,
      assignments: [],
    });
    expect(forAssignee.accounts.map((row) => [row.name, row.access])).toEqual([
      ["カフェB店", "assigned"],
    ]);
    // チームの外の人は 404、管理者はチームの外でも見られる
    expect((await page(other, scene.teamId)).status).toBe(404);
    const forAdmin = (await (await page(scene.admin, scene.teamId)).json()) as ThreadsTeamView;
    expect(forAdmin.canAssign).toBe(true);
    expect(forAdmin.assignments.map((row) => row.displayName)).toEqual(["佐藤", "山田", "高橋"]);
    // 運用状況：担当の人は担当の分、メンバーは 403、リーダーはチームの全部
    const assigneeStatus = (await (
      await page(scene.assignee, scene.teamId, "/status")
    ).json()) as ThreadsTeamStatus;
    expect(assigneeStatus.scope).toBe("assigned");
    expect((await page(scene.member, scene.teamId, "/status")).status).toBe(403);
    expect((await page(other, teamB, "/status")).status).toBe(403);
    await setTeamMember(scene.app, scene.admin.cookie, scene.organizationId, teamB, other.id, true);
    const leaderStatus = (await (await page(other, teamB, "/status")).json()) as ThreadsTeamStatus;
    expect(leaderStatus).toMatchObject({ scope: "team", accounts: [] });
    expect(leaderStatus.people.map((row) => row.displayName)).toEqual(["店舗Bの人"]);
  });
});
