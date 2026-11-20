// Threads への接続と自動投稿（threads-002）の結合のテスト（本物の PostgreSQL・偽の Threads の API。外へ出ない）：
// トークンを貼ってつなぐ（形・無効・短期・権限・続く失敗で待たせる・別のアカウント・ほかの運用アカウント・包んで持つ）・
// 確かめる・切る・投稿の設定（夜間の幅・間・オンにする前の確かめ・版）・定期の仕事（合言葉・公開・順・次に投稿する・
// 直前の NG ワード・やり直し・持ち越し・失敗・認証のエラー・上限・結果がわからない公開の照らし合わせ・トークンの確かめ直しと延長）・
// 自動投稿の状態と知らせ・投稿中の案は消せない。
import "@hono/zod-openapi";
import { listApps } from "@workspace/contracts/core";
import type {
  AutoPostStatus,
  Connection,
  ConnectResult,
  DraftBatchResult,
  DraftList,
  PostDraft,
  PostingScheduleSaved,
  PostingScheduleView,
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

/** 道の頭。 */
const BASE = "/api/v1/threads/accounts";

/** テストの鍵の束。 */
const KEY_RING = JSON.stringify({ "1": btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) });

/** テストの合言葉。 */
const JOB_SECRET = "s".repeat(40);

/** 偽の Threads の宛先（どこでもよい。偽の fetch は源を見ない）。 */
const FAKE_BASE = "http://fake-threads.test";

/**
 * 明日（日本時間）の時刻。
 * @param hour 時
 * @param minute 分
 * @returns 日時
 */
function tomorrowAt(hour: number, minute: number): Date {
  return new Date(
    jstMidnight(addDays(jstDateOf(new Date()), 1)).getTime() + (hour * 60 + minute) * 60_000,
  );
}

