// GoodNotes の PDF の読み方（research R5。T029）。pdf.js を通さない入力（線の四角・文の項目・書体の名前）で、決まりをひとつずつ確かめる。
// 文はどれも架空のもの。座標は読みやすいように「上からの高さ」で書き、PDF の座標（下から）に直して渡す。
import { describe, expect, it } from "vitest";
import { extractGoodNotesMarkers } from "./goodnotes.ts";
import type { GoodNotesPage, GoodNotesStroke, GoodNotesText } from "./goodnotes.ts";

/** ページの高さ（pt）。 */
const HEIGHT = 800;
/** 本文の書体・テキストボックスの書体の名前。 */
const BODY = "BBBBBB+RyuminPro-Light";
const BOX = "AAAAAK+HiraginoSans-W3";

/**
 * 文の項目（1字の幅は字の大きさと同じ）。
 * @param str 文字
 * @param left 左の端
 * @param baseline 字の下の線の、上からの高さ
 * @param options 字の大きさと書体
 * @returns 文の項目（PDF の座標）
 */
function text(
  str: string,
  left: number,
  baseline: number,
  options: { size?: number; font?: string } = {},
): GoodNotesText {
  const size = options.size ?? 10;
  const y = HEIGHT - baseline;
  return {
    text: str,
    font: options.font ?? BODY,
    x0: left,
    x1: left + size * [...str].length,
    y0: y - size * 0.12,
    y1: y + size * 0.88,
  };
}

/**
 * 横に引いた線。
 * @param left 左の端
 * @param right 右の端
 * @param middle 線の真ん中の、上からの高さ
 * @param options 線の幅と不透明度（既定は幅 12pt・不透明度 0.5）
 * @returns 線（PDF の座標）
 */
function stroke(
  left: number,
  right: number,
  middle: number,
  options: { width?: number; opacity?: number } = {},
): GoodNotesStroke {
  const y = HEIGHT - middle;
  return {
    x0: left,
    x1: right,
    y0: y - 0.5,
    y1: y + 0.5,
    width: options.width ?? 12,
    opacity: options.opacity ?? 0.5,
  };
}

/**
 * 本文の行（字の下の線から 3.8pt 上が、マーカーの線の真ん中になる）。
 * @param baseline 字の下の線の、上からの高さ
 * @returns マーカーの線の真ん中の高さ
 */
function middleOf(baseline: number): number {
  return baseline - 3.8;
}

/**
 * 1ページ分の入力。
 * @param strokes 線
 * @param texts 文の項目
 * @returns ページ
 */
function page(strokes: GoodNotesStroke[], texts: GoodNotesText[]): GoodNotesPage {
  return { height: HEIGHT, strokes, texts };
}

describe("マーカーの線を見分ける", () => {
  it("不透明度が1未満で、幅が 8pt 以上の線だけをマーカーとみなす（色は見ない）", () => {
    const texts = [
      text("一行目の架空の文です。", 50, 100),
      text("二行目の架空の文です。", 50, 160),
      text("三行目の架空の文です。", 50, 220),
    ];
    const markers = extractGoodNotesMarkers([
      page(
        [
          stroke(52, 158, middleOf(100), { opacity: 1 }),
          stroke(52, 158, middleOf(160), { width: 5 }),
          stroke(52, 158, middleOf(220), { width: 8 }),
        ],
        texts,
      ),
    ]);
    expect(markers.map((marker) => marker.text)).toEqual(["三行目の架空の文です。"]);
  });

  it("同じ高さ（4pt 以内）の線は1行にする。重ねた2本の線の字は1回だけ拾う", () => {
    const markers = extractGoodNotesMarkers([
      page(
        [stroke(52, 120, middleOf(100)), stroke(110, 158, middleOf(100) + 3.5)],
        [text("重ねて引いた架空の文。", 50, 100)],
      ),
    ]);
    expect(markers.map((marker) => marker.text)).toEqual(["重ねて引いた架空の文。"]);
  });

  it("同じ行の離れた2本の線は1つのマーカーにし、間の字は拾わない", () => {
    const markers = extractGoodNotesMarkers([
      page(
        [stroke(52, 78, middleOf(100)), stroke(132, 158, middleOf(100))],
        [text("左右と間の架空の文。", 50, 100)],
      ),
    ]);
    // 左の線の下の1〜3字目と、右の線の下の9〜10字目だけ
    expect(markers.map((marker) => marker.text)).toEqual(["左右と文。"]);
  });

  it("行の間が 22pt より狭い行は1つのマーカーにし、広ければ別のマーカーにする", () => {
    const texts = [
      text("一行目から続く", 50, 100),
      text("二行目の文です。", 50, 120),
      text("ここは引かない。", 50, 140),
      text("離れた行の文。", 50, 160),
    ];
    const markers = extractGoodNotesMarkers([
      page(
        [
          stroke(52, 118, middleOf(100)),
          stroke(52, 128, middleOf(120)),
          stroke(52, 118, middleOf(160)),
        ],
        texts,
      ),
    ]);
    expect(markers.map((marker) => marker.text)).toEqual([
      "一行目から続く二行目の文です。",
      "離れた行の文。",
    ]);
  });

  it("英数字の行どうしは、つなぎ目に空白を入れる", () => {
    const markers = extractGoodNotesMarkers([
      page(
        [
          stroke(52, 148, middleOf(100), { width: 10 }),
          stroke(52, 98, middleOf(118), { width: 10 }),
        ],
        [text("alpha beta", 50, 100), text("gamma", 50, 118)],
      ),
    ]);
    expect(markers.map((marker) => marker.text)).toEqual(["alpha beta gamma"]);
  });

  it("線の上下に幅の半分を足した四角に、半分以上入る字だけを拾う", () => {
    // 線は 1字目の右の 4割（56pt）から 5字目の左の 4割（94pt）まで：1字目と5字目は 4割しか入らないので拾わない
    const markers = extractGoodNotesMarkers([
      page([stroke(56, 94, middleOf(100))], [text("あいうえおかき", 50, 100)]),
    ]);
    expect(markers.map((marker) => marker.text)).toEqual(["いうえ"]);
  });

  it("字の上下の半分より外にずれた線では、その字を拾わない", () => {
    // 線の四角は真ん中 ±6pt。字の枠（10pt）の半分より上にずれると拾わない
    const markers = extractGoodNotesMarkers([
      page([stroke(52, 98, middleOf(100) - 9)], [text("あいうえお", 50, 100)]),
    ]);
    expect(markers).toEqual([]);
  });

  it("字のない所に引いた線は、マーカーにしない", () => {
    expect(
      extractGoodNotesMarkers([page([stroke(52, 98, 300)], [text("あいうえお", 50, 100)])]),
    ).toEqual([]);
  });
});

