// 予約の窓口の結合のテスト（本物の PostgreSQL）：使い方・名簿・取り込み（見積もり・2回目は増えない・列の対応）・
// 1人足す・取り消しと戻す・同じ名前の印とまとめる（まとめた行は隠して取り込み直しでも戻さない・2人とも来ていれば止める）・書き出し・権限（受付係・部員・ほかの人・ない交流会）。名前はどれも架空のもの。
import "@hono/zod-openapi";
import type {
  BookingSetting,
  ImportMappingList,
  RosterEntry,
  RosterImportPreview,
  RosterImportResult,
} from "@workspace/contracts/booking";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { bookingBase, importNames, readRoster, useRoster } from "../../../test/helpers/booking.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call, createEvent, makeStaff, placeEvent } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { setUpOrganization } from "../../../test/helpers/organization.ts";
import { manualCheckIn } from "../../../test/helpers/reception.ts";

const database = useTestDatabase();

/** ない ID。 */
const MISSING_ID = "0193a1b2-0000-7000-8000-000000000000";

describe("予約の名簿の窓口", () => {
  let app: TestApp;
  let owner: { cookie: string; account: { id: string } };
  let eventId: string;
  let base: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "持ち主の高橋" });
    eventId = (await createEvent(app, owner.cookie)).id;
    base = bookingBase(eventId);
  });

  describe("使い方", () => {
    it("行がなければ受付だけで、名簿の窓口は 409。名簿を使うにすると使える", async () => {
      const before = await call(app, owner.cookie, `${base}/setting`);
      expect((await before.json()) as BookingSetting).toMatchObject({
        mode: "reception",
        entryCount: 0,
      });
      const off = await call(app, owner.cookie, `${base}/entries`);
      expect(off.status).toBe(409);
      expect(((await off.json()) as ErrorBody).error.code).toBe("BOOKING_ROSTER_OFF");

      await useRoster(app, owner.cookie, eventId);
      const roster = await readRoster(app, owner.cookie, eventId);
      expect(roster.entries).toEqual([]);
      expect(roster.eventEnded).toBe(false);
    });

    it("受付だけに戻しても名簿は消えず隠れ、また名簿を使うにすると出る", async () => {
      await useRoster(app, owner.cookie, eventId);
      await importNames(app, owner.cookie, eventId, ["山田 花子"]);
      const back = await call(app, owner.cookie, `${base}/setting`, "PUT", { mode: "reception" });
      expect((await back.json()) as BookingSetting).toMatchObject({
        mode: "reception",
        entryCount: 1,
      });
      expect((await call(app, owner.cookie, `${base}/entries`)).status).toBe(409);
      expect((await call(app, owner.cookie, `${base}/matches`)).status).toBe(409);
      await useRoster(app, owner.cookie, eventId);
      expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(1);
    });

    it("知らない使い方は 400（自前で申込みを受けるは booking-003 から選べる）。受付係は読めるが変えられない", async () => {
      const invalid = await call(app, owner.cookie, `${base}/setting`, "PUT", {
        mode: "waitlist",
      });
      expect(invalid.status).toBe(400);
      const selfPage = await call(app, owner.cookie, `${base}/setting`, "PUT", {
        mode: "self_page",
      });
      expect(selfPage.status).toBe(200);
      const staff = await makeStaff(app, owner.cookie, eventId);
      expect((await call(app, staff.cookie, `${base}/setting`)).status).toBe(200);
      const put = await call(app, staff.cookie, `${base}/setting`, "PUT", { mode: "roster" });
      expect(put.status).toBe(403);
    });
  });

  describe("取り込み", () => {
    beforeEach(async () => {
      await useRoster(app, owner.cookie, eventId);
    });

    it("見積もりは書かずに行ごとの結果を返し、取り込むと入る。もう一度は増えない", async () => {
      const input = {
        applicationSource: "peatix",
        rows: [
          { line: 2, name: " 山田 花子 " },
          { line: 3, name: "" },
          { line: 4, name: "鈴木 一郎" },
        ],
      };
      const preview = await call(
        app,
        owner.cookie,
        `${base}/entries/import/preview`,
        "POST",
        input,
      );
      expect(preview.status).toBe(200);
      const plan = (await preview.json()) as RosterImportPreview;
      expect(plan.rows.map((row) => [row.line, row.name, row.outcome])).toEqual([
        [2, "山田 花子", "insert"],
        [3, "", "empty"],
        [4, "鈴木 一郎", "insert"],
      ]);
      expect((await readRoster(app, owner.cookie, eventId)).entries).toEqual([]);

      const first = await call(app, owner.cookie, `${base}/entries/import`, "POST", input);
      expect(((await first.json()) as RosterImportResult).counts).toEqual({
        insert: 2,
        existing: 0,
        empty: 1,
      });
      const second = await call(app, owner.cookie, `${base}/entries/import`, "POST", input);
      expect(((await second.json()) as RosterImportResult).counts).toEqual({
        insert: 0,
        existing: 2,
        empty: 1,
      });
      const roster = await readRoster(app, owner.cookie, eventId);
      expect(
        roster.entries.map((entry) => [entry.name, entry.entryKind, entry.applicationSource]),
      ).toEqual([
        ["山田 花子", "import", "peatix"],
        ["鈴木 一郎", "import", "peatix"],
      ]);
      expect(roster.entries[0]?.enteredByName).toBeNull();
    });

    it("同時に2回取り込んでも増えない", async () => {
      const input = { applicationSource: "other", rows: [{ line: 2, name: "山田 花子" }] };
      await Promise.all([
        call(app, owner.cookie, `${base}/entries/import`, "POST", input),
        call(app, owner.cookie, `${base}/entries/import`, "POST", input),
      ]);
      expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(1);
    });

    it("列の対応は交流会の持ち主ごとに覚え、持ち主の別の交流会でも返る。ほかの人には返らない", async () => {
      const headers = ["タイムスタンプ", "お名前", "メール"];
      const response = await call(app, owner.cookie, `${base}/entries/import`, "POST", {
        applicationSource: "other",
        rows: [{ line: 2, name: "山田 花子" }],
        mapping: { headers, nameColumn: "お名前" },
      });
      expect(response.status).toBe(200);
      const otherEvent = (await createEvent(app, owner.cookie)).id;
      await useRoster(app, owner.cookie, otherEvent);
      const listed = await call(app, owner.cookie, `${bookingBase(otherEvent)}/import-mappings`);
      expect((await listed.json()) as ImportMappingList).toEqual({
        mappings: [{ headers, nameColumn: "お名前", applicationSource: "other" }],
      });

      const stranger = await loginAs(app);
      const strangerEvent = (await createEvent(app, stranger.cookie)).id;
      await useRoster(app, stranger.cookie, strangerEvent);
      const none = await call(
        app,
        stranger.cookie,
        `${bookingBase(strangerEvent)}/import-mappings`,
      );
      expect(((await none.json()) as ImportMappingList).mappings).toEqual([]);
    });

    it("行の数・名前の長さ・名前の列を確かめる（400）", async () => {
      const tooLong = await call(app, owner.cookie, `${base}/entries/import`, "POST", {
        applicationSource: "other",
        rows: [{ line: 2, name: "あ".repeat(51) }],
      });
      expect(tooLong.status).toBe(400);
      const tooMany = await call(app, owner.cookie, `${base}/entries/import`, "POST", {
        applicationSource: "other",
        rows: Array.from({ length: 501 }, (_, index) => ({ line: index + 2, name: "名" })),
      });
      expect(tooMany.status).toBe(400);
    });
  });

  describe("手で直す", () => {
    beforeEach(async () => {
      await useRoster(app, owner.cookie, eventId);
    });

    it("受付係も1人足せて、入口は手で足す・入れた人が付く", async () => {
      const staff = await makeStaff(app, owner.cookie, eventId, { displayName: "受付係の石井" });
      const response = await call(app, staff.cookie, `${base}/entries`, "POST", {
        name: " 鈴木 まこと ",
        applicationSource: "other",
        memo: "電話で申込み",
      });
      expect(response.status).toBe(201);
      expect((await response.json()) as RosterEntry).toMatchObject({
        name: "鈴木 まこと",
        entryKind: "manual",
        status: "confirmed",
        enteredByName: "受付係の石井",
        memo: "電話で申込み",
        attendance: "pending",
        match: null,
      });
    });

    it("主催者は取り消し・戻すができ、受付係は 403", async () => {
      await importNames(app, owner.cookie, eventId, ["山田 花子"]);
      const [entry] = (await readRoster(app, owner.cookie, eventId)).entries;
      const staff = await makeStaff(app, owner.cookie, eventId);
      const path = `${base}/entries/${entry?.id}/status`;
      expect((await call(app, staff.cookie, path, "PUT", { status: "cancelled" })).status).toBe(
        403,
      );
      const cancelled = await call(app, owner.cookie, path, "PUT", { status: "cancelled" });
      expect(((await cancelled.json()) as RosterEntry).status).toBe("cancelled");
      const roster = await readRoster(app, owner.cookie, eventId);
      expect(roster.counts).toMatchObject({ confirmed: 0, cancelled: 1 });
      const restored = await call(app, owner.cookie, path, "PUT", { status: "confirmed" });
      expect(((await restored.json()) as RosterEntry).status).toBe("confirmed");
      const missing = await call(app, owner.cookie, `${base}/entries/${MISSING_ID}/status`, "PUT", {
        status: "cancelled",
      });
      expect(missing.status).toBe(404);
    });

    it("同じ名前の行に印が付き、まとめると1つになる。名前が違えば 400", async () => {
      await importNames(app, owner.cookie, eventId, ["佐藤 けん", "田中 りく"], "peatix");
      await call(app, owner.cookie, `${base}/entries`, "POST", {
        name: "佐藤けん",
        applicationSource: "other",
        memo: "手で足した",
      });
      const roster = await readRoster(app, owner.cookie, eventId);
      expect(roster.entries.map((entry) => [entry.name, entry.sameName])).toEqual([
        ["佐藤 けん", true],
        ["田中 りく", false],
        ["佐藤けん", true],
      ]);
      const [first, other, second] = roster.entries;
      const mismatch = await call(app, owner.cookie, `${base}/entries/merge`, "POST", {
        keepEntryId: first?.id,
        removeEntryId: other?.id,
      });
      expect(mismatch.status).toBe(400);
      const merged = await call(app, owner.cookie, `${base}/entries/merge`, "POST", {
        keepEntryId: first?.id,
        removeEntryId: second?.id,
      });
      expect(merged.status).toBe(200);
      expect((await merged.json()) as RosterEntry).toMatchObject({
        id: first?.id,
        sameName: false,
        memo: "手で足した",
      });
      expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(2);
    });

    it("まとめた行は名簿から隠れるが、同じ CSV を取り込み直しても人は戻らない", async () => {
      await importNames(app, owner.cookie, eventId, ["佐藤 けん", "田中 りく"], "peatix");
      await call(app, owner.cookie, `${base}/entries`, "POST", {
        name: "佐藤けん",
        applicationSource: "other",
      });
      const before = await readRoster(app, owner.cookie, eventId);
      const imported = before.entries.find((entry) => entry.name === "佐藤 けん");
      const manual = before.entries.find((entry) => entry.name === "佐藤けん");
      const merged = await call(app, owner.cookie, `${base}/entries/merge`, "POST", {
        keepEntryId: manual?.id,
        removeEntryId: imported?.id,
      });
      expect(merged.status).toBe(200);
      const after = await readRoster(app, owner.cookie, eventId);
      expect(after.entries.map((entry) => entry.name)).toEqual(["田中 りく", "佐藤けん"]);
      expect(after.counts).toMatchObject({ confirmed: 2, cancelled: 0 });

      const rows = [
        { line: 2, name: "佐藤 けん" },
        { line: 3, name: "田中 りく" },
      ];
      const preview = await call(app, owner.cookie, `${base}/entries/import/preview`, "POST", {
        applicationSource: "peatix",
        rows,
      });
      expect(((await preview.json()) as RosterImportPreview).counts).toEqual({
        insert: 0,
        existing: 2,
        empty: 0,
      });
      await importNames(app, owner.cookie, eventId, ["佐藤 けん", "田中 りく"], "peatix");
      expect((await readRoster(app, owner.cookie, eventId)).entries).toHaveLength(2);
      // まとめた行は、行の ID で直せない（404）・もう一度まとめられない（404）
      const status = await call(
        app,
        owner.cookie,
        `${base}/entries/${imported?.id}/status`,
        "PUT",
        { status: "confirmed" },
      );
      expect(status.status).toBe(404);
      const again = await call(app, owner.cookie, `${base}/entries/merge`, "POST", {
        keepEntryId: manual?.id,
        removeEntryId: imported?.id,
      });
      expect(again.status).toBe(404);
      const setting = await call(app, owner.cookie, `${base}/setting`);
      expect(((await setting.json()) as BookingSetting).entryCount).toBe(2);
    });

    it("2つともチェックインに当たっていればまとめず 409、片方だけなら当てが残す行へ移る", async () => {
      await importNames(app, owner.cookie, eventId, ["佐藤 けん"], "peatix");
      await call(app, owner.cookie, `${base}/entries`, "POST", {
        name: "佐藤けん",
        applicationSource: "other",
      });
      const roster = await readRoster(app, owner.cookie, eventId);
      const [first, second] = roster.entries;
      const one = await manualCheckIn(app, owner.cookie, eventId, { name: "佐藤 けん" });
      const two = await manualCheckIn(app, owner.cookie, eventId, { name: "佐藤 けん" });
      for (const [checkin, entry] of [
        [one, first],
        [two, second],
      ] as const) {
        const matched = await call(
          app,
          owner.cookie,
          `${base}/checkins/${checkin.id}/match`,
          "POST",
          { entryId: entry?.id },
        );
        expect(matched.status).toBe(200);
      }
      const both = await call(app, owner.cookie, `${base}/entries/merge`, "POST", {
        keepEntryId: first?.id,
        removeEntryId: second?.id,
      });
      expect(both.status).toBe(409);
      expect(((await both.json()) as ErrorBody).error.code).toBe("BOOKING_MERGE_BOTH_MATCHED");
      expect((await readRoster(app, owner.cookie, eventId)).counts.came).toBe(2);

      // 残す行の当てを外すと、まとめる行の当てが残す行へ移る
      const unmatch = await call(app, owner.cookie, `${base}/entries/${first?.id}/match`, "DELETE");
      expect(unmatch.status).toBe(200);
      const merged = await call(app, owner.cookie, `${base}/entries/merge`, "POST", {
        keepEntryId: first?.id,
        removeEntryId: second?.id,
      });
      expect(merged.status).toBe(200);
      expect((await merged.json()) as RosterEntry).toMatchObject({
        id: first?.id,
        attendance: "came",
        match: "manual",
      });
      const after = await readRoster(app, owner.cookie, eventId);
      expect(after.entries).toHaveLength(1);
      expect(after.counts).toMatchObject({ confirmed: 1, came: 1 });
    });

    it("取り消した行に手の当てが残っていても、来たの人数に入れない", async () => {
      await importNames(app, owner.cookie, eventId, ["山田 花子"]);
      const [entry] = (await readRoster(app, owner.cookie, eventId)).entries;
      const checkin = await manualCheckIn(app, owner.cookie, eventId, { name: "山田 花子" });
      await call(app, owner.cookie, `${base}/checkins/${checkin.id}/match`, "POST", {
        entryId: entry?.id,
      });
      await call(app, owner.cookie, `${base}/entries/${entry?.id}/status`, "PUT", {
        status: "cancelled",
      });
      const roster = await readRoster(app, owner.cookie, eventId);
      expect(roster.counts).toMatchObject({ confirmed: 0, cancelled: 1, came: 0 });
    });

    it("書き出しは主催者だけで、BOM つき・式として読まれない形", async () => {
      await call(app, owner.cookie, `${base}/entries`, "POST", {
        name: "=1+2",
        applicationSource: "peatix",
      });
      const csv = await call(app, owner.cookie, `${base}/entries/export`);
      expect(csv.status).toBe(200);
      expect(csv.headers.get("content-type")).toContain("text/csv");
      const bytes = new Uint8Array(await csv.arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const text = new TextDecoder().decode(bytes);
      expect(text.startsWith("名前,媒体,入口,状態,申し込んだ日時,来た,入れた人,メモ\r\n")).toBe(
        true,
      );
      expect(text).toContain("'=1+2,Peatix,手で足す,確定,");
      const staff = await makeStaff(app, owner.cookie, eventId);
      expect((await call(app, staff.cookie, `${base}/entries/export`)).status).toBe(403);
    });
  });

  describe("権限", () => {
    it("部員とほかの人は 403、ない交流会は 404。組織の編集者は主催者として使える", async () => {
      await useRoster(app, owner.cookie, eventId);
      const editor = await loginAs(app, { displayName: "編集者" });
      const member = await loginAs(app, { displayName: "部員" });
      const organizationId = await setUpOrganization(app, owner.cookie, [
        { cookie: editor.cookie, accountId: editor.account.id, role: "editor" },
        { cookie: member.cookie, accountId: member.account.id, role: "member" },
      ]);
      expect((await placeEvent(app, owner.cookie, eventId, organizationId)).status).toBe(200);
      expect((await call(app, editor.cookie, `${base}/entries`)).status).toBe(200);
      expect((await call(app, member.cookie, `${base}/entries`)).status).toBe(403);
      const stranger = await loginAs(app);
      expect((await call(app, stranger.cookie, `${base}/setting`)).status).toBe(403);
      expect((await call(app, owner.cookie, `${bookingBase(MISSING_ID)}/setting`)).status).toBe(
        404,
      );
      const staff = await makeStaff(app, owner.cookie, eventId);
      for (const [path, method] of [
        [`${base}/entries/import/preview`, "POST"],
        [`${base}/entries/import`, "POST"],
        [`${base}/import-mappings`, "GET"],
        [`${base}/entries/merge`, "POST"],
      ] as const) {
        const response = await call(
          app,
          staff.cookie,
          path,
          method,
          method === "GET" ? undefined : {},
        );
        expect(response.status).toBe(403);
      }
    });
  });
});
