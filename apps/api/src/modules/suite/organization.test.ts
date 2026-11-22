// 組織（suite-001。AD-22）の結合のテスト（本物の PostgreSQL）：作る・一覧・組織の画面・名前・上限・
// 役割ごとの操作の表（管理者・編集者・メンバー・組織の人でない人）・招待（札・作り直し・確かめ・入る・同時・上限・形）・
// 役割の切り替えと編集者の上限・外す・管理者の引き継ぎ・抜ける・消す・管理者のいない組織が残らないこと。
import "@hono/zod-openapi";
import type {
  OrganizationDetail,
  OrganizationInvitePreview,
  OrganizationInviteView,
  OrganizationList,
} from "@workspace/contracts/suite";
import {
  ORGANIZATION_ADMIN_LIMIT,
  ORGANIZATION_EDITOR_LIMIT,
  ORGANIZATION_MEMBER_LIMIT,
} from "@workspace/contracts/suite";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import {
  createOrganization,
  joinOrganization,
  rotateInviteToken,
  setOrganizationRole,
} from "../../../test/helpers/organization.ts";
import { withdrawal } from "./index.ts";

const database = useTestDatabase();

/** 道の頭。 */
const BASE = "/api/v1/suite/organizations";

/** テストの鍵の束（招待の写しを包む）。 */
const KEY_RING = JSON.stringify({ "1": btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) });

/** ログインした人。 */
type Person = { cookie: string; id: string };

