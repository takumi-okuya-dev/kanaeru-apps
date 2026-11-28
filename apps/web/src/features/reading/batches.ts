// 取りこむマーカーを、API の本文の上限に収まる束に分ける（research R7）。1束は JSON で 90KB・500件まで。順は変えない。
import { READING_IMPORT_LIMITS } from "@workspace/contracts/reading";
import type { MarkerImportItem, ReadingMarkerSource } from "@workspace/contracts/reading";

/** 束の大きさを測るための、本文の外側の余白（{"source":"…","markers":[]} の分）。 */
const ENVELOPE_BYTES = 64;

/**
 * 文字の UTF-8 のバイト数。
 * @param value 文字
 * @returns バイト数
 */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * マーカーを束に分ける。
 * @param source どこから取りこむか（本文の大きさに入る）
 * @param markers マーカー（順のまま）
 * @param limits 上限（テストで小さくする）
 * @param limits.batchBytes 1束の本文の大きさ（バイト）
 * @param limits.markersPerBatch 1束の件数
 * @returns 束の並び
 */
export function splitIntoBatches(
  source: ReadingMarkerSource,
  markers: readonly MarkerImportItem[],
  limits: { batchBytes: number; markersPerBatch: number } = READING_IMPORT_LIMITS,
): MarkerImportItem[][] {
  const batches: MarkerImportItem[][] = [];
  let current: MarkerImportItem[] = [];
  let size = ENVELOPE_BYTES + byteLength(source);
  for (const marker of markers) {
    const itemBytes = byteLength(JSON.stringify(marker)) + 1;
    const full =
      current.length >= limits.markersPerBatch ||
      (current.length > 0 && size + itemBytes > limits.batchBytes);
    if (full) {
      batches.push(current);
      current = [];
      size = ENVELOPE_BYTES + byteLength(source);
    }
    current.push(marker);
    size += itemBytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
