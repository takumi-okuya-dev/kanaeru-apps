// 持ち主の退会での引き継ぎ（threads-013。PRD 組織 5.7・6章・AD-22 の退会の手順）の結合のテスト（本物の PostgreSQL・偽の Threads）：
// 組織に入れた運用アカウントは管理者に引き継ぎ（接続を切る・自動投稿を切・メンションの待ちを取り消す・中の記録は同じ件数・
// 誰がしたかは SET NULL・新しい持ち主の担当の行を消す・ほかの担当は残して任せるはオフ・見せるはオフ・記録と知らせ）、
// 個人の運用は消す。管理者が退会するときは先に管理者を引き継ぐ。ひとりの組織は組織ごと消える。主催者がアカウントを消すときも同じ。
// 退会の確かめの中身の順番と、手順を2回流しても同じ結果になること。
import "@hono/zod-openapi";
import type { PostDraft, ThreadsTeamNotices } from "@workspace/contracts/threads";
import type { WithdrawalPreview } from "@workspace/contracts/account";
import { beforeEach, describe, expect, it } from "vitest";
import { ORGANIZER_LINE_USER_ID_FOR_TEST, loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import { setTeamMember, setUpTeam } from "../../../test/helpers/organization.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import {
  THREADS_BASE,
  createThreadsAccount,
  pasteDrafts,
  placeThreadsAccount,
  setUpTeamScene,
} from "../../../test/helpers/threads-team.ts";
import type { TeamScene } from "../../../test/helpers/threads-team.ts";
import { withdrawal as suiteWithdrawal } from "../suite/index.ts";
import { withdrawal as threadsWithdrawal } from "./index.ts";

const database = useTestDatabase();

/**
 * 1つの値を読む。
 * @param text SQL
 * @param values 引数
 * @returns 最初の行
 */
async function row<T>(text: string, values: unknown[] = []): Promise<T> {
  const result = await database.pool.query(text, values);
  return result.rows[0] as T;
}

/**
 * 運用アカウントの中の記録の件数（引き継ぎの前後で比べる）。
 * @param threadsAccountId 運用アカウントの ID
 * @returns 表ごとの件数
 */
async function recordCounts(threadsAccountId: string) {
  return row<Record<string, number>>(
    `SELECT
       (SELECT count(*) FROM threads_post_draft WHERE threads_account_id = $1)::int AS drafts,
       (SELECT count(*) FROM threads_strategy WHERE threads_account_id = $1)::int AS strategy,
       (SELECT count(*) FROM threads_ng_word WHERE threads_account_id = $1)::int AS ng_words,
       (SELECT count(*) FROM threads_post_mention WHERE threads_account_id = $1)::int AS mentions`,
    [threadsAccountId],
  );
}

