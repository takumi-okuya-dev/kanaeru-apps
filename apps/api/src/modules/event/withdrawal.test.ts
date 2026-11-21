// 退会の event の段の結合のテスト（本物の PostgreSQL。event-002。AD-19・AD-22・AD-23）：組織に入れた交流会は組織の今の管理者に
// 引き継ぐ・組織に入れていない交流会は子の行ごと消す・チェックインがあれば 409 で何も変わらない・確かめの中身。
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff, placeEvent } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import {
  createOrganization,
  joinOrganization,
  rotateInviteToken,
} from "../../../test/helpers/organization.ts";
import { checkIn } from "../../../test/helpers/reception.ts";

const database = useTestDatabase();

/** ログインした人。 */
type Person = Awaited<ReturnType<typeof loginAs>>;

/**
 * 交流会の持ち主を DB から読む。
 * @param eventId 交流会の ID
 * @returns 持ち主（交流会がなければ undefined）
 */
async function ownerOf(eventId: string): Promise<string | null | undefined> {
  const result = await database.pool.query<{ owner: string | null }>(
    "SELECT owner_account_id AS owner FROM event WHERE id = $1",
    [eventId],
  );
  return result.rows[0]?.owner;
}

/**
 * 表の、その交流会の行の数。
 * @param table 表の名前（このファイルの決まった名前だけ）
 * @param eventId 交流会の ID
 * @returns 行の数
 */
async function countFor(
  table: "event_staff" | "staff_invite" | "event_discount" | "event_organization",
  eventId: string,
): Promise<number> {
  const queries = {
    event_staff: "SELECT count(*) FROM event_staff WHERE event_id = $1",
    staff_invite: "SELECT count(*) FROM staff_invite WHERE event_id = $1",
    event_discount: "SELECT count(*) FROM event_discount WHERE event_id = $1",
    event_organization: "SELECT count(*) FROM event_organization WHERE event_id = $1",
  } as const;
  const result = await database.pool.query<{ count: string }>(queries[table], [eventId]);
  return Number(result.rows[0]?.count);
}

describe("退会の event の段", () => {
  let app: TestApp;
  let owner: Person;
  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "高橋" });
  });

  /**
   * 組織を作って持ち主を入れる（管理者は別の人）。
   * @param admin 管理者
   * @param name 組織の名前
   * @returns 組織の ID
   */
  async function organizationOf(admin: Person, name = "バドミントンの部"): Promise<string> {
    const organizationId = await createOrganization(app, admin.cookie, name);
    const token = await rotateInviteToken(app, admin.cookie, organizationId);
    expect((await joinOrganization(app, owner.cookie, token)).status).toBe(200);
    return organizationId;
  }

  it("組織に入れた交流会は、組織の今の管理者が新しい持ち主になる", async () => {
    const admin = await loginAs(app, { displayName: "森" });
    const organizationId = await organizationOf(admin);
    const created = await createEvent(app, owner.cookie);
    expect((await placeEvent(app, owner.cookie, created.id, organizationId)).status).toBe(200);

    const preview = await call(app, owner.cookie, "/api/v1/accounts/me/withdrawal");
    const { items } = (await preview.json()) as { items: unknown[] };
    expect(items).toContainEqual({
      kind: "handover",
      source: "受付",
      text: "交流会「11月の交流会」は、森さん（組織「バドミントンの部」の管理者）に引き継がれます。",
    });

    expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    expect(await ownerOf(created.id)).toBe(admin.account.id);
    expect(await countFor("event_organization", created.id)).toBe(1);
    const opened = await call(app, admin.cookie, `/api/v1/events/${created.id}`);
    expect(await opened.json()).toMatchObject({ myRole: "organizer", isOwner: true });
  });

  it("持ち主が管理者なら、管理者を引き継いだ人が新しい持ち主になる", async () => {
    const organizationId = await createOrganization(app, owner.cookie, "部");
    const next = await loginAs(app);
    await joinOrganization(
      app,
      next.cookie,
      await rotateInviteToken(app, owner.cookie, organizationId),
    );
    const created = await createEvent(app, owner.cookie);
    await placeEvent(app, owner.cookie, created.id, organizationId);

    expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    expect(await ownerOf(created.id)).toBe(next.account.id);
  });

  it("組織に入れていない交流会は、受付係・招待のリンク・割引ごと消える。組織にほかに誰もいなければ組織の交流会も消える", async () => {
    const personal = await createEvent(app, owner.cookie, {
      discounts: [{ name: "紹介割", amount: 500 }],
    });
    await makeStaff(app, owner.cookie, personal.id);
    const alone = await createOrganization(app, owner.cookie, "ひとりの部");
    const placed = await createEvent(app, owner.cookie, { name: "ひとりの部の会" });
    await placeEvent(app, owner.cookie, placed.id, alone);

    const preview = await call(app, owner.cookie, "/api/v1/accounts/me/withdrawal");
    const body = (await preview.json()) as { items: { kind: string; text: string }[] };
    expect(body.items.filter((item) => item.kind === "delete").map((item) => item.text)).toEqual([
      expect.stringContaining("組織に入れていない交流会2件"),
    ]);

    expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    expect(await ownerOf(personal.id)).toBeUndefined();
    expect(await ownerOf(placed.id)).toBeUndefined();
    for (const table of ["event_staff", "staff_invite", "event_discount"] as const) {
      expect(await countFor(table, personal.id), table).toBe(0);
    }
  });

  it("組織に入れていない交流会にチェックインがあれば 409 で、アカウントも交流会も引き継ぎも変わらない", async () => {
    const admin = await loginAs(app);
    const organizationId = await organizationOf(admin);
    const placed = await createEvent(app, owner.cookie, { name: "組織の会" });
    await placeEvent(app, owner.cookie, placed.id, organizationId);
    const personal = await createEvent(app, owner.cookie, { name: "個人の会" });
    const participant = await loginAs(app);
    await checkIn(app, participant.cookie, personal.id);

    const response = await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE");
    expect(response.status).toBe(409);
    expect(((await response.json()) as ErrorBody).error.code).toBe("ACCOUNT_OWNS_SHARED_RECORDS");
    expect(await ownerOf(personal.id)).toBe(owner.account.id);
    expect(await ownerOf(placed.id)).toBe(owner.account.id);
    expect((await call(app, owner.cookie, "/api/v1/events")).status).toBe(200);

    // 先に組織に入れれば退会できる
    expect((await placeEvent(app, owner.cookie, personal.id, organizationId)).status).toBe(200);
    expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    expect(await ownerOf(personal.id)).toBe(admin.account.id);
  });

  it("交流会を持たない受付係の退会は今のまま（受付係の割り当てだけ消える）", async () => {
    const created = await createEvent(app, owner.cookie);
    const staff = await makeStaff(app, owner.cookie, created.id);
    expect((await call(app, staff.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    expect(await countFor("event_staff", created.id)).toBe(0);
    expect(await ownerOf(created.id)).toBe(owner.account.id);
  });
});
