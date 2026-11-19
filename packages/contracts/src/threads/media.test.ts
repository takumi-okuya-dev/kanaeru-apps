// 外部メディアの掲載文（threads-008。めぐるの packages/shared/test/media/*.test.ts を1つにまとめて写した）：
// 日時の部品・行の直し・5つの媒体の組み立て・ルールのチェック・作業の STEP・まとめてコピー・画像と整えるプロンプト。
import { describe, expect, it } from "vitest";
import {
  FIX_BANK,
  FIX_EMAIL,
  FIX_LINE,
  FIX_PHONE,
  FIX_URL,
  dateFields,
  lengthOf,
  spacedDateTime,
} from "./media-common.ts";
import type { ListingSource } from "./media-types.ts";
import {
  MEDIA,
  MEDIA_DEFINITIONS,
  POLISH_BODY,
  POLISH_END,
  POLISH_TITLE,
  applyFixRules,
  buildListing,
  checkListing,
  imagePrompt,
  listingAsText,
  parsePolishAnswer,
  polishPrompt,
  refixListing,
  workSteps,
} from "./media.ts";
import { eventDateParts, formatEventWhen, isEventDateTime } from "./promotion-event.ts";
import type { PromotionEvent } from "./promotion-event.ts";
/** IT交流会のイベントの情報。 */
const IT_EVENT: PromotionEvent = {
  startAt: "2026-11-25T20:00",
  endAt: "2026-11-25T22:00",
  format: "venue",
  venueName: "バー「SHITEN（シテン）」",
  prefecture: "東京都",
  address: "台東区上野4-1-8",
  building: "3階",
  station: "御徒町駅 徒歩3分",
  capacity: 25,
  feeYen: 5000,
  feeNote: "紹介した人もされた人も1,000円引き",
  cancelPolicy: "当日キャンセル：100%\n前日キャンセル：50%",
  audience: "IT・コンサル系の方／初参加・一人参加歓迎",
  organizer: "主催の会",
};

/** IT交流会の本文（地図のURL・LINEの案内・紹介割引・完全紹介制・人脈づくりを含む）。 */
const IT_CONTENT = [
  "IT系・コンサル系の人や、その人たちに繋がりたい人で、ご飯を食べながらゆるく繋がる会です🍻",
  "初参加・一人参加も大歓迎です🙌",
  "人脈づくりや情報交換のきっかけにぜひ✨",
  "https://maps.app.goo.gl/VcGb44KUVcZNY3686",
  "※普段完全紹介・会員制のバーです。",
  "⭐️紹介割引⭐️お友達紹介した人もされた人も1000円オフ！",
  "参加費のお支払い方法は予約後にLINEでご案内します",
].join("\n");

/**
 * IT交流会の材料。
 * @param over 変えるところ
 * @returns 材料
 */
function itSource(over: Partial<ListingSource> = {}): ListingSource {
  return {
    title: "IT交流会 ゆるく繋がる飲み会",
    content: IT_CONTENT,
    targetLocation: "",
    targetPersona: "",
    targetAgeRange: "",
    cta: "",
    linkedUrl: "https://example.com/events/2026-11-25",
    event: IT_EVENT,
    defaults: {},
    ...over,
  };
}

// ---- common ----

describe("日時", () => {
  it("YYYY-MM-DDTHH:mm だけを受け、日付・時刻・曜日に分ける", () => {
    expect([
      isEventDateTime("2026-11-25T20:00"),
      isEventDateTime("2026-02-30T20:00"),
      isEventDateTime("2026-11-25 20:00"),
    ]).toEqual([true, false, false]);
    expect(eventDateParts("2026-11-25T20:00")).toMatchObject({
      date: "2026-11-25",
      time: "20:00",
      weekday: "水",
    });
    expect(dateFields(IT_EVENT)).toEqual({
      startDate: "2026-11-25",
      startTime: "20:00",
      endDate: "2026-11-25",
      endTime: "22:00",
    });
    expect(spacedDateTime("2026-11-25T20:00")).toBe("2026-11-25 20:00");
    expect(formatEventWhen(IT_EVENT)).toBe("2026年11月25日(水) 20:00 〜 22:00");
    expect(formatEventWhen({ startAt: "2026-11-25T20:00", endAt: null })).toBe(
      "2026年11月25日(水) 20:00 〜",
    );
  });
});

