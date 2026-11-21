// 試合表の表の結合のテスト（本物の PostgreSQL）：選択肢の CHECK と約束が食い違わない・名前と中身と版の CHECK・札の一意・
// 前に入れたレベルの相手（どちらか1つ）と一意・消し方（持ち主を消すと試合表と受付の行と組織に入れる行も消える・交流会を消すと
// つないだ交流会が空になる・持ち主が組織を抜けると組織に入れる行だけ消えて試合表は残る・組織や本人を消すと覚えたレベルも消える）。
// 窓口はまだないので、表に直に書いて確かめる（match-001。窓口は match-002）。
import "@hono/zod-openapi";
import { MATCH_LEVELS } from "@workspace/contracts/match";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { createEvent } from "../../../test/helpers/event.ts";
import { createOrganization } from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

describe("試合表の表", () => {
  let app: TestApp;
  let ownerId: string;
  let ownerCookie: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    const owner = await loginAs(app, { displayName: "運営" });
    ownerId = owner.account.id;
    ownerCookie = owner.cookie;
  });

  /**
   * 試合表を表に直に足す。
   * @param values 列の値（足りない列は見本）
   * @returns 足した行の ID
   */
  async function insertTable(values: Record<string, unknown> = {}): Promise<string> {
    const row = {
      owner_account_id: ownerId,
      name: "12/13(日) 練習会",
      play_date: "2026-12-13",
      content: "{}",
      version: 1,
      editor_device_id: null,
      view_token_hash: null,
      event_id: null,
      ...values,
    };
    const result = await database.pool.query<{ id: string }>(
      `INSERT INTO match_table (owner_account_id, name, play_date, content, version, editor_device_id, view_token_hash, event_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8) RETURNING id`,
      [
        row.owner_account_id,
        row.name,
        row.play_date,
        row.content,
        row.version,
        row.editor_device_id,
        row.view_token_hash,
        row.event_id,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("行を足せませんでした。");
    return id;
  }

  /**
   * 表の行の数を数える。
   * @param table 表の名前（このテストの中の決まった名前だけ）
   * @returns 行の数
   */
  async function countRows(
    table: "match_table" | "match_table_organization" | "match_join" | "match_level_memory",
  ): Promise<number> {
    const queries = {
      match_table: "SELECT count(*)::int AS n FROM match_table",
      match_table_organization: "SELECT count(*)::int AS n FROM match_table_organization",
      match_join: "SELECT count(*)::int AS n FROM match_join",
      match_level_memory: "SELECT count(*)::int AS n FROM match_level_memory",
    } as const;
    const result = await database.pool.query<{ n: number }>(queries[table]);
    return result.rows[0]?.n ?? 0;
  }

  it("レベルの code はどれも DB に入り、ほかの値は CHECK で止まる", async () => {
    const tableId = await insertTable();
    const person = await loginAs(app);
    for (const level of MATCH_LEVELS) {
      await database.pool.query(
        "INSERT INTO match_join (match_table_id, nickname, level) VALUES ($1, '高橋', $2)",
        [tableId, level],
      );
      await database.pool.query(
        `INSERT INTO match_level_memory (owner_account_id, account_id, level) VALUES ($1, $2, $3)
         ON CONFLICT (owner_account_id, account_id) WHERE owner_account_id IS NOT NULL
         DO UPDATE SET level = excluded.level`,
        [ownerId, person.account.id, level],
      );
    }
    expect(await countRows("match_join")).toBe(MATCH_LEVELS.length);
    expect(await countRows("match_level_memory")).toBe(1);
    await expect(
      database.pool.query(
        "INSERT INTO match_join (match_table_id, nickname, level) VALUES ($1, '高橋', 'expert')",
        [tableId],
      ),
    ).rejects.toThrow(/match_join_level_check/);
    await expect(
      database.pool.query(
        "UPDATE match_level_memory SET level = 'pro' WHERE owner_account_id = $1",
        [ownerId],
      ),
    ).rejects.toThrow(/match_level_memory_level_check/);
  });

  it("名前・中身・版・担当の端末・受付の呼び名の CHECK と、札の一意", async () => {
    await expect(insertTable({ name: "" })).rejects.toThrow(/match_table_name_check/);
    await expect(insertTable({ name: "あ".repeat(61) })).rejects.toThrow(/match_table_name_check/);
    await expect(insertTable({ content: "[]" })).rejects.toThrow(/match_table_content_check/);
    await expect(insertTable({ version: 0 })).rejects.toThrow(/match_table_version_check/);
    await expect(insertTable({ editor_device_id: "" })).rejects.toThrow(
      /match_table_editor_device_id_check/,
    );
    const hash = "a".repeat(64);
    const tableId = await insertTable({ view_token_hash: hash, editor_device_id: "device-1" });
    await expect(insertTable({ view_token_hash: hash })).rejects.toThrow(
      /match_table_view_token_hash_unique/,
    );
    // 札のない試合表はいくつでも作れる（空は一意の外）
    await insertTable();
    await insertTable();
    const read = await database.pool.query<{ version: number; seed: number; content: object }>(
      "SELECT version, seed, content FROM match_table WHERE id = $1",
      [tableId],
    );
    expect(read.rows[0]).toEqual({ version: 1, seed: 0, content: {} });
    for (const nickname of ["", "あ".repeat(21)]) {
      await expect(
        database.pool.query(
          "INSERT INTO match_join (match_table_id, nickname, level) VALUES ($1, $2, 'novice')",
          [tableId, nickname],
        ),
      ).rejects.toThrow(/match_join_nickname_check/);
    }
  });

  it("前に入れたレベルの相手は、運営か組織のどちらか1つで、相手と人の組ごとに1行", async () => {
    const person = await loginAs(app);
    const organizationId = await createOrganization(app, ownerCookie);
    await expect(
      database.pool.query(
        "INSERT INTO match_level_memory (account_id, level) VALUES ($1, 'novice')",
        [person.account.id],
      ),
    ).rejects.toThrow(/match_level_memory_holder_check/);
    await expect(
      database.pool.query(
        `INSERT INTO match_level_memory (owner_account_id, organization_id, account_id, level)
         VALUES ($1, $2, $3, 'novice')`,
        [ownerId, organizationId, person.account.id],
      ),
    ).rejects.toThrow(/match_level_memory_holder_check/);
    await database.pool.query(
      "INSERT INTO match_level_memory (organization_id, account_id, level) VALUES ($1, $2, 'beginner')",
      [organizationId, person.account.id],
    );
    await expect(
      database.pool.query(
        "INSERT INTO match_level_memory (organization_id, account_id, level) VALUES ($1, $2, 'novice')",
        [organizationId, person.account.id],
      ),
    ).rejects.toThrow(/match_level_memory_organization_id_account_id_unique/);
    // 同じ人でも、運営の個人の覚えは別の行
    await database.pool.query(
      "INSERT INTO match_level_memory (owner_account_id, account_id, level) VALUES ($1, $2, 'novice')",
      [ownerId, person.account.id],
    );
    expect(await countRows("match_level_memory")).toBe(2);
  });

  it("組織に入れる行は、持ち主が組織の人のときだけ作れ、持ち主が組織を抜けると消えて試合表は残る", async () => {
    const organizationId = await createOrganization(app, ownerCookie);
    const outsider = await loginAs(app);
    const tableId = await insertTable();
    await expect(
      database.pool.query(
        "INSERT INTO match_table_organization (match_table_id, organization_id, owner_account_id) VALUES ($1, $2, $3)",
        [tableId, organizationId, outsider.account.id],
      ),
    ).rejects.toThrow(/match_table_organization_member_fk/);
    await database.pool.query(
      "INSERT INTO match_table_organization (match_table_id, organization_id, owner_account_id) VALUES ($1, $2, $3)",
      [tableId, organizationId, ownerId],
    );
    expect(await countRows("match_table_organization")).toBe(1);
    await database.pool.query(
      "DELETE FROM organization_member WHERE organization_id = $1 AND account_id = $2",
      [organizationId, ownerId],
    );
    expect(await countRows("match_table_organization")).toBe(0);
    expect(await countRows("match_table")).toBe(1);
  });

  it("交流会を消すと、つないだ交流会だけが空になり、試合表は残る", async () => {
    const eventId = (await createEvent(app, ownerCookie)).id;
    const tableId = await insertTable({ event_id: eventId });
    await database.pool.query("DELETE FROM event WHERE id = $1", [eventId]);
    const read = await database.pool.query<{ event_id: string | null }>(
      "SELECT event_id FROM match_table WHERE id = $1",
      [tableId],
    );
    expect(read.rows[0]?.event_id).toBeNull();
  });

  it("持ち主を消すと、試合表と受付の行と組織に入れる行と覚えたレベルが消える。組織を消すと組織の覚えが消える", async () => {
    const person = await loginAs(app);
    const organizationId = await createOrganization(app, ownerCookie);
    const tableId = await insertTable();
    await database.pool.query(
      "INSERT INTO match_join (match_table_id, nickname, level) VALUES ($1, '高橋', 'advanced')",
      [tableId],
    );
    await database.pool.query(
      "INSERT INTO match_table_organization (match_table_id, organization_id, owner_account_id) VALUES ($1, $2, $3)",
      [tableId, organizationId, ownerId],
    );
    await database.pool.query(
      "INSERT INTO match_level_memory (owner_account_id, account_id, level) VALUES ($1, $2, 'advanced')",
      [ownerId, person.account.id],
    );
    await database.pool.query(
      "INSERT INTO match_level_memory (organization_id, account_id, level) VALUES ($1, $2, 'advanced')",
      [organizationId, person.account.id],
    );

    await database.pool.query("DELETE FROM organization WHERE id = $1", [organizationId]);
    expect(await countRows("match_level_memory")).toBe(1);
    expect(await countRows("match_table_organization")).toBe(0);

    await database.pool.query("DELETE FROM account WHERE id = $1", [ownerId]);
    expect(await countRows("match_table")).toBe(0);
    expect(await countRows("match_join")).toBe(0);
    expect(await countRows("match_level_memory")).toBe(0);
  });

  it("レベルを覚えた本人を消すと、その人の覚えが消える", async () => {
    const person = await loginAs(app);
    await database.pool.query(
      "INSERT INTO match_level_memory (owner_account_id, account_id, level) VALUES ($1, $2, 'novice')",
      [ownerId, person.account.id],
    );
    await database.pool.query("DELETE FROM account WHERE id = $1", [person.account.id]);
    expect(await countRows("match_level_memory")).toBe(0);
  });
});
