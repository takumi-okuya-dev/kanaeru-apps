// アルゴリズムの分析の計算（threads-006。めぐるの packages/shared/test/analysis/*.test.ts を1つにまとめて写した）：
// 祝日・投稿ごとの値・区切りと傾向・プロンプトに入れる傾向の守り・内容の分類のプロンプトと答えの読み取り。
import { describe, expect, it } from "vitest";
import { POST_LENGTH_DEFAULTS } from "./limits.ts";
import { analyzePosts } from "./analysis.ts";
import { classifyPrompt, parseClassifyAnswer, trendsForPrompt } from "./analysis-prompt.ts";
import type { AnalysisPost, Trend } from "./analysis-types.ts";
import { lengthBuckets, postValues } from "./analysis-values.ts";
import { isJapaneseHoliday } from "./holidays.ts";
/**
 * 日本時間の日時を ISO 8601 にする。
 * @param ymd - 日付
 * @param hour - 時（日本時間）
 * @returns ISO 8601
 */
const jst = (ymd: string, hour: number) =>
  new Date(`${ymd}T${String(hour).padStart(2, "0")}:00:00+09:00`).toISOString();

/**
 * 投稿1件。
 * @param over - 変えるところ
 * @returns 投稿
 */
function post(over: Partial<AnalysisPost> = {}): AnalysisPost {
  return {
    id: over.id ?? "p",
    body: "今日の気づき",
    publishedAt: jst("2026-10-07", 12),
    views: 100,
    likes: 5,
    replies: 1,
    reposts: 0,
    quotes: 0,
    followersAtPost: 100,
    h24Views: 60,
    openingType: null,
    themeId: null,
    promo: false,
    ...over,
  };
}

const HOURS = [7, 12, 17, 21];

/**
 * 夜（20〜23時）の投稿の閲覧を高めにした投稿の並び（平日・2026-08-03から1日1件）。
 * @param n - 件数
 * @param over - 投稿ごとに変えるところ
 * @returns 投稿
 */
function makePosts(
  n: number,
  over: (i: number) => Partial<AnalysisPost> = () => ({}),
): AnalysisPost[] {
  const out: AnalysisPost[] = [];
  for (let i = 0; i < n; i++) {
    const day = new Date(Date.UTC(2026, 7, 3 + i));
    const ymd = day.toISOString().slice(0, 10);
    const hour = HOURS[i % HOURS.length]!;
    const night = hour === 21;
    out.push(
      post({
        id: `p${i}`,
        body: `投稿${i}の本文です`,
        publishedAt: jst(ymd, hour),
        views: night ? 400 + (i % 5) * 10 : 200 + (i % 5) * 10,
        h24Views: night ? 200 : 120,
        ...over(i),
      }),
    );
  }
  return out;
}

// ---- holidays ----

describe("isJapaneseHoliday", () => {
  it("2026年の祝日・振替休日・国民の休日", () => {
    const days = [
      "2026-01-01",
      "2026-01-12",
      "2026-02-11",
      "2026-02-23",
      "2026-03-20",
      "2026-04-29",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-07-20",
      "2026-08-11",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-10-12",
      "2026-11-03",
      "2026-11-23",
    ];
    for (const d of days) expect(isJapaneseHoliday(d), d).toBe(true);
  });

  it("ふつうの平日・土日だけの日は祝日でない", () => {
    for (const d of ["2026-05-07", "2026-09-24", "2026-01-13", "2026-11-04", "2026-11-07"])
      expect(isJapaneseHoliday(d), d).toBe(false);
  });

  it("春分と秋分の日（年で変わる）", () => {
    expect(isJapaneseHoliday("2025-03-20")).toBe(true);
    expect(isJapaneseHoliday("2025-09-23")).toBe(true);
    expect(isJapaneseHoliday("2027-03-21")).toBe(true);
    expect(isJapaneseHoliday("2027-09-23")).toBe(true);
    expect(isJapaneseHoliday("2025-03-21")).toBe(false);
  });

  it("振替休日（日曜の祝日の次の平日）", () => {
    expect(isJapaneseHoliday("2025-11-24")).toBe(true); // 勤労感謝の日（日）の振替
    expect(isJapaneseHoliday("2027-03-22")).toBe(true); // 春分の日（日）の振替
  });

  it("扱う年の外・形の違う文字列は false", () => {
    expect(isJapaneseHoliday("1999-01-01")).toBe(false);
    expect(isJapaneseHoliday("2100-01-01")).toBe(false);
    expect(isJapaneseHoliday("2026/01/01")).toBe(false);
  });
});

