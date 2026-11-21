// 組織の中のチーム（suite-003）の結合のテスト（本物の PostgreSQL）：作る・名前・上限・同じ名前・役割ごとの操作・
// 人を足す・リーダー・外す・組織の画面に出る・消す・組織から抜けるとチームからも消える・別の組織のチーム。
import "@hono/zod-openapi";
import type { OrganizationDetail } from "@workspace/contracts/suite";
import { TEAM_LIMIT } from "@workspace/contracts/suite";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import {
  createOrganization,
  createTeam,
  joinOrganization,
  rotateInviteToken,
  setOrganizationRole,
  setTeamMember,
} from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

/** 道の頭。 */
const BASE = "/api/v1/suite/organizations";

/** ログインした人。 */
type Person = { cookie: string; id: string };

/**
 * 応答のエラーの code。
 * @param response 応答
 * @returns code
 */
async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as ErrorBody).error.code;
}

describe("組織の中のチーム", () => {
  let app: TestApp;
  let admin: Person;
  let editor: Person;
  let member: Person;
  let outsider: Person;
  let organizationId: string;

  /**
   * ログインする。
   * @param displayName 表示名
   * @returns クッキーと account の ID
   */
  async function person(displayName: string): Promise<Person> {
    const { cookie, account } = await loginAs(app, { displayName });
    return { cookie, id: account.id };
  }

  /**
   * 組織の画面を読む。
   * @param who 読む人
   * @returns 組織の画面
   */
  async function detail(who: Person): Promise<OrganizationDetail> {
    return (await (
      await call(app, who.cookie, `${BASE}/${organizationId}`)
    ).json()) as OrganizationDetail;
  }

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    admin = await person("田中");
    editor = await person("佐藤");
    member = await person("鈴木");
    outsider = await person("部外者");
    organizationId = await createOrganization(app, admin.cookie, "飲食チーム");
    const token = await rotateInviteToken(app, admin.cookie, organizationId);
    expect((await joinOrganization(app, editor.cookie, token)).status).toBe(200);
    expect((await joinOrganization(app, member.cookie, token)).status).toBe(200);
    expect(
      (await setOrganizationRole(app, admin.cookie, organizationId, editor.id, "editor")).status,
    ).toBe(204);
  });

  it("管理者がチームを作り、人を足し、リーダーを決めると、組織の人の全員の組織の画面に出る", async () => {
    const teamA = await createTeam(app, admin.cookie, organizationId, "  店舗A  ");
    const teamB = await createTeam(app, admin.cookie, organizationId, "店舗B");
    expect((await setTeamMember(app, admin.cookie, organizationId, teamA, member.id)).status).toBe(
      204,
    );
    expect(
      (await setTeamMember(app, admin.cookie, organizationId, teamA, editor.id, true)).status,
    ).toBe(204);
    const forMember = await detail(member);
    expect(forMember.teamLimit).toBe(TEAM_LIMIT);
    expect(forMember.teams.map((row) => row.name)).toEqual(["店舗A", "店舗B"]);
    // リーダー → 組織の役割の順
    expect(
      forMember.teams[0]?.members.map((row) => [row.displayName, row.role, row.leader, row.isMe]),
    ).toEqual([
      ["佐藤", "editor", true, false],
      ["鈴木", "member", false, true],
    ]);
    expect(forMember.teams[1]).toMatchObject({ id: teamB, members: [] });
    // リーダーを外す（同じ窓口で切り替える）
    expect(
      (await setTeamMember(app, admin.cookie, organizationId, teamA, editor.id, false)).status,
    ).toBe(204);
    expect((await detail(admin)).teams[0]?.members.every((row) => !row.leader)).toBe(true);
  });

  it("チームの操作は管理者だけ（編集者・メンバーは 403、組織の外の人は 404）", async () => {
    const teamId = await createTeam(app, admin.cookie, organizationId);
    for (const who of [editor, member]) {
      const created = await call(app, who.cookie, `${BASE}/${organizationId}/teams`, "POST", {
        name: "勝手なチーム",
      });
      expect(created.status).toBe(403);
      expect(await codeOf(created)).toBe("ORGANIZATION_ADMIN_ONLY");
      expect(
        (await setTeamMember(app, who.cookie, organizationId, teamId, who.id, true)).status,
      ).toBe(403);
      expect(
        (await call(app, who.cookie, `${BASE}/${organizationId}/teams/${teamId}`, "DELETE")).status,
      ).toBe(403);
    }
    const fromOutside = await call(
      app,
      outsider.cookie,
      `${BASE}/${organizationId}/teams`,
      "POST",
      {
        name: "外から",
      },
    );
    expect(fromOutside.status).toBe(404);
    expect(await codeOf(fromOutside)).toBe("ORGANIZATION_NOT_FOUND");
  });

  it("名前は組織の中で重ならず、空や31文字は断り、名前を直せる", async () => {
    const teamId = await createTeam(app, admin.cookie, organizationId, "店舗A");
    const same = await call(app, admin.cookie, `${BASE}/${organizationId}/teams`, "POST", {
      name: "店舗A",
    });
    expect(same.status).toBe(409);
    expect(await codeOf(same)).toBe("TEAM_NAME_TAKEN");
    for (const name of ["   ", "あ".repeat(31)]) {
      expect(
        (await call(app, admin.cookie, `${BASE}/${organizationId}/teams`, "POST", { name })).status,
      ).toBe(400);
    }
    const other = await createTeam(app, admin.cookie, organizationId, "店舗B");
    const renameTaken = await call(
      app,
      admin.cookie,
      `${BASE}/${organizationId}/teams/${other}`,
      "PATCH",
      { name: "店舗A" },
    );
    expect(renameTaken.status).toBe(409);
    expect(
      (
        await call(app, admin.cookie, `${BASE}/${organizationId}/teams/${teamId}`, "PATCH", {
          name: "本店",
        })
      ).status,
    ).toBe(204);
    expect((await detail(admin)).teams.map((row) => row.name)).toEqual(["本店", "店舗B"]);
    // 別の組織では同じ名前を使える
    const elsewhere = await createOrganization(app, outsider.cookie, "別の組織");
    await createTeam(app, outsider.cookie, elsewhere, "本店");
  });

  it(`チームは1つの組織に${TEAM_LIMIT}まで`, async () => {
    for (let index = 0; index < TEAM_LIMIT; index += 1) {
      await createTeam(app, admin.cookie, organizationId, `チーム${index}`);
    }
    const over = await call(app, admin.cookie, `${BASE}/${organizationId}/teams`, "POST", {
      name: "もう1つ",
    });
    expect(over.status).toBe(409);
    expect(await codeOf(over)).toBe("TEAM_LIMIT");
  });

  it("組織の外の人は足せず、別の組織のチームは触れない", async () => {
    const teamId = await createTeam(app, admin.cookie, organizationId);
    const notMember = await setTeamMember(app, admin.cookie, organizationId, teamId, outsider.id);
    expect(notMember.status).toBe(404);
    expect(await codeOf(notMember)).toBe("TEAM_MEMBER_NOT_FOUND");
    const elsewhere = await createOrganization(app, outsider.cookie, "別の組織");
    const foreignTeam = await createTeam(app, outsider.cookie, elsewhere, "よそのチーム");
    const crossed = await setTeamMember(app, admin.cookie, organizationId, foreignTeam, member.id);
    expect(crossed.status).toBe(404);
    expect(await codeOf(crossed)).toBe("TEAM_NOT_FOUND");
    expect(
      (await call(app, admin.cookie, `${BASE}/${organizationId}/teams/${foreignTeam}`, "DELETE"))
        .status,
    ).toBe(404);
  });

  it("外す・チームを消す・組織から抜けると、チームの人の行が消える", async () => {
    const teamA = await createTeam(app, admin.cookie, organizationId, "店舗A");
    const teamB = await createTeam(app, admin.cookie, organizationId, "店舗B");
    for (const who of [editor, member]) {
      await setTeamMember(app, admin.cookie, organizationId, teamA, who.id);
      await setTeamMember(app, admin.cookie, organizationId, teamB, who.id);
    }
    const removed = await call(
      app,
      admin.cookie,
      `${BASE}/${organizationId}/teams/${teamA}/members/${editor.id}`,
      "DELETE",
    );
    expect(removed.status).toBe(204);
    const again = await call(
      app,
      admin.cookie,
      `${BASE}/${organizationId}/teams/${teamA}/members/${editor.id}`,
      "DELETE",
    );
    expect(again.status).toBe(404);
    // 組織から抜けると、どのチームからも消える
    expect(
      (await call(app, member.cookie, `${BASE}/${organizationId}/leave`, "POST", {})).status,
    ).toBe(204);
    const count = async (teamId: string) =>
      (
        await database.pool.query("SELECT account_id FROM team_member WHERE team_id = $1", [teamId])
      ).rows.map((row: { account_id: string }) => row.account_id);
    expect(await count(teamA)).toEqual([]);
    expect(await count(teamB)).toEqual([editor.id]);
    // チームを消すと、チームの人の行も消える
    expect(
      (await call(app, admin.cookie, `${BASE}/${organizationId}/teams/${teamB}`, "DELETE")).status,
    ).toBe(204);
    expect(await count(teamB)).toEqual([]);
    expect((await detail(admin)).teams.map((row) => row.name)).toEqual(["店舗A"]);
  });
});
