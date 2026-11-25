// 時間差のメンション（threads-007）の結合のテスト（本物の PostgreSQL・偽の Threads の API。外へ出ない）：
// 設定（ひとこと・時間差・NG ワード・版）・メンションする人（形・自分・同じ人・いつも付ける）・案に付ける（文・今は選べない人）・
// 承認（返信の文の NG ワード）・投稿の時間差のあとに返信する（返信先・済み・URL）・却下で消える・投稿済みの投稿にあとから返信する・
// 人を消すと承認待ちに戻る・時間を過ぎた・返信の権限がない・外す。
import "@hono/zod-openapi";
import { listApps } from "@workspace/contracts/core";
import type {
  ActivityEntry,
  DraftBatchResult,
  DraftList,
  MentionBulkResult,
  MentionSettings,
  PostDraft,
  ReviewResult,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import { addDays, jstDateOf, jstMidnight } from "@workspace/contracts/threads";
import { createSecretBox } from "@workspace/secret-box";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { createDomainFeatures } from "../../kernel/features.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { createJobRequestCheck } from "../../kernel/job-auth.ts";
import { createLogger } from "../../kernel/logger.ts";
import { createFakeThreads } from "./fake-threads.ts";
import type { FakeThreads } from "./fake-threads.ts";
import { runJob } from "./job-runner.ts";
import { createThreadsClient } from "./threads-client.ts";

const database = useTestDatabase();
const BASE = "/api/v1/threads/accounts";
const KEY_RING = JSON.stringify({ "1": btoa(String.fromCharCode(...new Uint8Array(32).fill(5))) });
const FAKE_BASE = "http://fake-threads.test";
const MINUTE = 60_000;

/**
 * 明日（日本時間）の時刻。
 * @param hour 時
 * @param minute 分
 * @returns 日時
 */
function tomorrowAt(hour: number, minute: number): Date {
  return new Date(
    jstMidnight(addDays(jstDateOf(new Date()), 1)).getTime() + (hour * 60 + minute) * MINUTE,
  );
}

describe("時間差のメンション", () => {
  let fake: FakeThreads;
  let fakeNow = Date.now();
  let app: TestApp;
  let cookie: string;
  let accountId: string;

  /**
   * 定期の仕事を1回行う。
   * @param now 基準の時刻
   * @returns 結果
   */
  function tick(now: Date) {
    fakeNow = now.getTime();
    const deps: DomainRouteDeps = {
      db: database.db,
      logger: createLogger({ level: "silent", pretty: false }),
      features: createDomainFeatures([]),
      config: { ...testConfig(), threadsApiBaseUrl: FAKE_BASE },
      fetch: fake.fetch,
      secretBox: createSecretBox(KEY_RING, 1),
      isJobRequest: createJobRequestCheck(undefined),
      apps: listApps(),
    };
    return runJob(deps, createThreadsClient(FAKE_BASE, fake.fetch), now, () => now);
  }

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    fakeNow = Date.now();
    fake = createFakeThreads({ clock: () => fakeNow });
    fake.addUser({ id: "9001", username: "takumi_dev", name: "たくみ" });
    app = buildApp(
      database,
      testConfig({
        tokenEncryption: { keyRing: KEY_RING, currentVersion: 1 },
        threadsApiBaseUrl: FAKE_BASE,
      }),
      { features: createDomainFeatures([]), fetch: fake.fetch },
    );
    cookie = (await loginAs(app)).cookie;
    accountId = (
      (await (await call(app, cookie, BASE, "POST", { name: "運用" })).json()) as ThreadsAccount
    ).id;
    const token = fake.issueToken({ userId: "9001" });
    expect(
      (await call(app, cookie, `${BASE}/${accountId}/connection`, "POST", { token })).status,
    ).toBe(200);
  });

  /**
   * 窓口を呼ぶ（道の頭は運用アカウント）。
   * @param path 運用アカウントのあとの道
   * @param method 動き
   * @param payload 本文
   * @returns 応答
   */
  function api(path: string, method = "GET", payload?: unknown): Promise<Response> {
    return call(app, cookie, `${BASE}/${accountId}${path}`, method, payload);
  }

  /**
   * エラーの code を読む。
   * @param response 応答
   * @returns code
   */
  async function codeOf(response: Response): Promise<string> {
    return ((await response.json()) as ErrorBody).error.code;
  }

  /**
   * ひとこと・時間差と2人（minato_place はいつも付ける）を入れる。
   */
  async function setUp(): Promise<void> {
    expect(
      (
        await api("/mention-settings", "PUT", {
          message: "よければシェアお願いします",
          delayMinutes: 30,
          version: 0,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api("/mention-people", "POST", {
          username: "@Minato_Place",
          label: "港の運営",
          always: true,
        })
      ).status,
    ).toBe(201);
    expect(
      (await api("/mention-people", "POST", { username: "taro.events", label: "太郎" })).status,
    ).toBe(201);
  }

  /**
   * 案をためる。
   * @param bodies 本文
   * @returns 案（貼った順）
   */
  async function paste(bodies: string[]): Promise<PostDraft[]> {
    const response = await api("/draft-batches", "POST", {
      clientRequestId: randomUUID(),
      text: bodies.join("\n@@@\n"),
    });
    return ((await response.json()) as DraftBatchResult).drafts;
  }

  /**
   * 承認する・却下する。
   * @param action 操作
   * @param drafts 案
   * @returns 応答
   */
  function review(action: "approve" | "reject", drafts: PostDraft[]): Promise<Response> {
    return api("/drafts/review", "POST", {
      action,
      items: drafts.map((draft) => ({ id: draft.id, version: draft.version })),
      ...(action === "reject" ? { reasons: ["thin"] } : {}),
    });
  }

  /**
   * 状態ごとの案を読む。
   * @param status 状態
   * @returns 案
   */
  async function list(status: string): Promise<PostDraft[]> {
    return ((await (await api(`/drafts?status=${status}`)).json()) as DraftList).drafts;
  }

  it("設定：初めの値・NG ワードのひとことは断る・人の形と自分と同じ人を断る", async () => {
    let settings = (await (await api("/mention-settings")).json()) as MentionSettings;
    expect(settings).toMatchObject({ message: "", delayMinutes: 30, version: 0, people: [] });
    await api("/ng-words", "POST", { words: ["拡散希望"] });
    let response = await api("/mention-settings", "PUT", {
      message: "拡散希望です",
      delayMinutes: 60,
      version: 0,
    });
    expect(response.status).toBe(400);
    response = await api("/mention-settings", "PUT", {
      message: "ぜひ",
      delayMinutes: 45,
      version: 0,
    });
    expect(response.status).toBe(400);
    await setUp();
    response = await api("/mention-settings", "PUT", {
      message: "a",
      delayMinutes: 60,
      version: 0,
    });
    expect(await codeOf(response)).toBe("THREADS_VERSION_CONFLICT");
    for (const username of ["あいう", "takumi_dev", "minato_place"]) {
      response = await api("/mention-people", "POST", { username, label: "x" });
      expect(response.status, username).toBe(400);
    }
    settings = (await (await api("/mention-settings")).json()) as MentionSettings;
    expect(settings.people.map((person) => [person.username, person.always])).toEqual([
      ["minato_place", true],
      ["taro.events", false],
    ]);
    const taro = settings.people[1];
    response = await api(`/mention-people/${taro?.id ?? ""}`, "PUT", {
      label: "太郎さん",
      always: true,
    });
    expect(((await response.json()) as MentionSettings).people[1]).toMatchObject({
      label: "太郎さん",
      always: true,
    });
    const activity = (await (await api("/activity?kind=settings")).json()) as {
      items: ActivityEntry[];
    };
    expect(activity.items.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "mention_settings_saved",
        "mention_person_added",
        "mention_person_updated",
      ]),
    );
  });

  it("承認した案に付けたメンションを、投稿の30分後に返信で出す。同じ人はほかの案に付けられない", async () => {
    await setUp();
    const [first, second] = await paste(["イベントのお知らせ", "別の投稿"]);
    if (!first || !second) throw new Error("案がない");
    let response = await api(`/drafts/${first.id}/mention`, "PUT", {
      version: first.version,
      usernames: ["minato_place"],
    });
    expect(response.status).toBe(200);
    const attached = (await response.json()) as PostDraft;
    expect(attached.mention).toMatchObject({
      usernames: ["minato_place"],
      text: "よければシェアお願いします\n@minato_place",
      delayMinutes: 30,
      state: "pending",
      dueAt: null,
    });
    // 同じ人は、ほかの案の予定に入っていると選べない
    response = await api(`/drafts/${second.id}/mention`, "PUT", {
      version: second.version,
      usernames: ["minato_place"],
    });
    expect(await codeOf(response)).toBe("THREADS_MENTION_BLOCKED");
    // 一覧にない人は選べない
    response = await api(`/drafts/${second.id}/mention`, "PUT", {
      version: second.version,
      usernames: ["nobody"],
    });
    expect(response.status).toBe(400);

    expect((await review("approve", [attached])).status).toBe(200);
    expect(
      (
        await api("/posting-schedule", "PUT", {
          enabled: true,
          slotTimes: ["10:00"],
          jitter: false,
          version: 0,
        })
      ).status,
    ).toBe(200);
    await tick(tomorrowAt(10, 0));
    const post = fake.posts().find((item) => item.text === "イベントのお知らせ");
    expect(post).toBeDefined();
    // 30分たつまでは出さない
    expect((await tick(tomorrowAt(10, 20))).mentions).toBe(0);
    expect((await tick(tomorrowAt(10, 31))).mentions).toBe(1);
    const reply = fake.posts().find((item) => item.replyToId === post?.id);
    expect(reply?.text).toBe("よければシェアお願いします\n@minato_place");
    const published = (await list("published")).find((draft) => draft.id === first.id);
    expect(published?.mention).toMatchObject({ state: "sent" });
    expect(published?.mention?.replyPermalink).toContain(
      "https://www.threads.com/@takumi_dev/post/",
    );
    // 同じ回にもう一度出さない
    expect((await tick(tomorrowAt(10, 40))).mentions).toBe(0);
    expect(fake.posts().filter((item) => item.replyToId === post?.id)).toHaveLength(1);
  });

  it("公開の要求が届かずコンテナーが公開されないまま（FINISHED）なら、やり直しの中で出し直す", async () => {
    await setUp();
    const [first] = await paste(["やり直しのお知らせ"]);
    if (!first) throw new Error("案がない");
    const attached = (await (
      await api(`/drafts/${first.id}/mention`, "PUT", {
        version: first.version,
        usernames: ["minato_place"],
      })
    ).json()) as PostDraft;
    expect((await review("approve", [attached])).status).toBe(200);
    await api("/posting-schedule", "PUT", {
      enabled: true,
      slotTimes: ["10:00"],
      jitter: false,
      version: 0,
    });
    await tick(tomorrowAt(10, 0));
    const post = fake.posts().find((item) => item.text === "やり直しのお知らせ");
    expect(post).toBeDefined();
    // 返信の公開が 500（結果がわからない）→ 次の回は FINISHED（公開されていない）→ やり直しの時刻に出す
    fake.failNext("publish", { status: 500, body: { error: { message: "x", code: 2 } } });
    expect((await tick(tomorrowAt(10, 31))).mentions).toBe(0);
    expect((await tick(tomorrowAt(10, 36))).mentions).toBe(0);
    expect((await tick(tomorrowAt(10, 45))).mentions).toBe(1);
    expect(fake.posts().filter((item) => item.replyToId === post?.id)).toHaveLength(1);
  });

  it("返信の文に NG ワードがあると承認できない。承認済みに付けると承認し直し。却下すると消える。外せる", async () => {
    await setUp();
    const [draft] = await paste(["お知らせ"]);
    if (!draft) throw new Error("案がない");
    let response = await api(`/drafts/${draft.id}/mention`, "PUT", {
      version: draft.version,
      usernames: ["minato_place"],
      text: "ぜひ拡散して @minato_place",
    });
    let current = (await response.json()) as PostDraft;
    await api("/ng-words", "POST", { words: ["拡散"] });
    response = await review("approve", [current]);
    expect(((await response.json()) as ReviewResult).skipped).toEqual([
      { id: draft.id, reason: "NG_WORD" },
    ]);

    // 文を直して承認 → 承認済みに付け直すと承認待ちに戻る
    response = await api(`/drafts/${draft.id}/mention`, "PUT", {
      version: current.version,
      usernames: ["minato_place"],
      text: "よろしく @minato_place @taro.events",
    });
    current = (await response.json()) as PostDraft;
    expect(current.mention?.usernames).toEqual(["minato_place", "taro.events"]);
    current = ((await (await review("approve", [current])).json()) as { drafts: PostDraft[] })
      .drafts[0] as PostDraft;
    expect(current.status).toBe("approved");
    response = await api(`/drafts/${draft.id}/mention`, "PUT", {
      version: current.version,
      usernames: ["minato_place"],
    });
    current = (await response.json()) as PostDraft;
    expect(current.status).toBe("needs_review");

    // 外す → 付け直して却下 → 消える
    response = await api(`/drafts/${draft.id}/mention`, "DELETE");
    current = (await response.json()) as PostDraft;
    expect(current.mention).toBeNull();
    response = await api(`/drafts/${draft.id}/mention`, "PUT", {
      version: current.version,
      usernames: ["minato_place"],
    });
    current = (await response.json()) as PostDraft;
    expect((await review("reject", [current])).status).toBe(200);
    const rejected = (await list("rejected")).find((item) => item.id === draft.id);
    expect(rejected?.mention).toBeNull();
  });

  it("人を消すと、承認済みの案は文からその人を外して承認待ちに戻る", async () => {
    await setUp();
    const [draft] = await paste(["お知らせ"]);
    if (!draft) throw new Error("案がない");
    const current = (await (
      await api(`/drafts/${draft.id}/mention`, "PUT", {
        version: draft.version,
        usernames: ["minato_place", "taro.events"],
      })
    ).json()) as PostDraft;
    const approved = (
      (await (await review("approve", [current])).json()) as { drafts: PostDraft[] }
    ).drafts[0];
    expect(approved?.status).toBe("approved");
    const settings = (await (await api("/mention-settings")).json()) as MentionSettings;
    expect(settings.people.find((person) => person.username === "taro.events")?.pendingCount).toBe(
      1,
    );
    const taro = settings.people.find((person) => person.username === "taro.events");
    expect((await api(`/mention-people/${taro?.id ?? ""}`, "DELETE")).status).toBe(200);
    const reopened = (await list("needs_review")).find((item) => item.id === draft.id);
    expect(reopened?.mention).toMatchObject({
      usernames: ["minato_place"],
      text: "よければシェアお願いします\n@minato_place",
    });
  });

  it("投稿済みの投稿にあとから返信する（7日以内・1つだけ）。時間を過ぎた・権限がないときは出さない", async () => {
    await setUp();
    // 自動投稿で投稿する
    const [draft, other] = await paste(["今日の投稿", "もう1つの投稿"]);
    if (!draft || !other) throw new Error("案がない");
    await review("approve", [draft, other]);
    await api("/posting-schedule", "PUT", {
      enabled: true,
      slotTimes: ["10:00", "11:00"],
      jitter: false,
      version: 0,
    });
    await tick(tomorrowAt(10, 0));
    await tick(tomorrowAt(11, 0));
    const published = await list("published");
    expect(published).toHaveLength(2);
    const target = published.find((item) => item.body === "今日の投稿") as PostDraft;
    // 今の時刻（本当の時刻）で押すので、偽の時計も合わせる
    fakeNow = Date.now();
    await database.pool.query(
      "UPDATE threads_post_draft SET published_at = now() - interval '1 hour' WHERE threads_account_id = $1",
      [accountId],
    );
    let response = await api(`/drafts/${target.id}/mention`, "PUT", {
      version: target.version,
      usernames: ["taro.events"],
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as PostDraft).mention).toMatchObject({
      delayMinutes: null,
      state: "pending",
    });
    // 1つの投稿に1つまで
    response = await api(`/drafts/${target.id}/mention`, "PUT", {
      version: target.version,
      usernames: ["minato_place"],
    });
    expect(await codeOf(response)).toBe("THREADS_MENTION_NOT_ALLOWED");
    expect((await tick(new Date(Date.now() + MINUTE))).mentions).toBe(1);

    // 返信の権限がない（Threads が 403）→ 出せなかった・返信の権限がない印
    const second = published.find((item) => item.body === "もう1つの投稿") as PostDraft;
    response = await api(`/drafts/${second.id}/mention`, "PUT", {
      version: second.version,
      usernames: ["minato_place"],
    });
    expect(response.status).toBe(200);
    fake.failNext("create", { status: 403, body: { error: { message: "denied", code: 10 } } });
    await tick(new Date(Date.now() + MINUTE));
    const after = (await list("published")).find((item) => item.id === second.id);
    expect(after?.mention).toMatchObject({ state: "failed", failureReason: "no_permission" });
    expect(((await (await api("/mention-settings")).json()) as MentionSettings).repliesDenied).toBe(
      true,
    );

    // 7日を過ぎた投稿には付けられない
    await database.pool.query(
      "UPDATE threads_post_draft SET published_at = now() - interval '8 days' WHERE id = $1",
      [second.id],
    );
    await database.pool.query("DELETE FROM threads_post_mention WHERE draft_id = $1", [second.id]);
    await database.pool.query("UPDATE threads_account SET replies_denied_at = NULL");
    response = await api(`/drafts/${second.id}/mention`, "PUT", {
      version: second.version,
      usernames: ["minato_place"],
    });
    expect(await codeOf(response)).toBe("THREADS_MENTION_NOT_ALLOWED");

    // 返信の時刻から24時間を過ぎた予定は出さない（夜間の停止のあとでも24時間以内なら出す）
    await database.pool.query(
      `INSERT INTO threads_post_mention (draft_id, threads_account_id, usernames, text, delay_minutes)
       VALUES ($1, $2, ARRAY['minato_place'], '@minato_place', 30)`,
      [second.id, accountId],
    );
    await tick(new Date(Date.now() + MINUTE));
    const expired = (await list("published")).find((item) => item.id === second.id);
    expect(expired?.mention).toMatchObject({ state: "failed", failureReason: "expired" });
  });

  it("ほかの人の運用アカウントは 404", async () => {
    const other = (await loginAs(app, { lineUserId: `U${"8".repeat(32)}` })).cookie;
    expect((await call(app, other, `${BASE}/${accountId}/mention-settings`)).status).toBe(404);
  });

  it("選んだ承認待ちの案に、「いつも付ける」の人でまとめて付ける。付けられない案は理由を返す（threads-011）", async () => {
    await setUp();
    const [first, second, third] = await paste(["一つ目", "二つ目", "三つ目"]);
    if (!first || !second || !third) throw new Error("案がない");
    const response = await api("/drafts/mentions", "POST", {
      items: [
        { id: first.id, version: first.version },
        { id: second.id, version: second.version },
        { id: third.id, version: third.version + 3 },
      ],
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as MentionBulkResult;
    // 1つ目に付けると、minato_place はほかの案の予定に入るので、2つ目には付けられない
    expect(result.drafts.map((draft) => [draft.id, draft.mention?.usernames])).toEqual([
      [first.id, ["minato_place"]],
    ]);
    expect(result.skipped).toEqual([
      { id: second.id, reason: "NO_PEOPLE" },
      { id: third.id, reason: "STALE" },
    ]);
    const logged = (await (await api("/activity")).json()) as { items: ActivityEntry[] };
    expect(logged.items[0]).toMatchObject({ action: "mentions_attached", itemCount: 1 });
  });

  it("投稿に失敗したら、まだ出していないメンションは「投稿されませんでした」にする（threads-011）", async () => {
    await setUp();
    const [draft] = await paste(["失敗するお知らせ"]);
    if (!draft) throw new Error("案がない");
    const attached = (await (
      await api(`/drafts/${draft.id}/mention`, "PUT", {
        version: draft.version,
        usernames: ["minato_place"],
      })
    ).json()) as PostDraft;
    expect((await review("approve", [attached])).status).toBe(200);
    expect(
      (
        await api("/posting-schedule", "PUT", {
          enabled: true,
          slotTimes: ["10:00"],
          jitter: false,
          version: 0,
        })
      ).status,
    ).toBe(200);
    // Threads が受け付けない（やり直さない失敗）
    fake.failNext("create", { status: 400, body: { error: { message: "bad", code: 100 } } });
    expect((await tick(tomorrowAt(10, 1))).failed).toBe(1);
    const failed = (await list("publish_failed")).find((item) => item.id === draft.id);
    expect(failed?.mention).toMatchObject({ state: "failed", failureReason: "post_failed" });
    // 予定に入っていないので、その人をほかの案で選べる
    const [other] = await paste(["ほかのお知らせ"]);
    if (!other) throw new Error("案がない");
    const response = await api(`/drafts/${other.id}/mention`, "PUT", {
      version: other.version,
      usernames: ["minato_place"],
    });
    expect(response.status).toBe(200);
  });
});