// ---- values ----

const ls = POST_LENGTH_DEFAULTS;

describe("postValues", () => {
  it("反応率・返信率・広がり・初速・後からの伸び", () => {
    const v = postValues(
      post({
        views: 200,
        likes: 10,
        replies: 4,
        reposts: 2,
        quotes: 4,
        followersAtPost: 50,
        h24Views: 80,
      }),
      ls,
    );
    expect(v.engagementRate).toBeCloseTo(20 / 200);
    expect(v.replyRate).toBeCloseTo(4 / 200);
    expect(v.spread).toBeCloseTo(4);
    expect(v.firstSpeed).toBe(80);
    expect(v.laterGrowth).toBeCloseTo(2.5);
  });

  it("求められない値は null", () => {
    const v = postValues(post({ views: 0, followersAtPost: null, h24Views: null }), ls);
    expect(v.engagementRate).toBeNull();
    expect(v.replyRate).toBeNull();
    expect(v.spread).toBeNull();
    expect(v.firstSpeed).toBeNull();
    expect(v.laterGrowth).toBeNull();
    expect(postValues(post({ followersAtPost: 0, h24Views: 0 }), ls)).toMatchObject({
      spread: null,
      firstSpeed: 0,
      laterGrowth: null,
    });
  });

  it("時間帯は日本時間で決まる", () => {
    expect(postValues(post({ publishedAt: "2026-10-07T11:30:00.000Z" }), ls).timeBucket).toBe(
      "night",
    );
    expect(postValues(post({ publishedAt: jst("2026-10-07", 5) }), ls).timeBucket).toBe("morning");
    expect(postValues(post({ publishedAt: jst("2026-10-07", 15) }), ls).timeBucket).toBe("noon");
    expect(postValues(post({ publishedAt: jst("2026-10-07", 19) }), ls).timeBucket).toBe("evening");
    expect(postValues(post({ publishedAt: jst("2026-10-07", 4) }), ls).timeBucket).toBe(
      "latenight",
    );
  });

  it("土日と祝日は休日", () => {
    expect(postValues(post({ publishedAt: jst("2026-10-07", 12) }), ls).dayKind).toBe("weekday");
    expect(postValues(post({ publishedAt: jst("2026-10-10", 12) }), ls).dayKind).toBe("holiday");
    expect(postValues(post({ publishedAt: jst("2026-10-12", 12) }), ls).dayKind).toBe("holiday");
    // UTCでは前の日でも、日本時間の日付で決める
    expect(postValues(post({ publishedAt: "2026-10-11T16:00:00.000Z" }), ls).dayKind).toBe(
      "holiday",
    );
  });

  it("本文の特徴", () => {
    const f = (body: string) => postValues(post({ body }), ls).features;
    expect(f("みんなはどうしてる？\n\n").question).toBe(true);
    expect(f("どうしてる?").question).toBe(true);
    expect(f("どうしてる？\n私はこうしてる").question).toBe(false);
    expect(f("３年続けた").number).toBe(true);
    expect(f("ずっと続けた").number).toBe(false);
    expect(f("あ".repeat(20) + "\n続き").shortFirstLine).toBe(true);
    expect(f("あ".repeat(21)).shortFirstLine).toBe(false);
    expect(f("1\n2\n\n3\n4\n5").manyLines).toBe(true);
    expect(f("1\n2\n3\n4").manyLines).toBe(false);
    expect(f("うれしい😊").emoji).toBe(true);
    expect(f("うれしい").emoji).toBe(false);
    expect(f("みなさんへ").callout).toBe(true);
    expect(f("私は").callout).toBe(false);
  });

  it("文字数はコードポイントで数え、Accountの設定で区切る", () => {
    expect(postValues(post({ body: "😊".repeat(77) }), ls)).toMatchObject({
      length: 77,
      lengthBucket: "short",
    });
    expect(postValues(post({ body: "あ".repeat(78) }), ls).lengthBucket).toBe("medium");
    expect(postValues(post({ body: "あ".repeat(117) }), ls).lengthBucket).toBe("medium");
    expect(postValues(post({ body: "あ".repeat(118) }), ls).lengthBucket).toBe("long");
  });
});

