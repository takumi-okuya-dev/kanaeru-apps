// Kindle のアプリの「ノートブックの書き出し」の HTML の読み方（specs/reading/002-kindle-search/research.md R2・PRD の補足 7章）。
// 端末の中で読み、マーカーの文・メモ・章・ページか位置だけを取り出す（AD-34）。HTML は DOMParser で読み、スクリプトを動かさず、
// textContent だけを使う。表示の言葉（Highlight・ハイライト・Page・ページ など）は言語で変わるので、クラスの名前と並びで読む。
import { isQuestionComment } from "@workspace/contracts/reading";
import type { ImportedMarker } from "./goodnotes.ts";

/** ハイライトの色の印（2026-11-28 に持ち主の日本語のアプリの書き出しで annotation_ を確かめた。古い形は highlight_）。 */
const HIGHLIGHT_SPAN = [
  'span[class^="annotation_"]',
  'span[class*=" annotation_"]',
  'span[class^="highlight_"]',
  'span[class*=" highlight_"]',
].join(", ");

/** 日本語の字（漢字・ひらがな・カタカナ・長音・句読点・かっこ）。 */
const JA = "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー、。「」『』（）・]";

/** 日本語の字どうしの間の空白（固定のレイアウトの本の、行の折り返しの名残）。 */
const SPACE_BETWEEN_JA = new RegExp(`(?<=${JA}) +(?=${JA})`, "gu");

/** 文の終わりの字（これで終わるハイライトは、次のハイライトにつなげない）。 */
const SENTENCE_END = /[。．.!?！？」』）)]$/u;

/**
 * ハイライトとメモの文を整える（日本語の字どうしの間の空白を除く）。
 * @param value 文
 * @returns 整えた文
 */
export function cleanKindleText(value: string): string {
  return value.replace(SPACE_BETWEEN_JA, "");
}

/**
 * 2つの文をつなぐ（日本語どうしなら空白なし、そうでなければ空白1つ）。
 * @param before 前の文
 * @param after 後の文
 * @returns つないだ文
 */
function joinText(before: string, after: string): string {
  const ja = new RegExp(`${JA}$`, "u").test(before) && new RegExp(`^${JA}`, "u").test(after);
  return ja ? `${before}${after}` : `${before} ${after}`;
}

/** メモを直前のハイライトに付けるときの、位置の離れの上限。 */
const NOTE_DISTANCE_MAX = 10;

/** Kindle の書き出しを読めなかった。 */
export class KindleReadError extends Error {
  /** 理由（not-kindle：Kindle の書き出しの HTML でない） */
  readonly reason: "not-kindle";

  /**
   * 読めなかったことを作る。
   */
  constructor() {
    super("Kindle の書き出しの HTML ではありません。");
    this.name = "KindleReadError";
    this.reason = "not-kindle";
  }
}

/** 読み取った結果。 */
export type KindleResult = {
  /** 書名 */
  title: string | null;
  /** 著者 */
  author: string | null;
  /** マーカー（本の中の順） */
  markers: ImportedMarker[];
  /** 「…」で終わるハイライトの数（出版社の上限で切れたかもしれないもの） */
  truncatedCount: number;
};

/**
 * 節の文字を、空白をそろえて取り出す。
 * @param element 節
 * @returns 文字（なければ空）
 */
function textOf(element: Element | null): string {
  return (element?.textContent ?? "").replace(/\s+/gu, " ").trim();
}

/**
 * 見出しの中の数字（カンマを除く）から、ページと位置を取る。最後の数字を位置、その前があればページにする。
 * 「章名 > Page 9 · Location 55」のように章名に数字があっても、「>」の後ろだけを見る。
 * @param heading 見出しの文字
 * @returns ページと位置
 */
export function pageAndLocation(heading: string): { page?: number; location?: number } {
  const tail = heading.includes(">") ? heading.slice(heading.lastIndexOf(">") + 1) : heading;
  const afterDash = tail.includes(" - ") ? tail.slice(tail.indexOf(" - ") + 3) : tail;
  const numbers = [...afterDash.matchAll(/\d[\d,]*/gu)]
    .map((match) => Number(match[0].replace(/,/gu, "")))
    .filter((value) => Number.isSafeInteger(value) && value >= 1);
  if (numbers.length >= 2) return { page: numbers.at(-2), location: numbers.at(-1) };
  // 数字が1つ：ページか位置かは言葉で分からないので、位置とみなす（Kindle の書き出しには、いつも位置が入る）
  if (numbers.length === 1) return { location: numbers[0] };
  return {};
}

