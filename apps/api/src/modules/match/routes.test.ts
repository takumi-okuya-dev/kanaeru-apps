// 試合表の窓口の結合のテスト（本物の PostgreSQL）：作る・一覧・読む・直す（版の番号・担当の端末・同じ変更の ID）・担当の端末を
// 受け取る・消す・入れられる組織・権限（持ち主・入れた組織の管理者と編集者・メンバーとほかの人）・入力の誤り・ない ID・
// 90日を過ぎた試合表を消す・アプリが見えないときの 404。
import "@hono/zod-openapi";
import { INITIAL_CONTENT } from "@workspace/contracts/match";
import type { MatchTable, MatchTableContent, MatchTableList } from "@workspace/contracts/match";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import {
  DEVICE_A,
  MATCH_TABLES,
  createTable,
  showMatchApp,
  updateTable,
} from "../../../test/helpers/match.ts";
import {
  createOrganization,
  joinOrganization,
  rotateInviteToken,
  setOrganizationRole,
} from "../../../test/helpers/organization.ts";
import { upsertVisibility } from "../suite/index.ts";
import { deleteExpiredTables } from "./repository.ts";

const database = useTestDatabase();

/**
 * 4人の名簿と1試合の中身（ダブルス・上級）。
 * @param done 試合が終わったか
 * @returns 中身
 */
function fourPlayers(done = false): MatchTableContent {
  return {
    ...INITIAL_CONTENT,
    players: ["a", "b", "c", "d"].map((id) => ({
      id,
      nickname: `呼び名${id}`,
      level: "advanced",
      status: "present",
    })),
    plan: [{ key: "advanced", games: [{ players: ["a", "b", "c", "d"], done }] }],
  };
}