describe("lengthBuckets", () => {
  it("初めの値で 〜77字・78〜117字・118字〜", () => {
    expect(lengthBuckets(ls).map((b) => b.label)).toEqual([
      "短い（〜77字）",
      "中くらい（78〜117字）",
      "長い（118字〜）",
    ]);
  });
  it("設定を変えると幅も変わる", () => {
    const b = lengthBuckets({ ...ls, shortLength: 40, mediumLength: 80, longLength: 120 });
    expect(b.map((x) => x.max)).toEqual([60, 100, null]);
  });
});

// ---- analyze ----

const opts = { lengthSettings: POST_LENGTH_DEFAULTS, themes: [] };

describe("analyzePosts（区切り）", () => {
  it("時間帯・曜日・文字数・本文の特徴ごとに件数と中央値が並ぶ", () => {
    const r = analyzePosts(makePosts(60), opts);
    expect(r.needMore).toBeNull();
    expect(r.time.map((b) => b.key)).toEqual(["morning", "noon", "evening", "night", "latenight"]);
    const night = r.time.find((b) => b.key === "night")!;
    expect(night.count).toBe(15);
    expect(night.views).toBe(420);
    expect(night.mark).toBeNull();
    expect(r.time.find((b) => b.key === "morning")!.views).toBe(220);
    expect(r.time.find((b) => b.key === "latenight")).toMatchObject({
      count: 0,
      views: null,
      engagementRate: null,
      mark: "untried",
    });
    expect(r.day.map((b) => b.label)).toEqual(["平日", "休日"]);
    expect(r.day.reduce((a, b) => a + b.count, 0)).toBe(60);
    expect(r.length.map((b) => b.key)).toEqual(["short", "medium", "long"]);
    expect(r.features.map((f) => f.key)).toEqual([
      "question",
      "number",
      "shortFirstLine",
      "manyLines",
      "emoji",
      "callout",
    ]);
    expect(r.totals).toEqual({ confirmed: 60, promo: 0, withFollowers: 60, classified: 0 });
  });

  it("10件未満の区切りは「件数が少ない」", () => {
    const posts = makePosts(30, (i) => (i < 3 ? { publishedAt: jst("2026-08-03", 2) } : {}));
    expect(analyzePosts(posts, opts).time.find((b) => b.key === "latenight")).toMatchObject({
      count: 3,
      mark: "few",
    });
  });

  it("確定した投稿が20件未満なら、あと何件かを出して表と傾向は空", () => {
    const r = analyzePosts(makePosts(12), opts);
    expect(r.needMore).toBe(8);
    expect(r.trends).toEqual([]);
    expect(r.time).toEqual([]);
    expect(r.recommended).toEqual({ available: false, posts: [], compare: null });
    expect(r.totals.confirmed).toBe(12);
  });
});

