// Threads のチーム運用（threads-013。PRD 組織 5章）の結合のテスト（本物の PostgreSQL・偽の Threads。外へ出ない）：
// 関わり × 操作の表（持ち主・担当の人・任された担当の人・管理者・担当のない編集者・メンバー〈見せる設定のオン・オフ〉・関わりのない人・別の組織の人）・
// 任された承認も NG ワードで止まる・任されていない担当の人が消せる案・役割を下げたときの担当・担当にできる人・組織から外れたとき・
// 一覧の担当している運用アカウント・運用状況（範囲と、数と日付だけ）・知らせ・誰がしたか。
import "@hono/zod-openapi";
import type {
  DraftList,
  PostDraft,
  ReviewResult,
  ThreadsAccountAccess,
  ThreadsAccountList,
  ThreadsAccountTeam,
  ThreadsOrganizationView,
  ThreadsTeamNotices,
  ThreadsTeamStatus,
} from "@workspace/contracts/threads";
import { beforeEach, describe, expect, it } from "vitest";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { setOrganizationRole } from "../../../test/helpers/organization.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import {
  THREADS_BASE,
  THREADS_ORG_BASE,
  assignThreadsAccount,
  createThreadsAccount,
  pasteDrafts,
  placeThreadsAccount,
  setUpTeamScene,
} from "../../../test/helpers/threads-team.ts";
import type { TeamPerson, TeamScene } from "../../../test/helpers/threads-team.ts";

const database = useTestDatabase();

/** 期待（ok：403・404 でない答え・forbidden：403・missing：404）。 */
type Expect = "ok" | "forbidden" | "missing";

/** 操作のまとまり。 */
type Group =
  | "read_content"
  | "read_private"
  | "write_content"
  | "review"
  | "manage"
  | "activity"
  | "team_card";

/** 表の場面の材料（関わりごとに作り直す）。 */
type Fixture = {
  scene: TeamScene;
  /** 承認待ちの案 */
  needsReview: PostDraft;
  /** 却下した案 */
  rejected: PostDraft;
  /** 承認済みの案 */
  approved: PostDraft;
  /** 戦略を保存する入力（持ち主が読んだもの） */
  strategyInput: Record<string, unknown>;
  /** プロンプトの設定（持ち主が読んだもの） */
  promptSettings: Record<string, unknown>;
};

/**
 * 表の場面を作る（案を3つためて、1つを承認・1つを却下する）。
 * @param shared 組織に見せるか
 * @returns 材料
 */
async function setUpFixture(shared: boolean): Promise<Fixture> {
  const scene = await setUpTeamScene(database);
  const { app, owner, account } = scene;
  const api = (path: string, method = "GET", body?: unknown) =>
    call(app, owner.cookie, `${THREADS_BASE}/${account.id}${path}`, method, body);
  const batch = await pasteDrafts(
    app,
    owner.cookie,
    account.id,
    "承認待ちの案\n@@@\n却下する案\n@@@\n承認する案",
  );
  const [needsReview, toReject, toApprove] = batch.drafts as [PostDraft, PostDraft, PostDraft];
  const rejectedResult = (await (
    await api("/drafts/review", "POST", {
      action: "reject",
      items: [{ id: toReject.id, version: toReject.version }],
      reasons: ["tone"],
    })
  ).json()) as ReviewResult;
  const approvedResult = (await (
    await api("/drafts/review", "POST", {
      action: "approve",
      items: [{ id: toApprove.id, version: toApprove.version }],
    })
  ).json()) as ReviewResult;
  if (shared) expect((await api("/team/shared", "PUT", { shared: true })).status).toBe(200);
  const strategy = (await (await api("/strategy")).json()) as Record<string, unknown>;
  const { filledCount: _f, total: _t, updatedAt: _u, ...strategyInput } = strategy;
  const promptSettings = (await (await api("/prompt-settings")).json()) as Record<string, unknown>;
  return {
    scene,
    needsReview,
    rejected: rejectedResult.drafts[0] as PostDraft,
    approved: approvedResult.drafts[0] as PostDraft,
    strategyInput,
    promptSettings,
  };
}