describe("行の直し", () => {
  const rules = [FIX_URL, FIX_LINE, FIX_EMAIL, FIX_PHONE, FIX_BANK];
  it("URL・地図・LINE・メール・電話番号・口座・PayPayの行を外し、欄・書き出し・理由を残す", () => {
    const text = [
      "はじめの行",
      "https://maps.app.goo.gl/abc",
      "LINEで連絡してください",
      "info@example.com まで",
      "03-1234-5678",
      "PayPayで払えます",
      "おわりの行",
    ].join("\n");
    const r = applyFixRules("body", text, rules);
    expect(r.text).toBe("はじめの行\nおわりの行");
    expect(r.fixes).toHaveLength(5);
    expect(r.fixes[0]).toMatchObject({
      field: "body",
      reason: expect.stringContaining("URL") as unknown,
    });
  });

  it("「オンライン」や日付・時刻・郵便番号は外さない", () => {
    const text = "■場所：オンライン\n■日時：2026-11-25 20:00\n〒110-0005 東京都台東区";
    expect(applyFixRules("body", text, rules).fixes).toEqual([]);
  });

  it("書き出しは40字まで", () => {
    const long = `LINE ${"あ".repeat(60)}`;
    expect([...applyFixRules("body", long, rules).fixes[0]!.excerpt]).toHaveLength(41);
  });

  it("文字数は絵文字も1文字", () => {
    expect(lengthOf("🍻あ")).toBe(2);
  });
});

// ---- index ----

describe("組み立て", () => {
  it("5つの媒体すべてで作れる。イベントの情報がなければ日時の欄は空", () => {
    for (const m of MEDIA) {
      const b = buildListing(m, itSource());
      expect(b.fields.title, m).not.toBe("");
      expect(buildListing(m, itSource({ event: null })).fields.startDate ?? "", m).toBe("");
    }
  });

  it("STEPに値を差し込む", () => {
    const steps = workSteps("peatix", buildListing("peatix", itSource()).fields);
    expect(steps[2]!.values[0]).toMatchObject({
      field: { key: "title" },
      value: expect.stringContaining("IT交流会") as unknown,
    });
  });

  it("まとめてコピーは、区切りごとに欄の名前つき", () => {
    const text = listingAsText("peatix", buildListing("peatix", itSource()).fields);
    expect(text).toContain("【Peatixの掲載内容】");
    expect(text).toContain("■ステップ1｜基本情報");
    expect(text).toContain("【イベント名】");
  });
});

describe("ルールのチェック", () => {
  it("直した値で出し直す。終了・参加費の金額がなければ黄。赤 → 黄 → 参考の順", () => {
    const src = itSource({ event: { ...IT_EVENT, endAt: null, feeYen: null } });
    const b = buildListing("peatix", src);
    const checks = checkListing("peatix", { ...b.fields, title: "あ".repeat(50) }, src);
    expect(checks[0]!.level).toBe("red");
    expect(
      checks
        .filter((c) => c.level === "yellow")
        .map((c) => c.message)
        .join(),
    ).toMatch(/終了の日時.*参加費の金額|参加費の金額.*終了の日時/);
    const levels = checks.map((c) => c.level);
    expect(levels).toEqual(
      [...levels].sort(
        (a, b) => ["red", "yellow", "info"].indexOf(a) - ["red", "yellow", "info"].indexOf(b),
      ),
    );
  });

  it("貼った文にも自動の直しを通す（反映のあと・保存のとき）", () => {
    const b = buildListing("tsunagate", itSource());
    const r = refixListing(
      "tsunagate",
      { ...b.fields, intro: "よい会です\nLINEで連絡ください" },
      itSource(),
    );
    expect(r.fields.intro).toBe("よい会です");
    expect(r.fixes).toHaveLength(1);
  });
});

describe("AIと整える", () => {
  it("プロンプトに媒体の決まり・今のタイトルと本文・答えの目印が入る", () => {
    const b = buildListing("peatix", itSource());
    const p = polishPrompt("peatix", itSource(), b.fields);
    for (const w of ["Peatix", "45文字以内", b.fields.title, POLISH_TITLE, POLISH_BODY, POLISH_END])
      expect(p).toContain(w);
  });

  it("答えを読む：目印あり・前後の文は無視・片方だけ・目印なし", () => {
    expect(
      parsePolishAnswer(
        `はい、整えました。\n${POLISH_TITLE}\n新しいタイトル\n${POLISH_BODY}\n新しい本文\n2行め\n${POLISH_END}\nほかに何か…`,
      ),
    ).toEqual({
      title: "新しいタイトル",
      body: "新しい本文\n2行め",
    });
    expect(parsePolishAnswer(`${POLISH_TITLE}\nタイトルだけ`)).toEqual({
      title: "タイトルだけ",
      body: null,
    });
    expect(parsePolishAnswer("目印のない答え")).toEqual({ title: null, body: null });
  });
});