describe("analyzePosts（傾向）", () => {
  it("夜の閲覧が高いと、夜の傾向が件数と中央値つきで出る", () => {
    const t = analyzePosts(makePosts(60), opts).trends.find((x) => x.dimension === "time")!;
    expect(t).toMatchObject({
      key: "night",
      text: "夜（20〜23時）に出した投稿が伸びやすい",
      count: 15,
      views: 420,
      otherCount: 45,
      otherViews: 220,
      promptable: false,
    });
    expect(t.ratio).toBeCloseTo(420 / 220);
  });

  it("差が1.5倍に届かない・片側が10件未満なら傾向にしない（SC-002）", () => {
    const flat = makePosts(60, () => ({ views: 300 }));
    expect(analyzePosts(flat, opts).trends).toEqual([]);
    // 夜の投稿が9件だけ（ほかの時間帯に移す）
    const few = makePosts(60, (i) =>
      i % 4 === 3 && i > 35 ? { publishedAt: jst("2026-08-03", 12), views: 200 } : {},
    );
    const r = analyzePosts(few, opts);
    expect(r.time.find((b) => b.key === "night")!.count).toBe(9);
    expect(r.trends.filter((x) => x.dimension === "time")).toEqual([]);
  });

  it("ほかの投稿の中央値が0なら傾向にしない", () => {
    const posts = makePosts(40, (i) => ({ views: i % 4 === 3 ? 100 : 0 }));
    expect(analyzePosts(posts, opts).trends.filter((x) => x.dimension === "time")).toEqual([]);
  });

  it("区切りの種類ごとに1つ、倍率の大きい順に5つまで", () => {
    // 夜（i % 4 === 3）は800、最後に問いかけ（i % 4 === 1）は600、ほかは200
    const posts: AnalysisPost[] = makePosts(80, (i) => {
      const q = i % 4 === 1;
      return {
        body: `${i % 3 === 0 ? "😊" : ""}${q ? "みんなはどう？" : "こうしてる"}`,
        views: i % 4 === 3 ? 800 : q ? 600 : 200,
      };
    });
    const r = analyzePosts(posts, opts);
    expect(r.trends.length).toBeLessThanOrEqual(5);
    expect(r.trends.filter((t) => t.dimension === "time").length).toBe(1);
    const ratios = r.trends.map((t) => t.ratio);
    expect([...ratios].sort((a, b) => b - a)).toEqual(ratios);
    expect(r.trends.find((t) => t.key === "question")?.text).toBe(
      "最後に問いかけがある投稿が伸びやすい",
    );
  });

  it("「なし」の側が伸びた本文の特徴も傾向にする", () => {
    const posts = makePosts(40, (i) =>
      i % 2 === 0 ? { body: "うれしい😊", views: 100 } : { body: "うれしい", views: 300 },
    );
    const t = analyzePosts(posts, opts).trends.find((x) => x.key === "emoji")!;
    expect(t.text).toBe("絵文字のない投稿が伸びやすい");
    expect(t.promptable).toBe(true);
  });

  it("文字数の傾向の文に字数の幅が入る", () => {
    const posts = makePosts(40, (i) =>
      i % 2 === 0 ? { body: "あ".repeat(100), views: 500 } : { body: "あ".repeat(30), views: 200 },
    );
    expect(analyzePosts(posts, opts).trends.find((x) => x.dimension === "length")?.text).toBe(
      "中くらい（78〜117字）の投稿が伸びやすい",
    );
  });

  it("宣伝の投稿の数を数える", () => {
    const posts = makePosts(30, (i) => ({ promo: i < 4 }));
    expect(analyzePosts(posts, opts).totals.promo).toBe(4);
  });
});

describe("analyzePosts（おすすめに乗った目安。T020）", () => {
  it("広がりの上位20%で1を超える投稿を、広がりの大きい順に並べる", () => {
    const posts = makePosts(30, (i) => ({
      views: 50 + i * 10,
      followersAtPost: 100,
      body: `${"あ".repeat(45)}${i}`,
    }));
    const r = analyzePosts(posts, opts).recommended;
    expect(r.available).toBe(true);
    expect(r.posts.map((p) => p.id)).toEqual(["p29", "p28", "p27", "p26", "p25", "p24"]);
    expect(r.posts[0]).toMatchObject({ views: 340, spread: 3.4, head: "あ".repeat(40) });
    expect(r.compare!.recommended.count).toBe(6);
    expect(r.compare!.others.count).toBe(24);
  });

  it("広がりが1以下なら上位でも入れない。フォロワー数のない投稿は外す", () => {
    const low = makePosts(30, (i) => ({ views: 10 + i, followersAtPost: 100 }));
    expect(analyzePosts(low, opts).recommended.posts).toEqual([]);
    expect(analyzePosts(low, opts).recommended.compare).toBeNull();
    const mixed = makePosts(30, (i) => ({
      views: 50 + i * 10,
      followersAtPost: i >= 25 ? null : 100,
    }));
    const r = analyzePosts(mixed, opts);
    expect(r.totals.withFollowers).toBe(25);
    expect(
      r.recommended.posts.every((p) => !["p25", "p26", "p27", "p28", "p29"].includes(p.id)),
    ).toBe(true);
  });

  it("広がりを求められる投稿が10件未満なら出さない", () => {
    const posts = makePosts(30, (i) => ({ followersAtPost: i < 9 ? 100 : null }));
    expect(analyzePosts(posts, opts).recommended).toEqual({
      available: false,
      posts: [],
      compare: null,
    });
  });

  it("ほかの投稿との比べ：初速・後からの伸び・返信率・文字数・問いかけの件数", () => {
    const posts = makePosts(20, (i) => {
      const top = i >= 16;
      return {
        views: top ? 500 : 100,
        followersAtPost: 100,
        h24Views: top ? 250 : 80,
        replies: top ? 10 : 1,
        body: top ? "どう思う？" : "こうでした",
      };
    });
    const c = analyzePosts(posts, opts).recommended.compare!;
    expect(c.recommended).toMatchObject({
      count: 4,
      firstSpeed: 250,
      laterGrowth: 2,
      replyRate: 0.02,
      length: 5,
      questionCount: 4,
    });
    expect(c.others).toMatchObject({
      count: 16,
      firstSpeed: 80,
      laterGrowth: 1.25,
      replyRate: 0.01,
      questionCount: 0,
    });
  });
});

