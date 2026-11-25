// アルゴリズムの分析（threads-006）の結合のテスト（本物の PostgreSQL）：
// 件数が足りないと「あと何件」・時間帯と本文の特徴の傾向・プロンプトに入る傾向（投稿のルールで外す・設定で切る）・
// 分析の設定（テーマ・版・消したテーマの分類を外す）・内容の分類（一覧・保存・飛ばす）・持ち主だけ・操作の記録・CHECK と約束。
import "@hono/zod-openapi";
import { OPENING_TYPES, jstToday } from "@workspace/contracts/threads";
import type {
  ActivityEntry,
  AnalysisSettings,
  AnalysisView,
  ClassificationsList,
  GeneratedPrompt,
  ThreadsAccount,
} from "@workspace/contracts/threads";
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

const database = useTestDatabase();
const BASE = "/api/v1/threads/accounts";
const DAY = 86_400_000;

describe("アルゴリズムの分析", () => {
  let app: TestApp;
  let cookie: string;
  let accountId: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    app = buildApp(database, testConfig(), {
      features: createDomainFeatures([]),
    });
    cookie = (await loginAs(app)).cookie;
    accountId = (
      (await (await call(app, cookie, BASE, "POST", { name: "運用" })).json()) as ThreadsAccount
    ).id;
  });

  /**
   * 確定した投稿を DB に入れる。
   * @param body 本文
   * @param publishedAt 投稿した日時
   * @param views 閲覧の数
   * @returns 案の ID
   */
  async function confirmed(body: string, publishedAt: Date, views: number): Promise<string> {
    const batchId = randomUUID();
    await database.pool.query(
      "INSERT INTO threads_draft_batch (id, threads_account_id, client_request_id, draft_count, delimiter_found) VALUES ($1, $2, $3, 1, false)",
      [batchId, accountId, randomUUID()],
    );
    const draftId = randomUUID();
    await database.pool.query(
      `INSERT INTO threads_post_draft (id, threads_account_id, batch_id, position, body, status, reviewed_at, published_at, threads_media_id)
       VALUES ($1, $2, $3, 0, $4, 'published', $5, $5, $6)`,
      [draftId, accountId, batchId, body, publishedAt, String(Math.floor(Math.random() * 1e9))],
    );
    await database.pool.query(
      `INSERT INTO threads_post_metric (draft_id, threads_account_id, state, views, likes, replies, reposts, quotes, shares, last_fetched_at, confirmed_at)
       VALUES ($1, $2, 'confirmed', $3, 5, 1, 0, 0, 0, $4, $4)`,
      [draftId, accountId, views, new Date(publishedAt.getTime() + 7 * DAY)],
    );
    return draftId;
  }

  /**
   * 40件の確定した投稿（昼と夜を交互。夜は閲覧が2倍で、最後に問いかけがある）。
   * @returns 案の ID（新しい順ではなく入れた順）
   */
  async function seedForty(): Promise<string[]> {
    const today = jstToday(new Date());
    const ids: string[] = [];
    for (let index = 0; index < 40; index += 1) {
      const day = new Date(new Date(`${today}T00:00:00+09:00`).getTime() - (index + 8) * DAY);
      const ymd = jstToday(day);
      const night = index % 2 === 0;
      const at = new Date(`${ymd}T${night ? "21" : "12"}:00:00+09:00`);
      ids.push(
        await confirmed(
          night ? `夜の投稿${index}\nどう思う？` : `昼の投稿${index}です。`,
          at,
          night ? 400 + index : 200 + index,
        ),
      );
    }
    return ids;
  }

  /**
   * 分析を読む。
   * @param scope 範囲
   * @returns 分析の画面
   */
  async function analysis(scope = "all"): Promise<AnalysisView> {
    const response = await call(app, cookie, `${BASE}/${accountId}/analysis?scope=${scope}`);
    expect(response.status).toBe(200);
    return (await response.json()) as AnalysisView;
  }

  /**
   * 投稿のプロンプトを読む。
   * @returns プロンプト
   */
  async function prompt(): Promise<string> {
    return (
      (await (await call(app, cookie, `${BASE}/${accountId}/prompt`)).json()) as GeneratedPrompt
    ).prompt;
  }

  it("確定した投稿が20件に足りなければ「あと何件」だけを返し、プロンプトに傾向の節はない", async () => {
    const now = Date.now();
    for (let index = 0; index < 5; index += 1)
      await confirmed(`投稿${index}`, new Date(now - (index + 8) * DAY), 100);
    const view = await analysis();
    expect(view).toMatchObject({ needMore: 15, trends: [], time: [], period: { days: 90 } });
    expect(view.totals.confirmed).toBe(5);
    expect(view.settings).toEqual({ trendsInPrompt: true, themes: [], version: 0 });
    expect(await prompt()).not.toContain("■伸びた傾向");
  });

  it("夜と問いかけの傾向が出て、本文で変えられる傾向だけがプロンプトに入る。投稿のルールに出る特徴と設定の切で外れる", async () => {
    await seedForty();
    // 期間の外（91日前）と、確定していない投稿は使わない
    await confirmed("古い投稿", new Date(Date.now() - 100 * DAY), 9999);
    const view = await analysis();
    expect(view.totals.confirmed).toBe(40);
    expect(view.needMore).toBeNull();
    const night = view.time.find((row) => row.key === "night");
    expect(night).toMatchObject({ count: 20, mark: null });
    expect(view.time.find((row) => row.key === "latenight")).toMatchObject({
      count: 0,
      mark: "untried",
    });
    const texts = view.trends.map((trend) => trend.text);
    expect(texts).toContain("夜（20〜23時）に出した投稿が伸びやすい");
    expect(texts).toContain("最後に問いかけがある投稿が伸びやすい");
    const timeTrend = view.trends.find((trend) => trend.dimension === "time");
    expect(timeTrend).toMatchObject({ promptable: false, inPrompt: false });
    const questionTrend = view.trends.find((trend) => trend.key === "question");
    expect(questionTrend).toMatchObject({ promptable: true, inPrompt: true });

    let text = await prompt();
    expect(text).toContain("■伸びた傾向");
    expect(text).toContain("・最後に問いかけがある投稿が伸びやすい(20件。");
    expect(text).not.toContain("夜（20〜23時）に出した投稿が伸びやすい");

    // 投稿のルールに「問いかけ」が出ると、その特徴の傾向は入れない
    expect(
      (
        await call(app, cookie, `${BASE}/${accountId}/core-rules`, "PUT", {
          coreRules: "問いかけで終わらせない",
        })
      ).status,
    ).toBe(200);
    expect((await analysis()).trends.find((trend) => trend.key === "question")?.inPrompt).toBe(
      false,
    );
    expect(await prompt()).not.toContain("最後に問いかけがある投稿が伸びやすい");
    await call(app, cookie, `${BASE}/${accountId}/core-rules`, "PUT", { coreRules: "" });

    // 設定で切ると、節がなくなる
    const saved = await call(app, cookie, `${BASE}/${accountId}/analysis/settings`, "PUT", {
      trendsInPrompt: false,
      themes: [],
      version: 0,
    });
    expect(saved.status).toBe(200);
    text = await prompt();
    expect(text).not.toContain("■伸びた傾向");
  });

  it("宣伝の投稿は「ふだんの投稿」から外れ、宣伝の数は範囲によらず数える", async () => {
    await seedForty();
    await call(app, cookie, `${BASE}/${accountId}/promotions`, "POST", {
      title: "夜の投稿",
      content: "宣伝の中身",
      targetLocation: "",
      targetPersona: "",
      targetAgeRange: "",
      cta: "",
      linkedUrl: "",
      priority: 0,
      status: "active",
      validUntil: null,
      event: null,
    });
    const all = await analysis("all");
    const regular = await analysis("regular");
    expect(all.totals).toMatchObject({ confirmed: 40, promo: 20 });
    expect(regular.totals).toMatchObject({ confirmed: 20, promo: 20 });
  });

  it("テーマを保存し（版）、分類の答えを保存すると表に出る。消したテーマの分類はテーマなしに戻る", async () => {
    const ids = await seedForty();
    let response = await call(app, cookie, `${BASE}/${accountId}/analysis/settings`, "PUT", {
      trendsInPrompt: true,
      themes: [{ name: " 仕事の悩み " }, { name: "転職" }],
      version: 0,
    });
    expect(response.status).toBe(200);
    const settings = (await response.json()) as AnalysisSettings;
    expect(settings.version).toBe(1);
    expect(settings.themes.map((theme) => theme.name)).toEqual(["仕事の悩み", "転職"]);
    const [work, change] = settings.themes;

    // 古い版で保存すると 409
    response = await call(app, cookie, `${BASE}/${accountId}/analysis/settings`, "PUT", {
      trendsInPrompt: true,
      themes: [],
      version: 0,
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as ErrorBody).error.code).toBe("THREADS_VERSION_CONFLICT");

    // 同じ名前のテーマは 400
    response = await call(app, cookie, `${BASE}/${accountId}/analysis/settings`, "PUT", {
      trendsInPrompt: true,
      themes: [{ name: "転職" }, { name: "転職" }],
      version: 1,
    });
    expect(response.status).toBe(400);

    // まだの投稿は新しい順に並ぶ
    const pending = (await (
      await call(app, cookie, `${BASE}/${accountId}/analysis/classifications?mode=unclassified`)
    ).json()) as ClassificationsList;
    expect(pending.posts).toHaveLength(40);
    expect(pending.remaining).toBe(0);
    expect(pending.themes).toHaveLength(2);

    const items = ids.map((draftId, index) => ({
      draftId,
      openingType: index % 2 === 0 ? "question" : "story",
      themeId: index % 2 === 0 ? (work?.id ?? null) : (change?.id ?? null),
    }));
    // 50件を超えると 400
    response = await call(app, cookie, `${BASE}/${accountId}/analysis/classifications`, "PUT", {
      source: "ai",
      items: [...items, ...items.slice(0, 11)],
    });
    expect(response.status).toBe(400);
    // ほかの運用アカウントの投稿・知らないテーマは飛ばす
    response = await call(app, cookie, `${BASE}/${accountId}/analysis/classifications`, "PUT", {
      source: "ai",
      items: [
        ...items.slice(0, 38),
        { draftId: randomUUID(), openingType: "other", themeId: null },
      ],
    });
    expect(await response.json()).toMatchObject({ saved: 38, skipped: [expect.any(String)] });
    response = await call(app, cookie, `${BASE}/${accountId}/analysis/classifications`, "PUT", {
      source: "manual",
      items: [
        ...items.slice(38),
        { draftId: ids[0], openingType: "question", themeId: "tunknown" },
      ],
    });
    expect(await response.json()).toMatchObject({ saved: 2, skipped: [ids[0]] });

    const view = await analysis();
    expect(view.totals.classified).toBe(40);
    expect(view.opening.find((row) => row.key === "question")).toMatchObject({ count: 20 });
    expect(view.theme.map((row) => row.label)).toEqual(["仕事の悩み", "転職"]);
    expect(view.trends.map((trend) => trend.text)).toContain("「問いかけ」の書き出しが伸びやすい");

    // 「転職」を消すと、その分類はテーマなしに戻る
    response = await call(app, cookie, `${BASE}/${accountId}/analysis/settings`, "PUT", {
      trendsInPrompt: true,
      themes: [{ id: work?.id, name: "仕事の悩み" }],
      version: 1,
    });
    expect(((await response.json()) as AnalysisSettings).themes).toEqual([work]);
    const nullThemes = await database.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM threads_post_classification WHERE theme_id IS NULL",
    );
    expect(nullThemes.rows[0]?.n).toBe(20);
    const classified = (await (
      await call(app, cookie, `${BASE}/${accountId}/analysis/classifications?mode=classified`)
    ).json()) as ClassificationsList;
    expect(classified.posts).toHaveLength(40);

    // 操作の記録
    const activity = (await (
      await call(app, cookie, `${BASE}/${accountId}/activity?kind=content`)
    ).json()) as { items: ActivityEntry[] };
    expect(activity.items.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["analysis_settings_saved", "posts_classified"]),
    );
  });

  it("ほかの人の運用アカウントは 404。範囲の値が違えば 400", async () => {
    const other = (await loginAs(app, { lineUserId: `U${"9".repeat(32)}` })).cookie;
    expect((await call(app, other, `${BASE}/${accountId}/analysis`)).status).toBe(404);
    expect(
      (
        await call(app, other, `${BASE}/${accountId}/analysis/classifications`, "PUT", {
          source: "ai",
          items: [{ draftId: randomUUID(), openingType: "other", themeId: null }],
        })
      ).status,
    ).toBe(404);
    expect((await call(app, cookie, `${BASE}/${accountId}/analysis?scope=x`)).status).toBe(400);
  });

  it("書き出しの型の CHECK は、約束の選択肢と同じ", async () => {
    const result = await database.pool.query<{ definition: string }>(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'threads_post_classification_opening_type_check'",
    );
    for (const value of OPENING_TYPES) expect(result.rows[0]?.definition).toContain(`'${value}'`);
  });
});
