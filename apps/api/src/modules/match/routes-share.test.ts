// 見せる・受け付ける窓口の結合のテスト（本物の PostgreSQL。match-004）：
// - 見るだけの札：作る・作り直すと前の札は 404・期限を過ぎた札は 404・形の違う札は 404・権限・期限の決め方
// - 見るだけのページ：ログインなし・no-store と noindex・呼び名と組み合わせと進み具合だけ（レベル・名簿の人の ID・氏名は出さない）
// - 受付：ログインなしで呼び名とレベルだけを受ける（strict）・締めた札と期限を過ぎた札は 404・100人まで・同じ名前の印・
//   一覧と消す・アプリが見えないときの 404
import "@hono/zod-openapi";
import { INITIAL_CONTENT, JOIN_MAX } from "@workspace/contracts/match";
import type {
  MatchJoinList,
  MatchLinkIssued,
  MatchTable,
  MatchTableContent,
  MatchView,
} from "@workspace/contracts/match";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import {
  MATCH_TABLES,
  createTable,
  showMatchApp,
  updateTable,
} from "../../../test/helpers/match.ts";
import { upsertVisibility } from "../suite/index.ts";
import { matchJoin, matchTable } from "./schema.ts";
import { tokenExpiry } from "./tokens.ts";

const database = useTestDatabase();

/** 見本の名簿（呼び名とレベル）と、終わった試合1つ・まだの試合1つ。 */
const CONTENT: MatchTableContent = {
  ...INITIAL_CONTENT,
  players: [
    ["a", "高橋"],
    ["b", "佐藤美"],
    ["c", "伊藤"],
    ["d", "渡辺"],
  ].map(([id, nickname]) => ({
    id: id as string,
    nickname: nickname as string,
    level: "advanced" as const,
    status: "present" as const,
  })),
  plan: [
    {
      key: "advanced",
      games: [
        { players: ["a", "b", "c", "d"], done: true },
        { players: ["d", "c", "b", "a"], done: false },
      ],
    },
  ],
};

/**
 * 本文の error.code を読む。
 * @param response 応答
 * @returns code
 */