describe("持ち主の退会での引き継ぎ", () => {
  let scene: TeamScene;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    scene = await setUpTeamScene(database);
  });

  /**
   * 運用アカウントを Threads につなぐ（偽の Threads のトークン）。
   * @param accountId 運用アカウントの ID
   * @param userId Threads のユーザー ID
   */
  async function connect(accountId: string, userId: string): Promise<void> {
    scene.fake.addUser({ id: userId, username: `user_${userId}`, name: "店" });
    const token = scene.fake.issueToken({ userId });
    const response = await call(
      scene.app,
      scene.owner.cookie,
      `${THREADS_BASE}/${accountId}/connection`,
      "POST",
      {
        token,
      },
    );
    expect(response.status).toBe(200);
  }

  /**
   * 引き継ぎの材料を作る：つなぐ・案（担当が作って任された人が承認・持ち主が作る）・戦略・NG ワード・自動投稿・メンションの待ち。
   * @returns 担当が作った案
   */
  async function fillAccount(): Promise<PostDraft> {
    const { app, owner, assignee, account } = scene;
    await connect(account.id, "7001");
    const byAssignee = (await pasteDrafts(app, assignee.cookie, account.id, "担当の案"))
      .drafts[0] as PostDraft;
    const byOwner = (await pasteDrafts(app, owner.cookie, account.id, "持ち主の案\n@@@\n二つ目"))
      .drafts[0] as PostDraft;
    await call(app, owner.cookie, `${THREADS_BASE}/${account.id}/drafts/review`, "POST", {
      action: "approve",
      items: [{ id: byOwner.id, version: byOwner.version }],
    });
    await call(app, owner.cookie, `${THREADS_BASE}/${account.id}/ng-words`, "POST", {
      words: ["禁止"],
    });
    const strategy = (await (
      await call(app, owner.cookie, `${THREADS_BASE}/${account.id}/strategy`)
    ).json()) as Record<string, unknown>;
    const { filledCount: _f, total: _t, updatedAt: _u, ...values } = strategy;
    await call(app, owner.cookie, `${THREADS_BASE}/${account.id}/strategy`, "PUT", {
      ...values,
      finalAction: "相談",
    });
    await database.pool.query(
      "INSERT INTO threads_posting_schedule (threads_account_id, enabled, slot_minutes) VALUES ($1, true, '{600}')",
      [account.id],
    );
    await database.pool.query(
      "INSERT INTO threads_post_mention (draft_id, threads_account_id, usernames, text, delay_minutes) VALUES ($1, $2, '{taro}', 'よろしく', 30)",
      [byOwner.id, account.id],
    );
    // 管理者が自分でも担当していた（引き継ぐと消える行）
    await call(
      scene.app,
      scene.admin.cookie,
      `/api/v1/threads/organizations/${scene.organizationId}/assignments`,
      "PUT",
      {
        threadsAccountId: account.id,
        accountId: scene.admin.id,
        assigned: true,
      },
    );
    await call(app, owner.cookie, `${THREADS_BASE}/${account.id}/team/shared`, "PUT", {
      shared: true,
    });
    return byAssignee;
  }

  it("組織に入れた運用アカウントは管理者に引き継ぎ、個人の運用は消す（確かめの中身も分けて出す）", async () => {
    const { app, owner, admin, account } = scene;
    const byAssignee = await fillAccount();
    const personal = await createThreadsAccount(app, owner.cookie, "個人の運用");
    const before = await recordCounts(account.id);

    const preview = (await (
      await call(app, owner.cookie, "/api/v1/accounts/me/withdrawal")
    ).json()) as WithdrawalPreview;
    expect(preview.items).toEqual([
      { kind: "organization", source: "スイート", text: "組織「飲食チーム」から抜けます。" },
      {
        kind: "handover",
        source: "Threads",
        text: "運用アカウント「カフェB店」は、田中さん（組織「飲食チーム」の管理者）に引き継がれます。Threads への接続は切れます。",
      },
      {
        kind: "delete",
        source: "Threads",
        text: "運用アカウント1件（「個人の運用」）と、その投稿の案・戦略・反応などを消します。",
      },
    ]);

    expect((await call(app, owner.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);

    const handed = await row<Record<string, unknown>>(
      "SELECT account_id, connection_status, username, threads_user_id, handover_from_name, handed_over_at FROM threads_account WHERE id = $1",
      [account.id],
    );
    expect(handed).toMatchObject({
      account_id: admin.id,
      connection_status: "needs_reconnect",
      username: "user_7001",
      threads_user_id: "7001",
      handover_from_name: "鈴木",
    });
    expect(handed.handed_over_at).not.toBeNull();
    expect(
      (
        await database.pool.query(
          "SELECT 1 FROM threads_connection WHERE threads_account_id = $1",
          [account.id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await row<{ enabled: boolean }>(
          "SELECT enabled FROM threads_posting_schedule WHERE threads_account_id = $1",
          [account.id],
        )
      ).enabled,
    ).toBe(false);
    expect(
      (
        await row<{ state: string }>(
          "SELECT state FROM threads_post_mention WHERE threads_account_id = $1",
          [account.id],
        )
      ).state,
    ).toBe("canceled");
    expect(await recordCounts(account.id)).toEqual(before);
    // 個人の運用は消える
    expect(
      (await database.pool.query("SELECT 1 FROM threads_account WHERE id = $1", [personal.id]))
        .rowCount,
    ).toBe(0);
    // 前の持ち主の「誰がしたか」は SET NULL、担当の人のものは残る
    const actors = await database.pool.query<{
      body: string;
      created_by_account_id: string | null;
      reviewed_by_account_id: string | null;
    }>(
      "SELECT body, created_by_account_id, reviewed_by_account_id FROM threads_post_draft WHERE threads_account_id = $1 ORDER BY body",
      [account.id],
    );
    expect(actors.rows.find((r) => r.body === "持ち主の案")).toMatchObject({
      created_by_account_id: null,
      reviewed_by_account_id: null,
    });
    expect(actors.rows.find((r) => r.body === byAssignee.body)?.created_by_account_id).toBe(
      scene.assignee.id,
    );
    // 組織に入ったまま、持ち主の欄も替わり、見せるはオフ。新しい持ち主の担当の行は消え、ほかの担当は残して任せるはオフ
    expect(
      await row(
        "SELECT owner_account_id, shared FROM threads_organization_account WHERE threads_account_id = $1",
        [account.id],
      ),
    ).toEqual({
      owner_account_id: admin.id,
      shared: false,
    });
    const assignments = await database.pool.query<{ account_id: string; delegated: boolean }>(
      "SELECT account_id, delegated FROM threads_assignment WHERE threads_account_id = $1 ORDER BY account_id",
      [account.id],
    );
    expect(assignments.rows.map((r) => r.account_id).sort()).toEqual(
      [scene.assignee.id, scene.delegatee.id].sort(),
    );
    expect(assignments.rows.every((r) => !r.delegated)).toBe(true);
    // 記録と知らせ
    const log = await row<{ actor_account_id: string | null; summary: string }>(
      "SELECT actor_account_id, summary FROM threads_activity_log WHERE threads_account_id = $1 AND action = 'account_handed_over'",
      [account.id],
    );
    expect(log).toEqual({ actor_account_id: null, summary: "鈴木" });
    const notices = (await (
      await call(app, admin.cookie, "/api/v1/threads/team-notices")
    ).json()) as ThreadsTeamNotices;
    expect(notices.handovers).toEqual([
      { threadsAccountId: account.id, accountName: "カフェB店", fromName: "鈴木" },
    ]);
    await call(app, admin.cookie, "/api/v1/threads/team-notices/seen", "POST");
    const seen = (await (
      await call(app, admin.cookie, "/api/v1/threads/team-notices")
    ).json()) as ThreadsTeamNotices;
    expect(seen.handovers).toEqual([]);
    // 新しい持ち主はすべてでき、担当の人は続けられる
    expect(
      (
        await call(app, admin.cookie, `${THREADS_BASE}/${account.id}`, "PATCH", {
          name: "引き継いだ店",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          app,
          scene.assignee.cookie,
          `${THREADS_BASE}/${account.id}/drafts?status=needs_review`,
        )
      ).status,
    ).toBe(200);
  });

  it("持ち主が管理者で、ほかに人がいれば、いちばん長くいる人が管理者になり、その人に引き継ぐ", async () => {
    const { app, admin } = scene;
    const own = await createThreadsAccount(app, admin.cookie, "管理者の店");
    await setTeamMember(app, admin.cookie, scene.organizationId, scene.teamId, admin.id);
    expect((await placeThreadsAccount(app, admin.cookie, own.id, scene.teamId)).status).toBe(200);
    const preview = (await (
      await call(app, admin.cookie, "/api/v1/accounts/me/withdrawal")
    ).json()) as WithdrawalPreview;
    expect(preview.items.map((item) => item.kind)).toEqual(["organization", "handover"]);
    expect(preview.items[1]?.text).toContain("鈴木さん");
    expect((await call(app, admin.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    // 持ち主（いちばん先に入った）が管理者になり、運用アカウントを受け取る
    expect(
      await row(
        "SELECT role FROM organization_member WHERE organization_id = $1 AND account_id = $2",
        [scene.organizationId, scene.owner.id],
      ),
    ).toEqual({ role: "admin" });
    expect(await row("SELECT account_id FROM threads_account WHERE id = $1", [own.id])).toEqual({
      account_id: scene.owner.id,
    });
    // 前の持ち主の運用アカウント（カフェB店）は変わらない
    expect(
      await row("SELECT account_id FROM threads_account WHERE id = $1", [scene.account.id]),
    ).toEqual({ account_id: scene.owner.id });
  });

  it("ひとりの組織の管理者が退会すると、組織と、組織に入れた運用アカウントは消える", async () => {
    const { app, outsider } = scene;
    const orgResponse = await call(app, outsider.cookie, "/api/v1/suite/organizations", "POST", {
      name: "ひとり",
    });
    const { id: alone } = (await orgResponse.json()) as { id: string };
    const own = await createThreadsAccount(app, outsider.cookie, "ひとりの店");
    const aloneTeam = await setUpTeam(app, outsider.cookie, alone, [outsider.id]);
    await placeThreadsAccount(app, outsider.cookie, own.id, aloneTeam);
    const preview = (await (
      await call(app, outsider.cookie, "/api/v1/accounts/me/withdrawal")
    ).json()) as WithdrawalPreview;
    expect(preview.items.map((item) => item.kind)).toEqual(["organization", "delete"]);
    expect((await call(app, outsider.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    expect(
      (await database.pool.query("SELECT 1 FROM organization WHERE id = $1", [alone])).rowCount,
    ).toBe(0);
    expect(
      (await database.pool.query("SELECT 1 FROM threads_account WHERE id = $1", [own.id])).rowCount,
    ).toBe(0);
  });

  it("主催者がアカウントを消すときも、同じ順に引き継ぐ", async () => {
    const app = buildApp(
      database,
      testConfig({ organizerLineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST }),
    );
    const organizer = await loginAs(app, { lineUserId: ORGANIZER_LINE_USER_ID_FOR_TEST });
    expect(
      (await call(app, organizer.cookie, `/api/v1/accounts/${scene.owner.id}`, "DELETE")).status,
    ).toBe(204);
    expect(
      await row("SELECT account_id, connection_status FROM threads_account WHERE id = $1", [
        scene.account.id,
      ]),
    ).toEqual({
      account_id: scene.admin.id,
      connection_status: "not_connected",
    });
  });

  it("各段は2回流しても同じ結果になる（途中で止まっても、もう一度押せば続きから終わる）", async () => {
    await fillAccount();
    const db = database.db;
    await suiteWithdrawal.prepare(db, scene.owner.id);
    await threadsWithdrawal.prepare(db, scene.owner.id);
    const once = await row<Record<string, unknown>>(
      "SELECT account_id, connection_status, connection_generation FROM threads_account WHERE id = $1",
      [scene.account.id],
    );
    const logsOnce = await row<{ n: number }>(
      "SELECT count(*)::int AS n FROM threads_activity_log WHERE action = 'account_handed_over'",
    );
    await suiteWithdrawal.prepare(db, scene.owner.id);
    await threadsWithdrawal.prepare(db, scene.owner.id);
    expect(
      await row(
        "SELECT account_id, connection_status, connection_generation FROM threads_account WHERE id = $1",
        [scene.account.id],
      ),
    ).toEqual(once);
    expect(
      await row(
        "SELECT count(*)::int AS n FROM threads_activity_log WHERE action = 'account_handed_over'",
      ),
    ).toEqual(logsOnce);
    expect(logsOnce.n).toBe(1);
    // そのあとアカウントを消しても、引き継いだ運用アカウントは残る
    expect(
      (await call(scene.app, scene.owner.cookie, "/api/v1/accounts/me", "DELETE")).status,
    ).toBe(204);
    expect(
      (await database.pool.query("SELECT 1 FROM threads_account WHERE id = $1", [scene.account.id]))
        .rowCount,
    ).toBe(1);
  });

  it("組織に入れていない人の退会は、今までどおりすべて消える（確かめの中身は消える記録だけ）", async () => {
    const { app, outsider } = scene;
    const own = await createThreadsAccount(app, outsider.cookie, "個人だけ");
    await pasteDrafts(app, outsider.cookie, own.id, "案");
    const preview = (await (
      await call(app, outsider.cookie, "/api/v1/accounts/me/withdrawal")
    ).json()) as WithdrawalPreview;
    expect(preview.items.map((item) => [item.kind, item.source])).toEqual([["delete", "Threads"]]);
    expect((await call(app, outsider.cookie, "/api/v1/accounts/me", "DELETE")).status).toBe(204);
    expect(
      (await database.pool.query("SELECT 1 FROM threads_account WHERE id = $1", [own.id])).rowCount,
    ).toBe(0);
  });
});