// ---- image ----

const SIZES = {
  kokuchpro: "4:3",
  peatix: "1840×900",
  tsunagate: "4:3",
  jmty: "500×500",
  youtrust: "1200×630",
} as const;

describe("画像のプロンプト", () => {
  it.each(MEDIA)("%s：イベントの情報・大きさ・入れてはいけないものが入る", (m) => {
    const p = imagePrompt(m, itSource(), "illustration");
    for (const w of [
      "IT交流会",
      "2026年11月25日(水)",
      "御徒町",
      "5,000円",
      SIZES[m],
      "QRコード",
      "口座",
    ])
      expect(p).toContain(w);
  });

  it("こくちーずプロは中央75%、イラスト型と写真を使う型で文が変わる", () => {
    expect(imagePrompt("kokuchpro", itSource(), "illustration")).toContain("75%");
    const a = imagePrompt("peatix", itSource(), "illustration");
    const b = imagePrompt("peatix", itSource(), "photo");
    expect([a.includes("イラスト型"), b.includes("写真を使う型")]).toEqual([true, true]);
  });
});

// ---- kokuchpro ----

const def = MEDIA_DEFINITIONS.kokuchpro;

describe("こくちーずプロの欄", () => {
  it("①〜⑦の区切りと、欄の並び・必須・登録後に変えられない・上限", () => {
    expect(def.steps).toHaveLength(7);
    expect(def.fields.slice(0, 2).map((f) => [f.key, f.required, f.immutable])).toEqual([
      ["format", true, true],
      ["pricing", true, true],
    ]);
    expect(def.fields.find((f) => f.key === "title")!.max).toBe(100);
    expect(def.fields.find((f) => f.key === "summary")!.max).toBe(80);
    expect(def.fields.filter((f) => f.defaultable).map((f) => f.key)).toEqual([
      "officeName",
      "officeTel",
      "officeEmail",
      "group",
    ]);
  });

  it("IT交流会から、オフライン・有料・人脈／交流会・ITエンジニア交流会と理由を選ぶ", () => {
    const b = buildListing("kokuchpro", itSource({ defaults: { officeName: "事務局" } }));
    expect([b.fields.format, b.fields.pricing, b.fields.genre, b.fields.subGenre]).toEqual([
      "オフライン",
      "有料",
      "人脈／交流会",
      "ITエンジニア交流会",
    ]);
    expect(b.reasons.pricing).toContain("参加費がある");
    expect([
      b.fields.startDate,
      b.fields.startTime,
      b.fields.price,
      b.fields.capacity,
      b.fields.officeName,
    ]).toEqual(["2026-11-25", "20:00", "5000", "25", "事務局"]);
    expect(b.fields.payment).toBe("個別支払（振込先などを自分で案内する）");
  });

  it("無料なら「無料」と「設定しない」、金額がなければ空", () => {
    const free = buildListing("kokuchpro", itSource({ event: { ...IT_EVENT, feeYen: 0 } }));
    expect([free.fields.pricing, free.fields.payment]).toEqual([
      "無料",
      "設定しない（無料イベント）",
    ]);
    const none = buildListing("kokuchpro", itSource({ event: { ...IT_EVENT, feeYen: null } }));
    expect(none.fields.price).toBe("");
  });

  it("作業のSTEPは15。最初は「登録の最初の画面で、2つを選ぶ」、最後はルールの確認と公開、1日3件まで", () => {
    const steps = workSteps("kokuchpro", buildListing("kokuchpro", itSource()).fields);
    expect(steps).toHaveLength(15);
    expect(steps[0]!.title).toBe("登録の最初の画面で、2つを選ぶ");
    expect(steps[14]!).toMatchObject({
      title: "ルールの確認 → 最終確認 → 公開",
      ruleCheck: true,
      publish: true,
    });
    expect(steps[14]!.notes.join()).toContain("3件まで");
  });
});

