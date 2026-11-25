// 試合表の退会の手順（AD-22 の (2)・AD-25）：組織に入れた試合表は組織の今の管理者に引き継ぎ、組織に入れていない試合表は消える。
// 確かめの中身に、引き継がれる試合表と消える試合表を分けて出す。退会する人が管理者なら、suite の段が先に管理者を引き継ぎ、
// 新しい管理者に渡す。
import "@hono/zod-openapi";
import type { MatchTable } from "@workspace/contracts/match";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import { MATCH_TABLES, createTable, showMatchApp } from "../../../test/helpers/match.ts";
import {
  createOrganization,
  joinOrganization,
  rotateInviteToken,
} from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

describe("試合表の退会の手順", () => {
  let app: TestApp;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showMatchApp(database);
    app = buildApp(database, testConfig());
  });

  it("組織に入れた試合表は管理者に引き継ぎ、入れていない試合表は消える", async () => {
    const admin = await loginAs(app, { displayName: "管理者" });
    const owner = await loginAs(app, { displayName: "運営" });
    const organizationId = await createOrganization(app, admin.cookie, "さくらサークル");
    const token = await rotateInviteToken(app, admin.cookie, organizationId);
    expect((await joinOrganization(app, owner.cookie, token)).status).toBe(200);
    const placed = await createTable(app, owner.cookie, { name: "組織の練習会", organizationId });
    const personal = await createTable(app, owner.cookie, { name: "個人の練習会" });

    const preview = (await (
      await call(app, owner.cookie, "/api/v1/accounts/me/withdrawal")
    ).json()) as { items: { kind: string; text: string; source: string }[] };
    const matchItems = preview.items.filter((item) => item.source === "試合表");
    expect(matchItems).toEqual([
      {
        kind: "handover",
        source: "試合表",
        text: "試合表「組織の練習会」は、管理者さん（組織「さくらサークル」の管理者）に引き継がれます。",
      },
      {
        kind: "delete",
        source: "試合表",
        text: "組織に入れていない試合表1件（「個人の練習会」）を消します。",
      },
    ]);

    expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    const handed = await call(app, admin.cookie, `${MATCH_TABLES}/${placed.id}`);
    expect(handed.status).toBe(200);
    expect((await handed.json()) as MatchTable).toMatchObject({
      isOwner: true,
      organization: { id: organizationId, name: "さくらサークル" },
    });
    const left = await database.pool.query("SELECT id FROM match_table WHERE id = $1", [
      personal.id,
    ]);
    expect(left.rowCount).toBe(0);
  });

  it("退会する人が管理者なら、新しい管理者に引き継ぐ", async () => {
    const owner = await loginAs(app, { displayName: "運営で管理者" });
    const next = await loginAs(app, { displayName: "次の管理者" });
    const organizationId = await createOrganization(app, owner.cookie);
    const token = await rotateInviteToken(app, owner.cookie, organizationId);
    expect((await joinOrganization(app, next.cookie, token)).status).toBe(200);
    const placed = await createTable(app, owner.cookie, { organizationId });
    expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    const handed = await call(app, next.cookie, `${MATCH_TABLES}/${placed.id}`);
    expect(handed.status).toBe(200);
    expect(((await handed.json()) as MatchTable).isOwner).toBe(true);
  });
});
