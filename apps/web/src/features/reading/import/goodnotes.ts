// GoodNotes から書き出した PDF から、マーカーとコメントを取り出す読み方（research R5・spec US2）。
// pdf.js に依存しない、状態を持たない関数にする（pdf.js から取り出すのは pdf.ts。ここは取り出した線と文だけを読む）。
// GoodNotes は注釈を使わず、マーカーもテキストボックスもページに焼きこむ。しおりもない。
// - マーカー：不透明度が1未満で、線の幅が 8pt 以上の線（色は見ない）。同じ高さ（4pt 以内）の線は1行、
//   行の間（行の真ん中どうしの間）が 22pt より狭い行は1つのマーカーにする。線の上下に幅の半分を足した四角に、半分以上入る字を拾う
// - テキストボックス：ページでいちばん多い書体（本文）と違う書体で、柱の帯の外にある文。GoodNotes の既定の書体
//   （HiraginoSans）の名前の書体がそのページにあれば、それだけをテキストボックスとみなす（本の見出しの書体をコメントにしない）。
//   いちばん近いマーカー（四角の間が 100pt 以内）のコメントにし、近くになければ文のないコメントだけのものにする
// - 章とページ：ページの上の柱の帯（上から 45pt）の文から、章・節の名前（数字で始まる、または「章」を含む）と、
//   数字だけのページ番号を取る。章の名前（偶数ページ）が分かっていれば、同じ番号の節の名前（奇数ページ）より章の名前を使う。
//   柱のないページ（章の扉など）は前の章を引き継ぐ。ページ番号がなければ PDF のページ番号にする
// 座標はどれも PDF のページの座標（左下が原点で、右と上へ増える pt）で受け取り、中では上から下へ増える形に直して読む。

/** PDF のページの座標の四角（左下が原点で、右と上へ増える pt）。 */
export type PdfBox = {
  /** 左の端 */
  x0: number;
  /** 下の端 */
  y0: number;
  /** 右の端 */
  x1: number;
  /** 上の端 */
  y1: number;
};

/** ページに描かれた線（stroke）。四角は線の通り道の範囲（線の幅を足す前）。 */
export type GoodNotesStroke = PdfBox & {
  /** 線の幅（pt。CTM で直したもの） */
  width: number;
  /** 線の不透明度（0〜1） */
  opacity: number;
};

/** ページの文の項目。四角は字の枠（字の下の線の少し下から、字の大きさの分の高さ）。 */
export type GoodNotesText = PdfBox & {
  /** 文字（1つの項目の字は、四角の中に同じ幅で並ぶとみなす） */
  text: string;
  /** 書体の名前（例 "AAAAAK+HiraginoSans-W3"。名前が取れなければ、書体を見分けられる別の名前） */
  font: string;
};

/** 1ページ分の入力。 */
export type GoodNotesPage = {
  /** ページの高さ（pt） */
  height: number;
  /** 線 */
  strokes: readonly GoodNotesStroke[];
  /** 文の項目 */
  texts: readonly GoodNotesText[];
};

/** 取り出したマーカー（文のないものは、コメントだけのもの。@workspace/contracts/reading の取りこみの1件に、そのまま渡せる形。無い欄は省く）。 */
export type ImportedMarker = {
  /** マーカーの文（コメントだけのものは空） */
  text: string;
  /** コメント（テキストボックスの文） */
  comment?: string;
  /** 章（柱から取った章か節の名前） */
  chapter?: string;
  /** ページ（柱のページ番号。なければ PDF のページ番号。GoodNotes の PDF では必ず入る） */
  page?: number;
  /** 位置（Kindle の位置。GoodNotes の PDF では入らない。reading-002） */
  location?: number;
  /** 本の中の並びの番号（PDF のページ × 100,000 ＋ ページの中の上からの順〈0から〉） */
  position: number;
  /** コメントが `?` か `？` で始まる */
  question: boolean;
};