describe("こくちーずプロのルール", () => {
  it("自動の直しはしない（地図のURL・紹介割引が残る）", () => {
    const b = buildListing("kokuchpro", itSource());
    expect(b.fixes).toEqual([]);
    expect(b.fields.body).toContain("maps.app.goo.gl");
    expect(b.fields.body).toContain("紹介割引");
  });

  it("必須の欄が空なら黄、1日3件までは参考", () => {
    const b = buildListing("kokuchpro", itSource());
    const checks = checkListing("kokuchpro", b.fields, itSource());
    expect(checks.some((c) => c.level === "yellow" && c.field === "officeName")).toBe(true);
    expect(checks.some((c) => c.level === "info" && c.message.includes("3件まで"))).toBe(true);
  });
});

// ---- peatix ----

describe("Peatixの欄", () => {
  it("ステップ1〜5と、イベント名の上限45", () => {
    expect(MEDIA_DEFINITIONS.peatix.steps).toHaveLength(5);
    expect(MEDIA_DEFINITIONS.peatix.fields.find((f) => f.key === "title")!.max).toBe(45);
  });

  it("イベント名は日付を先頭に置く形（候補2案）、当日払いは無料チケット＋チケット名に金額", () => {
    const b = buildListing("peatix", itSource());
    expect(b.fields.title).toBe("【11/25(水)20時〜】IT交流会 ゆるく繋がる飲み会｜御徒町");
    expect(b.titleCandidates).toHaveLength(2);
    expect([
      b.fields.paymentStyle!.startsWith("当日払い"),
      b.fields.ticketName,
      b.fields.price,
    ]).toEqual([true, "参加費 5,000円（当日払い）", "0"]);
    expect(b.fields.format).toBe("会場開催");
  });

  it("作業のSTEPは10。最初はルールの確認、最後は公開", () => {
    const steps = workSteps("peatix", buildListing("peatix", itSource()).fields);
    expect(steps).toHaveLength(10);
    expect([steps[0]!.ruleCheck, steps[9]!.publish]).toEqual([true, true]);
  });
});

describe("Peatixのルール", () => {
  it("地図のURL・LINEの行が外れ、理由が残る", () => {
    const b = buildListing("peatix", itSource());
    expect(b.fields.body).not.toContain("maps.app.goo.gl");
    expect(b.fields.body).not.toContain("LINEでご案内");
    expect(b.fixes.map((f) => f.field)).toEqual(["body", "body"]);
  });

  it("イベント名が45文字を超えると赤。カバー画像・グループは参考", () => {
    const b = buildListing("peatix", itSource());
    const checks = checkListing("peatix", { ...b.fields, title: "あ".repeat(46) }, itSource());
    expect(checks[0]).toMatchObject({ level: "red", field: "title" });
    expect(checks.some((c) => c.message.includes("カバー画像"))).toBe(true);
    expect(checks.some((c) => c.message.includes("グループ"))).toBe(true);
  });
});

// ---- tsunagate ----

describe("つなげーとの欄", () => {
  it("イベント名は60字まで・30字以上の形で人数を入れない。紹介文の冒頭3行は場所・日時・参加費", () => {
    const b = buildListing(
      "tsunagate",
      itSource({ title: "IT交流会 25名限定 ゆるく繋がる飲み会" }),
    );
    expect([...b.fields.title!].length).toBeLessThanOrEqual(60);
    expect([...b.fields.title!].length).toBeGreaterThanOrEqual(30);
    expect(b.fields.title).not.toMatch(/25名/);
    expect(b.fields.intro!.split("\n").slice(0, 3)).toEqual([
      "📍場所：バー「SHITEN（シテン）」（御徒町駅 徒歩3分）",
      "🗓日時：2026年11月25日(水) 20:00 〜 22:00",
      "💰参加費：5,000円（つなげーとでの事前決済）",
    ]);
    expect([b.fields.payment, b.fields.genderRatio, b.fields.exclusive]).toEqual([
      "事前決済（クレジット／Amazon Pay）",
      "設定しない",
      "チェックしない",
    ]);
  });

  it("作業のSTEPは9。最後は公開と、自分も参加申し込み", () => {
    const steps = workSteps("tsunagate", buildListing("tsunagate", itSource()).fields);
    expect(steps).toHaveLength(9);
    expect(steps[8]!.notes.join()).toContain("参加申し込み");
  });
});

