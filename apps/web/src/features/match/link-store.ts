// 運営の端末に置く札（見るだけ・受付。match-004 research R2）。DB は札の SHA-256 だけを持つので、札そのもの（QR に入れる URL）は
// 作った端末の localStorage にだけある。ほかの端末で QR を出すときは、札を作り直す（前の QR は使えなくなる）。
// 読めない・書けないとき（プライベートブラウズなど）は、画面を開いている間だけ覚える。期限を過ぎた札は読まない。
import { useCallback, useState } from "react";

/** 札の種類。 */
export type LinkKind = "view" | "join";

/** 端末に置く札。 */
export type StoredLink = {
  /** 札 */
  token: string;
  /** 期限（ISO 8601） */
  expiresAt: string;
};

/** 読めなかったときの、画面を開いている間だけの置き場所。 */
const memory = new Map<string, StoredLink>();

/**
 * 置き場所の鍵。
 * @param tableId 試合表の ID
 * @param kind 札の種類
 * @returns 鍵
 */
function keyOf(tableId: string, kind: LinkKind): string {
  return `kanaeru.match.link.${kind}.${tableId}`;
}

/**
 * 端末に置いた札を読む（期限を過ぎていれば読まない）。
 * @param tableId 試合表の ID
 * @param kind 札の種類
 * @param now 今の時刻
 * @returns 札（なければ undefined）
 */
export function readLink(
  tableId: string,
  kind: LinkKind,
  now: Date = new Date(),
): StoredLink | undefined {
  const key = keyOf(tableId, kind);
  let stored = memory.get(key);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) stored = JSON.parse(raw) as StoredLink;
  } catch {
    // 読めないときは、画面を開いている間の値を使う
  }
  if (!stored || typeof stored.token !== "string" || typeof stored.expiresAt !== "string") {
    return undefined;
  }
  return Date.parse(stored.expiresAt) > now.getTime() ? stored : undefined;
}

/**
 * 札を端末に置く。
 * @param tableId 試合表の ID
 * @param kind 札の種類
 * @param link 札
 */
export function writeLink(tableId: string, kind: LinkKind, link: StoredLink): void {
  const key = keyOf(tableId, kind);
  memory.set(key, link);
  try {
    window.localStorage.setItem(key, JSON.stringify(link));
  } catch {
    // 書けないときは、画面を開いている間だけ覚える
  }
}

/**
 * 端末に置いた札を読み、置き直したら描き直すフック。
 * @param tableId 試合表の ID
 * @param kind 札の種類
 * @returns 札と、札を置く関数
 */
export function useStoredLink(
  tableId: string,
  kind: LinkKind,
): [StoredLink | undefined, (link: StoredLink) => void] {
  const [link, setLink] = useState(() => readLink(tableId, kind));
  const save = useCallback(
    (next: StoredLink) => {
      writeLink(tableId, kind, next);
      setLink(next);
    },
    [tableId, kind],
  );
  return [link, save];
}