describe("試合表の窓口", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showMatchApp(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "運営" });
  });

  it("作ると、作った端末が担当で、名簿なしの中身と版1で返り、一覧に出る", async () => {
    const table = await createTable(app, owner.cookie);
    expect(table).toMatchObject({
      name: "12/13(日) 練習会",
      playDate: "2026-12-13",
      organization: null,
      isOwner: true,
      version: 1,
      editorDeviceId: DEVICE_A,
      content: INITIAL_CONTENT,
    });
    const list = (await (await call(app, owner.cookie, MATCH_TABLES)).json()) as MatchTableList;
    expect(list.tables.map((row) => row.id)).toEqual([table.id]);
    const read = (await (
      await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}`)
    ).json()) as MatchTable;
    expect(read.seed).toBe(table.seed);
  });

  it("作る入力の誤りは 400（名前が空・日付の形・知らない欄）", async () => {
    for (const body of [
      { name: " ", playDate: "2026-12-13", deviceId: DEVICE_A },
      { name: "練習会", playDate: "12/13", deviceId: DEVICE_A },
      { name: "練習会", playDate: "2026-12-13", deviceId: DEVICE_A, fullNames: ["高橋 拓真"] },
    ]) {
      expect((await call(app, owner.cookie, MATCH_TABLES, "POST", body)).status).toBe(400);
    }
  });

  it("ログインしていなければ 401、ない ID は 404、形の違う ID も 404", async () => {
    expect((await app.request(MATCH_TABLES)).status).toBe(401);
    const missing = await call(app, owner.cookie, `${MATCH_TABLES}/${crypto.randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      "MATCH_NOT_FOUND",
    );
    expect((await call(app, owner.cookie, `${MATCH_TABLES}/abc`)).status).toBe(404);
  });

  it("担当の端末が、もとの版が同じときだけ直せ、版が1つ上がる。同じ変更の ID の送り直しは二重にならない", async () => {
    const table = await createTable(app, owner.cookie);
    const changeId = crypto.randomUUID();
    const first = await updateTable(app, owner.cookie, table, fourPlayers(), { changeId });
    expect(first.status).toBe(200);
    const saved = (await first.json()) as MatchTable;
    expect(saved.version).toBe(2);
    expect(saved.content.players).toHaveLength(4);

    // 答えが届かなかったつもりで同じ変更をもう一度送る：書かずに今の試合表（版2）を返す
    const again = await updateTable(app, owner.cookie, table, fourPlayers(true), { changeId });
    expect(again.status).toBe(200);
    const same = (await again.json()) as MatchTable;
    expect(same.version).toBe(2);
    expect(same.content.plan[0]?.games[0]?.done).toBe(false);

    // 古い版のまま別の変更を送ると 409 MATCH_VERSION_CONFLICT
    const stale = await updateTable(app, owner.cookie, table, fourPlayers(true));
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe(
      "MATCH_VERSION_CONFLICT",
    );

    // 新しい版なら通る
    const next = await updateTable(app, owner.cookie, saved, fourPlayers(true), { seed: 42 });
    expect(next.status).toBe(200);
    expect((await next.json()) as MatchTable).toMatchObject({ version: 3, seed: 42 });
  });

  it("担当でない端末は 409 MATCH_NOT_EDITOR。受け取ると、前の担当の端末が 409 になる", async () => {
    const table = await createTable(app, owner.cookie);
    const other = await updateTable(app, owner.cookie, table, fourPlayers(), {
      deviceId: "device-b",
    });
    expect(other.status).toBe(409);
    expect(((await other.json()) as { error: { code: string } }).error.code).toBe(
      "MATCH_NOT_EDITOR",
    );
    const taken = await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}/editor`, "PUT", {
      deviceId: "device-b",
    });
    expect(taken.status).toBe(200);
    const moved = (await taken.json()) as MatchTable;
    expect(moved).toMatchObject({ editorDeviceId: "device-b", version: 1 });
    expect((await updateTable(app, owner.cookie, moved, fourPlayers())).status).toBe(409);
    expect(
      (await updateTable(app, owner.cookie, moved, fourPlayers(), { deviceId: "device-b" })).status,
    ).toBe(200);
  });

  it("中身の形の誤り（氏名の欄・名簿にいない人・試合の人数）は 400 で、書かない", async () => {
    const table = await createTable(app, owner.cookie);
    const content = fourPlayers();
    const withName = {
      ...content,
      players: content.players.map((player) => ({ ...player, fullName: "高橋 拓真" })),
    } as unknown as MatchTableContent;
    const stranger: MatchTableContent = {
      ...content,
      plan: [{ key: "advanced", games: [{ players: ["a", "b", "c", "x"], done: false }] }],
    };
    const singlesGame: MatchTableContent = {
      ...content,
      plan: [{ key: "advanced", games: [{ players: ["a", "b"], done: false }] }],
    };
    for (const bad of [withName, stranger, singlesGame]) {
      expect((await updateTable(app, owner.cookie, table, bad)).status).toBe(400);
    }
    const read = (await (
      await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}`)
    ).json()) as MatchTable;
    expect(read.version).toBe(1);
  });

  it("組織に入れると、管理者と編集者は一覧に出て読めて直せる。メンバーとほかの人は 403 で一覧に出ない", async () => {
    const admin = await loginAs(app, { displayName: "管理者" });
    const organizationId = await createOrganization(app, admin.cookie, "さくらサークル");
    const token = await rotateInviteToken(app, admin.cookie, organizationId);
    const editor = await loginAs(app, { displayName: "編集者" });
    const member = await loginAs(app, { displayName: "メンバー" });
    const stranger = await loginAs(app, { displayName: "ほかの人" });
    for (const person of [owner, editor, member]) {
      expect((await joinOrganization(app, person.cookie, token)).status).toBe(200);
    }
    expect(
      (await setOrganizationRole(app, admin.cookie, organizationId, editor.account.id, "editor"))
        .status,
    ).toBe(204);

    const options = (await (
      await call(app, owner.cookie, "/api/v1/match/organization-options")
    ).json()) as { organizations: { id: string; name: string }[] };
    expect(options.organizations).toEqual([{ id: organizationId, name: "さくらサークル" }]);

    const table = await createTable(app, owner.cookie, { organizationId });
    expect(table.organization).toEqual({ id: organizationId, name: "さくらサークル" });
    for (const person of [admin, editor]) {
      const list = (await (await call(app, person.cookie, MATCH_TABLES)).json()) as MatchTableList;
      expect(list.tables.map((row) => [row.id, row.isOwner])).toEqual([[table.id, false]]);
      expect((await call(app, person.cookie, `${MATCH_TABLES}/${table.id}`)).status).toBe(200);
    }
    // 編集者がこの端末を担当にして直す
    await call(app, editor.cookie, `${MATCH_TABLES}/${table.id}/editor`, "PUT", {
      deviceId: "device-editor",
    });
    const fresh = (await (
      await call(app, editor.cookie, `${MATCH_TABLES}/${table.id}`)
    ).json()) as MatchTable;
    expect(
      (
        await updateTable(app, editor.cookie, fresh, fourPlayers(), {
          deviceId: "device-editor",
        })
      ).status,
    ).toBe(200);

    for (const person of [member, stranger]) {
      const list = (await (await call(app, person.cookie, MATCH_TABLES)).json()) as MatchTableList;
      expect(list.tables).toEqual([]);
      const response = await call(app, person.cookie, `${MATCH_TABLES}/${table.id}`);
      expect(response.status).toBe(403);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        "MATCH_FORBIDDEN",
      );
      expect((await call(app, person.cookie, `${MATCH_TABLES}/${table.id}`, "DELETE")).status).toBe(
        403,
      );
    }
  });

  it("入っていない組織には入れられない（400 MATCH_ORGANIZATION_NOT_FOUND）", async () => {
    const other = await loginAs(app);
    const organizationId = await createOrganization(app, other.cookie);
    const response = await call(app, owner.cookie, MATCH_TABLES, "POST", {
      name: "練習会",
      playDate: "2026-12-13",
      deviceId: DEVICE_A,
      organizationId,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "MATCH_ORGANIZATION_NOT_FOUND",
    );
  });

  it("消すと 204 で、読むと 404", async () => {
    const table = await createTable(app, owner.cookie);
    expect((await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}`, "DELETE")).status).toBe(
      204,
    );
    expect((await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}`)).status).toBe(404);
  });

  it("試合の日から90日を過ぎた自分の試合表は、一覧を開くと消える（ほかの人の試合表は消さない）", async () => {
    const other = await loginAs(app);
    /**
     * 試合表を表に直に足す（作る窓口は先に古いものを消すので、古い日の行は直に足す）。
     * @param ownerAccountId 持ち主
     * @param playDate 試合の日
     * @returns 試合表の ID
     */
    const insert = async (ownerAccountId: string, playDate: string) => {
      const result = await database.pool.query<{ id: string }>(
        "INSERT INTO match_table (owner_account_id, name, play_date) VALUES ($1, '古い練習会', $2) RETURNING id",
        [ownerAccountId, playDate],
      );
      return result.rows[0]?.id ?? "";
    };
    const old = await insert(owner.account.id, "2026-08-31");
    const recent = await insert(owner.account.id, "2026-09-01");
    const othersOld = await insert(other.account.id, "2026-08-01");
    // 日本時間 2026-11-30 から見て、90日前は 2026-09-01（それより前の日の試合表を消す）
    const now = new Date("2026-11-30T00:00:00+09:00");
    expect(await deleteExpiredTables(database.db, owner.account.id, now)).toBe(1);
    const ids = (await database.pool.query<{ id: string }>("SELECT id FROM match_table")).rows.map(
      (row) => row.id,
    );
    expect(ids).toEqual(expect.arrayContaining([recent, othersOld]));
    expect(ids).not.toContain(old);
    // 一覧を開くと、今日から見て90日を過ぎた自分の試合表を消す
    await insert(owner.account.id, "2000-01-01");
    const list = (await (await call(app, owner.cookie, MATCH_TABLES)).json()) as MatchTableList;
    expect(list.tables.some((row) => row.playDate === "2000-01-01")).toBe(false);
  });

  it("台帳で「切」なら、運営者でない人には 404", async () => {
    await upsertVisibility(database.db, "match", "off");
    expect((await call(app, owner.cookie, MATCH_TABLES)).status).toBe(404);
  });
});