describe("つなげーとのルール", () => {
  it("地図のURL・紹介割引・LINEの行が外れる", () => {
    const b = buildListing("tsunagate", itSource());
    expect(b.fields.intro).not.toMatch(/maps\.app|紹介割引|LINE/);
    expect(b.fixes.map((f) => f.reason).join()).toContain("紹介");
  });

  it("「人脈づくり」などは黄。手数料・自分も参加・重複の禁止・人気の時間は参考", () => {
    const b = buildListing("tsunagate", itSource());
    const checks = checkListing("tsunagate", b.fields, itSource(), b.fixes.length);
    expect(checks.find((c) => c.level === "yellow" && c.field === "intro")!.message).toContain(
      "人脈",
    );
    const info = checks
      .filter((c) => c.level === "info")
      .map((c) => c.message)
      .join("\n");
    for (const w of ["手数料", "参加申し込み", "複数作る", "人気の時間", "自動で直した内容"])
      expect(info).toContain(w);
  });
});

// ---- jmty ----

describe("ジモティーの欄", () => {
  it("カテゴリーはパーティー、タイトルは日付と駅を前に「〜しませんか？」", () => {
    const b = buildListing("jmty", itSource());
    expect(b.fields.category).toBe("イベント ＞ パーティー（交流会・飲み会・BBQなど）");
    expect(b.fields.title).toBe("【11/25(水)】御徒町でIT交流会 ゆるく繋がる飲み会しませんか？🍻");
    expect([b.fields.prefecture, b.fields.station]).toEqual(["東京都", "御徒町駅"]);
  });

  it("内容の最初に日時・場所・参加費、最後に「詳細・お申し込み」と専用URL", () => {
    const b = buildListing("jmty", itSource());
    expect(b.fields.body!.split("\n")[0]).toBe("【日時】2026年11月25日(水) 20:00 〜 22:00");
    expect(
      b.fields.body!.endsWith("■詳細・お申し込み\nhttps://example.com/events/2026-11-25"),
    ).toBe(true);
  });

  it("作業のSTEPは8", () => {
    expect(workSteps("jmty", buildListing("jmty", itSource()).fields)).toHaveLength(8);
  });
});

describe("ジモティーのルール", () => {
  it("LINE・地図のURLの行が外れ、案内のURLは最後の1か所だけ", () => {
    const b = buildListing(
      "jmty",
      itSource({ content: "楽しい会です\n出会いもあります\nLINE: abc\nhttps://maps.app.goo.gl/x" }),
    );
    expect(b.fields.body).not.toMatch(/LINE|出会い|maps\.app/);
    expect(b.fields.body!.match(/https?:\/\//g)).toHaveLength(1);
  });

  it("重複投稿の禁止・審査・画像500×500・連絡先は参考", () => {
    const info = checkListing("jmty", buildListing("jmty", itSource()).fields, itSource())
      .map((c) => c.message)
      .join("\n");
    for (const w of ["重複", "審査", "500×500", "連絡先"]) expect(info).toContain(w);
  });
});

// ---- youtrust ----

describe("YOUTRUSTの欄", () => {
  it("タイトルは絵文字を外し「＠エリア」、対象者は箇条書き", () => {
    const b = buildListing("youtrust", itSource({ title: "🍻IT交流会 ゆるく繋がる飲み会" }));
    expect(b.fields.title).toBe("IT交流会 ゆるく繋がる飲み会＠御徒町");
    expect(b.fields.audience).toBe("・IT・コンサル系の方\n・初参加・一人参加歓迎");
    expect(b.fields.format).toBe("オフライン（会場に集まる）");
  });

  it("作業のSTEPは12", () => {
    expect(workSteps("youtrust", buildListing("youtrust", itSource()).fields)).toHaveLength(12);
  });
});

describe("YOUTRUSTのルール", () => {
  it("「完全紹介・会員制」と他サイトのURLの行が外れる", () => {
    const b = buildListing("youtrust", itSource());
    expect(b.fields.summary).not.toMatch(/完全紹介|maps\.app/);
    expect(b.fixes.some((f) => f.reason.includes("限られて見える"))).toBe(true);
  });

  it("住所が空なら黄。サムネイル・主催・公開後に戻せない・通知の時刻は参考", () => {
    const src = itSource({
      event: { ...IT_EVENT, prefecture: null, address: null, building: null },
    });
    const checks = checkListing("youtrust", buildListing("youtrust", src).fields, src);
    expect(checks.some((c) => c.level === "yellow" && c.field === "address")).toBe(true);
    const info = checks
      .filter((c) => c.level === "info")
      .map((c) => c.message)
      .join("\n");
    for (const w of ["サムネイル", "主催", "下書きには戻せません", "22時"])
      expect(info).toContain(w);
  });
});