/** 読み方の決まりの値（research R5）。 */
export const GOODNOTES_RULES = {
  /** マーカーとみなす線の幅の下限（pt） */
  minStrokeWidth: 8,
  /** 同じ行とみなす線の高さの違い（pt） */
  sameLineTolerance: 4,
  /** 1つのマーカーにまとめる行の間（行の真ん中どうし。これより狭ければまとめる。pt） */
  lineGap: 22,
  /** 柱の帯（ページの上からの高さ。pt） */
  headerBand: 45,
  /** 字を拾う、四角に入る割合の下限 */
  minCoverage: 0.5,
  /** テキストボックスを近いマーカーのコメントにする、四角の間の上限（pt） */
  commentDistance: 100,
  /** 1ページの中の順の番号の幅（position ＝ ページ × これ ＋ 順） */
  positionPerPage: 100_000,
} as const;

/** GoodNotes のテキストボックスの既定の書体の名前（research R5）。 */
const TEXT_BOX_FONT = /HiraginoSans/iu;

/** 上から下へ増える形の四角（中だけで使う）。 */
type Rect = { left: number; top: number; right: number; bottom: number };

/** 1つの字（文の項目を同じ幅で切ったもの）。 */
type Glyph = Rect & { char: string };

/** マーカーの1行（同じ高さの線を、横に重なるものごとにまとめた四角の並び）。 */
type StrokeLine = { center: number; segments: Rect[] };

/** 読んでいる途中のマーカー。 */
type Highlight = { lines: StrokeLine[]; box: Rect; text: string; comments: string[] };

/** テキストボックス（同じ書体の、近い文の項目をまとめたもの）。 */
type TextBox = { font: string; box: Rect; rows: { box: Rect; text: string }[] };

/**
 * PDF の座標の四角を、上から下へ増える形にする。
 * @param box PDF の座標の四角
 * @param height ページの高さ
 * @returns 上から下へ増える形の四角
 */
function toRect(box: PdfBox, height: number): Rect {
  return {
    left: Math.min(box.x0, box.x1),
    right: Math.max(box.x0, box.x1),
    top: height - Math.max(box.y0, box.y1),
    bottom: height - Math.min(box.y0, box.y1),
  };
}

/**
 * 2つの四角を囲む四角。
 * @param a 四角
 * @param b 四角
 * @returns 両方を囲む四角
 */
