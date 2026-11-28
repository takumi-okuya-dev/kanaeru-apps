// 読み取ったマーカーを、送る前に整える（ImportPage が確かめの画面へ移る前に呼ぶ）。
// - 上限に合わせる：章は200字で切り、コメントは4,000字で切る（いくつかのテキストボックスをつないだコメントが長くなりうる）。
//   マーカーの文が4,000字をこえるものは入れない（数を返して確かめの画面に出す）。上限をこえる1件で、束がいつも断られないように。
// - ファイルの中の重なりを1つにする：同じ鍵（markerKey）のものは、コメントを改行でつなぎ、? の印はどちらかにあれば立てる。
//   束の中か束をまたぐかで結果が変わらないように（research R4 の重なりの扱いを、送る前にそろえる）。
import { READING_MARKER_LIMITS, countChars, markerKey } from "@workspace/contracts/reading";
import type { ImportedMarker } from "./import/goodnotes.ts";

/**
 * 字の数（コードポイント）で切る。
 * @param value 文字
 * @param max 上限（字）
 * @returns 切った文字
 */
function clip(value: string, max: number): string {
  return countChars(value) <= max ? value : [...value].slice(0, max).join("");
}

/**
 * 上限に合わせる。
 * @param markers 読み取ったマーカー
 * @returns 合わせたマーカーと、入れなかった数
 */
export function fitMarkersToLimits(markers: readonly ImportedMarker[]): {
  markers: ImportedMarker[];
  skipped: number;
} {
  const fitted: ImportedMarker[] = [];
  let skipped = 0;
  for (const marker of markers) {
    if (countChars(marker.text) > READING_MARKER_LIMITS.text) {
      skipped += 1;
      continue;
    }
    fitted.push({
      ...marker,
      ...(marker.comment !== undefined
        ? { comment: clip(marker.comment, READING_MARKER_LIMITS.comment) }
        : {}),
      ...(marker.chapter !== undefined
        ? { chapter: clip(marker.chapter, READING_MARKER_LIMITS.chapter) }
        : {}),
    });
  }
  return { markers: fitted, skipped };
}

/**
 * ファイルの中の重なり（同じ鍵）を1つにする。並びは先に出てきた順のまま。
 * @param markers マーカー
 * @returns 重なりを1つにしたマーカー
 */
export async function mergeDuplicateMarkers(
  markers: readonly ImportedMarker[],
): Promise<ImportedMarker[]> {
  const byKey = new Map<string, ImportedMarker>();
  for (const marker of markers) {
    const key = await markerKey(marker);
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, marker);
      continue;
    }
    const comments = [seen.comment, marker.comment].filter(
      (comment, index, all): comment is string =>
        comment !== undefined && all.indexOf(comment) === index,
    );
    const comment =
      comments.length > 0 ? clip(comments.join("\n"), READING_MARKER_LIMITS.comment) : undefined;
    const chapter = seen.chapter ?? marker.chapter;
    byKey.set(key, {
      ...seen,
      ...(comment !== undefined ? { comment } : {}),
      ...(chapter !== undefined ? { chapter } : {}),
      question: seen.question || marker.question,
    });
  }
  return [...byKey.values()];
}