describe("テキストボックスをコメントにする", () => {
  const body = [
    text("上のマーカーの架空の文。", 50, 100),
    text("引かない行です。", 50, 140),
    text("下のマーカーの架空の文。", 50, 180),
  ];
  const strokes = [stroke(52, 108, middleOf(100)), stroke(52, 108, middleOf(180))];

  it("いちばん近いマーカーのコメントにする（マーカーの下に置いたもの）", () => {
    const markers = extractGoodNotesMarkers([
      page(strokes, [...body, text("下のメモ", 60, 200, { size: 9, font: BOX })]),
    ]);
    expect(markers.map(({ text: value, comment }) => ({ text: value, comment }))).toEqual([
      { text: "上のマーカー", comment: undefined },
      { text: "下のマーカー", comment: "下のメモ" },
    ]);
  });

  it("マーカーの上に置いたものも、いちばん近いマーカーのコメントにする", () => {
    const markers = extractGoodNotesMarkers([
      page(strokes, [...body, text("上のメモ", 60, 80, { size: 9, font: BOX })]),
    ]);
    expect(markers[0]).toMatchObject({ text: "上のマーカー", comment: "上のメモ" });
    expect(markers[1]?.comment).toBeUndefined();
  });

  it("2行にわたるテキストボックスは1つのコメントにする", () => {
    const markers = extractGoodNotesMarkers([
      page(strokes, [
        ...body,
        text("二行にわたる", 60, 200, { size: 9, font: BOX }),
        text("架空のメモ", 60, 211, { size: 9, font: BOX }),
      ]),
    ]);
    expect(markers[1]?.comment).toBe("二行にわたる架空のメモ");
  });

  it("近くにマーカーがなければ、文のないコメントだけのものにし、上からの順に並べる", () => {
    const markers = extractGoodNotesMarkers([
      page(strokes, [...body, text("離れたメモ", 60, 500, { size: 9, font: BOX })]),
    ]);
    expect(markers.at(-1)).toEqual({
      text: "",
      comment: "離れたメモ",
      page: 1,
      position: 100_002,
      question: false,
    });
  });

  it("マーカーのないページのテキストボックスは、コメントだけのものにする", () => {
    const markers = extractGoodNotesMarkers([
      page(
        [],
        [
          text("本文だけの架空のページ。", 50, 100),
          text("ページのメモ", 60, 130, { size: 9, font: BOX }),
        ],
      ),
    ]);
    expect(markers).toEqual([
      { text: "", comment: "ページのメモ", page: 1, position: 100_000, question: false },
    ]);
  });

  it("テキストボックスの書体の字は、下にあるマーカーの文に入れない", () => {
    const markers = extractGoodNotesMarkers([
      page(
        [stroke(52, 248, middleOf(100))],
        [text("重なる架空の文です。", 50, 100), text("メモ", 160, 100, { size: 10, font: BOX })],
      ),
    ]);
    expect(markers).toEqual([
      {
        text: "重なる架空の文です。",
        comment: "メモ",
        page: 1,
        position: 100_000,
        question: false,
      },
    ]);
  });

  it("HiraginoSans の書体があれば、それだけをテキストボックスとみなす（本の見出しの書体はマーカーの文のまま）", () => {
    const markers = extractGoodNotesMarkers([
      page(
        [stroke(52, 108, middleOf(100))],
        [
          text("見出しの例", 50, 100, { font: "CCCCCC+GothicPro-Bold" }),
          text("本文のほうが字の多い架空のページです。", 50, 140),
          text("見出しのメモ", 60, 116, { size: 9, font: BOX }),
        ],
      ),
    ]);
    expect(markers).toEqual([
      { text: "見出しの例", comment: "見出しのメモ", page: 1, position: 100_000, question: false },
    ]);
  });

  it("HiraginoSans がなければ、本文といちばん多い書体と違う書体の文をテキストボックスとみなす", () => {
    const markers = extractGoodNotesMarkers([
      page(
        [stroke(52, 108, middleOf(100))],
        [
          text("本文の架空の文です。", 50, 100),
          text("ほかの書体のメモ", 60, 120, { size: 9, font: "DDDDDD+Helvetica" }),
        ],
      ),
    ]);
    expect(markers[0]).toMatchObject({ text: "本文の架空の", comment: "ほかの書体のメモ" });
  });

  it("`?` か `？` で始まるコメントに印を付ける", () => {
    const markers = extractGoodNotesMarkers([
      page(strokes, [
        ...body,
        text("？これは本当か", 60, 80, { size: 9, font: BOX }),
        text("?あとで調べる", 60, 200, { size: 9, font: BOX }),
      ]),
      page(strokes, [...body, text("ふつうのメモ？", 60, 200, { size: 9, font: BOX })]),
    ]);
    expect(markers.map((marker) => marker.question)).toEqual([true, true, false, false]);
  });
});