function union(a: Rect, b: Rect): Rect {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

/**
 * 2つの四角の間のいちばん近いところの長さ（重なれば 0）。
 * @param a 四角
 * @param b 四角
 * @returns 長さ（pt）
 */
function distance(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.hypot(dx, dy);
}

/**
 * 字の枠のうち、四角に入る割合（字の幅がなければ、字の真ん中が横に入るかで見る）。
 * @param glyph 字の枠
 * @param rect 四角
 * @returns 0〜1
 */
function coverage(glyph: Rect, rect: Rect): number {
  const height = glyph.bottom - glyph.top;
  const width = glyph.right - glyph.left;
  const overlapY = Math.max(0, Math.min(glyph.bottom, rect.bottom) - Math.max(glyph.top, rect.top));
  const ratioY = height > 0 ? overlapY / height : overlapY > 0 ? 1 : 0;
  if (width <= 0) {
    const center = glyph.left;
    return center >= rect.left && center <= rect.right ? ratioY : 0;
  }
  const overlapX = Math.max(0, Math.min(glyph.right, rect.right) - Math.max(glyph.left, rect.left));
  return (overlapX / width) * ratioY;
}

/**
 * 2つの文をつなぐ（英数字どうしの間だけ空白を入れる。日本語の行のつなぎ目には入れない）。
 * @param head 前の文
 * @param tail 後ろの文
 * @returns つないだ文
 */
function joinText(head: string, tail: string): string {
  if (head === "" || tail === "") return head + tail;
  return /[A-Za-z0-9,.;:!?)]$/u.test(head) && /^[A-Za-z0-9(]/u.test(tail)
    ? `${head} ${tail}`
    : head + tail;
}

/**
 * 空白の並びを1つの空白にし、前後の空白を取る。
 * @param value 文
 * @returns そろえた文
 */
function squash(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/**
 * 文の項目を、字ごとの枠に切る（字は項目の四角の中に同じ幅で並ぶとみなす）。
 * @param item 文の項目（上から下へ増える形の四角）
 * @returns 字の枠の並び
 */
function splitGlyphs(item: Rect & { text: string }): Glyph[] {
  const chars = [...item.text];
  const width = (item.right - item.left) / Math.max(chars.length, 1);
  return chars.map((char, index) => ({
    char,
    top: item.top,
    bottom: item.bottom,
    left: item.left + width * index,
    right: item.left + width * (index + 1),
  }));
}

/**
 * マーカーの線を、行とマーカーにまとめる。
 * @param strokes ページの線
 * @param height ページの高さ
 * @returns 上から順のマーカー（文はまだ空）
 */
function groupHighlights(strokes: readonly GoodNotesStroke[], height: number): Highlight[] {
  const marks = strokes
    .filter((stroke) => stroke.opacity < 1 && stroke.width >= GOODNOTES_RULES.minStrokeWidth)
    .map((stroke) => {
      const path = toRect(stroke, height);
      const half = stroke.width / 2;
      return {
        center: (path.top + path.bottom) / 2,
        rect: { ...path, top: path.top - half, bottom: path.bottom + half },
      };
    })
    .sort((a, b) => a.center - b.center);

  // 同じ高さの線を1行にする（行の真ん中は、入れた線の真ん中の平均）
  const rows: { centers: number[]; rects: Rect[] }[] = [];
  for (const mark of marks) {
    const row = rows.at(-1);
    const center = row
      ? row.centers.reduce((sum, value) => sum + value, 0) / row.centers.length
      : 0;
    if (row && Math.abs(mark.center - center) <= GOODNOTES_RULES.sameLineTolerance) {
      row.centers.push(mark.center);
      row.rects.push(mark.rect);
    } else rows.push({ centers: [mark.center], rects: [mark.rect] });
  }
  const lines: StrokeLine[] = rows.map((row) => {
    // 横に重なる線（1行に2本重ねた線）は1つの四角にし、離れた線は別の四角のままにする（間の字を拾わない）
    const segments: Rect[] = [];
    for (const rect of [...row.rects].sort((a, b) => a.left - b.left)) {
      const last = segments.at(-1);
      if (last && rect.left <= last.right) segments[segments.length - 1] = union(last, rect);
      else segments.push(rect);
    }
    const center = row.centers.reduce((sum, value) => sum + value, 0) / row.centers.length;
    return { center, segments };
  });

  // 行の間が狭い行を1つのマーカーにする
  const highlights: Highlight[] = [];
  for (const line of lines) {
    const current = highlights.at(-1);
    const previous = current?.lines.at(-1);
    const box = line.segments.reduce(union);
    if (current && previous && line.center - previous.center < GOODNOTES_RULES.lineGap) {
      current.lines.push(line);
      current.box = union(current.box, box);
    } else highlights.push({ lines: [line], box, text: "", comments: [] });
  }
  return highlights;
}

/**
 * マーカーの四角に半分以上入る字を拾い、マーカーの文を作る。
 * @param highlights マーカー
 * @param glyphs 本の文の字（柱とテキストボックスを除いたもの）
 */
function fillHighlightText(highlights: Highlight[], glyphs: readonly Glyph[]): void {
  const picked = highlights.map((highlight) => highlight.lines.map(() => [] as Glyph[]));
  for (const glyph of glyphs) {
    let best: { score: number; highlight: number; line: number } | undefined;
    highlights.forEach((highlight, highlightIndex) => {
      highlight.lines.forEach((line, lineIndex) => {
        for (const segment of line.segments) {
          const score = coverage(glyph, segment);
          if (score >= GOODNOTES_RULES.minCoverage && (!best || score > best.score)) {
            best = { score, highlight: highlightIndex, line: lineIndex };
          }
        }
      });
    });
    if (best) picked[best.highlight]?.[best.line]?.push(glyph);
  }
  highlights.forEach((highlight, index) => {
    const lines = (picked[index] ?? []).map((line) =>
      [...line]
        .sort((a, b) => a.left - b.left)
        .map((glyph) => glyph.char)
        .join(""),
    );
    highlight.text = squash(lines.map(squash).reduce(joinText, ""));
  });
}

/**
 * テキストボックスの文の項目を、同じ書体で近いものごとにまとめる。
 * @param items テキストボックスの文の項目（上から下へ増える形の四角）
 * @returns テキストボックス
 */
function groupTextBoxes(items: readonly (Rect & { text: string; font: string })[]): TextBox[] {
  const sorted = [...items].sort((a, b) =>
    Math.abs(a.top - b.top) > (a.bottom - a.top) / 2 ? a.top - b.top : a.left - b.left,
  );
  const boxes: TextBox[] = [];
  for (const item of sorted) {
    const lineHeight = item.bottom - item.top;
    const box = boxes.find(
      (candidate) =>
        candidate.font === item.font &&
        item.top - candidate.box.bottom <= lineHeight &&
        item.bottom >= candidate.box.top &&
        item.left <= candidate.box.right + lineHeight &&
        item.right >= candidate.box.left - lineHeight,
    );
    const row = { box: item as Rect, text: item.text };
    if (box) {
      box.rows.push(row);
      box.box = union(box.box, item);
    } else boxes.push({ font: item.font, box: item, rows: [row] });
  }
  return boxes;
}

/**
 * テキストボックスの文（同じ高さの項目は左から、行は上から順につなぐ）。
 * @param box テキストボックス
 * @returns 文
 */
function textBoxText(box: TextBox): string {
  const lines: { top: number; bottom: number; parts: { left: number; text: string }[] }[] = [];
  for (const row of box.rows) {
    const line = lines.find(
      (candidate) =>
        (row.box.top + row.box.bottom) / 2 > candidate.top &&
        (row.box.top + row.box.bottom) / 2 < candidate.bottom,
    );
    if (line) line.parts.push({ left: row.box.left, text: row.text });
    else
      lines.push({
        top: row.box.top,
        bottom: row.box.bottom,
        parts: [{ left: row.box.left, text: row.text }],
      });
  }
  return squash(
    lines
      .sort((a, b) => a.top - b.top)
      .map((line) =>
        squash(
          line.parts
            .sort((a, b) => a.left - b.left)
            .map((part) => part.text)
            .join(""),
        ),
      )
      .reduce(joinText, ""),
  );
}

/**
 * 柱の帯の文から、章か節の名前と、ページ番号を取る。
 * 項目を左から並べ、字の大きさの2倍より離れた所で切る。数字だけのものがページ番号、ほかで章・節らしいものが名前。
 * @param items 柱の帯の文の項目（上から下へ増える形の四角）
 * @returns 名前とページ番号（なければ undefined）
 */
function readHeader(items: readonly (Rect & { text: string })[]): {
  title?: string;
  page?: number;
} {
  const groups: { right: number; text: string }[] = [];
  for (const item of [...items]
    .filter((candidate) => candidate.text.trim() !== "")
    .sort((a, b) => a.left - b.left)) {
    const size = item.bottom - item.top;
    const last = groups.at(-1);
    if (last && item.left - last.right <= size * 2) {
      const spaced = item.left - last.right > size / 4 ? " " : "";
      last.text = `${last.text}${spaced}${item.text}`;
      last.right = Math.max(last.right, item.right);
    } else groups.push({ right: item.right, text: item.text });
  }
  let title: string | undefined;
  let page: number | undefined;
  for (const group of groups) {
    const text = squash(group.text);
    const plain = text.normalize("NFKC");
    if (/^\d+$/u.test(plain)) {
      const number = Number(plain);
      if (page === undefined && number >= 1) page = number;
    } else if (/章/u.test(plain) || (/^\d/u.test(plain) && !(title && /章/u.test(title)))) {
      title ??= text;
      if (/章/u.test(plain)) title = text;
    }
  }
  return { ...(title ? { title } : {}), ...(page ? { page } : {}) };
}

/**
 * 名前の頭の数（「6 章」なら 6、「7.2」なら 7）。
 * @param title 章か節の名前
 * @returns 数（数で始まらなければ undefined）
 */
function leadingNumber(title: string): number | undefined {
  const match = /^(\d+)/u.exec(title.normalize("NFKC"));
  return match ? Number(match[1]) : undefined;
}

/**
 * GoodNotes から書き出した PDF のページから、マーカーとコメントを取り出す（research R5）。
 * @param pages ページごとの線・文の項目・高さ（PDF のページの順）
 * @returns 本の中の順のマーカー（文のないものはコメントだけのもの）
 */
export function extractGoodNotesMarkers(pages: readonly GoodNotesPage[]): ImportedMarker[] {
  const markers: ImportedMarker[] = [];
  let chapter: string | undefined;
  pages.forEach((page, pageIndex) => {
    const pdfPage = pageIndex + 1;
    const items = page.texts
      .filter((item) => item.text !== "")
      .map((item) => ({ ...toRect(item, page.height), text: item.text, font: item.font }));
    const inHeader = (item: Rect) => (item.top + item.bottom) / 2 < GOODNOTES_RULES.headerBand;
    const headerItems = items.filter(inHeader);
    const bodyItems = items.filter((item) => !inHeader(item));

    // 章とページ（柱がなければ前の章を引き継ぐ。同じ番号の章の名前が分かっていれば、節の名前より章の名前）
    const header = readHeader(headerItems);
    if (header.title) {
      const keepChapter =
        chapter !== undefined &&
        /章/u.test(chapter) &&
        !/章/u.test(header.title) &&
        leadingNumber(chapter) === leadingNumber(header.title);
      if (!keepChapter) chapter = header.title;
    }
    const pageNumber = header.page ?? pdfPage;

    // 本文の書体（字の数がいちばん多い書体）と、テキストボックスの書体
    const counts = new Map<string, number>();
    for (const item of bodyItems) {
      const count = [...item.text.replace(/\s/gu, "")].length;
      counts.set(item.font, (counts.get(item.font) ?? 0) + count);
    }
    const bodyFont = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const others = [...counts.keys()].filter((font) => font !== bodyFont);
    const preferred = others.filter((font) => TEXT_BOX_FONT.test(font));
    const boxFonts = new Set(preferred.length > 0 ? preferred : others);

    const highlights = groupHighlights(page.strokes, page.height);
    fillHighlightText(
      highlights,
      bodyItems.filter((item) => !boxFonts.has(item.font)).flatMap(splitGlyphs),
    );
    const withText = highlights.filter((highlight) => highlight.text !== "");

    // テキストボックスを、いちばん近いマーカーのコメントにする（近くになければコメントだけのもの）
    const loose: { box: Rect; comment: string }[] = [];
    for (const box of groupTextBoxes(bodyItems.filter((item) => boxFonts.has(item.font)))) {
      const comment = textBoxText(box);
      if (comment === "") continue;
      let nearest: { highlight: Highlight; gap: number } | undefined;
      for (const highlight of withText) {
        const gap = distance(box.box, highlight.box);
        if (!nearest || gap < nearest.gap) nearest = { highlight, gap };
      }
      if (nearest && nearest.gap <= GOODNOTES_RULES.commentDistance) {
        nearest.highlight.comments.push(comment);
      } else loose.push({ box: box.box, comment });
    }

    const entries = [
      ...withText.map((highlight) => ({
        top: highlight.box.top,
        left: highlight.box.left,
        text: highlight.text,
        comment: highlight.comments.join("\n"),
      })),
      ...loose.map((item) => ({
        top: item.box.top,
        left: item.box.left,
        text: "",
        comment: item.comment,
      })),
    ].sort((a, b) => a.top - b.top || a.left - b.left);
    entries.forEach((entry, order) => {
      markers.push({
        text: entry.text,
        ...(entry.comment ? { comment: entry.comment } : {}),
        ...(chapter ? { chapter } : {}),
        page: pageNumber,
        position: pdfPage * GOODNOTES_RULES.positionPerPage + order,
        question: /^[?？]/u.test(entry.comment),
      });
    });
  });
  return markers;
}