describe("Threads への接続と自動投稿", () => {
  let fake: FakeThreads;
  let fakeNow = Date.now();
  let app: TestApp;
  let cookie: string;

  /**
   * 定期の仕事の道具（API の組み立てと同じもの）。
   * @returns 道具
   */
  function jobDeps(): DomainRouteDeps {
    return {
      db: database.db,
      logger: createLogger({ level: "silent", pretty: false }),
      features: createDomainFeatures([]),
      config: { ...testConfig(), threadsApiBaseUrl: FAKE_BASE },
      fetch: fake.fetch,
      secretBox: createSecretBox(KEY_RING, 1),
      isJobRequest: createJobRequestCheck(JOB_SECRET),
      apps: listApps(),
    };
  }

  /**
   * 定期の仕事を1回行う。
   * @param now 基準の時刻
   * @returns 結果
   */
  function tick(now: Date) {
    fakeNow = now.getTime();
    return runJob(jobDeps(), createThreadsClient(FAKE_BASE, fake.fetch), now, () => now);
  }

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    fakeNow = Date.now();
    fake = createFakeThreads({ clock: () => fakeNow });
    fake.addUser({ id: "9001", username: "takumi_dev", name: "たくみ" });
    fake.addUser({ id: "9002", username: "other_user", name: "ほかの人" });
    app = buildApp(
      database,
      testConfig({
        tokenEncryption: { keyRing: KEY_RING, currentVersion: 1 },
        jobTriggerSecret: JOB_SECRET,
        threadsApiBaseUrl: FAKE_BASE,
      }),
      { features: createDomainFeatures([]), fetch: fake.fetch },
    );
    cookie = (await loginAs(app, { displayName: "たくみ" })).cookie;
  });

  /**
   * 運用アカウントを作る。
   * @param who クッキー
   * @returns 運用アカウント
   */
  async function createAccount(who = cookie): Promise<ThreadsAccount> {
    const response = await call(app, who, BASE, "POST", { name: "運用" });
    expect(response.status).toBe(201);
    return (await response.json()) as ThreadsAccount;
  }

  /**
   * トークンを貼る。
   * @param accountId 運用アカウントの ID
   * @param token トークン
   * @param who クッキー
   * @returns 応答
   */
  function connect(accountId: string, token: string, who = cookie): Promise<Response> {
    return call(app, who, `${BASE}/${accountId}/connection`, "POST", { token });
  }

  /**
   * つないだ運用アカウントを作る。
   * @returns 運用アカウントの ID とトークン
   */
  async function connectedAccount(): Promise<{ id: string; token: string }> {
    const { id } = await createAccount();
    const token = fake.issueToken({ userId: "9001" });
    expect((await connect(id, token)).status).toBe(200);
    return { id, token };
  }

  /**
   * 投稿の設定を保存する。
   * @param accountId 運用アカウントの ID
   * @param input 入力
   * @returns 応答
   */
  function saveSchedule(accountId: string, input: Record<string, unknown>): Promise<Response> {
    return call(app, cookie, `${BASE}/${accountId}/posting-schedule`, "PUT", {
      enabled: true,
      slotTimes: ["10:00"],
      jitter: false,
      version: 0,
      ...input,
    });
  }

  /**
   * 案をためて承認する。
   * @param accountId 運用アカウントの ID
   * @param bodies 本文
   * @returns 承認した案（貼った順）
   */
  async function approved(accountId: string, bodies: string[]): Promise<PostDraft[]> {
    const pasted = await call(app, cookie, `${BASE}/${accountId}/draft-batches`, "POST", {
      clientRequestId: randomUUID(),
      text: bodies.join("\n@@@\n"),
    });
    const { drafts } = (await pasted.json()) as DraftBatchResult;
    const response = await call(app, cookie, `${BASE}/${accountId}/drafts/review`, "POST", {
      action: "approve",
      items: drafts.map((draft) => ({ id: draft.id, version: draft.version })),
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { drafts: PostDraft[] }).drafts.sort(
      (a, b) => a.position - b.position,
    );
  }

  /**
   * 状態ごとの案を読む。
   * @param accountId 運用アカウントの ID
   * @param status 状態
   * @returns 一覧
   */
  async function drafts(accountId: string, status: string): Promise<DraftList> {
    return (await (
      await call(app, cookie, `${BASE}/${accountId}/drafts?status=${status}`)
    ).json()) as DraftList;
  }

  /**
   * エラーの code を読む。
   * @param response 応答
   * @returns code
   */
  async function codeOf(response: Response): Promise<string> {
    return ((await response.json()) as ErrorBody).error.code;
  }

  describe("接続", () => {
    it("はじめは未接続。トークンを貼るとつながり、トークンは包んで持つ（平文を DB に置かない）", async () => {
      const { id } = await createAccount();
      const before = (await (
        await call(app, cookie, `${BASE}/${id}/connection`)
      ).json()) as Connection;
      expect(before).toMatchObject({ status: "not_connected", username: null, expiresAt: null });

      const token = fake.issueToken({ userId: "9001" });
      const response = await connect(id, `  "${token}"\n`);
      expect(response.status).toBe(200);
      const result = (await response.json()) as ConnectResult;
      expect(result.kind).toBe("connect");
      expect(result.warnings).toEqual([]);
      expect(result.connection).toMatchObject({
        status: "connected",
        username: "takumi_dev",
        displayName: "たくみ",
      });
      expect(Date.parse(result.connection.expiresAt ?? "")).toBeGreaterThan(
        Date.now() + 59 * 86_400_000,
      );

      const stored = await database.pool.query<{ ciphertext: Buffer; key_version: number }>(
        "SELECT access_token_ciphertext AS ciphertext, key_version FROM threads_connection WHERE threads_account_id = $1",
        [id],
      );
      expect(stored.rows[0]?.key_version).toBe(1);
      expect(stored.rows[0]?.ciphertext.toString("utf8")).not.toContain(token);
      // 同じ Threads のアカウントで、つなぎ直せる
      const again = await connect(id, fake.issueToken({ userId: "9001" }));
      expect(((await again.json()) as ConnectResult).kind).toBe("reconnect");
    });

    it("鍵の設定がなければ 503（THREADS_CONNECTION_UNAVAILABLE）", async () => {
      const noKey = buildApp(database, testConfig({ threadsApiBaseUrl: FAKE_BASE }), {
        features: createDomainFeatures([]),
        fetch: fake.fetch,
      });
      const user = (await loginAs(noKey)).cookie;
      const created = (await (
        await call(noKey, user, BASE, "POST", { name: "運用" })
      ).json()) as ThreadsAccount;
      const response = await call(noKey, user, `${BASE}/${created.id}/connection`, "POST", {
        token: fake.issueToken({ userId: "9001" }),
      });
      expect(response.status).toBe(503);
      expect(await codeOf(response)).toBe("THREADS_CONNECTION_UNAVAILABLE");
    });

    it("形が違う・無効・短期のトークンは断り、10分に5回失敗すると待たせる（6回目は Threads に問い合わせない）", async () => {
      const { id } = await createAccount();
      const short = await connect(id, fake.issueToken({ userId: "9001", lifetime: "short" }));
      expect(short.status).toBe(400);
      expect(await codeOf(short)).toBe("THREADS_TOKEN_SHORT_LIVED");
      const bad = await connect(id, "短すぎる");
      expect(await codeOf(bad)).toBe("THREADS_TOKEN_INVALID");
      const invalid = fake.issueToken({ userId: "9001" });
      fake.invalidate(invalid);
      for (let index = 0; index < 3; index += 1) {
        expect(await codeOf(await connect(id, invalid))).toBe("THREADS_TOKEN_INVALID");
      }
      const meCalls = fake.calls().me ?? 0;
      const locked = await connect(id, fake.issueToken({ userId: "9001" }));
      expect(locked.status).toBe(429);
      expect(await codeOf(locked)).toBe("THREADS_TOKEN_CHECK_LOCKED");
      expect(fake.calls().me ?? 0).toBe(meCalls);
    });

    it("権限が足りなければ案内を返し、debug_token で調べられなければ60日とみなして2時間後に確かめ直す", async () => {
      const { id } = await createAccount();
      const response = await connect(
        id,
        fake.issueToken({
          userId: "9001",
          scopes: ["threads_basic", "threads_manage_insights"],
          noDebug: true,
        }),
      );
      const result = (await response.json()) as ConnectResult;
      expect(result.warnings).toEqual(["no_publish_permission"]);
      const recheck = await database.pool.query<{ recheck_at: Date | null }>(
        "SELECT recheck_at FROM threads_connection WHERE threads_account_id = $1",
        [id],
      );
      const recheckAt = recheck.rows[0]?.recheck_at;
      expect(recheckAt).toBeInstanceOf(Date);
      const summary = await tick(new Date((recheckAt?.getTime() ?? 0) + 60_000));
      expect(summary.rechecked).toBe(1);
      const after = await database.pool.query<{ recheck_at: Date | null }>(
        "SELECT recheck_at FROM threads_connection WHERE threads_account_id = $1",
        [id],
      );
      expect(after.rows[0]?.recheck_at).toBeNull();
    });

    it("つなぎ直しで別の Threads のアカウントは 409。ほかの運用アカウントがつないでいる Threads のアカウントも 409", async () => {
      const { id } = await connectedAccount();
      const mismatch = await connect(id, fake.issueToken({ userId: "9002" }));
      expect(await codeOf(mismatch)).toBe("THREADS_RECONNECT_MISMATCH");
      const someone = (await loginAs(app, { displayName: "ほかの人" })).cookie;
      const other = await createAccount(someone);
      const taken = await connect(other.id, fake.issueToken({ userId: "9001" }), someone);
      expect(taken.status).toBe(409);
      expect(await codeOf(taken)).toBe("THREADS_ACCOUNT_TAKEN");
      // ほかの人の運用アカウントの接続は 404
      expect((await call(app, someone, `${BASE}/${id}/connection`)).status).toBe(404);
    });

    it("確かめると、使えないトークンは「接続し直しが要る」になる。切ると未接続に戻り、トークンと自動投稿のオンが消える", async () => {
      const { id, token } = await connectedAccount();
      expect((await saveSchedule(id, {})).status).toBe(200);
      fake.invalidate(token);
      const checked = await call(app, cookie, `${BASE}/${id}/connection/check`, "POST");
      expect(((await checked.json()) as Connection).status).toBe("needs_reconnect");
      const status = (await (
        await call(app, cookie, `${BASE}/${id}/auto-post`)
      ).json()) as AutoPostStatus;
      expect(status.autoPost.stoppedReason).toBe("needs_reconnect");
      expect(status.notices).toContainEqual({ kind: "needs_reconnect" });

      const removed = await call(app, cookie, `${BASE}/${id}/connection`, "DELETE");
      expect(((await removed.json()) as Connection).status).toBe("not_connected");
      const rows = await database.pool.query(
        "SELECT 1 FROM threads_connection WHERE threads_account_id = $1",
        [id],
      );
      expect(rows.rowCount).toBe(0);
      const schedule = (await (
        await call(app, cookie, `${BASE}/${id}/posting-schedule`)
      ).json()) as PostingScheduleView;
      expect(schedule.schedule.enabled).toBe(false);
    });
  });

  describe("投稿の設定", () => {
    it("はじめは既定の値。夜間（8:30 より前・23:00 より後）の時刻・30分より近い時刻は欄のそばに誤り", async () => {
      const { id } = await createAccount();
      const view = (await (
        await call(app, cookie, `${BASE}/${id}/posting-schedule`)
      ).json()) as PostingScheduleView;
      expect(view.schedule).toEqual({ enabled: false, slotTimes: [], jitter: true, version: 0 });
      expect(view.limits).toMatchObject({ slots: 10, earliest: "08:30", latest: "23:00" });
      const night = await saveSchedule(id, { enabled: false, slotTimes: ["07:00", "12:00"] });
      expect(night.status).toBe(400);
      const body = (await night.json()) as ErrorBody;
      expect(body.error.fields?.[0]).toMatchObject({ path: "slotTimes" });
      expect(body.error.fields?.[0]?.message).toContain("07:00");
      const close = await saveSchedule(id, {
        enabled: false,
        slotTimes: ["12:00", "12:10"],
        jitter: true,
      });
      expect(((await close.json()) as ErrorBody).error.fields?.[0]?.message).toContain("30分");
    });

    it("未接続ではオンにできない（THREADS_NOT_READY）。つなぐとオンにでき、版が古ければ 409", async () => {
      const { id } = await createAccount();
      const off = await saveSchedule(id, {});
      expect(off.status).toBe(409);
      expect(await codeOf(off)).toBe("THREADS_NOT_READY");
      expect((await connect(id, fake.issueToken({ userId: "9001" }))).status).toBe(200);
      const saved = (await (
        await saveSchedule(id, { slotTimes: ["21:00", "09:00"] })
      ).json()) as PostingScheduleSaved;
      expect(saved.schedule).toEqual({
        enabled: true,
        slotTimes: ["09:00", "21:00"],
        jitter: false,
        version: 1,
      });
      expect(saved.connectionCheck?.status).toBe("ok");
      const stale = await saveSchedule(id, { version: 0 });
      expect(await codeOf(stale)).toBe("THREADS_VERSION_CONFLICT");
    });

    it("投稿の権限がなければオンにできない", async () => {
      const { id } = await createAccount();
      await connect(id, fake.issueToken({ userId: "9001", scopes: ["threads_basic"] }));
      expect(await codeOf(await saveSchedule(id, {}))).toBe("THREADS_NOT_READY");
    });
  });

  describe("定期の仕事", () => {
    it("合言葉がない・違えば 404、合えば結果を返す（Cloud Scheduler は JSON の本文 {} で呼ぶ）", async () => {
      /**
       * 定期の仕事の窓口を呼ぶ。
       * @param authorization 見出し
       * @returns 応答
       */
      const post = (authorization?: string) =>
        app.request("/api/v1/threads/jobs/tick", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(authorization ? { authorization } : {}),
          },
          body: "{}",
        });
      expect((await post()).status).toBe(404);
      expect((await post("Bearer nope")).status).toBe(404);
      const ok = await post(`Bearer ${JOB_SECRET}`);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ published: 0, failed: 0 });
    });

    it("時刻が来たら、投稿の順の先頭を投稿する（同じ時刻は二重にしない）。「次に投稿する」を付けた案が先", async () => {
      const { id } = await connectedAccount();
      await saveSchedule(id, { slotTimes: ["10:00", "15:00"] });
      const [first, second] = await approved(id, ["一つ目の案です", "二つ目の案です"]);
      if (!first || !second) throw new Error("案がありません");
      const prioritized = await call(
        app,
        cookie,
        `${BASE}/${id}/drafts/${second.id}/priority`,
        "PUT",
        {
          prioritized: true,
          version: second.version,
        },
      );
      expect(prioritized.status).toBe(200);

      const list = await drafts(id, "approved");
      expect(list.drafts.map((draft) => draft.body)).toEqual(["二つ目の案です", "一つ目の案です"]);
      expect(Object.keys(list.schedule)).toHaveLength(2);
      const status = (await (
        await call(app, cookie, `${BASE}/${id}/auto-post`)
      ).json()) as AutoPostStatus;
      expect(status.next?.draft.excerpt).toBe("二つ目の案です");
      expect(status.daysLeft).toBe(1);

      const summary = await tick(tomorrowAt(10, 3));
      expect(summary.published).toBe(1);
      expect(fake.posts().map((post) => post.text)).toEqual(["二つ目の案です"]);
      const published = await drafts(id, "published");
      expect(published.drafts[0]).toMatchObject({ body: "二つ目の案です", status: "published" });
      expect(published.drafts[0]?.threadsPermalink).toContain("takumi_dev");
      expect((await tick(tomorrowAt(10, 8))).published).toBe(0);
      expect(fake.posts()).toHaveLength(1);
      // 自動の投稿は操作の記録に残る（threads-005）
      const logged = await database.pool.query<{ action: string; summary: string }>(
        "SELECT action, summary FROM threads_activity_log WHERE kind = 'autopost'",
      );
      expect(logged.rows).toEqual([{ action: "auto_published", summary: "二つ目の案です" }]);
    });

    it("投稿の直前に NG ワードに当たった案は承認待ちに戻し、次の案を投稿して知らせる", async () => {
      const { id } = await connectedAccount();
      await saveSchedule(id, {});
      await approved(id, ["必ず儲かる話です", "ふつうの話です"]);
      await call(app, cookie, `${BASE}/${id}/ng-words`, "POST", { word: "必ず儲かる" });
      const summary = await tick(tomorrowAt(10, 1));
      expect(summary).toMatchObject({ published: 1, blocked: 1 });
      const review = await drafts(id, "needs_review");
      expect(review.drafts[0]).toMatchObject({
        blockedReason: "ng_word",
        blockedWords: ["必ず儲かる"],
      });
      const status = (await (
        await call(app, cookie, `${BASE}/${id}/auto-post`)
      ).json()) as AutoPostStatus;
      expect(status.notices).toContainEqual({
        kind: "blocked",
        count: 1,
        latestReason: "ng_word",
        latestWords: ["必ず儲かる"],
      });
      // 戻した日時を今より前にしてから閉じる（テストは明日の時刻で定期の仕事を動かしている）
      await database.pool.query(
        "UPDATE threads_post_draft SET blocked_at = now() - interval '1 minute' WHERE blocked_at IS NOT NULL",
      );
      await call(app, cookie, `${BASE}/${id}/auto-post/blocked-notice-seen`, "POST");
      const seen = (await (
        await call(app, cookie, `${BASE}/${id}/auto-post`)
      ).json()) as AutoPostStatus;
      expect(seen.notices.some((notice) => notice.kind === "blocked")).toBe(false);
    });

    it("一時的な失敗は5分後にやり直す。3回失敗したら次の時刻に持ち越し、それも失敗したら「投稿に失敗」", async () => {
      const { id } = await connectedAccount();
      await saveSchedule(id, { slotTimes: ["10:00", "12:00"] });
      const [draft] = await approved(id, ["失敗する案です"]);
      fake.failNext("create", { status: 500, body: { error: { message: "x", code: 2 } } }, 8);
      expect((await tick(tomorrowAt(10, 1))).retried).toBe(1);
      expect((await tick(tomorrowAt(10, 7))).retried).toBe(1);
      expect((await tick(tomorrowAt(10, 18))).retried).toBe(1);
      expect((await tick(tomorrowAt(10, 34))).carriedOver).toBe(1);
      const carried = await drafts(id, "approved");
      expect(carried.drafts[0]).toMatchObject({ id: draft?.id, carryover: true });
      // 次の時刻：もう一度試し、やり直しを使い切ると「投稿に失敗」
      await tick(tomorrowAt(12, 1));
      await tick(tomorrowAt(12, 7));
      await tick(tomorrowAt(12, 18));
      expect((await tick(tomorrowAt(12, 34))).failed).toBe(1);
      const failed = await drafts(id, "publish_failed");
      expect(failed.drafts[0]).toMatchObject({ id: draft?.id, publishError: "threads_server" });
      const status = (await (
        await call(app, cookie, `${BASE}/${id}/auto-post`)
      ).json()) as AutoPostStatus;
      expect(status.notices).toContainEqual(
        expect.objectContaining({ kind: "publish_failed", count: 1 }),
      );
      // 投稿に失敗した案は、承認し直して投稿の順に戻せる
      const current = failed.drafts[0];
      const again = await call(app, cookie, `${BASE}/${id}/drafts/review`, "POST", {
        action: "approve",
        items: [{ id: current?.id, version: current?.version }],
      });
      expect(again.status).toBe(200);
    });

    it("やり直しの間に自動投稿を切ったら投稿しない。NG ワードを足したら承認待ちに戻す", async () => {
      const { id } = await connectedAccount();
      await saveSchedule(id, { slotTimes: ["10:00", "12:00"] });
      const [draft] = await approved(id, ["やり直しになる案です"]);
      fake.failNext("create", { status: 500, body: { error: { message: "x", code: 2 } } });
      expect((await tick(tomorrowAt(10, 1))).retried).toBe(1);
      expect(
        (await saveSchedule(id, { enabled: false, slotTimes: ["10:00", "12:00"], version: 1 }))
          .status,
      ).toBe(200);
      expect((await tick(tomorrowAt(10, 7))).published).toBe(0);
      expect(fake.posts()).toHaveLength(0);
      expect((await drafts(id, "approved")).drafts[0]).toMatchObject({ id: draft?.id });

      // 入に戻して、もう一度やり直しにしてから NG ワードを足す
      expect((await saveSchedule(id, { slotTimes: ["10:00", "12:00"], version: 2 })).status).toBe(
        200,
      );
      fake.failNext("create", { status: 500, body: { error: { message: "x", code: 2 } } });
      expect((await tick(tomorrowAt(12, 1))).retried).toBe(1);
      await call(app, cookie, `${BASE}/${id}/ng-words`, "POST", { word: "やり直し" });
      expect((await tick(tomorrowAt(12, 7))).blocked).toBe(1);
      expect(fake.posts()).toHaveLength(0);
      expect((await drafts(id, "needs_review")).drafts[0]).toMatchObject({
        id: draft?.id,
        blockedReason: "ng_word",
        blockedWords: ["やり直し"],
      });
    });

    it("認証のエラーは「接続し直しが要る」にして案を承認済みに戻し、上限は次の日の0時まで止める", async () => {
      const { id, token } = await connectedAccount();
      await saveSchedule(id, { slotTimes: ["10:00", "14:00"] });
      await approved(id, ["上限に当たる案です"]);
      fake.failNext("create", { status: 400, body: { error: { message: "limit", code: 4 } } });
      expect((await tick(tomorrowAt(10, 1))).skipped).toBe(1);
      const status = (await (
        await call(app, cookie, `${BASE}/${id}/auto-post`)
      ).json()) as AutoPostStatus;
      expect(status.autoPost.stoppedReason).toBe("rate_limited");
      expect((await drafts(id, "approved")).drafts).toHaveLength(1);

      await database.pool.query("UPDATE threads_posting_schedule SET paused_until = NULL");
      fake.invalidate(token);
      expect((await tick(tomorrowAt(14, 1))).skipped).toBe(1);
      const connection = (await (
        await call(app, cookie, `${BASE}/${id}/connection`)
      ).json()) as Connection;
      expect(connection.status).toBe("needs_reconnect");
      expect((await drafts(id, "approved")).drafts[0]?.status).toBe("approved");
    });

    it("公開の答えを失っても二重に投稿せず、次の回に投稿の一覧と照らし合わせて投稿済みにする。投稿中の案は消せない", async () => {
      const { id } = await connectedAccount();
      await saveSchedule(id, {});
      const [draft] = await approved(id, ["答えを失う案です"]);
      fake.dropNextPublishResponse();
      expect((await tick(tomorrowAt(10, 1))).waiting).toBe(1);
      expect((await drafts(id, "approved")).drafts[0]?.status).toBe("publishing");
      const removing = await call(app, cookie, `${BASE}/${id}/drafts/${draft?.id}`, "DELETE");
      expect(await codeOf(removing)).toBe("THREADS_PUBLISHING");
      expect(await codeOf(await call(app, cookie, `${BASE}/${id}/connection`, "DELETE"))).toBe(
        "THREADS_PUBLISHING",
      );
      const summary = await tick(tomorrowAt(10, 10));
      expect(summary.published).toBe(1);
      expect(fake.posts()).toHaveLength(1);
      expect((await drafts(id, "published")).drafts[0]?.id).toBe(draft?.id);
    });

    it("期限まで7日を切ったトークンは延ばし（包み直す）、期限を過ぎたものは「接続し直しが要る」にする", async () => {
      const { id } = await connectedAccount();
      const before = await database.pool.query<{ ciphertext: Buffer }>(
        "SELECT access_token_ciphertext AS ciphertext FROM threads_connection WHERE threads_account_id = $1",
        [id],
      );
      await database.pool.query(
        "UPDATE threads_connection SET expires_at = now() + interval '3 days', issued_at = now() - interval '57 days'",
      );
      expect((await tick(new Date())).refreshed).toBe(1);
      const after = await database.pool.query<{ ciphertext: Buffer; expires_at: Date }>(
        "SELECT access_token_ciphertext AS ciphertext, expires_at FROM threads_connection WHERE threads_account_id = $1",
        [id],
      );
      expect(after.rows[0]?.ciphertext.equals(before.rows[0]?.ciphertext ?? Buffer.alloc(0))).toBe(
        false,
      );
      expect(after.rows[0]?.expires_at.getTime()).toBeGreaterThan(Date.now() + 50 * 86_400_000);

      await database.pool.query(
        "UPDATE threads_connection SET expires_at = now() - interval '1 minute'",
      );
      await tick(new Date());
      const connection = (await (
        await call(app, cookie, `${BASE}/${id}/connection`)
      ).json()) as Connection;
      expect(connection.status).toBe("needs_reconnect");
    });
  });
});
