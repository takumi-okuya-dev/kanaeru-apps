// 退会の booking の段の結合のテスト（本物の PostgreSQL。booking-001 research R11）：組織に入れていない交流会の持ち主が退会すると
// 名簿も消える・確かめの中身に名簿の人数・組織に入れた交流会の名簿は新しい持ち主に移って残る・受付係が退会しても行は残る。
import "@hono/zod-openapi";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, importNames, readRoster, useRoster } from "../../../test/helpers/booking.ts";
import {
  followAndLink,
  lineUser,
  notifyConfig,
  saveLine,
} from "../../../test/helpers/booking-notify.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff, placeEvent } from "../../../test/helpers/event.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";

const database = useTestDatabase();

/**
 * 名簿の行の数（表に直に数える）。
 * @returns 行の数
 */
async function countEntries(): Promise<number> {
  const result = await database.pool.query<{ count: string }>("SELECT count(*) FROM booking_entry");
  return Number(result.rows[0]?.count);
}

describe("退会の booking の段", () => {
  let app: TestApp;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
  });

  it("組織に入れていない交流会の持ち主が退会すると、確かめに名簿の人数が出て、名簿も消える", async () => {
    const owner = await loginAs(app, { displayName: "持ち主" });
    const eventId = (await createEvent(app, owner.cookie)).id;
    await useRoster(app, owner.cookie, eventId);
    await importNames(app, owner.cookie, eventId, ["山田 花子", "鈴木 一郎"]);
    await call(app, owner.cookie, `${bookingBase(eventId)}/entries/import`, "POST", {
      applicationSource: "other",
      rows: [{ line: 2, name: "山田 花子" }],
      mapping: { headers: ["お名前"], nameColumn: "お名前" },
    });

    const preview = await call(app, owner.cookie, "/api/v1/accounts/me/withdrawal");
    const { items } = (await preview.json()) as { items: { kind: string; text: string }[] };
    expect(items).toContainEqual(
      expect.objectContaining({
        kind: "delete",
        text: "組織に入れていない交流会の名簿（2人分）も一緒に消えます。",
      }),
    );
    expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    expect(await countEntries()).toBe(0);
    const mappings = await database.pool.query("SELECT 1 FROM booking_import_mapping");
    expect(mappings.rowCount).toBe(0);
  });

  it("組織に入れた交流会の名簿は、交流会と一緒に新しい持ち主に移って残る", async () => {
    const admin = await loginAs(app, { displayName: "管理者" });
    const owner = await loginAs(app, { displayName: "持ち主" });
    const organizationId = await setUpOrganization(app, admin.cookie, [
      { cookie: owner.cookie, accountId: owner.account.id, role: "editor" },
    ]);
    const eventId = (await createEvent(app, owner.cookie)).id;
    expect((await placeEvent(app, owner.cookie, eventId, organizationId)).status).toBe(200);
    await useRoster(app, owner.cookie, eventId);
    await importNames(app, owner.cookie, eventId, ["山田 花子"]);
    expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    expect((await readRoster(app, admin.cookie, eventId)).entries).toHaveLength(1);
  });

  it("受付係が退会しても、その人が足した行は残り、入れた人だけが空になる", async () => {
    const owner = await loginAs(app, { displayName: "持ち主" });
    const eventId = (await createEvent(app, owner.cookie)).id;
    await useRoster(app, owner.cookie, eventId);
    const staff = await makeStaff(app, owner.cookie, eventId, { displayName: "受付係" });
    await call(app, staff.cookie, `${bookingBase(eventId)}/entries`, "POST", {
      name: "鈴木 まこと",
      applicationSource: "other",
    });
    expect((await call(app, staff.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    const roster = await readRoster(app, owner.cookie, eventId);
    expect(roster.entries[0]).toMatchObject({ name: "鈴木 まこと", enteredByName: null });
  });

  it("個人の公式アカウントの設定があれば確かめに出て、退会で設定・紐づけ・連絡のメールアドレスが消える（booking-002）", async () => {
    const notifyApp = buildApp(database, notifyConfig());
    const owner = await loginAs(notifyApp, { displayName: "持ち主" });
    const channelId = (await saveLine(notifyApp, owner.cookie)).line?.channelId ?? "";
    await followAndLink(notifyApp, owner.cookie, channelId, lineUser("a"));
    await call(notifyApp, owner.cookie, "/api/v1/booking/me/contact", "PUT", {
      email: "taro@example.com",
    });
    const preview = await call(notifyApp, owner.cookie, "/api/v1/accounts/me/withdrawal");
    const { items } = (await preview.json()) as { items: { kind: string; text: string }[] };
    expect(items).toContainEqual(
      expect.objectContaining({
        kind: "delete",
        text: "個人の LINE 公式アカウントとメールの設定（予約の知らせ）も一緒に消えます。",
      }),
    );
    expect((await call(notifyApp, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    const left = await database.pool.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM booking_line_channel) + (SELECT count(*) FROM booking_line_link)
        + (SELECT count(*) FROM booking_contact) AS n`,
    );
    expect(Number(left.rows[0]?.n)).toBe(0);
  });
});