async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe("見せる・受け付ける窓口", () => {
  let app: TestApp;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let table: MatchTable;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showMatchApp(database);
    app = buildApp(database, testConfig());
    owner = await loginAs(app, { displayName: "運営" });
    table = await createTable(app, owner.cookie, { playDate: "2099-12-13" });
    const saved = await updateTable(app, owner.cookie, table, CONTENT);
    expect(saved.status).toBe(200);
    table = (await saved.json()) as MatchTable;
  });

  /**
   * 見るだけの札を作る。
   * @returns 作った札
   */
  async function issueView(): Promise<MatchLinkIssued> {
    const response = await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}/view-link`, "PUT");
    expect(response.status).toBe(200);
    return (await response.json()) as MatchLinkIssued;
  }

  /**
   * 受付の札を作る。
   * @returns 作った札
   */
  async function issueJoin(): Promise<MatchLinkIssued> {
    const response = await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}/join-link`, "PUT");
    expect(response.status).toBe(200);
    return (await response.json()) as MatchLinkIssued;
  }

  it("見るだけのページは、ログインなしで呼び名・組み合わせ・進み具合だけを、no-store と noindex で返す", async () => {
    const link = await issueView();
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{32}$/u);
    const response = await call(app, "", `/api/v1/match/views/${link.token}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    const text = await response.text();
    const view = JSON.parse(text) as MatchView;
    expect(view).toMatchObject({
      name: table.name,
      playDate: "2099-12-13",
      version: table.version,
    });
    const advanced = view.groups.find((group) => group.key === "advanced");
    expect(advanced?.label).toBe("上級");
    expect(advanced?.games).toEqual([
      { players: ["高橋", "佐藤美", "伊藤", "渡辺"], done: true },
      { players: ["渡辺", "伊藤", "佐藤美", "高橋"], done: false },
    ]);
    // 人ごとのレベル・名簿の人の ID・当日の印・担当の端末・持ち主は出さない（組の key と言葉は、どのレベルの表かを示すだけ）
    expect(text).not.toMatch(/"level"|"status"|"players":\[\{|"id"|editorDeviceId|owner|"a","b"/u);
    expect(Object.keys(view).sort()).toEqual(
      ["expiresAt", "groups", "minutesPerGame", "name", "playDate", "updatedAt", "version"].sort(),
    );

    const version = await call(app, "", `/api/v1/match/views/${link.token}/version`);
    expect(version.status).toBe(200);
    expect(version.headers.get("x-robots-tag")).toContain("noindex");
    expect(await version.json()).toEqual({ version: table.version });
  });

  it("作り直すと前の札は 404・期限を過ぎた札は 404・形の違う札は 404（どれも同じ答え）", async () => {
    const first = await issueView();
    const second = await issueView();
    expect((await call(app, "", `/api/v1/match/views/${first.token}`)).status).toBe(404);
    expect((await call(app, "", `/api/v1/match/views/${second.token}`)).status).toBe(200);

    await database.db
      .update(matchTable)
      .set({ viewTokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(matchTable.id, table.id));
    const expired = await call(app, "", `/api/v1/match/views/${second.token}`);
    expect(expired.status).toBe(404);
    expect(await codeOf(expired)).toBe("MATCH_VIEW_NOT_FOUND");
    expect((await call(app, "", `/api/v1/match/views/${second.token}/version`)).status).toBe(404);
    // 形の違う札も、ない札と同じ code（形が合うかを見分けられない）で、noindex が付く
    const malformed = await call(app, "", "/api/v1/match/views/short");
    expect(malformed.status).toBe(404);
    expect(malformed.headers.get("x-robots-tag")).toContain("noindex");
    expect(await codeOf(malformed)).toBe("MATCH_VIEW_NOT_FOUND");
    const malformedJoin = await call(app, "", "/api/v1/match/joins/short", "POST", {
      nickname: "石川",
      level: "novice",
    });
    expect(malformedJoin.status).toBe(404);
    expect(await codeOf(malformedJoin)).toBe("MATCH_JOIN_NOT_FOUND");
  });

  it("札の期限は、試合の日と今日の遅いほうの日本時間の終わり。試合表を読むと札の状態（札そのものは出さない）", async () => {
    const link = await issueView();
    expect(link.expiresAt).toBe("2099-12-13T15:00:00.000Z");
    const now = new Date("2026-11-22T10:00:00+09:00");
    expect(tokenExpiry("2026-11-01", now).toISOString()).toBe("2026-11-22T15:00:00.000Z");
    const read = (await (
      await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}`)
    ).json()) as MatchTable;
    expect(read.links).toEqual({
      viewExpiresAt: link.expiresAt,
      joinExpiresAt: null,
      joinClosedAt: null,
      viewHint: link.hint,
      joinHint: null,
    });
    expect(link.hint).toMatch(/^[0-9a-f]{8}$/u);
    expect(JSON.stringify(read)).not.toContain(link.token);
  });

  it("札を作れるのは持ち主と組織の管理者・編集者だけ（ログインなしは 401、ほかの人は 403）", async () => {
    const stranger = await loginAs(app, { displayName: "ほかの人" });
    for (const path of ["view-link", "join-link"]) {
      expect((await call(app, "", `${MATCH_TABLES}/${table.id}/${path}`, "PUT")).status).toBe(401);
      expect(
        (await call(app, stranger.cookie, `${MATCH_TABLES}/${table.id}/${path}`, "PUT")).status,
      ).toBe(403);
    }
    expect((await call(app, stranger.cookie, `${MATCH_TABLES}/${table.id}/joins`)).status).toBe(
      403,
    );
  });

  it("受付は、ログインなしで呼び名とレベルだけを受け、一覧に出る（no-store と noindex）", async () => {
    const link = await issueJoin();
    const info = await call(app, "", `/api/v1/match/joins/${link.token}`);
    expect(info.status).toBe(200);
    expect(info.headers.get("cache-control")).toBe("no-store");
    expect(info.headers.get("x-robots-tag")).toContain("noindex");
    expect(await info.json()).toEqual({
      name: table.name,
      playDate: "2099-12-13",
      levels: ["advanced", "intermediate", "beginner", "novice"],
    });

    const joined = await call(app, "", `/api/v1/match/joins/${link.token}`, "POST", {
      nickname: "  石川 ",
      level: "novice",
    });
    expect(joined.status).toBe(201);
    expect(joined.headers.get("x-robots-tag")).toContain("noindex");
    expect(await joined.json()).toEqual({ nickname: "石川", level: "novice" });

    const list = (await (
      await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}/joins`)
    ).json()) as MatchJoinList;
    expect(list.joins).toHaveLength(1);
    expect(list.joins[0]).toMatchObject({ nickname: "石川", level: "novice", duplicate: false });
    expect(list.expiresAt).toBe(link.expiresAt);
    expect(list.closedAt).toBeNull();
  });

  it("受付の本文は strict（ほかの欄・長すぎる呼び名・空・知らないレベルは 400 で、書かない）", async () => {
    const link = await issueJoin();
    const path = `/api/v1/match/joins/${link.token}`;
    const bad: unknown[] = [
      { nickname: "石川", level: "novice", fullName: "石川 海" },
      { nickname: "石川", level: "novice", email: "a@example.com" },
      { nickname: "あ".repeat(21), level: "novice" },
      { nickname: "   ", level: "novice" },
      { nickname: "石川", level: "expert" },
      { nickname: "石川" },
    ];
    bad.push(
      { nickname: "石\u202e川", level: "novice" },
      { nickname: "石\u200b川", level: "novice" },
    );
    for (const body of bad) {
      const response = await call(app, "", path, "POST", body);
      expect(response.status).toBe(400);
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
    }
    const rows = await database.db.select().from(matchJoin);
    expect(rows).toHaveLength(0);
  });

  it("締めた受付・期限を過ぎた受付・作り直した前の札は 404。作り直すと開く", async () => {
    const link = await issueJoin();
    const closed = await call(
      app,
      owner.cookie,
      `${MATCH_TABLES}/${table.id}/join-link/close`,
      "POST",
    );
    expect(closed.status).toBe(200);
    expect(((await closed.json()) as MatchJoinList).closedAt).not.toBeNull();
    const info = await call(app, "", `/api/v1/match/joins/${link.token}`);
    expect(info.status).toBe(404);
    expect(await codeOf(info)).toBe("MATCH_JOIN_NOT_FOUND");
    const post = await call(app, "", `/api/v1/match/joins/${link.token}`, "POST", {
      nickname: "石川",
      level: "novice",
    });
    expect(post.status).toBe(404);

    const reopened = await issueJoin();
    expect((await call(app, "", `/api/v1/match/joins/${link.token}`)).status).toBe(404);
    expect((await call(app, "", `/api/v1/match/joins/${reopened.token}`)).status).toBe(200);

    await database.db
      .update(matchTable)
      .set({ joinTokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(matchTable.id, table.id));
    expect((await call(app, "", `/api/v1/match/joins/${reopened.token}`)).status).toBe(404);
  });

  it(`1つの試合表に受け付けるのは${JOIN_MAX}人まで（超えると 409。消すとまた受ける）`, async () => {
    const link = await issueJoin();
    await database.db.insert(matchJoin).values(
      Array.from({ length: JOIN_MAX }, (_, index) => ({
        matchTableId: table.id,
        nickname: `人${index}`,
        level: "beginner" as const,
      })),
    );
    const path = `/api/v1/match/joins/${link.token}`;
    const full = await call(app, "", path, "POST", { nickname: "石川", level: "novice" });
    expect(full.status).toBe(409);
    expect(await codeOf(full)).toBe("MATCH_JOIN_FULL");

    const list = (await (
      await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}/joins`)
    ).json()) as MatchJoinList;
    const first = list.joins[0];
    if (!first) throw new Error("受付の行がありません");
    const removed = await call(
      app,
      owner.cookie,
      `${MATCH_TABLES}/${table.id}/joins/${first.id}`,
      "DELETE",
    );
    expect(removed.status).toBe(204);
    expect((await call(app, "", path, "POST", { nickname: "石川", level: "novice" })).status).toBe(
      201,
    );
    const again = await call(
      app,
      owner.cookie,
      `${MATCH_TABLES}/${table.id}/joins/${first.id}`,
      "DELETE",
    );
    expect(again.status).toBe(404);
  });

  it("同じ呼び名が、ほかの受付か名簿にあれば印を付ける（受付は止めない）", async () => {
    const link = await issueJoin();
    const path = `/api/v1/match/joins/${link.token}`;
    for (const nickname of ["石川", "石 川", "高橋", "森"]) {
      expect((await call(app, "", path, "POST", { nickname, level: "novice" })).status).toBe(201);
    }
    const list = (await (
      await call(app, owner.cookie, `${MATCH_TABLES}/${table.id}/joins`)
    ).json()) as MatchJoinList;
    expect(list.joins.map((join) => [join.nickname, join.duplicate])).toEqual([
      ["石川", true],
      ["石 川", true],
      ["高橋", true],
      ["森", false],
    ]);
  });

  it("上限の近くで同時に送っても、受け付けるのは上限まで（試合表の行を押さえてから数える）", async () => {
    const link = await issueJoin();
    await database.db.insert(matchJoin).values(
      Array.from({ length: JOIN_MAX - 2 }, (_, index) => ({
        matchTableId: table.id,
        nickname: `人${index}`,
        level: "beginner" as const,
      })),
    );
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        call(app, "", `/api/v1/match/joins/${link.token}`, "POST", {
          nickname: `同時${index}`,
          level: "novice",
        }),
      ),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 201, 409, 409, 409]);
    const rows = await database.db
      .select()
      .from(matchJoin)
      .where(eq(matchJoin.matchTableId, table.id));
    expect(rows).toHaveLength(JOIN_MAX);
  });

  it("ほかの試合表の受付の行は、自分の試合表の道からは消せない（404）", async () => {
    const other = await createTable(app, owner.cookie, { name: "ほかの試合表" });
    const otherLink = (await (
      await call(app, owner.cookie, `${MATCH_TABLES}/${other.id}/join-link`, "PUT")
    ).json()) as MatchLinkIssued;
    expect(
      (
        await call(app, "", `/api/v1/match/joins/${otherLink.token}`, "POST", {
          nickname: "石川",
          level: "novice",
        })
      ).status,
    ).toBe(201);
    const [row] = await database.db
      .select()
      .from(matchJoin)
      .where(eq(matchJoin.matchTableId, other.id));
    if (!row) throw new Error("受付の行がありません");
    const crossed = await call(
      app,
      owner.cookie,
      `${MATCH_TABLES}/${table.id}/joins/${row.id}`,
      "DELETE",
    );
    expect(crossed.status).toBe(404);
    expect(await database.db.select().from(matchJoin).where(eq(matchJoin.id, row.id))).toHaveLength(
      1,
    );
    const list = (await (
      await call(app, owner.cookie, `${MATCH_TABLES}/${other.id}/joins`)
    ).json()) as MatchJoinList;
    expect(list.hint).toBe(otherLink.hint);
  });

  it("アプリが見えない（台帳で「切」）ときは、ログインなしの道も 404", async () => {
    const view = await issueView();
    const join = await issueJoin();
    await upsertVisibility(database.db, "match", "off");
    expect((await call(app, "", `/api/v1/match/views/${view.token}`)).status).toBe(404);
    expect((await call(app, "", `/api/v1/match/joins/${join.token}`)).status).toBe(404);
  });
});