describe("章とページ", () => {
  /**
   * 柱のあるページ。
   * @param title 柱の章か節の名前（なければ柱なし）
   * @param pageNumber 柱のページ番号
   * @returns ページ
   */
  function withHeader(title: string | undefined, pageNumber?: string): GoodNotesPage {
    const header = [
      ...(title ? [text(title, 60, 30, { size: 9 })] : []),
      ...(pageNumber ? [text(pageNumber, 360, 30, { size: 9 })] : []),
    ];
    return page(
      [stroke(52, 128, middleOf(100))],
      [...header, text("架空の本文の行です。", 50, 100)],
    );
  }

  it("柱から章とページ番号を取る。柱のないページは前の章を引き継ぎ、ページは PDF のページ番号にする", () => {
    const markers = extractGoodNotesMarkers([
      withHeader("1.2　見本の節", "13"),
      withHeader(undefined),
      withHeader("1.3　次の節", "15"),
    ]);
    expect(markers.map(({ chapter, page: number }) => ({ chapter, page: number }))).toEqual([
      { chapter: "1.2 見本の節", page: 13 },
      { chapter: "1.2 見本の節", page: 2 },
      { chapter: "1.3 次の節", page: 15 },
    ]);
  });

  it("章の名前（偶数ページ）が分かっていれば、同じ番号の節の名前（奇数ページ）より章の名前を使う", () => {
    const markers = extractGoodNotesMarkers([
      withHeader("6 章　知識と記憶", "120"),
      withHeader("6.1　記憶の形", "121"),
      withHeader("7.2　パラメトリック学習", "141"),
    ]);
    expect(markers.map((marker) => marker.chapter)).toEqual([
      "6 章 知識と記憶",
      "6 章 知識と記憶",
      "7.2 パラメトリック学習",
    ]);
  });

  it("柱の帯の文は、マーカーの文にもテキストボックスにもしない", () => {
    const markers = extractGoodNotesMarkers([
      page(
        [stroke(52, 108, middleOf(100))],
        [
          text("柱のメモ風の文", 60, 30, { size: 9, font: BOX }),
          text("架空の本文の行です。", 50, 100),
        ],
      ),
    ]);
    expect(markers).toEqual([
      { text: "架空の本文の", page: 1, position: 100_000, question: false },
    ]);
  });

  it("最初の柱の前のページは、章を持たない", () => {
    const markers = extractGoodNotesMarkers([
      withHeader(undefined),
      withHeader("1.1　始まりの節", "3"),
    ]);
    expect(markers[0]).not.toHaveProperty("chapter");
    expect(markers[1]?.chapter).toBe("1.1 始まりの節");
  });
});

describe("並びの番号", () => {
  it("PDF のページ × 100,000 ＋ ページの中の上からの順（0から）にする", () => {
    const texts = [text("一つ目の架空の文。", 50, 100), text("二つ目の架空の文。", 50, 300)];
    const strokes = [stroke(52, 98, middleOf(300)), stroke(52, 98, middleOf(100))];
    const markers = extractGoodNotesMarkers([
      page([], []),
      page(strokes, texts),
      page(strokes, texts),
    ]);
    expect(markers.map(({ text: value, position }) => ({ text: value, position }))).toEqual([
      { text: "一つ目の架", position: 200_000 },
      { text: "二つ目の架", position: 200_001 },
      { text: "一つ目の架", position: 300_000 },
      { text: "二つ目の架", position: 300_001 },
    ]);
  });
});