describe("analyzePosts の入力", () => {
  it("1件だけ確かめる用の post() も使える", () => {
    expect(analyzePosts([post()], opts).needMore).toBe(19);
  });
});

// ---- prompt-trends ----

const trend = (over: Partial<Trend>): Trend => ({
  dimension: "feature",
  key: "question",
  text: "最後に問いかけがある投稿が伸びやすい",
  count: 20,
  views: 480,
  otherCount: 44,
  otherViews: 250,
  ratio: 1.92,
  promptable: true,
  ...over,
});

describe("trendsForPrompt", () => {
  it("時間帯・曜日の傾向は入れない", () => {
    const out = trendsForPrompt(
      [
        trend({ dimension: "time", key: "night", promptable: false }),
        trend({ dimension: "day", key: "holiday", promptable: false }),
        trend({}),
      ],
      [],
      [],
    );
    expect(out.map((t) => t.dimension)).toEqual(["feature"]);
  });

  it("CORE RULESに出てくる特徴の傾向は、向きに関係なく入れない（SC-003）", () => {
    const trends = [
      trend({ key: "emoji", text: "絵文字を入れた投稿が伸びやすい" }),
      trend({ key: "question" }),
      trend({ key: "number", text: "数字を入れた投稿が伸びやすい" }),
      trend({ key: "callout", text: "呼びかけ（あなた・みんな）がある投稿が伸びやすい" }),
      trend({ key: "manyLines", text: "改行が多い（5行以上）投稿が伸びやすい" }),
      trend({ key: "shortFirstLine", text: "1行目が20字以内の投稿が伸びやすい" }),
    ];
    expect(trendsForPrompt(trends, ["絵文字は使わない"], []).map((t) => t.key)).not.toContain(
      "emoji",
    );
    expect(trendsForPrompt(trends, ["読者に質問しない"], []).map((t) => t.key)).not.toContain(
      "question",
    );
    expect(trendsForPrompt(trends, ["数字は半角で書く"], []).map((t) => t.key)).not.toContain(
      "number",
    );
    expect(trendsForPrompt(trends, ["呼びかけない"], []).map((t) => t.key)).not.toContain(
      "callout",
    );
    expect(trendsForPrompt(trends, ["改行は2行まで"], []).map((t) => t.key)).not.toContain(
      "manyLines",
    );
    expect(trendsForPrompt(trends, ["書き出しは結論から"], []).map((t) => t.key)).not.toContain(
      "shortFirstLine",
    );
    expect(trendsForPrompt(trends, ["敬語で書く"], []).length).toBe(5);
  });

  it("NGワードを含む傾向は入れない", () => {
    const out = trendsForPrompt(
      [
        trend({ dimension: "theme", key: "t1", text: "テーマ「副業で稼ぐ」の投稿が伸びやすい" }),
        trend({}),
      ],
      [],
      ["稼ぐ"],
    );
    expect(out.map((t) => t.key)).toEqual(["question"]);
  });

  it("5つまで", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      trend({ dimension: "theme", key: `t${i}`, text: `テーマ「${i}」の投稿が伸びやすい` }),
    );
    expect(trendsForPrompt(many, [], []).length).toBe(5);
  });
});

// ---- classify ----

const themes = [
  { id: "t1", name: "仕事の悩み" },
  { id: "t2", name: "転職" },
];
const posts = [
  { draftId: "d1", body: "会社員3年目で気づいたこと" },
  { draftId: "d2", body: "転職して変わったのは\n給料じゃなかった" },
  { draftId: "d3", body: "職場で話しかけやすい人って？" },
];

