// 取りこみの画面（/reading/import）から確かめの画面（/reading/import/confirm）へ、読み取った中身を渡す置き場（画面の中だけ）。
// マーカーの文は、道・search params・sessionStorage・localStorage に入れない（PRD 5章）。読み直したら消える（確かめの画面は取りこみの画面へ戻す）。
import type { ImportedMarker } from "./import/goodnotes.ts";
import type { ReadingMarkerSource } from "@workspace/contracts/reading";

/** 読み取った中身。 */
export type ImportDraft = {
  /** どこから取りこむか */
  source: ReadingMarkerSource;
  /** 読み取ったファイルの名前（貼り付けは null。入れる本の候補を出すのに使う） */
  fileName: string | null;
  /** 読み取ったマーカー */
  markers: ImportedMarker[];
  /** 入れる本（先に選んであれば） */
  bookId: string | null;
  /** 上限をこえて読まなかった行（貼り付けだけ） */
  skippedLines: number[];
  /** 文が長すぎて入れないマーカーの数（PDF だけ） */
  skippedCount: number;
};

let draft: ImportDraft | undefined;

/**
 * 読み取った中身を置く。
 * @param next 中身
 */
export function setImportDraft(next: ImportDraft): void {
  draft = next;
}

/**
 * 読み取った中身を読む。
 * @returns 中身（なければ undefined）
 */
export function getImportDraft(): ImportDraft | undefined {
  return draft;
}

/** 読み取った中身を消す（入れ終えたとき・やめたとき）。 */
export function clearImportDraft(): void {
  draft = undefined;
}
