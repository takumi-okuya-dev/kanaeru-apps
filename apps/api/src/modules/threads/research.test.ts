// 宣伝とリサーチ（threads-004）の結合のテスト（本物の PostgreSQL）：宣伝（イベントの情報・期限・宣伝の対象の並び・版・消す）・
// 宣伝の投稿の割合・参考の投稿（まとめて足す・投稿日の決まり・直す・消す）・解説のプロンプトと貼り戻し（まだのものだけ）・
// キーワード（同じものは 409・直す・消す）・キーワードの案のプロンプト・プロンプトに宣伝と参考の投稿が入る・ほかの人は 404。
import "@hono/zod-openapi";
import type {
  ExplainPrompt,
  GeneratedPrompt,
  Promotion,
  PromotionList,
  ReferencePost,
  ReferencePostInput,
  ResearchKeyword,
  ThreadsAccount,
} from "@workspace/contracts/threads";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import type { TestApp } from "../../../test/helpers/app.ts";
import { loginAs } from "../../../test/helpers/account.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { showThreadsApp } from "../../../test/helpers/threads.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { createDomainFeatures } from "../../kernel/features.ts";
import { threadsAccount } from "./schema.ts";

const database = useTestDatabase();
const BASE = "/api/v1/threads/accounts";

/** 宣伝の入力の見本。 */
const PROMOTION = {
  title: "11月の交流会",
  content: "転職を考えている人の交流会です。",
  targetLocation: "東京",
  targetPersona: "20代の会社員",
  targetAgeRange: "20代",
  cta: "プロフィールのリンクから申し込む",
  linkedUrl: "https://example.com/event",
  priority: 10,
  status: "active",
  validUntil: null,
  event: null,
} as const;

/** 参考の投稿の入力の見本。 */
const REFERENCE: ReferencePostInput = {
  body: "仕事を辞めたいと思った夜に、まずやったこと。",
  keyword: "転職",
  postUrl: "",
  whyGood: "",
  platform: "threads",
  postedDateMode: "unknown",
  postedDate: null,
  metrics: { likes: 120, replies: 8, views: null, saves: null, reposts: 3, followers: null },
  author: "",
  memo: "",
};

