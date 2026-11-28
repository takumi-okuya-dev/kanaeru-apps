// 貼り付けの取りこみの読み方（specs/reading/001-bookshelf-import/research.md R8・PRD FR-R8）。zod を読まない。
// 1行に1つのマーカー。行の頭の「p.38」「P38」「p38」「38:」「38 」をページに、「//」の後ろをコメントにする。
// 「?」「？」で始まるコメントには、あとで調べるの印を付ける（PRD FR-R11）。上限をこえる行は誤りとして返す（ほかの行は読む）。
import { READING_MARKER_LIMITS, countChars } from "./limits.ts";

/** 読み取ったマーカー（取りこみの窓口に送る形と同じ並び）。 */
export type PastedMarker = {
  /** マーカーの文 */
  text: string;
  /** コメント */
  comment?: string;
  /** ページ */
  page?: number;
  /** 本の中の並びの番号（ページがあればページ × 100,000 ＋ 行の順。なければ行の順） */
  position: number;
  /** あとで調べるの印 */
  question: boolean;
};

/** 貼り付けを読んだ結果。 */
export type PasteResult = {
  /** 読み取ったマーカー */
  markers: PastedMarker[];
  /** 上限をこえて読まなかった行の番号（1から） */
  tooLongLines: number[];
};

/** 行の頭のページ（p.38・P38・p38・38:・38 のあとに文）。 */
const PAGE_PREFIX = /^(?:[pP]\.?\s*(\d{1,6})\s*[:：]?\s*|(\d{1,6})\s*[:：]\s*|(\d{1,6})\s+)(?=\S)/u;

/**
 * コメントが「あとで調べる」で始まるか（? と全角の ？）。
 * @param comment コメント
 * @returns 始まるか
 */
export function isQuestionComment(comment: string | undefined | null): boolean {
  return comment !== undefined && comment !== null && /^[?？]/u.test(comment.trim());
}

/**
 * 貼り付けた文を読む。
 * @param pasted 貼り付けた文
 * @returns 読み取ったマーカーと、読まなかった行
 */
export function parsePastedMarkers(pasted: string): PasteResult {
  const markers: PastedMarker[] = [];
  const tooLongLines: number[] = [];
  pasted.split(/\r\n|\r|\n/u).forEach((raw, index) => {
    let line = raw.trim();
    if (line === "") return;
    let page: number | undefined;
    const match = PAGE_PREFIX.exec(line);
    if (match) {
      const number = Number(match[1] ?? match[2] ?? match[3]);
      if (number >= 1) page = number;
      line = line.slice(match[0].length).trim();
    }
    const split = line.indexOf("//");
    const text = (split === -1 ? line : line.slice(0, split)).trim();
    const commentText = split === -1 ? "" : line.slice(split + 2).trim();
    const comment = commentText === "" ? undefined : commentText;
    if (text === "" && comment === undefined) return;
    if (
      countChars(text) > READING_MARKER_LIMITS.text ||
      (comment !== undefined && countChars(comment) > READING_MARKER_LIMITS.comment)
    ) {
      tooLongLines.push(index + 1);
      return;
    }
    const order = markers.length + 1;
    markers.push({
      text,
      ...(comment !== undefined ? { comment } : {}),
      ...(page !== undefined ? { page } : {}),
      position: page !== undefined ? page * 100_000 + order : order,
      question: isQuestionComment(comment),
    });
  });
  return { markers, tooLongLines };
}