/** 表の操作（まとまりと、その人として送る要求）。 */
const OPERATIONS: {
  name: string;
  group: Group;
  run: (fixture: Fixture, who: TeamPerson) => Promise<Response>;
}[] = [
  { name: "運用アカウントを読む", group: "read_content", run: (f, w) => api(f, w, "") },
  {
    name: "投稿の案の一覧",
    group: "read_content",
    run: (f, w) => api(f, w, "/drafts?status=needs_review"),
  },
  { name: "戦略を読む", group: "read_content", run: (f, w) => api(f, w, "/strategy") },
  { name: "反応", group: "read_private", run: (f, w) => api(f, w, "/performance") },
  { name: "プロンプト", group: "read_private", run: (f, w) => api(f, w, "/prompt") },
  { name: "ホーム", group: "read_private", run: (f, w) => api(f, w, "/home") },
  { name: "設定（読むだけ）", group: "read_private", run: (f, w) => api(f, w, "/prompt-settings") },
  { name: "自動投稿の予定", group: "read_private", run: (f, w) => api(f, w, "/auto-post") },
  {
    name: "戦略を保存する",
    group: "write_content",
    run: (f, w) => api(f, w, "/strategy", "PUT", { ...f.strategyInput, finalAction: "相談の予約" }),
  },
  {
    name: "案をためる",
    group: "write_content",
    run: (f, w) =>
      api(f, w, "/draft-batches", "POST", {
        clientRequestId: crypto.randomUUID(),
        text: "担当が作った案",
      }),
  },
  {
    name: "案を直す",
    group: "write_content",
    run: (f, w) =>
      api(f, w, `/drafts/${f.needsReview.id}`, "PUT", {
        body: "直した案",
        version: f.needsReview.version,
      }),
  },
  {
    name: "承認待ちの案を消す",
    group: "write_content",
    run: (f, w) => api(f, w, `/drafts/${f.needsReview.id}`, "DELETE"),
  },
  {
    name: "承認する",
    group: "review",
    run: (f, w) =>
      api(f, w, "/drafts/review", "POST", {
        action: "approve",
        items: [{ id: f.needsReview.id, version: f.needsReview.version }],
      }),
  },
  {
    name: "却下の案を消す",
    group: "review",
    run: (f, w) => api(f, w, `/drafts/${f.rejected.id}`, "DELETE"),
  },
  {
    name: "次に投稿する",
    group: "review",
    run: (f, w) =>
      api(f, w, `/drafts/${f.approved.id}/priority`, "PUT", {
        prioritized: true,
        version: f.approved.version,
      }),
  },
  {
    name: "名前を直す",
    group: "manage",
    run: (f, w) => api(f, w, "", "PATCH", { name: "新しい名前" }),
  },
  {
    name: "プロンプトの設定を変える",
    group: "manage",
    run: (f, w) => api(f, w, "/prompt-settings", "PUT", f.promptSettings),
  },
  { name: "接続を切る", group: "manage", run: (f, w) => api(f, w, "/connection", "DELETE") },
  {
    name: "組織に見せる",
    group: "manage",
    run: (f, w) => api(f, w, "/team/shared", "PUT", { shared: true }),
  },
  {
    name: "組織に入れる",
    group: "manage",
    run: (f, w) => api(f, w, "/team/placement", "PUT", { organizationId: f.scene.organizationId }),
  },
  {
    name: "承認を任せる",
    group: "manage",
    run: (f, w) =>
      api(f, w, `/team/delegations/${f.scene.assignee.id}`, "PUT", { delegated: false }),
  },
  { name: "操作の記録", group: "activity", run: (f, w) => api(f, w, "/activity") },
  { name: "このアカウントのチーム", group: "team_card", run: (f, w) => api(f, w, "/team") },
];

/**
 * 運用アカウントの道に、その人として送る。
 * @param fixture 材料
 * @param who 送る人
 * @param path 運用アカウントの道のあと
 * @param method 動き
 * @param body 本文
 * @returns 応答
 */
function api(fixture: Fixture, who: TeamPerson, path: string, method = "GET", body?: unknown) {
  return call(
    fixture.scene.app,
    who.cookie,
    `${THREADS_BASE}/${fixture.scene.account.id}${path}`,
    method,
    body,
  );
}