/**
 * 本の中の並びの番号（ページがあればページ × 100,000 ＋ 位置、なければ位置）。
 * @param page ページ
 * @param location 位置
 * @param order 書き出しの中の順（どちらもないとき）
 * @returns 並びの番号
 */
function positionOf(page: number | undefined, location: number | undefined, order: number): number {
  if (page !== undefined) return page * 100_000 + Math.min(location ?? order, 99_999);
  return location ?? order;
}

/**
 * Kindle の書き出しの HTML を読む。
 * @param html HTML の文字
 * @returns 書名・著者・マーカー・切れたかもしれない数
 * @throws {KindleReadError} Kindle の書き出しの HTML でないとき
 */
export function readKindleHtml(html: string): KindleResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const titleElement = doc.querySelector(".bookTitle");
  if (!titleElement || !doc.querySelector(".noteHeading")) throw new KindleReadError();

  const markers: ImportedMarker[] = [];
  let chapter: string | undefined;
  // メモを付ける先（直前のハイライト。メモを付けたら空にする）
  let last: ImportedMarker | undefined;
  // ページをまたいで分かれたハイライトをつなぐ先（直前のハイライト。メモを挟んでも残す）
  let lastHighlight: ImportedMarker | undefined;
  let order = 0;
  const nodes = doc.querySelectorAll(".sectionHeading, .noteHeading");
  for (const node of nodes) {
    if (node.classList.contains("sectionHeading")) {
      const name = textOf(node);
      chapter = name === "" ? undefined : name;
      continue;
    }
    // 見出しの次の noteText が本文（間にほかの節が挟まっても、次の noteText までを見る）
    let next = node.nextElementSibling;
    while (next && !next.classList.contains("noteText")) {
      if (next.classList.contains("noteHeading") || next.classList.contains("sectionHeading")) {
        next = null;
        break;
      }
      next = next.nextElementSibling;
    }
    const body = cleanKindleText(textOf(next));
    if (body === "") continue;
    order += 1;
    const heading = textOf(node);
    const { page, location } = pageAndLocation(heading);
    // ハイライトの見出しには色の span がある（今の書き出しは annotation_<色>、古い書き出しは highlight_<色>）。メモにはない
    const isHighlight = node.querySelector(HIGHLIGHT_SPAN) !== null;
    if (!isHighlight) {
      // メモ：直前のハイライトに付ける（位置が近いときだけ）。なければコメントだけのマーカー
      const near =
        last !== undefined &&
        (location === undefined ||
          last.location === undefined ||
          Math.abs(location - last.location) <= NOTE_DISTANCE_MAX);
      if (last && near && last.text !== "") {
        last.comment = last.comment ? `${last.comment}\n${body}` : body;
        last.question = last.question || isQuestionComment(body);
        last = undefined;
        continue;
      }
      markers.push({
        text: "",
        comment: body,
        ...(chapter !== undefined ? { chapter } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(location !== undefined ? { location } : {}),
        position: positionOf(page, location, order),
        question: isQuestionComment(body),
      });
      last = undefined;
      lastHighlight = undefined;
      continue;
    }
    // ページをまたいで引いたハイライトは、ページの区切りで2つに分かれて書き出される（2026-11-28 に実物で確かめた）。
    // 直前のハイライトが同じ章で、位置が続いていて（差が1まで）、文の終わりで終わっていなければ、1つにつなぐ
    if (
      lastHighlight &&
      lastHighlight.chapter === chapter &&
      location !== undefined &&
      lastHighlight.location !== undefined &&
      location - lastHighlight.location >= 0 &&
      location - lastHighlight.location <= 1 &&
      !SENTENCE_END.test(lastHighlight.text)
    ) {
      lastHighlight.text = joinText(lastHighlight.text, body);
      lastHighlight.location = location;
      last = lastHighlight;
      continue;
    }
    const marker: ImportedMarker = {
      text: body,
      ...(chapter !== undefined ? { chapter } : {}),
      ...(page !== undefined ? { page } : {}),
      ...(location !== undefined ? { location } : {}),
      position: positionOf(page, location, order),
      question: false,
    };
    markers.push(marker);
    last = marker;
    lastHighlight = marker;
  }
  const truncatedCount = markers.filter((marker) => /(…|\.\.\.)$/u.test(marker.text)).length;
  const author = textOf(doc.querySelector(".authors"));
  return {
    title: textOf(titleElement) || null,
    author: author === "" ? null : author,
    markers,
    truncatedCount,
  };
}
