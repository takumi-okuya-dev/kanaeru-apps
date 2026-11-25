// ほかのアプリに出す申込みの名簿（index.ts の listApplicantRoster。AD-23・match-006）の結合のテスト（本物の PostgreSQL）：
// 確定した申込みだけ・まとめた行とキャンセル待ちと取り消しは出さない・古い順・名前と account だけ・受付だけの交流会は空・
// ほかの交流会の行は出さない。名前はどれも架空のもの。
import "@hono/zod-openapi";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, importNames, readRoster, useRoster } from "../../../test/helpers/booking.ts";
import { apply, openSelfPage } from "../../../test/helpers/booking-apply.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent } from "../../../test/helpers/event.ts";
import { listApplicantRoster } from "./index.ts";
import { insertEntry, markEntryMerged, updateEntry } from "./repository.ts";

const database = useTestDatabase();

describe("ほかのアプリに出す申込みの名簿", () => {
  let app: TestApp;
  let owner: { cookie: string; account: { id: string } };
  let eventId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "持ち主の高橋" });
    eventId = (await createEvent(app, owner.cookie)).id;
  });

  it("受付だけの交流会（設定の行がない）は空", async () => {
    expect(await listApplicantRoster(database.db, eventId)).toEqual([]);
  });

  it("確定した申込みだけを古い順に、名前と account だけで出す（まとめた行・キャンセル待ち・取り消しは出さない）", async () => {
    await useRoster(app, owner.cookie, eventId);
    await importNames(app, owner.cookie, eventId, ["山田 花子", "佐藤 一郎", "鈴木 次郎"]);
    const roster = await readRoster(app, owner.cookie, eventId);
    const idOf = (name: string) => roster.entries.find((entry) => entry.name === name)?.id ?? "";
    await updateEntry(database.db, eventId, idOf("佐藤 一郎"), { status: "cancelled" });
    const duplicate = await insertEntry(database.db, {
      eventId,
      name: "山田 花子",
      applicationSource: "other",
      entryKind: "manual",
      enteredBy: owner.account.id,
    });
    await markEntryMerged(database.db, eventId, duplicate.id, idOf("山田 花子"));
    await insertEntry(database.db, {
      eventId,
      name: "高田 待ち",
      applicationSource: "other",
      entryKind: "manual",
      enteredBy: owner.account.id,
      status: "waitlisted",
    });

    const rows = await listApplicantRoster(database.db, eventId);
    expect(rows).toEqual([
      { name: "山田 花子", accountId: null },
      { name: "鈴木 次郎", accountId: null },
    ]);
    // 名前と account のほか（メールアドレス・媒体・メモなど）は出さない
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["accountId", "name"]);
  });

  it("LINE ログインで申し込んだ人は account つき。ほかの交流会の申込みは出さない", async () => {
    await openSelfPage(app, owner.cookie, eventId);
    const participant = await loginAs(app, { displayName: "中村" });
    expect((await apply(app, participant.cookie, eventId, { name: "中村 さき" })).status).toBe(201);

    const other = (await createEvent(app, owner.cookie, { name: "別の練習会" })).id;
    await useRoster(app, owner.cookie, other);
    await importNames(app, owner.cookie, other, ["別の 人"]);

    expect(await listApplicantRoster(database.db, eventId)).toEqual([
      { name: "中村 さき", accountId: participant.account.id },
    ]);
  });

  it("受付だけに戻すと、名簿は隠れて空になる", async () => {
    await useRoster(app, owner.cookie, eventId);
    await importNames(app, owner.cookie, eventId, ["山田 花子"]);
    expect(await listApplicantRoster(database.db, eventId)).toHaveLength(1);
    const back = await call(app, owner.cookie, `${bookingBase(eventId)}/setting`, "PUT", {
      mode: "reception",
    });
    expect(back.status).toBe(200);
    expect(await listApplicantRoster(database.db, eventId)).toEqual([]);
  });
});