/** 関わりの場合（名前・見せる設定・人・期待）。 */
type RelationCase = {
  name: string;
  shared: boolean;
  pick: (scene: TeamScene) => TeamPerson;
  expect: Record<Group, Expect>;
};

/** 関わりごとの期待（PRD 組織 5.2 の表）。 */
const RELATIONS: RelationCase[] = [
  ...[false, true].map((shared): RelationCase => ({
    name: `持ち主（見せる：${shared ? "オン" : "オフ"}）`,
    shared,
    pick: (scene: TeamScene) => scene.owner,
    expect: {
      read_content: "ok",
      read_private: "ok",
      write_content: "ok",
      review: "ok",
      manage: "ok",
      activity: "ok",
      team_card: "ok",
    },
  })),
  {
    name: "担当の人（任されていない）",
    shared: false,
    pick: (scene) => scene.assignee,
    expect: {
      read_content: "ok",
      read_private: "ok",
      write_content: "ok",
      review: "forbidden",
      manage: "forbidden",
      activity: "forbidden",
      team_card: "ok",
    },
  },
  {
    name: "担当の人（承認を任されている）",
    shared: false,
    pick: (scene) => scene.delegatee,
    expect: {
      read_content: "ok",
      read_private: "ok",
      write_content: "ok",
      review: "ok",
      manage: "forbidden",
      activity: "forbidden",
      team_card: "ok",
    },
  },
  ...(["admin", "editor", "member"] as const).flatMap((role) =>
    [false, true].map((shared): RelationCase => ({
      name: `${role === "admin" ? "管理者（担当なし）" : role === "editor" ? "編集者（担当なし）" : "メンバー"}（見せる：${shared ? "オン" : "オフ"}）`,
      shared,
      pick: (scene: TeamScene) => scene[role],
      expect: {
        read_content: shared ? "ok" : "forbidden",
        read_private: "forbidden",
        write_content: "forbidden",
        review: "forbidden",
        manage: "forbidden",
        activity: "forbidden",
        team_card: "forbidden",
      },
    })),
  ),
  ...(["outsider", "stranger"] as const).flatMap((key) =>
    [false, true].map((shared): RelationCase => ({
      name: `${key === "outsider" ? "関わりのない人" : "別の組織の人"}（見せる：${shared ? "オン" : "オフ"}）`,
      shared,
      pick: (scene: TeamScene) => scene[key],
      expect: {
        read_content: "missing",
        read_private: "missing",
        write_content: "missing",
        review: "missing",
        manage: "missing",
        activity: "missing",
        team_card: "missing",
      },
    })),
  ),
];

/**
 * 応答を期待の種類にする。
 * @param response 応答
 * @returns 種類
 */
async function kindOf(response: Response): Promise<string> {
  if (response.status === 404) return "missing";
  if (response.status === 403) {
    const body = (await response.json()) as ErrorBody;
    return body.error.code === "THREADS_TEAM_FORBIDDEN" ? "forbidden" : `403:${body.error.code}`;
  }
  if (response.status === 401) return "401";
  if (response.status >= 500) return `${response.status}`;
  return "ok";
}

describe("関わり × 操作の表（PRD 組織 5.2）", () => {
  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
  });

  for (const relation of RELATIONS) {
    it(relation.name, async () => {
      const fixture = await setUpFixture(relation.shared);
      const who = relation.pick(fixture.scene);
      const results: Record<string, string> = {};
      const expected: Record<string, string> = {};
      for (const operation of OPERATIONS) {
        results[operation.name] = await kindOf(await operation.run(fixture, who));
        expected[operation.name] = relation.expect[operation.group];
      }
      expect(results).toEqual(expected);
      // 関わりと、できること（画面の出し分け）も同じ表から出る
      const access = await api(fixture, who, "/access");
      if (relation.expect.read_content === "missing") {
        expect(access.status).toBe(404);
      } else {
        const body = (await access.json()) as ThreadsAccountAccess;
        expect(body.can).toEqual({
          readContent: relation.expect.read_content === "ok",
          readPrivate: relation.expect.read_private === "ok",
          writeContent: relation.expect.write_content === "ok",
          review: relation.expect.review === "ok",
          manage: relation.expect.manage === "ok",
          activity: relation.expect.activity === "ok",
        });
        expect(body.ownerName).toBe("鈴木");
      }
    });
  }
});