describe("宣伝とリサーチ", () => {
  let app: TestApp;
  let cookie: string;
  let id: string;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    app = buildApp(database, testConfig(), {
      features: createDomainFeatures([]),
    });
    cookie = (await loginAs(app)).cookie;
    id = (
      (await (await call(app, cookie, BASE, "POST", { name: "運用" })).json()) as ThreadsAccount
    ).id;
  });

  /**
   * エラーの code を読む。
   * @param response 応答
   * @returns code
   */
  async function codeOf(response: Response): Promise<string> {
    return ((await response.json()) as ErrorBody).error.code;
  }

  it("宣伝を足し・直し・消す。止めた・期限を過ぎた宣伝は宣伝の対象でなく、後ろに並ぶ", async () => {
    const created = await call(app, cookie, `${BASE}/${id}/promotions`, "POST", {
      ...PROMOTION,
      event: {
        startAt: "2026-11-30T19:00",
        endAt: "2026-11-30T21:00",
        format: "venue",
        venueName: "渋谷のカフェ",
        prefecture: "東京都",
        address: null,
        building: null,
        station: "渋谷",
        capacity: 20,
        feeYen: 1000,
        feeNote: null,
        cancelPolicy: null,
        audience: null,
        organizer: null,
      },
    });
    expect(created.status).toBe(201);
    const promotion = (await created.json()) as Promotion;
    expect(promotion).toMatchObject({ isTargetable: true, event: { venueName: "渋谷のカフェ" } });
    await call(app, cookie, `${BASE}/${id}/promotions`, "POST", {
      ...PROMOTION,
      title: "止めた宣伝",
      status: "paused",
      priority: 90,
    });
    await call(app, cookie, `${BASE}/${id}/promotions`, "POST", {
      ...PROMOTION,
      title: "古い宣伝",
      validUntil: "2020-01-01",
    });
    const list = (await (
      await call(app, cookie, `${BASE}/${id}/promotions`)
    ).json()) as PromotionList;
    expect(list.items.map((item) => [item.title, item.isTargetable])).toEqual([
      ["11月の交流会", true],
      ["止めた宣伝", false],
      ["古い宣伝", false],
    ]);
    expect(list.ratioPercent).toBe(20);

    const updated = await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "PUT", {
      ...PROMOTION,
      title: "直した宣伝",
      version: promotion.version,
    });
    expect(((await updated.json()) as Promotion).title).toBe("直した宣伝");
    const stale = await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "PUT", {
      ...PROMOTION,
      version: promotion.version,
    });
    expect(await codeOf(stale)).toBe("THREADS_VERSION_CONFLICT");
    expect(
      (await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "DELETE")).status,
    ).toBe(204);
    expect(
      (await call(app, cookie, `${BASE}/${id}/promotions/${promotion.id}`, "DELETE")).status,
    ).toBe(404);
  });

  it("宣伝の入力の誤りは欄ごとに返す（タイトルなし・URL の形・イベントの終わりが始まりより前）", async () => {
    const response = await call(app, cookie, `${BASE}/${id}/promotions`, "POST", {
      ...PROMOTION,
      title: " ",
      linkedUrl: "example.com",
      event: {
        startAt: "2026-11-30T19:00",
        endAt: "2026-11-30T18:00",
        format: "online",
        venueName: null,
        prefecture: null,
        address: null,
        building: null,
        station: null,
        capacity: null,
        feeYen: null,
        feeNote: null,
        cancelPolicy: null,
        audience: null,
        organizer: null,
      },
    });
    expect(response.status).toBe(400);
    const paths = ((await response.json()) as ErrorBody).error.fields?.map((field) => field.path);
    expect(paths).toEqual(expect.arrayContaining(["title", "linkedUrl", "event.endAt"]));
  });

  it("宣伝の割合・宣伝・参考の投稿がプロンプトに入る", async () => {
    await call(app, cookie, `${BASE}/${id}/promotions`, "POST", PROMOTION);
    const ratio = await call(app, cookie, `${BASE}/${id}/promotion-ratio`, "PUT", {
      ratioPercent: 30,
    });
    expect(await ratio.json()).toEqual({ ratioPercent: 30 });
    expect(
      (await call(app, cookie, `${BASE}/${id}/promotion-ratio`, "PUT", { ratioPercent: 101 }))
        .status,
    ).toBe(400);
    await call(app, cookie, `${BASE}/${id}/reference-posts`, "POST", {
      items: [{ ...REFERENCE, whyGood: "共感から入って行動で終わる" }],
    });
    const prompt = (await (
      await call(app, cookie, `${BASE}/${id}/prompt`)
    ).json()) as GeneratedPrompt;
    expect(prompt.summary).toMatchObject({ promotionCount: 1, referencePostCount: 1 });
    expect(prompt.prompt).toContain("転職を考えている人の交流会です。");
    expect(prompt.prompt).toContain("共感から入って行動で終わる");
  });

  it("参考の投稿をまとめて足し、解説がまだのものを解説のプロンプトに入れ、貼り戻した解説は空のものだけに保存する", async () => {
    const created = await call(app, cookie, `${BASE}/${id}/reference-posts`, "POST", {
      items: [REFERENCE, { ...REFERENCE, body: "2つ目の投稿", whyGood: "もう書いてある" }],
    });
    expect(created.status).toBe(201);
    const { items } = (await created.json()) as { items: ReferencePost[] };
    const [first, second] = items;
    if (!first || !second) throw new Error("参考の投稿がありません");
    const explain = (await (
      await call(app, cookie, `${BASE}/${id}/reference-posts/explain-prompt`)
    ).json()) as ExplainPrompt;
    expect(explain.pendingCount).toBe(1);
    expect(explain.items.map((item) => item.id)).toEqual([first.id]);
    expect(explain.prompt).toContain(`【ID:${explain.items[0]?.shortId}】`);
    const saved = await call(app, cookie, `${BASE}/${id}/reference-posts/explanations`, "POST", {
      items: [
        { id: first.id, whyGood: "最初の一文で悩みを言い当てている" },
        { id: second.id, whyGood: "上書きしない" },
      ],
    });
    expect(await saved.json()).toEqual({
      saved: [first.id],
      skipped: [{ id: second.id, reason: "already_explained" }],
    });

    const badDate = await call(app, cookie, `${BASE}/${id}/reference-posts`, "POST", {
      items: [{ ...REFERENCE, postedDateMode: "exact", postedDate: null }],
    });
    expect(((await badDate.json()) as ErrorBody).error.fields?.[0]?.path).toBe(
      "items.0.postedDate",
    );

    const updated = await call(app, cookie, `${BASE}/${id}/reference-posts/${first.id}`, "PUT", {
      post: { ...REFERENCE, body: "直した本文" },
      version: first.version + 1,
    });
    expect(((await updated.json()) as ReferencePost).body).toBe("直した本文");
    expect(
      (await call(app, cookie, `${BASE}/${id}/reference-posts/${first.id}`, "DELETE")).status,
    ).toBe(204);
  });

  it("キーワードは同じもの（照合の形）があれば 409。直す・消す。キーワードの案のプロンプトは戦略から作る", async () => {
    const created = await call(app, cookie, `${BASE}/${id}/research-keywords`, "POST", {
      items: [
        { keyword: "転職", purpose: "迷っている人" },
        { keyword: "副業", purpose: "" },
      ],
    });
    expect(created.status).toBe(201);
    const { items } = (await created.json()) as { items: ResearchKeyword[] };
    const duplicate = await call(app, cookie, `${BASE}/${id}/research-keywords`, "POST", {
      items: [{ keyword: " 転職 ", purpose: "" }],
    });
    expect(await codeOf(duplicate)).toBe("THREADS_KEYWORD_DUPLICATE");
    const sameInBatch = await call(app, cookie, `${BASE}/${id}/research-keywords`, "POST", {
      items: [
        { keyword: "残業", purpose: "" },
        { keyword: "残業", purpose: "" },
      ],
    });
    expect(await codeOf(sameInBatch)).toBe("THREADS_KEYWORD_DUPLICATE");
    const target = items.find((item) => item.keyword === "副業");
    const updated = await call(
      app,
      cookie,
      `${BASE}/${id}/research-keywords/${target?.id}`,
      "PUT",
      {
        keyword: "副業 始め方",
        purpose: "始めたい人",
        version: target?.version,
      },
    );
    expect(((await updated.json()) as ResearchKeyword).keyword).toBe("副業 始め方");
    expect(
      (await call(app, cookie, `${BASE}/${id}/research-keywords/${target?.id}`, "DELETE")).status,
    ).toBe(204);
    const idea = (await (
      await call(app, cookie, `${BASE}/${id}/research-keywords/idea-prompt`)
    ).json()) as { prompt: string };
    expect(idea.prompt).toContain("キーワード｜狙い");
  });

  it("参考の投稿とキーワードを直せる（版が合わなければ 409・ない ID とほかの人は 404・直すと同じキーワードは 409。threads-012）", async () => {
    const { items } = (await (
      await call(app, cookie, `${BASE}/${id}/reference-posts`, "POST", { items: [REFERENCE] })
    ).json()) as { items: ReferencePost[] };
    const post = items[0];
    if (!post) throw new Error("参考の投稿がありません");
    const edited = await call(app, cookie, `${BASE}/${id}/reference-posts/${post.id}`, "PUT", {
      post: {
        ...REFERENCE,
        postUrl: "https://www.threads.com/@someone/post/abc",
        whyGood: "手で書いた解説",
        metrics: { likes: 820, replies: 12, views: 32000, saves: 40, reposts: 5, followers: 1500 },
        author: "someone",
        memo: "書き出しが気になった",
      },
      version: post.version,
    });
    expect(edited.status).toBe(200);
    const saved = (await edited.json()) as ReferencePost;
    expect(saved).toMatchObject({
      whyGood: "手で書いた解説",
      author: "someone",
      memo: "書き出しが気になった",
      metrics: { views: 32000, followers: 1500 },
      version: post.version + 1,
    });
    // 古い版で直すと 409、ない ID は 404、URL の形が違えば欄の誤り
    const stale = await call(app, cookie, `${BASE}/${id}/reference-posts/${post.id}`, "PUT", {
      post: REFERENCE,
      version: post.version,
    });
    expect(await codeOf(stale)).toBe("THREADS_VERSION_CONFLICT");
    const missing = await call(
      app,
      cookie,
      `${BASE}/${id}/reference-posts/0193a1b2-0000-7000-8000-000000000999`,
      "PUT",
      { post: REFERENCE, version: 1 },
    );
    expect(missing.status).toBe(404);
    const badUrl = await call(app, cookie, `${BASE}/${id}/reference-posts/${post.id}`, "PUT", {
      post: { ...REFERENCE, postUrl: "threads.com/x" },
      version: saved.version,
    });
    expect(((await badUrl.json()) as ErrorBody).error.fields?.[0]?.path).toBe("post.postUrl");
    const other = (await loginAs(app, { displayName: "ほかの人" })).cookie;
    expect(
      (
        await call(app, other, `${BASE}/${id}/reference-posts/${post.id}`, "PUT", {
          post: REFERENCE,
          version: saved.version,
        })
      ).status,
    ).toBe(404);
    // 1件の解説のプロンプトに、入れた反応の数が入る（不明にしない）
    const single = (await (
      await call(app, cookie, `${BASE}/${id}/reference-posts/explain-prompt?id=${post.id}`)
    ).json()) as ExplainPrompt;
    expect(single.prompt).toContain("閲覧数: 32000");
    expect(single.prompt).toContain("投稿者のフォロワー数: 1500");
    expect(single.prompt).toContain("登録者のメモ: 書き出しが気になった");

    const { items: keywords } = (await (
      await call(app, cookie, `${BASE}/${id}/research-keywords`, "POST", {
        items: [
          { keyword: "転職", purpose: "" },
          { keyword: "副業", purpose: "" },
        ],
      })
    ).json()) as { items: ResearchKeyword[] };
    const side = keywords.find((item) => item.keyword === "副業");
    if (!side) throw new Error("キーワードがありません");
    const clash = await call(app, cookie, `${BASE}/${id}/research-keywords/${side.id}`, "PUT", {
      keyword: "転職",
      purpose: "",
      version: side.version,
    });
    expect(await codeOf(clash)).toBe("THREADS_KEYWORD_DUPLICATE");
    const staleKeyword = await call(
      app,
      cookie,
      `${BASE}/${id}/research-keywords/${side.id}`,
      "PUT",
      { keyword: "副業 始め方", purpose: "", version: side.version + 5 },
    );
    expect(await codeOf(staleKeyword)).toBe("THREADS_VERSION_CONFLICT");
    const blank = await call(app, cookie, `${BASE}/${id}/research-keywords/${side.id}`, "PUT", {
      keyword: " ",
      purpose: "",
      version: side.version,
    });
    expect(((await blank.json()) as ErrorBody).error.fields?.[0]?.path).toBe("keyword");
    expect(
      (
        await call(app, other, `${BASE}/${id}/research-keywords/${side.id}`, "PUT", {
          keyword: "x",
          purpose: "",
          version: side.version,
        })
      ).status,
    ).toBe(404);
  });

  it("参考の投稿・キーワードを足す・直す・消す・解説を保存すると、リサーチを変えた日時が進む（threads-012）", async () => {
    /**
     * リサーチを変えた日時を読む。
     * @returns 日時（まだなら null）
     */
    async function changedAt(): Promise<Date | null> {
      const [row] = await database.db
        .select({ at: threadsAccount.researchChangedAt })
        .from(threadsAccount)
        .where(eq(threadsAccount.id, id));
      return row?.at ?? null;
    }
    /** 日時を空に戻す（次の操作で進んだかを見分ける）。 */
    async function reset(): Promise<void> {
      await database.db
        .update(threadsAccount)
        .set({ researchChangedAt: null })
        .where(eq(threadsAccount.id, id));
    }
    expect(await changedAt()).toBeNull();
    const { items } = (await (
      await call(app, cookie, `${BASE}/${id}/reference-posts`, "POST", { items: [REFERENCE] })
    ).json()) as { items: ReferencePost[] };
    const post = items[0];
    if (!post) throw new Error("参考の投稿がありません");
    expect(await changedAt()).not.toBeNull();
    await reset();
    await call(app, cookie, `${BASE}/${id}/reference-posts/explanations`, "POST", {
      items: [{ id: post.id, whyGood: "解説" }],
    });
    expect(await changedAt()).not.toBeNull();
    await reset();
    await call(app, cookie, `${BASE}/${id}/reference-posts/${post.id}`, "PUT", {
      post: { ...REFERENCE, body: "直した" },
      version: post.version + 1,
    });
    expect(await changedAt()).not.toBeNull();
    await reset();
    // 版が合わずに直せなかったときは進めない
    await call(app, cookie, `${BASE}/${id}/reference-posts/${post.id}`, "PUT", {
      post: REFERENCE,
      version: 1,
    });
    expect(await changedAt()).toBeNull();
    await call(app, cookie, `${BASE}/${id}/reference-posts/${post.id}`, "DELETE");
    expect(await changedAt()).not.toBeNull();
    await reset();
    const { items: keywords } = (await (
      await call(app, cookie, `${BASE}/${id}/research-keywords`, "POST", {
        items: [{ keyword: "転職", purpose: "" }],
      })
    ).json()) as { items: ResearchKeyword[] };
    expect(await changedAt()).not.toBeNull();
    await reset();
    const keyword = keywords[0];
    await call(app, cookie, `${BASE}/${id}/research-keywords/${keyword?.id}`, "PUT", {
      keyword: "転職 迷い",
      purpose: "",
      version: keyword?.version,
    });
    expect(await changedAt()).not.toBeNull();
    await reset();
    await call(app, cookie, `${BASE}/${id}/research-keywords/${keyword?.id}`, "DELETE");
    expect(await changedAt()).not.toBeNull();
  });

  it("ほかの人の運用アカウントの宣伝・参考の投稿・キーワードは 404", async () => {
    const other = (await loginAs(app, { displayName: "ほかの人" })).cookie;
    expect((await call(app, other, `${BASE}/${id}/promotions`)).status).toBe(404);
    expect((await call(app, other, `${BASE}/${id}/reference-posts`)).status).toBe(404);
    expect((await call(app, other, `${BASE}/${id}/research-keywords`)).status).toBe(404);
  });
});