describe("classifyPrompt", () => {
  it("型の7つ・テーマ・答えの形・番号つきの本文が入る", () => {
    const p = classifyPrompt(posts, themes);
    expect(p).toContain("あるある／問いかけ／言い切り／体験談／数字／告知／その他");
    expect(p).toContain("仕事の悩み／転職");
    expect(p).toContain("【1】書き出しの型：あるある／テーマ：仕事の悩み");
    expect(p).toContain("【2】\n転職して変わったのは\n給料じゃなかった");
    expect(p).toContain("【3】\n職場で話しかけやすい人って？");
  });

  it("テーマがないときは型だけを答えてもらう", () => {
    const p = classifyPrompt(posts, []);
    expect(p).toContain("# テーマ\nなし(テーマは付けない)");
    expect(p).toContain("【1】書き出しの型：あるある\n");
    expect(p).not.toContain("テーマ：");
  });
});

describe("parseClassifyAnswer", () => {
  it("目印の行だけを読み、前後の文は無視する", () => {
    const text =
      "分類しました！\n【1】書き出しの型：体験談／テーマ：仕事の悩み\n【2】書き出しの型: 体験談 / テーマ: 転職\n【3】書き出しの型：問いかけ、テーマ：なし\n以上です";
    const r = parseClassifyAnswer(text, posts, themes);
    expect(r.items).toEqual([
      { index: 1, draftId: "d1", openingType: "story", themeId: "t1" },
      { index: 2, draftId: "d2", openingType: "story", themeId: "t2" },
      { index: 3, draftId: "d3", openingType: "question", themeId: null },
    ]);
    expect(r.problems).toEqual([]);
  });

  it("「」『』と全角・半角のちがいを無視し、同じ番号は後のほう", () => {
    const text =
      "【１】書き出しの型：「あるある」／テーマ：『転職』\n【1】書き出しの型：言い切り／テーマ：転職";
    const r = parseClassifyAnswer(text, posts, themes);
    expect(r.items).toEqual([{ index: 1, draftId: "d1", openingType: "assertion", themeId: "t2" }]);
  });

  it("知らない型・知らないテーマ・範囲外の番号・答えのない投稿は problems に理由つき", () => {
    const text =
      "【1】書き出しの型：ジョーク／テーマ：転職\n【2】書き出しの型：体験談／テーマ：雑談\n【9】書き出しの型：体験談／テーマ：転職";
    const r = parseClassifyAnswer(text, posts, themes);
    expect(r.items).toEqual([]);
    expect(r.problems).toEqual([
      { index: 1, reason: "知らない書き出しの型「ジョーク」" },
      { index: 2, reason: "知らないテーマ「雑談」" },
      { index: 3, reason: "答えがない" },
    ]);
  });

  it("テーマがないときは型だけで付ける", () => {
    const r = parseClassifyAnswer("【1】書き出しの型：あるある", posts.slice(0, 1), []);
    expect(r.items).toEqual([{ index: 1, draftId: "d1", openingType: "aruaru", themeId: null }]);
  });
});

describe("analyzePosts（書き出しの型・テーマ）", () => {
  it("分類の付いた投稿だけで表と傾向を求める。一覧にないテーマはテーマなし", () => {
    const list = makePosts(60, (i) =>
      i < 40
        ? {
            openingType: i % 2 === 0 ? "aruaru" : "story",
            themeId: i % 2 === 0 ? "t2" : i % 3 === 0 ? "t9" : "t1",
            views: i % 2 === 0 ? 600 : 200,
          }
        : {},
    );
    const r = analyzePosts(list, { lengthSettings: POST_LENGTH_DEFAULTS, themes });
    expect(r.totals.classified).toBe(40);
    expect(r.opening.find((b) => b.key === "aruaru")).toMatchObject({ count: 20, views: 600 });
    expect(r.opening.find((b) => b.key === "other")).toMatchObject({ count: 0, mark: "untried" });
    expect(r.theme.map((b) => b.label)).toEqual(["仕事の悩み", "転職"]);
    expect(r.theme.find((b) => b.key === "t2")!.count).toBe(20);
    expect(r.trends.find((t) => t.dimension === "opening")?.text).toBe(
      "「あるある」の書き出しが伸びやすい",
    );
    expect(r.trends.find((t) => t.dimension === "theme")?.text).toBe(
      "テーマ「転職」の投稿が伸びやすい",
    );
  });
});