describe("チーム運用の決まり", () => {
  let scene: TeamScene;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    scene = await setUpTeamScene(database);
  });

  /**
   * 運用アカウントの道に送る。
   * @param who 送る人
   * @param path 道のあと
   * @param method 動き
   * @param body 本文
   * @param accountId 運用アカウントの ID（既定は場面のもの）
   * @returns 応答
   */
  function send(
    who: TeamPerson,
    path: string,
    method = "GET",
    body?: unknown,
    accountId = scene.account.id,
  ) {
    return call(scene.app, who.cookie, `${THREADS_BASE}/${accountId}${path}`, method, body);
  }

  it("任された担当の人の承認も、NG ワードの確かめを通る（省かない）", async () => {
    expect((await send(scene.owner, "/ng-words", "POST", { words: ["禁止"] })).status).toBe(201);
    const { drafts } = await pasteDrafts(
      scene.app,
      scene.delegatee.cookie,
      scene.account.id,
      "禁止の言葉を含む案",
    );
    const draft = drafts[0] as PostDraft;
    const result = (await (
      await send(scene.delegatee, "/drafts/review", "POST", {
        action: "approve",
        items: [{ id: draft.id, version: draft.version }],
      })
    ).json()) as ReviewResult;
    expect(result.drafts).toHaveLength(0);
    expect(result.skipped).toEqual([{ id: draft.id, reason: "NG_WORD" }]);
  });

  it("誰がしたかを残す：案の作った人・直した人・承認した人と、操作の記録のした人（組織に入っている運用アカウントだけ名前を出す）", async () => {
    const { drafts } = await pasteDrafts(
      scene.app,
      scene.assignee.cookie,
      scene.account.id,
      "担当の案",
    );
    const draft = drafts[0] as PostDraft;
    await send(scene.delegatee, `/drafts/${draft.id}`, "PUT", {
      body: "直した担当の案",
      version: draft.version,
    });
    const list = (await (
      await send(scene.owner, "/drafts?status=needs_review")
    ).json()) as DraftList;
    expect(list.drafts.find((row) => row.id === draft.id)).toMatchObject({
      createdByName: "佐藤",
      updatedByName: "山田",
    });
    const edited = list.drafts.find((row) => row.id === draft.id) as PostDraft;
    await send(scene.delegatee, "/drafts/review", "POST", {
      action: "approve",
      items: [{ id: edited.id, version: edited.version }],
    });
    const reviewed = await database.pool.query<{ reviewed_by_account_id: string | null }>(
      "SELECT reviewed_by_account_id FROM threads_post_draft WHERE id = $1",
      [draft.id],
    );
    expect(reviewed.rows[0]?.reviewed_by_account_id).toBe(scene.delegatee.id);
    const activity = (await (await send(scene.owner, "/activity")).json()) as {
      items: { action: string; actorName?: string | null }[];
    };
    expect(activity.items.find((row) => row.action === "drafts_added")?.actorName).toBe("佐藤");
    expect(activity.items.find((row) => row.action === "drafts_approved")?.actorName).toBe("山田");
    expect(activity.items.map((row) => row.action)).toEqual(
      expect.arrayContaining(["organization_placed", "assignment_added", "delegation_changed"]),
    );

    // 個人の運用（組織に入れていない）では名前を出さない
    const personal = await createThreadsAccount(scene.app, scene.owner.cookie, "個人の運用");
    await pasteDrafts(scene.app, scene.owner.cookie, personal.id, "個人の案");
    const personalList = (await (
      await send(scene.owner, "/drafts?status=needs_review", "GET", undefined, personal.id)
    ).json()) as DraftList;
    expect(personalList.drafts[0]).not.toHaveProperty("createdByName");
    const personalActivity = (await (
      await send(scene.owner, "/activity", "GET", undefined, personal.id)
    ).json()) as { items: Record<string, unknown>[] };
    expect(personalActivity.items[0]).not.toHaveProperty("actorName");
  });

  it("任されていない担当の人は、承認待ちの案は消せるが、却下の案は消せない（まとめて消すときは承認待ちだけ消える）", async () => {
    const { drafts } = await pasteDrafts(
      scene.app,
      scene.owner.cookie,
      scene.account.id,
      "一\n@@@\n二\n@@@\n三",
    );
    const [first, second, third] = drafts as [PostDraft, PostDraft, PostDraft];
    await send(scene.owner, "/drafts/review", "POST", {
      action: "reject",
      items: [
        { id: second.id, version: second.version },
        { id: third.id, version: third.version },
      ],
      reasons: ["tone"],
    });
    const single = await send(scene.assignee, `/drafts/${second.id}`, "DELETE");
    expect(single.status).toBe(403);
    const bulk = await send(scene.assignee, "/drafts/delete", "POST", {
      ids: [first.id, third.id],
    });
    expect(await bulk.json()).toEqual({ deletedCount: 1 });
    const left = await database.pool.query<{ status: string }>(
      "SELECT status FROM threads_post_draft WHERE threads_account_id = $1 ORDER BY position",
      [scene.account.id],
    );
    expect(left.rows.map((row) => row.status)).toEqual(["rejected", "rejected"]);
    // 任された担当の人は却下の案も消せる
    expect((await send(scene.delegatee, `/drafts/${second.id}`, "DELETE")).status).toBe(204);
  });

  it("編集者からメンバーに戻すと担当と任せるが効かなくなり、もう一度編集者にしても戻らない", async () => {
    const demote = await setOrganizationRole(
      scene.app,
      scene.admin.cookie,
      scene.organizationId,
      scene.delegatee.id,
      "member",
    );
    expect(demote.status).toBe(204);
    expect((await send(scene.delegatee, "/drafts?status=needs_review")).status).toBe(403);
    const promote = await setOrganizationRole(
      scene.app,
      scene.admin.cookie,
      scene.organizationId,
      scene.delegatee.id,
      "editor",
    );
    expect(promote.status).toBe(204);
    expect((await send(scene.delegatee, "/drafts?status=needs_review")).status).toBe(403);
    const team = (await (await send(scene.owner, "/team")).json()) as ThreadsAccountTeam;
    expect(team.people.map((row) => row.accountId)).not.toContain(scene.delegatee.id);
    // 付け直すと担当に戻るが、承認を任せるはオフのまま
    expect(
      (
        await assignThreadsAccount(
          scene.app,
          scene.admin.cookie,
          scene.organizationId,
          scene.account.id,
          scene.delegatee.id,
        )
      ).status,
    ).toBe(200);
    const access = (await (await send(scene.delegatee, "/access")).json()) as ThreadsAccountAccess;
    expect(access).toMatchObject({ relation: "assignee", delegated: false });
    expect(access.can.review).toBe(false);
  });

  it("担当にできるのは編集者か管理者で、持ち主でない人。管理者は自分を担当にでき、操作の記録も見られる", async () => {
    const asMember = await assignThreadsAccount(
      scene.app,
      scene.admin.cookie,
      scene.organizationId,
      scene.account.id,
      scene.member.id,
    );
    expect(asMember.status).toBe(409);
    expect(((await asMember.json()) as ErrorBody).error.code).toBe(
      "THREADS_ASSIGNMENT_NOT_ALLOWED",
    );
    // 持ち主を編集者にしても、自分の運用アカウントの担当にはできない
    await setOrganizationRole(
      scene.app,
      scene.admin.cookie,
      scene.organizationId,
      scene.owner.id,
      "editor",
    );
    expect(
      (
        await assignThreadsAccount(
          scene.app,
          scene.admin.cookie,
          scene.organizationId,
          scene.account.id,
          scene.owner.id,
        )
      ).status,
    ).toBe(409);
    // 管理者でない人は担当を決められない
    expect(
      (
        await assignThreadsAccount(
          scene.app,
          scene.editor.cookie,
          scene.organizationId,
          scene.account.id,
          scene.editor.id,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await assignThreadsAccount(
          scene.app,
          scene.outsider.cookie,
          scene.organizationId,
          scene.account.id,
          scene.editor.id,
        )
      ).status,
    ).toBe(404);
    expect((await send(scene.admin, "/activity")).status).toBe(403);
    const self = await assignThreadsAccount(
      scene.app,
      scene.admin.cookie,
      scene.organizationId,
      scene.account.id,
      scene.admin.id,
    );
    expect(self.status).toBe(200);
    const view = (await self.json()) as ThreadsOrganizationView;
    expect(
      view.assignments.find((row) => row.accountId === scene.admin.id)?.assignedAccountIds,
    ).toEqual([scene.account.id]);
    expect((await send(scene.admin, "/activity")).status).toBe(200);
    expect(
      (
        await send(scene.admin, "/drafts/review", "POST", {
          action: "approve",
          items: [{ id: crypto.randomUUID(), version: 1 }],
        })
      ).status,
    ).toBe(403);
    // 外す
    expect(
      (
        await assignThreadsAccount(
          scene.app,
          scene.admin.cookie,
          scene.organizationId,
          scene.account.id,
          scene.admin.id,
          false,
        )
      ).status,
    ).toBe(200);
    expect((await send(scene.admin, "/activity")).status).toBe(403);
  });

  it("持ち主が組織を抜けると、運用アカウントは個人の運用に戻り、担当の人は開けなくなる（データは残る）", async () => {
    await pasteDrafts(scene.app, scene.owner.cookie, scene.account.id, "残る案");
    const left = await call(
      scene.app,
      scene.owner.cookie,
      `/api/v1/suite/organizations/${scene.organizationId}/leave`,
      "POST",
      {},
    );
    expect(left.status).toBe(204);
    expect((await send(scene.assignee, "/drafts?status=needs_review")).status).toBe(404);
    expect((await send(scene.admin, "")).status).toBe(404);
    const counts = await database.pool.query(
      "SELECT (SELECT count(*) FROM threads_organization_account)::int AS placed, (SELECT count(*) FROM threads_assignment)::int AS assigned, (SELECT count(*) FROM threads_post_draft WHERE threads_account_id = $1)::int AS drafts",
      [scene.account.id],
    );
    expect(counts.rows[0]).toEqual({ placed: 0, assigned: 0, drafts: 1 });
    const team = (await (await send(scene.owner, "/team")).json()) as ThreadsAccountTeam;
    expect(team.organization).toBeNull();
  });

  it("担当の人が組織を抜けると、その人の担当だけが消える", async () => {
    await call(
      scene.app,
      scene.assignee.cookie,
      `/api/v1/suite/organizations/${scene.organizationId}/leave`,
      "POST",
      {},
    );
    expect((await send(scene.assignee, "")).status).toBe(404);
    expect((await send(scene.delegatee, "")).status).toBe(200);
  });

  it("持ち主が組織から外す・組織を消すと、個人の運用に戻り、持ち主はすべてできる", async () => {
    expect(
      (await placeThreadsAccount(scene.app, scene.owner.cookie, scene.account.id, null)).status,
    ).toBe(200);
    expect((await send(scene.assignee, "")).status).toBe(404);
    const assigned = await database.pool.query("SELECT 1 FROM threads_assignment");
    expect(assigned.rowCount).toBe(0);
    // 入れ直すと、前の担当は戻らない
    expect(
      (
        await placeThreadsAccount(
          scene.app,
          scene.owner.cookie,
          scene.account.id,
          scene.organizationId,
        )
      ).status,
    ).toBe(200);
    expect((await send(scene.assignee, "")).status).toBe(403);
    // 組織を消す
    expect(
      (
        await call(
          scene.app,
          scene.admin.cookie,
          `/api/v1/suite/organizations/${scene.organizationId}`,
          "DELETE",
        )
      ).status,
    ).toBe(204);
    expect((await send(scene.owner, "", "PATCH", { name: "個人に戻った" })).status).toBe(200);
    expect((await send(scene.member, "")).status).toBe(404);
  });

  it("入っていない組織には入れられず、組織に入っていなければ見せる設定は変えられない", async () => {
    const other = await placeThreadsAccount(
      scene.app,
      scene.owner.cookie,
      scene.account.id,
      scene.otherOrganizationId,
    );
    expect(other.status).toBe(404);
    expect(((await other.json()) as ErrorBody).error.code).toBe("THREADS_TEAM_NOT_FOUND");
    const personal = await createThreadsAccount(scene.app, scene.owner.cookie, "個人");
    expect(
      (await send(scene.owner, "/team/shared", "PUT", { shared: true }, personal.id)).status,
    ).toBe(404);
    // 担当の人でない人には承認を任せられない
    const notAssignee = await send(scene.owner, `/team/delegations/${scene.editor.id}`, "PUT", {
      delegated: true,
    });
    expect(notAssignee.status).toBe(409);
  });

  it("このアカウントのチーム：組織 → 管理者 → 持ち主 → 担当の人（任されている印・あなた）。入れられる組織は持ち主だけ", async () => {
    const team = (await (await send(scene.assignee, "/team")).json()) as ThreadsAccountTeam;
    expect(team.organization?.name).toBe("飲食チーム");
    expect(
      team.people.map((row) => [row.position, row.displayName, row.delegated, row.isMe]),
    ).toEqual([
      ["admin", "田中", false, false],
      ["owner", "鈴木", false, false],
      ["assignee", "佐藤", false, true],
      ["assignee", "山田", true, false],
    ]);
    expect(team.candidates).toEqual([]);
    const forOwner = (await (await send(scene.owner, "/team")).json()) as ThreadsAccountTeam;
    expect(forOwner.candidates.map((row) => row.id)).toEqual([scene.organizationId]);
  });

  it("一覧には担当している運用アカウントを分けて出し、上限は持っている分だけ数える", async () => {
    const list = (await (
      await call(scene.app, scene.assignee.cookie, THREADS_BASE)
    ).json()) as ThreadsAccountList;
    expect(list.accounts).toEqual([]);
    expect(list.assigned).toEqual([
      expect.objectContaining({
        id: scene.account.id,
        ownerName: "鈴木",
        organizationName: "飲食チーム",
        lastOpenedAt: null,
      }),
    ]);
    const forOwner = (await (
      await call(scene.app, scene.owner.cookie, THREADS_BASE)
    ).json()) as ThreadsAccountList;
    expect(forOwner.accounts.map((row) => row.id)).toEqual([scene.account.id]);
    expect(forOwner.assigned).toEqual([]);
    // 担当の人が開いても、持ち主の「最後に開いた」は変えない
    expect((await send(scene.assignee, "/open", "POST")).status).toBe(200);
    const opened = await database.pool.query<{ last_opened_at: Date | null }>(
      "SELECT last_opened_at FROM threads_account WHERE id = $1",
      [scene.account.id],
    );
    expect(opened.rows[0]?.last_opened_at).toBeNull();
  });

  it("Threads の組織の画面：名前・持ち主・見せる状態はだれにも、開き方は関わりで、担当の表は管理者だけ", async () => {
    const forMember = (await (
      await call(scene.app, scene.member.cookie, `${THREADS_ORG_BASE}/${scene.organizationId}`)
    ).json()) as ThreadsOrganizationView;
    expect(forMember.accounts).toEqual([
      expect.objectContaining({
        id: scene.account.id,
        ownerName: "鈴木",
        shared: false,
        access: "none",
      }),
    ]);
    expect(forMember.assignments).toEqual([]);
    expect(forMember).toMatchObject({ canAssign: false, canSeeStatus: false });
    const forAssignee = (await (
      await call(scene.app, scene.assignee.cookie, `${THREADS_ORG_BASE}/${scene.organizationId}`)
    ).json()) as ThreadsOrganizationView;
    expect(forAssignee.accounts[0]?.access).toBe("assigned");
    expect(forAssignee.canSeeStatus).toBe(true);
    const forAdmin = (await (
      await call(scene.app, scene.admin.cookie, `${THREADS_ORG_BASE}/${scene.organizationId}`)
    ).json()) as ThreadsOrganizationView;
    expect(forAdmin.assignments.map((row) => row.displayName)).toEqual([
      "田中",
      "佐藤",
      "山田",
      "高橋",
    ]);
    expect(forAdmin).toMatchObject({ canAssign: true, canSeeStatus: true });
    expect(
      (await call(scene.app, scene.outsider.cookie, `${THREADS_ORG_BASE}/${scene.organizationId}`))
        .status,
    ).toBe(404);
    const orgs = (await (await call(scene.app, scene.member.cookie, THREADS_ORG_BASE)).json()) as {
      organizations: { id: string; accountCount: number }[];
    };
    expect(orgs.organizations).toEqual([
      expect.objectContaining({ id: scene.organizationId, accountCount: 1 }),
    ]);
    expect(
      (
        (await (await call(scene.app, scene.outsider.cookie, THREADS_ORG_BASE)).json()) as {
          organizations: unknown[];
        }
      ).organizations,
    ).toEqual([]);
  });

  it("運用状況：管理者はすべて、担当の編集者は担当の分とその持ち主だけ、メンバーと担当のない編集者は 403、関わりのない人は 404。数と日付だけ", async () => {
    // 担当していない、別の持ち主の運用アカウントも組織に入れる
    const other = await createThreadsAccount(scene.app, scene.member.cookie, "ベーカリー");
    await placeThreadsAccount(scene.app, scene.member.cookie, other.id, scene.organizationId);
    await pasteDrafts(scene.app, scene.assignee.cookie, scene.account.id, "秘密の本文です");
    const strategy = (await (await send(scene.owner, "/strategy")).json()) as Record<
      string,
      unknown
    >;
    const { filledCount: _f, total: _t, updatedAt: _u, ...values } = strategy;
    await send(scene.owner, "/strategy", "PUT", { ...values, finalAction: "秘密の戦略" });

    const path = `${THREADS_ORG_BASE}/${scene.organizationId}/status`;
    const forAdminResponse = await call(scene.app, scene.admin.cookie, path);
    expect(forAdminResponse.status).toBe(200);
    const text = await forAdminResponse.text();
    expect(text).not.toContain("秘密の本文");
    expect(text).not.toContain("秘密の戦略");
    const forAdmin = JSON.parse(text) as ThreadsTeamStatus;
    expect(forAdmin.scope).toBe("all");
    expect(forAdmin.accounts.map((row) => row.name).sort()).toEqual(["カフェB店", "ベーカリー"]);
    expect(forAdmin.people).toHaveLength(6);
    const assigneeRow = forAdmin.people.find((row) => row.accountId === scene.assignee.id);
    expect(assigneeRow?.activeCount7d).toBe(1);
    expect(assigneeRow?.lastActiveAt).not.toBeNull();
    const cafe = forAdmin.accounts.find((row) => row.name === "カフェB店");
    expect(cafe).toMatchObject({
      needsReviewCount: 1,
      approvedCount: 0,
      postCount7d: 0,
      connectionStatus: "not_connected",
    });
    expect(cafe?.growth).toEqual({ state: "insufficient", ratio: null });

    const forEditor = (await (
      await call(scene.app, scene.assignee.cookie, path)
    ).json()) as ThreadsTeamStatus;
    expect(forEditor.scope).toBe("assigned");
    expect(forEditor.accounts.map((row) => row.threadsAccountId)).toEqual([scene.account.id]);
    expect(forEditor.people.map((row) => row.accountId)).toEqual([scene.owner.id]);

    for (const who of [scene.member, scene.editor]) {
      const denied = await call(scene.app, who.cookie, path);
      expect(denied.status).toBe(403);
    }
    expect((await call(scene.app, scene.outsider.cookie, path)).status).toBe(404);
  });

  it("知らせ：担当が付いたら1回だけ出し、見たらもう出さない", async () => {
    const notices = (await (
      await call(scene.app, scene.assignee.cookie, "/api/v1/threads/team-notices")
    ).json()) as ThreadsTeamNotices;
    expect(notices.assignments).toEqual([
      {
        threadsAccountId: scene.account.id,
        accountName: "カフェB店",
        ownerName: "鈴木",
        organizationName: "飲食チーム",
      },
    ]);
    expect(notices.handovers).toEqual([]);
    expect(
      (await call(scene.app, scene.assignee.cookie, "/api/v1/threads/team-notices/seen", "POST"))
        .status,
    ).toBe(204);
    const after = (await (
      await call(scene.app, scene.assignee.cookie, "/api/v1/threads/team-notices")
    ).json()) as ThreadsTeamNotices;
    expect(after.assignments).toEqual([]);
  });
});