describe("操作の記録（threads-005）", () => {
  it("書きこみと承認・却下を記録し、種類で絞って新しい順に読める。ほかの人は 404", async () => {
    await truncateAllTables(database);
    await showThreadsApp(database);
    const app = buildApp(database, testConfig(), {
      features: createDomainFeatures([]),
    });
    const cookie = (await loginAs(app)).cookie;
    const id = (
      (await (await call(app, cookie, BASE, "POST", { name: "運用" })).json()) as ThreadsAccount
    ).id;
    await call(app, cookie, `${BASE}/${id}/ng-words`, "POST", { words: ["必ず"] });
    const pasted = await call(app, cookie, `${BASE}/${id}/draft-batches`, "POST", {
      clientRequestId: "0193a1b2-0000-7000-8000-0000000000aa",
      text: "記録される案の本文です\n@@@\nもう1つ",
    });
    const { drafts } = (await pasted.json()) as { drafts: { id: string; version: number }[] };
    await call(app, cookie, `${BASE}/${id}/drafts/review`, "POST", {
      action: "approve",
      items: drafts.map((draft) => ({ id: draft.id, version: draft.version })),
    });
    // もうある語だけを足しても、変えていないので記録しない（threads-011）
    await call(app, cookie, `${BASE}/${id}/ng-words`, "POST", { words: ["必ず"] });
    const all = (await (await call(app, cookie, `${BASE}/${id}/activity`)).json()) as {
      items: { action: string; label: string; itemCount: number; summary: string | null }[];
    };
    expect(all.items.map((item) => item.action)).toEqual([
      "drafts_approved",
      "drafts_added",
      "ng_word_added",
    ]);
    expect(all.items[0]).toMatchObject({
      label: "案を承認した",
      itemCount: 2,
      summary: "記録される案の本文です",
    });
    const review = (await (
      await call(app, cookie, `${BASE}/${id}/activity?kind=review`)
    ).json()) as {
      items: unknown[];
    };
    expect(review.items).toHaveLength(1);
    const other = (await loginAs(app, { displayName: "ほかの人" })).cookie;
    expect((await call(app, other, `${BASE}/${id}/activity`)).status).toBe(404);
  });
});
