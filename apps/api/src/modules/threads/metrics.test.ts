// 反応の分析（threads-003）の結合のテスト（本物の PostgreSQL・偽の Threads の API）：
// 24時間・3日・7日の取りこみと確定・過ぎた時点の補い（遅れて確定）・投稿が見つからない・権限がない・フォロワーの数（1日1回）・
// 判定（新しい30件の中央値の2倍以上で好調・0.5倍以下で低調。5件に足りなければしない）・反応の画面・改善のメモ（版）・
// 次のプロンプトに低調の投稿が入る・CSV の書き出し（threads-012：めぐると同じ列・ためたときの材料の版）・一覧の続き（50件ずつ）。
import "@hono/zod-openapi";
import { listApps } from "@workspace/contracts/core";
import { POST_CSV_HEADER, SNAPSHOT_CSV_HEADER } from "@workspace/contracts/threads";
import type {
  GeneratedPrompt,
  PerformanceItem,
  PerformanceView,
  ThreadsAccount,
} from "@workspace/contracts/threads";
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
const KEY_RING = JSON.stringify({ "1": btoa(String.fromCharCode(...new Uint8Array(32).fill(4))) });
const FAKE_BASE = "http://fake-threads.test";
const HOUR = 3600_000;

describe("反応の分析", () => {
  let fake: FakeThreads;
  let fakeNow = Date.now();
  let app: TestApp;
  let cookie: string;
  let accountId: string;
  let token: string;

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
    const created = (await (
      await call(app, cookie, BASE, "POST", { name: "運用" })
    ).json()) as ThreadsAccount;
    accountId = created.id;
    token = fake.issueToken({ userId: "9001" });
    expect(
      (await call(app, cookie, `${BASE}/${accountId}/connection`, "POST", { token })).status,
    ).toBe(200);
  });

  /**
   * 偽の Threads に投稿し、投稿済みの案を DB に入れる（publishedAt は過去の日時にできる）。
   * @param body 本文
   * @param publishedAt 投稿した日時
   * @param views 閲覧の数（偽の Threads の反応）
   * @returns 案の ID と投稿の ID
   */
  async function published(
    body: string,
    publishedAt: Date,
    views = 100,
  ): Promise<{ draftId: string; mediaId: string }> {
    const client = createThreadsClient(FAKE_BASE, fake.fetch);
    const { containerId } = await client.createTextContainer(token, "9001", body);
    const { mediaId } = await client.publishContainer(token, "9001", containerId);
    fake.setInsights(mediaId, { views, likes: 3, replies: 1, reposts: 0, quotes: 0, shares: 0 });
    const batchId = randomUUID();
    await database.pool.query(
      "INSERT INTO threads_draft_batch (id, threads_account_id, client_request_id, draft_count, delimiter_found) VALUES ($1, $2, $3, 1, false)",
      [batchId, accountId, randomUUID()],
    );
    const draftId = randomUUID();
    await database.pool.query(
      `INSERT INTO threads_post_draft (id, threads_account_id, batch_id, position, body, status, reviewed_at, published_at, threads_media_id, threads_permalink)
       VALUES ($1, $2, $3, 0, $4, 'published', $5, $5, $6, $7)`,
      [
        draftId,
        accountId,
        batchId,
        body,
        publishedAt,
        mediaId,
        `https://www.threads.com/@takumi_dev/post/${mediaId}`,
      ],
    );
    return { draftId, mediaId };
  }

  /**
   * 反応の画面を読む。
   * @param tab 絞りこみ
   * @returns 画面
   */
  async function view(tab = "all"): Promise<PerformanceView> {
    return (await (
      await call(app, cookie, `${BASE}/${accountId}/performance?tab=${tab}`)
    ).json()) as PerformanceView;
  }

  it("24時間・3日で途中の値を取りこみ、7日で確定する。取りこみは時点ごとに1回", async () => {
    const at = new Date(Date.now() - 2 * HOUR);
    const { draftId } = await published("反応を見る投稿", at, 50);
    await tick(new Date(at.getTime() + 24 * HOUR));
    let item = (await view()).items.find((entry) => entry.id === draftId);
    expect(item).toMatchObject({
      state: "updating",
      metrics: { views: 50, likes: 3 },
      lastElapsedHours: 24,
    });
    await tick(new Date(at.getTime() + 24 * HOUR + 5 * 60_000));
    fake.setInsights(
      (
        await database.pool.query<{ m: string }>(
          "SELECT threads_media_id AS m FROM threads_post_draft",
        )
      ).rows[0]?.m ?? "",
      { views: 80 },
    );
    await tick(new Date(at.getTime() + 72 * HOUR));
    await tick(new Date(at.getTime() + 168 * HOUR));
    item = (await view()).items.find((entry) => entry.id === draftId);
    expect(item).toMatchObject({ state: "confirmed", metrics: { views: 80 }, judgment: null });
    const snapshots = await database.pool.query<{ kind: string; method: string }>(
      "SELECT kind, method FROM threads_post_metric_snapshot ORDER BY fetched_at",
    );
    expect(snapshots.rows).toEqual([
      { kind: "h24", method: "slot" },
      { kind: "d3", method: "slot" },
      { kind: "d7", method: "slot" },
    ]);
  });

  it("次の時点がまだの古い投稿が多くても、新しい投稿の時点を取りこむ", async () => {
    const at = new Date(Date.now() - 2 * HOUR);
    // 48時間前に投稿し、24時間の時点はもう取った古い投稿（呼び出しの数の数倍）
    // 束は50件までなので、35件ずつの2つに分ける
    const batchIds = [randomUUID(), randomUUID()];
    for (const id of batchIds)
      await database.pool.query(
        "INSERT INTO threads_draft_batch (id, threads_account_id, client_request_id, draft_count, delimiter_found) VALUES ($1, $2, $3, 35, true)",
        [id, accountId, randomUUID()],
      );
    await database.pool.query(
      `WITH d AS (
         INSERT INTO threads_post_draft (threads_account_id, batch_id, position, body, status, reviewed_at, published_at, threads_media_id)
         SELECT $1, (ARRAY[$2::uuid, $5::uuid])[i / 35 + 1], i % 35, '古い投稿' || i, 'published', $3, $3, 'old-' || i
         FROM generate_series(0, 69) AS i
         RETURNING id
       )
       INSERT INTO threads_post_metric_snapshot (draft_id, threads_account_id, kind, method, fetched_at, elapsed_minutes, views)
       SELECT id, $1, 'h24', 'slot', $4, 1440, 10 FROM d`,
      [accountId, batchIds[0], new Date(at.getTime() - 24 * HOUR), at, batchIds[1]],
    );
    const { draftId } = await published("新しい投稿", at, 70);
    await tick(new Date(at.getTime() + 24 * HOUR));
    expect((await view()).items.find((entry) => entry.id === draftId)).toMatchObject({
      metrics: { views: 70 },
      lastElapsedHours: 24,
    });
  });

  it("過ぎた時点は補い、8日を過ぎていれば遅れて確定にする。投稿が見つからなければ計れない", async () => {
    const lateAt = new Date(Date.now() - 9 * 24 * HOUR);
    const late = await published("遅れた投稿", lateAt);
    const goneAt = new Date(Date.now() - 2 * 24 * HOUR);
    const gone = await published("消えた投稿", goneAt);
    await database.pool.query(
      "UPDATE threads_post_draft SET threads_media_id = '999', threads_permalink = NULL WHERE id = $1",
      [gone.draftId],
    );
    await tick(new Date());
    const { items } = await view();
    expect(items.find((entry) => entry.id === late.draftId)?.state).toBe("late_confirmed");
    expect(items.find((entry) => entry.id === gone.draftId)).toMatchObject({
      state: "unmeasurable",
      unmeasurableReason: "not_found",
    });
  });

  it("確定が5件以上あれば中央値で判定し、低調はメモと「次のプロンプトに入れる」を持つ。プロンプトに入る", async () => {
    const at = new Date(Date.now() - 168 * HOUR + 10 * 60_000);
    const viewsList = [100, 100, 100, 100, 250, 30];
    const posts = [];
    for (const [index, views] of viewsList.entries())
      posts.push(await published(`投稿${index}`, at, views));
    await tick(new Date());
    const all = await view();
    expect(all.summary).toMatchObject({ baseline: 100, baselineSampleCount: 6 });
    expect(all.summary.counts).toMatchObject({ all: 6, good: 1, normal: 4, poor: 1, pending: 0 });
    const poor = (await view("poor")).items[0] as PerformanceItem;
    expect(poor).toMatchObject({ body: "投稿5", judgment: "poor", ratio: 0.3 });
    expect(poor.feedback).toMatchObject({ includeInPrompt: true, inNextPrompt: true, version: 1 });

    const saved = await call(
      app,
      cookie,
      `${BASE}/${accountId}/performance/${poor.id}/feedback`,
      "PUT",
      {
        memo: "結論が遅い",
        includeInPrompt: true,
        version: 1,
      },
    );
    expect(((await saved.json()) as PerformanceItem).feedback).toMatchObject({
      memo: "結論が遅い",
      version: 2,
    });
    const stale = await call(
      app,
      cookie,
      `${BASE}/${accountId}/performance/${poor.id}/feedback`,
      "PUT",
      {
        memo: "古い",
        includeInPrompt: true,
        version: 1,
      },
    );
    expect(((await stale.json()) as ErrorBody).error.code).toBe("THREADS_VERSION_CONFLICT");
    const notPoor = await call(
      app,
      cookie,
      `${BASE}/${accountId}/performance/${posts[0]?.draftId}/feedback`,
      "PUT",
      {
        memo: null,
        includeInPrompt: true,
        version: 1,
      },
    );
    expect(notPoor.status).toBe(404);

    const prompt = (await (
      await call(app, cookie, `${BASE}/${accountId}/prompt`)
    ).json()) as GeneratedPrompt;
    expect(prompt.summary.poorPostCount).toBe(1);
    expect(prompt.prompt).toContain("結論が遅い");
    await call(app, cookie, `${BASE}/${accountId}/performance/${poor.id}/feedback`, "PUT", {
      memo: "結論が遅い",
      includeInPrompt: false,
      version: 2,
    });
    const without = (await (
      await call(app, cookie, `${BASE}/${accountId}/prompt`)
    ).json()) as GeneratedPrompt;
    expect(without.summary.poorPostCount).toBe(0);
  });

  it("確定が5件に足りなければ判定しない", async () => {
    const at = new Date(Date.now() - 168 * HOUR + 10 * 60_000);
    for (const index of [1, 2, 3]) await published(`少ない${index}`, at, 100);
    await tick(new Date());
    const all = await view();
    expect(all.summary.baseline).toBeNull();
    expect(all.items.every((item) => item.judgment === null)).toBe(true);
  });

  it("フォロワーの数は1日1回だけ記録し、反応を読む権限がなければ印を付けて問い合わせない", async () => {
    await published("最近の投稿", new Date(Date.now() - 2 * HOUR));
    fake.setFollowers("9001", 321);
    await tick(new Date());
    await tick(new Date(Date.now() + 5 * 60_000));
    const rows = await database.pool.query<{ followers_count: number }>(
      "SELECT followers_count FROM threads_follower_snapshot",
    );
    expect(rows.rows).toEqual([{ followers_count: 321 }]);

    const at = new Date(Date.now() - 2 * HOUR);
    await published("権限のない投稿", at);
    fake.failNext("insights", { status: 403, body: { error: { message: "denied", code: 10 } } });
    await tick(new Date(at.getTime() + 24 * HOUR));
    expect((await view()).summary.insightsDenied).toBe(true);
  });

  it("反応を CSV で書き出す（投稿ごと・取りこみごと。BOM つき）", async () => {
    const at = new Date(Date.now() - 2 * HOUR);
    await published("=SUM(A1)", at, 42);
    await tick(new Date(at.getTime() + 24 * HOUR));
    const posts = await call(app, cookie, `${BASE}/${accountId}/performance/export?kind=posts`);
    expect(posts.headers.get("content-type")).toContain("text/csv");
    expect(posts.headers.get("content-disposition")).toMatch(
      /threads-posts-\d{4}-\d{2}-\d{2}\.csv/,
    );
    const bytes = new Uint8Array(await posts.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    const [header, first] = text.replace(/^\uFEFF/, "").split("\r\n");
    expect(header?.split(",")).toEqual([...POST_CSV_HEADER]);
    expect(header?.split(",")).toHaveLength(37);
    expect(text).toContain("'=SUM(A1)");
    // 投稿した日時は日本時間の時差つき・文字数・閲覧（42）・24時間時点の閲覧・まとまりの中の順番（1から）
    const cells = first?.split(",") ?? [];
    expect(cells[1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
    expect(cells[5]).toBe("8");
    expect(cells[6]).toBe("42");
    expect(cells[17]).toBe("更新中");
    expect(cells[19]).toBe("42");
    expect(cells[26]).toBe("1");
    expect(cells[31]).toBe("いいえ");
    const snapshots = await (
      await call(app, cookie, `${BASE}/${accountId}/performance/export?kind=snapshots`)
    ).text();
    const [snapshotHeader] = snapshots.replace(/^\uFEFF/, "").split("\r\n");
    expect(snapshotHeader?.split(",")).toEqual([...SNAPSHOT_CSV_HEADER]);
    expect(snapshots).toContain("24時間時点");
    expect(snapshots).toContain("時刻の処理");
    expect(snapshots).toContain(",42,");
    const bad = await call(app, cookie, `${BASE}/${accountId}/performance/export?kind=other`);
    expect(bad.status).toBe(400);
  });

  it("ためたまとまりに、そのときの材料の版（戦略・宣伝・リサーチ・投稿のルール）を残し、CSV に出す", async () => {
    const strategyAt = new Date("2026-11-01T01:02:03Z");
    await database.pool.query(
      "INSERT INTO threads_strategy (threads_account_id, updated_at) VALUES ($1, $2)",
      [accountId, strategyAt],
    );
    await database.pool.query(
      "UPDATE threads_account SET promotions_changed_at = $2, research_changed_at = $3 WHERE id = $1",
      [accountId, new Date("2026-11-02T00:00:00Z"), new Date("2026-11-03T00:00:00Z")],
    );
    expect(
      (
        await call(app, cookie, `${BASE}/${accountId}/core-rules`, "PUT", {
          coreRules: "絵文字は使わない",
        })
      ).status,
    ).toBe(200);
    const created = await call(app, cookie, `${BASE}/${accountId}/draft-batches`, "POST", {
      clientRequestId: randomUUID(),
      text: "材料の版を残す案",
    });
    expect(created.status).toBe(201);
    const { batchId } = (await created.json()) as { batchId: string };
    const batch = await database.pool.query<{
      strategy_updated_at: Date;
      promotions_changed_at: Date;
      research_changed_at: Date;
      core_rules_changed_at: Date | null;
    }>(
      "SELECT strategy_updated_at, promotions_changed_at, research_changed_at, core_rules_changed_at FROM threads_draft_batch WHERE id = $1",
      [batchId],
    );
    const row = batch.rows[0];
    expect(row?.strategy_updated_at.toISOString()).toBe(strategyAt.toISOString());
    expect(row?.promotions_changed_at.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(row?.research_changed_at.toISOString()).toBe("2026-11-03T00:00:00.000Z");
    expect(row?.core_rules_changed_at).not.toBeNull();

    // 投稿済みにして CSV の最後の4列を見る（日本時間の時差つき）
    await database.pool.query(
      "UPDATE threads_post_draft SET status = 'published', reviewed_at = now(), published_at = now() WHERE batch_id = $1",
      [batchId],
    );
    const text = await (
      await call(app, cookie, `${BASE}/${accountId}/performance/export?kind=posts`)
    ).text();
    const cells =
      text
        .replace(/^\uFEFF/, "")
        .split("\r\n")[1]
        ?.split(",") ?? [];
    expect(cells.slice(33, 36)).toEqual([
      "2026-11-01T10:02:03+09:00",
      "2026-11-02T09:00:00+09:00",
      "2026-11-03T09:00:00+09:00",
    ]);
    expect(cells[36]).toMatch(/\+09:00$/);
  });

  it("一覧は50件ずつ。続きは nextCursor で読み、壊れた位置は 400", async () => {
    const batchId = randomUUID();
    await database.pool.query(
      "INSERT INTO threads_draft_batch (id, threads_account_id, client_request_id, draft_count, delimiter_found) VALUES ($1, $2, $3, 1, false)",
      [batchId, accountId, randomUUID()],
    );
    // 同じまとまりの中の順番は50まで（0〜49）なので、まとまりを分けて51件にする
    const second = randomUUID();
    await database.pool.query(
      "INSERT INTO threads_draft_batch (id, threads_account_id, client_request_id, draft_count, delimiter_found) VALUES ($1, $2, $3, 1, false)",
      [second, accountId, randomUUID()],
    );
    for (let i = 0; i < 51; i += 1) {
      await database.pool.query(
        `INSERT INTO threads_post_draft (threads_account_id, batch_id, position, body, status, reviewed_at, published_at)
         VALUES ($1, $2, $3, $4, 'published', now(), now() - ($5 || ' minutes')::interval)`,
        [accountId, i < 50 ? batchId : second, i % 50, `投稿${i}`, String(i)],
      );
    }
    const first = await view();
    expect(first.items).toHaveLength(50);
    expect(first.items[0]?.body).toBe("投稿0");
    expect(first.nextCursor).not.toBeNull();
    const rest = (await (
      await call(
        app,
        cookie,
        `${BASE}/${accountId}/performance?tab=all&before=${encodeURIComponent(first.nextCursor ?? "")}`,
      )
    ).json()) as PerformanceView;
    expect(rest.items.map((item) => item.body)).toEqual(["投稿50"]);
    expect(rest.nextCursor).toBeNull();
    const bad = await call(app, cookie, `${BASE}/${accountId}/performance?before=broken`);
    expect(bad.status).toBe(400);
  });

  it("ほかの人の運用アカウントの反応は 404", async () => {
    const other = (await loginAs(app, { displayName: "ほかの人" })).cookie;
    expect((await call(app, other, `${BASE}/${accountId}/performance`)).status).toBe(404);
  });
});