describe("組織", () => {
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
   * 組織の人の役割を DB から読む。
   * @param accountId account の ID
   * @param org 組織の ID（既定は organizationId）
   * @returns 役割（いなければ undefined）
   */
  async function roleOf(accountId: string, org = organizationId): Promise<string | undefined> {
    const result = await database.pool.query<{ role: string }>(
      "SELECT role FROM organization_member WHERE organization_id = $1 AND account_id = $2",
      [org, accountId],
    );
    return result.rows[0]?.role;
  }

  /**
   * 管理者の数（組織ごと。管理者のいない組織を見つける）。
   * @returns 管理者のいない組織の数
   */
  async function adminlessCount(): Promise<number> {
    const result = await database.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM organization o
        WHERE NOT EXISTS (SELECT 1 FROM organization_member m WHERE m.organization_id = o.id AND m.role = 'admin')`,
    );
    return result.rows[0]?.n ?? 0;
  }

  beforeEach(async () => {
    await truncateAllTables(database);
    app = buildApp(
      database,
      testConfig({ tokenEncryption: { keyRing: KEY_RING, currentVersion: 1 } }),
    );
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

  describe("作る・一覧・組織の画面", () => {
    it("作った人が管理者になり、一覧と組織の画面に出る（役割の順・あなた・新しい人は管理者にだけ）", async () => {
      const list = (await (await call(app, admin.cookie, BASE)).json()) as OrganizationList;
      expect(list.organizations).toEqual([
        expect.objectContaining({
          id: organizationId,
          name: "飲食チーム",
          myRole: "admin",
          memberCount: 3,
        }),
      ]);
      expect(list).toMatchObject({ adminCount: 1, adminLimit: ORGANIZATION_ADMIN_LIMIT });

      // メンバーが先に見ても、新しい人の印は付かない
      const forMember = (await (
        await call(app, member.cookie, `${BASE}/${organizationId}`)
      ).json()) as OrganizationDetail;
      expect(forMember.myRole).toBe("member");
      expect(forMember.members.map((row) => row.role)).toEqual(["admin", "editor", "member"]);
      expect(forMember.members.every((row) => !row.isNew)).toBe(true);
      expect(forMember.members.find((row) => row.isMe)?.accountId).toBe(member.id);

      const first = (await (
        await call(app, admin.cookie, `${BASE}/${organizationId}`)
      ).json()) as OrganizationDetail;
      expect(
        first.members
          .filter((row) => row.isNew)
          .map((row) => row.accountId)
          .sort(),
      ).toEqual([editor.id, member.id].sort());
      expect(first.members.find((row) => row.accountId === admin.id)).toMatchObject({
        isMe: true,
        isNew: false,
        displayName: "田中",
      });
      // 2回目には出さない（1回だけ）
      const second = (await (
        await call(app, admin.cookie, `${BASE}/${organizationId}`)
      ).json()) as OrganizationDetail;
      expect(second.members.some((row) => row.isNew)).toBe(false);
    });

    it("名前は前後の空白を除いて1〜50文字", async () => {
      expect((await call(app, admin.cookie, BASE, "POST", { name: "  " })).status).toBe(400);
      expect((await call(app, admin.cookie, BASE, "POST", { name: "あ".repeat(51) })).status).toBe(
        400,
      );
      const id = await createOrganization(app, admin.cookie, "  あ  ");
      const detail = (await (
        await call(app, admin.cookie, `${BASE}/${id}`)
      ).json()) as OrganizationDetail;
      expect(detail.name).toBe("あ");
    });

    it("管理者として持てる組織は20まで（21個目は 409 ORGANIZATION_LIMIT）", async () => {
      const someone = await person("たくさん");
      for (let index = 0; index < ORGANIZATION_ADMIN_LIMIT; index += 1) {
        await createOrganization(app, someone.cookie, `組織${index}`);
      }
      const over = await call(app, someone.cookie, BASE, "POST", { name: "もう1つ" });
      expect(over.status).toBe(409);
      expect(((await over.json()) as ErrorBody).error.code).toBe("ORGANIZATION_LIMIT");
    });
  });

  describe("役割ごとの操作の表", () => {
    /** 試す操作（新しい組織の上で、管理者・編集者・メンバー・組織の人でない人が試す）。 */
    const operations: {
      name: string;
      run: (who: Person, org: string, target: string) => Promise<Response>;
      ok: number;
    }[] = [
      { name: "組織の画面", run: (who, org) => call(app, who.cookie, `${BASE}/${org}`), ok: 200 },
      {
        name: "名前を直す",
        run: (who, org) => call(app, who.cookie, `${BASE}/${org}`, "PATCH", { name: "新しい名前" }),
        ok: 204,
      },
      {
        name: "招待を読む",
        run: (who, org) => call(app, who.cookie, `${BASE}/${org}/invite`),
        ok: 200,
      },
      {
        name: "招待を作り直す",
        run: (who, org) => call(app, who.cookie, `${BASE}/${org}/invite`, "POST"),
        ok: 200,
      },
      {
        name: "役割を切り替える",
        run: (who, org, target) =>
          call(app, who.cookie, `${BASE}/${org}/members/${target}`, "PUT", { role: "editor" }),
        ok: 204,
      },
      {
        name: "人を外す",
        run: (who, org, target) =>
          call(app, who.cookie, `${BASE}/${org}/members/${target}`, "DELETE"),
        ok: 204,
      },
      {
        name: "管理者を引き継ぐ",
        run: (who, org, target) =>
          call(app, who.cookie, `${BASE}/${org}/transfer`, "POST", { accountId: target }),
        ok: 204,
      },
      {
        name: "組織を消す",
        run: (who, org) => call(app, who.cookie, `${BASE}/${org}`, "DELETE"),
        ok: 204,
      },
    ];

    for (const operation of operations) {
      it(`${operation.name}：管理者は通し、編集者・メンバーは（画面のほかは）403、組織の人でない人は 404`, async () => {
        // 操作ごとに新しい組織（消す・引き継ぐで前提が変わらないように）。相手はメンバーの「対象」
        const target = await person("対象");
        const org = await createOrganization(app, admin.cookie, "表の組織");
        const token = await rotateInviteToken(app, admin.cookie, org);
        for (const who of [editor, member, target]) {
          expect((await joinOrganization(app, who.cookie, token)).status).toBe(200);
        }
        await setOrganizationRole(app, admin.cookie, org, editor.id, "editor");
        const forOthers = operation.name === "組織の画面" ? 200 : 403;
        expect((await operation.run(editor, org, target.id)).status).toBe(forOthers);
        expect((await operation.run(member, org, target.id)).status).toBe(forOthers);
        const denied = await operation.run(outsider, org, target.id);
        expect(denied.status).toBe(404);
        expect(((await denied.json()) as ErrorBody).error.code).toBe("ORGANIZATION_NOT_FOUND");
        expect((await operation.run(admin, org, target.id)).status).toBe(operation.ok);
        expect(await adminlessCount()).toBe(0);
      });
    }

    it("抜ける：編集者・メンバーは抜けられ、組織の人でない人は 404", async () => {
      expect(
        (await call(app, outsider.cookie, `${BASE}/${organizationId}/leave`, "POST", {})).status,
      ).toBe(404);
      expect(
        (await call(app, member.cookie, `${BASE}/${organizationId}/leave`, "POST", {})).status,
      ).toBe(204);
      expect(await roleOf(member.id)).toBeUndefined();
      expect(
        (await call(app, editor.cookie, `${BASE}/${organizationId}/leave`, "POST", {})).status,
      ).toBe(204);
      // 抜けた人には組織があることを知らせない
      expect((await call(app, member.cookie, `${BASE}/${organizationId}`)).status).toBe(404);
    });

    it("ない組織・形の違う ID は 404", async () => {
      expect(
        (await call(app, admin.cookie, `${BASE}/0193a1b2-0000-7000-8000-000000000000`)).status,
      ).toBe(404);
      expect((await call(app, admin.cookie, `${BASE}/not-a-uuid`)).status).toBe(404);
    });
  });

  describe("招待", () => {
    it("作る前は null。作り直すと43文字の札が出て、DB には SHA-256 と包んだ写しだけを持ち、前の札は使えない", async () => {
      const fresh = await createOrganization(app, admin.cookie, "新しい組織");
      const before = (await (
        await call(app, admin.cookie, `${BASE}/${fresh}/invite`)
      ).json()) as OrganizationInviteView;
      expect(before).toEqual({ token: null, createdAt: null });

      const first = await rotateInviteToken(app, admin.cookie, fresh);
      expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await database.pool.query<{
        token_hash: string;
        token_ciphertext: Buffer | null;
      }>(
        "SELECT token_hash, token_ciphertext FROM organization_invite WHERE organization_id = $1",
        [fresh],
      );
      expect(stored.rows[0]?.token_hash).toBe(createHash("sha256").update(first).digest("hex"));
      expect(stored.rows[0]?.token_ciphertext?.toString("utf8") ?? "").not.toContain(first);
      // 包んだ写しから出し直せる
      const shown = (await (
        await call(app, admin.cookie, `${BASE}/${fresh}/invite`)
      ).json()) as OrganizationInviteView;
      expect(shown.token).toBe(first);

      const second = await rotateInviteToken(app, admin.cookie, fresh);
      expect(second).not.toBe(first);
      const old = await call(app, outsider.cookie, `/api/v1/suite/organization-invites/${first}`);
      expect(old.status).toBe(404);
      expect(((await old.json()) as ErrorBody).error.code).toBe("ORGANIZATION_INVITE_INVALID");
      expect((await joinOrganization(app, outsider.cookie, first)).status).toBe(404);
      expect((await joinOrganization(app, outsider.cookie, second)).status).toBe(200);
    });

    it("秘密の箱がない環境では、写しを持たず、作り直したときだけ札を出す", async () => {
      const plain = buildApp(database, testConfig({ tokenEncryption: undefined }));
      const fresh = await createOrganization(plain, admin.cookie, "箱なし");
      const token = await rotateInviteToken(plain, admin.cookie, fresh);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const shown = (await (
        await call(plain, admin.cookie, `${BASE}/${fresh}/invite`)
      ).json()) as OrganizationInviteView;
      expect(shown.token).toBeNull();
      expect(shown.createdAt).not.toBeNull();
    });

    it("確かめの画面は組織の名前・管理者・人数・すでに入っているかを返し、入るとメンバーになる（2回目はすでに入っている）", async () => {
      const token = await rotateInviteToken(app, admin.cookie, organizationId);
      const preview = (await (
        await call(app, outsider.cookie, `/api/v1/suite/organization-invites/${token}`)
      ).json()) as OrganizationInvitePreview;
      expect(preview).toEqual({
        organizationId,
        name: "飲食チーム",
        adminName: "田中",
        memberCount: 3,
        alreadyMember: false,
        full: false,
      });
      const joined = await joinOrganization(app, outsider.cookie, token);
      expect(await joined.json()).toEqual({ organizationId, alreadyMember: false });
      expect(await roleOf(outsider.id)).toBe("member");
      const again = await joinOrganization(app, outsider.cookie, token);
      expect(await again.json()).toEqual({ organizationId, alreadyMember: true });
      const previewAgain = (await (
        await call(app, outsider.cookie, `/api/v1/suite/organization-invites/${token}`)
      ).json()) as OrganizationInvitePreview;
      expect(previewAgain.alreadyMember).toBe(true);
    });

    it("同じ人が同時に押しても1回だけ入る", async () => {
      const token = await rotateInviteToken(app, admin.cookie, organizationId);
      const results = await Promise.all([
        joinOrganization(app, outsider.cookie, token),
        joinOrganization(app, outsider.cookie, token),
      ]);
      expect(results.map((response) => response.status)).toEqual([200, 200]);
      const bodies = (await Promise.all(results.map((response) => response.json()))) as {
        alreadyMember: boolean;
      }[];
      expect(bodies.filter((body) => !body.alreadyMember)).toHaveLength(1);
      const rows = await database.pool.query(
        "SELECT 1 FROM organization_member WHERE organization_id = $1 AND account_id = $2",
        [organizationId, outsider.id],
      );
      expect(rows.rowCount).toBe(1);
    });

    it("人数の上限（50人）に達した組織には入れない（409 ORGANIZATION_FULL・確かめの画面は full）", async () => {
      const fill = ORGANIZATION_MEMBER_LIMIT - 3;
      await database.pool.query(
        `WITH created AS (
           INSERT INTO account (line_user_id, display_name)
           SELECT 'U' || md5('fill-' || g), '埋める人' FROM generate_series(1, $2::int) AS g
           RETURNING id
         )
         INSERT INTO organization_member (organization_id, account_id, role)
         SELECT $1, id, 'member' FROM created`,
        [organizationId, fill],
      );
      const token = await rotateInviteToken(app, admin.cookie, organizationId);
      const preview = (await (
        await call(app, outsider.cookie, `/api/v1/suite/organization-invites/${token}`)
      ).json()) as OrganizationInvitePreview;
      expect(preview).toMatchObject({ memberCount: ORGANIZATION_MEMBER_LIMIT, full: true });
      const full = await joinOrganization(app, outsider.cookie, token);
      expect(full.status).toBe(409);
      expect(((await full.json()) as ErrorBody).error.code).toBe("ORGANIZATION_FULL");
    });

    it("形の違う札・知らない札は 404 ORGANIZATION_INVITE_INVALID", async () => {
      for (const token of ["short", "A".repeat(43)]) {
        const response = await call(
          app,
          outsider.cookie,
          `/api/v1/suite/organization-invites/${token}`,
        );
        expect(response.status).toBe(404);
        expect(((await response.json()) as ErrorBody).error.code).toBe(
          "ORGANIZATION_INVITE_INVALID",
        );
        expect((await joinOrganization(app, outsider.cookie, token)).status).toBe(404);
      }
    });

    it("外した人は、手元の古いリンクで入り直せない（外すと招待のリンクを作り直す）。招待のリンクを作る前なら作らない", async () => {
      const token = await rotateInviteToken(app, admin.cookie, organizationId);
      expect(
        (await call(app, admin.cookie, `${BASE}/${organizationId}/members/${member.id}`, "DELETE"))
          .status,
      ).toBe(204);
      const again = await joinOrganization(app, member.cookie, token);
      expect(again.status).toBe(404);
      expect(((await again.json()) as ErrorBody).error.code).toBe("ORGANIZATION_INVITE_INVALID");
      const fresh = (await (
        await call(app, admin.cookie, `${BASE}/${organizationId}/invite`)
      ).json()) as OrganizationInviteView;
      expect(fresh.token).not.toBe(token);
      expect((await joinOrganization(app, member.cookie, fresh.token ?? "")).status).toBe(200);

      const noInvite = await createOrganization(app, admin.cookie, "招待なし");
      const token2 = await rotateInviteToken(app, admin.cookie, noInvite);
      expect((await joinOrganization(app, outsider.cookie, token2)).status).toBe(200);
      await database.pool.query("DELETE FROM organization_invite WHERE organization_id = $1", [
        noInvite,
      ]);
      expect(
        (await call(app, admin.cookie, `${BASE}/${noInvite}/members/${outsider.id}`, "DELETE"))
          .status,
      ).toBe(204);
      const after = (await (
        await call(app, admin.cookie, `${BASE}/${noInvite}/invite`)
      ).json()) as OrganizationInviteView;
      expect(after).toEqual({ token: null, createdAt: null });
    });

    it("組織を消すと、招待も使えない", async () => {
      const token = await rotateInviteToken(app, admin.cookie, organizationId);
      expect((await call(app, admin.cookie, `${BASE}/${organizationId}`, "DELETE")).status).toBe(
        204,
      );
      expect((await joinOrganization(app, outsider.cookie, token)).status).toBe(404);
      const rows = await database.pool.query(
        "SELECT 1 FROM organization_member WHERE organization_id = $1 UNION ALL SELECT 1 FROM organization_invite WHERE organization_id = $1",
        [organizationId],
      );
      expect(rows.rowCount).toBe(0);
    });
  });

  describe("役割・外す・引き継ぐ・抜ける", () => {
    it("編集者からメンバーに戻すと下げた日時を残し、もう一度編集者にしても日時は残る", async () => {
      expect(
        (await setOrganizationRole(app, admin.cookie, organizationId, editor.id, "member")).status,
      ).toBe(204);
      const demoted = await database.pool.query<{ role: string; demoted_at: Date | null }>(
        "SELECT role, demoted_at FROM organization_member WHERE organization_id = $1 AND account_id = $2",
        [organizationId, editor.id],
      );
      expect(demoted.rows[0]?.role).toBe("member");
      expect(demoted.rows[0]?.demoted_at).not.toBeNull();
      expect(
        (await setOrganizationRole(app, admin.cookie, organizationId, editor.id, "editor")).status,
      ).toBe(204);
      expect(await roleOf(editor.id)).toBe("editor");
    });

    it("編集者は10人まで（11人目は 409 ORGANIZATION_EDITOR_LIMIT）", async () => {
      await database.pool.query(
        `WITH created AS (
           INSERT INTO account (line_user_id, display_name)
           SELECT 'U' || md5('editor-' || g), '編集者' FROM generate_series(1, $2::int) AS g
           RETURNING id
         )
         INSERT INTO organization_member (organization_id, account_id, role)
         SELECT $1, id, 'editor' FROM created`,
        [organizationId, ORGANIZATION_EDITOR_LIMIT - 1],
      );
      const response = await setOrganizationRole(
        app,
        admin.cookie,
        organizationId,
        member.id,
        "editor",
      );
      expect(response.status).toBe(409);
      expect(((await response.json()) as ErrorBody).error.code).toBe("ORGANIZATION_EDITOR_LIMIT");
    });

    it("編集者が上限のとき、メンバーへ管理者を引き継ぐと 409（前の管理者が編集者として残り、上限を超えるため）", async () => {
      await database.pool.query(
        `WITH created AS (
           INSERT INTO account (line_user_id, display_name)
           SELECT 'U' || md5('editor-t-' || g), '編集者' FROM generate_series(1, $2::int) AS g
           RETURNING id
         )
         INSERT INTO organization_member (organization_id, account_id, role)
         SELECT $1, id, 'editor' FROM created`,
        [organizationId, ORGANIZATION_EDITOR_LIMIT - 1],
      );
      const toMember = await call(app, admin.cookie, `${BASE}/${organizationId}/transfer`, "POST", {
        accountId: member.id,
      });
      expect(toMember.status).toBe(409);
      expect(((await toMember.json()) as ErrorBody).error.code).toBe("ORGANIZATION_EDITOR_LIMIT");
      expect(await roleOf(admin.id)).toBe("admin");
      // 編集者へ引き継ぐなら、編集者の数は変わらないので引き継げる
      const toEditor = await call(app, admin.cookie, `${BASE}/${organizationId}/transfer`, "POST", {
        accountId: editor.id,
      });
      expect(toEditor.status).toBe(204);
      expect(await roleOf(editor.id)).toBe("admin");
    });

    it("自分の役割は変えられず・自分は外せず、管理者の役割は変えられない", async () => {
      const self = await setOrganizationRole(app, admin.cookie, organizationId, admin.id, "member");
      expect(self.status).toBe(409);
      expect(((await self.json()) as ErrorBody).error.code).toBe("ORGANIZATION_SELF_NOT_ALLOWED");
      expect(
        (await call(app, admin.cookie, `${BASE}/${organizationId}/members/${admin.id}`, "DELETE"))
          .status,
      ).toBe(409);
      expect(await roleOf(admin.id)).toBe("admin");
      // 入っていない人は 404
      expect(
        (await setOrganizationRole(app, admin.cookie, organizationId, outsider.id, "editor"))
          .status,
      ).toBe(404);
      expect(
        (
          await call(
            app,
            admin.cookie,
            `${BASE}/${organizationId}/members/${outsider.id}`,
            "DELETE",
          )
        ).status,
      ).toBe(404);
    });

    it("管理者を引き継ぐと、前の管理者は編集者になる。組織の人でない人には引き継げない", async () => {
      expect(
        (
          await call(app, admin.cookie, `${BASE}/${organizationId}/transfer`, "POST", {
            accountId: outsider.id,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await call(app, admin.cookie, `${BASE}/${organizationId}/transfer`, "POST", {
            accountId: admin.id,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await call(app, admin.cookie, `${BASE}/${organizationId}/transfer`, "POST", {
            accountId: member.id,
          })
        ).status,
      ).toBe(204);
      expect(await roleOf(member.id)).toBe("admin");
      expect(await roleOf(admin.id)).toBe("editor");
      // 前の管理者は、もう管理者の操作ができない
      expect(
        (await call(app, admin.cookie, `${BASE}/${organizationId}/invite`, "POST")).status,
      ).toBe(403);
    });

    it("管理者は引き継ぐ人を選ばないと抜けられず（409）、選べば引き継いで抜ける", async () => {
      const refused = await call(app, admin.cookie, `${BASE}/${organizationId}/leave`, "POST", {});
      expect(refused.status).toBe(409);
      expect(((await refused.json()) as ErrorBody).error.code).toBe(
        "ORGANIZATION_SUCCESSOR_REQUIRED",
      );
      expect(await roleOf(admin.id)).toBe("admin");
      expect(
        (
          await call(app, admin.cookie, `${BASE}/${organizationId}/leave`, "POST", {
            successorAccountId: editor.id,
          })
        ).status,
      ).toBe(204);
      expect(await roleOf(admin.id)).toBeUndefined();
      expect(await roleOf(editor.id)).toBe("admin");
      expect(await adminlessCount()).toBe(0);
    });

    it("どの順の操作（引き継ぎ・抜ける・外す・退会）でも、管理者のいない組織は残らない", async () => {
      await call(app, admin.cookie, `${BASE}/${organizationId}/transfer`, "POST", {
        accountId: editor.id,
      });
      expect(await adminlessCount()).toBe(0);
      await call(app, editor.cookie, `${BASE}/${organizationId}/members/${admin.id}`, "DELETE");
      expect(await adminlessCount()).toBe(0);
      await call(app, member.cookie, `${BASE}/${organizationId}/leave`, "POST", {});
      expect(await adminlessCount()).toBe(0);
      // 管理者の退会（ほかに誰もいない）→ 組織が消える
      expect((await call(app, editor.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
      expect(await adminlessCount()).toBe(0);
      const left = await database.pool.query("SELECT 1 FROM organization WHERE id = $1", [
        organizationId,
      ]);
      expect(left.rowCount).toBe(0);
    });
  });

  describe("退会の手順（suite の段）", () => {
    it("管理者が退会すると、いちばん長くいる人が管理者になる。2回流しても同じ", async () => {
      // 編集者（先に入った）がいちばん長い
      await withdrawal.prepare(database.db, admin.id);
      expect(await roleOf(editor.id)).toBe("admin");
      expect(await roleOf(admin.id)).toBe("editor");
      await withdrawal.prepare(database.db, admin.id);
      expect(await roleOf(editor.id)).toBe("admin");
      expect(await roleOf(member.id)).toBe("member");
    });

    it("前の手順のあとに管理者へ戻されても・組織を作っても、消すトランザクションの最後の確かめで片付ける", async () => {
      await withdrawal.prepare(database.db, admin.id);
      expect(await roleOf(editor.id)).toBe("admin");
      // 前の手順と消すのあいだに、管理者を戻された・ひとりの組織を作った（退会の途中の隙）
      expect(
        (
          await call(app, editor.cookie, `${BASE}/${organizationId}/transfer`, "POST", {
            accountId: admin.id,
          })
        ).status,
      ).toBe(204);
      const alone = await createOrganization(app, admin.cookie, "途中で作った組織");
      expect(await roleOf(admin.id)).toBe("admin");
      await database.db.transaction(async (tx) => {
        await withdrawal.finalize?.(tx, admin.id);
        await tx.execute(sql`DELETE FROM account WHERE id = ${admin.id}`);
      });
      expect(await roleOf(editor.id)).toBe("admin");
      expect(await adminlessCount()).toBe(0);
      const rows = await database.pool.query("SELECT 1 FROM organization WHERE id = $1", [alone]);
      expect(rows.rowCount).toBe(0);
    });

    it("退会の窓口は、前の手順と最後の確かめを流してからアカウントを消す", async () => {
      expect((await call(app, admin.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
      expect(await roleOf(editor.id)).toBe("admin");
      expect(await adminlessCount()).toBe(0);
    });

    it("ほかに誰もいなければ組織を消す", async () => {
      const alone = await createOrganization(app, outsider.cookie, "ひとり");
      await withdrawal.prepare(database.db, outsider.id);
      const rows = await database.pool.query("SELECT 1 FROM organization WHERE id = $1", [alone]);
      expect(rows.rowCount).toBe(0);
    });

    it("確かめの中身：管理者の組織は引き継ぐ先か消すこと、ほかの組織は抜けること", async () => {
      await createOrganization(app, member.cookie, "ひとり");
      const forAdmin = await withdrawal.preview(database.db, admin.id);
      expect(forAdmin).toEqual([
        { kind: "organization", text: "組織「飲食チーム」の管理者を、佐藤さんに引き継ぎます。" },
      ]);
      const forMember = await withdrawal.preview(database.db, member.id);
      expect(forMember.map((item) => item.text)).toEqual([
        "組織「飲食チーム」から抜けます。",
        "組織「ひとり」を消します（ほかに誰もいないため。組織に入れた記録も消えます）。",
      ]);
    });
  });
});
