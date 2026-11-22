// 運営の端末に置く札（見るだけ・受付。match-004 research R2）。DB は札の SHA-256 だけを持つので、札そのもの（QR に入れる URL）は
// 作った端末の localStorage にだけある。ほかの端末で QR を出すときは、札を作り直す（前の QR は使えなくなる）。
// 読めない・書けないとき（プライベートブラウズなど）は、画面を開いている間だけ覚える。期限を過ぎた札は読まない。
// ほかの端末で作り直された札（サーバーの SHA-256 の頭と合わない札）も読まない（古い QR を出さない）。
import { useCallback, useEffect, useState } from "react";

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

/** 置き場所の鍵の頭。 */
const KEY_PREFIX = "kanaeru.match.link.";

/**
 * 画面を開いている間だけの置き場所の札を消す（今の利用者が替わったとき。localStorage の札は account-reset.ts が消す）。
 */
export function clearMemoryLinks(): void {
  memory.clear();
}

/**
 * 置き場所の鍵。
 * @param tableId 試合表の ID
 * @param kind 札の種類
 * @returns 鍵
 */
function keyOf(tableId: string, kind: LinkKind): string {
  return `${KEY_PREFIX}${kind}.${tableId}`;
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
 * 札の SHA-256 の頭8文字（サーバーの hint と比べる）。
 * @param token 札
 * @returns 16進の8文字
 */
export async function tokenHint(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 端末に置いた札を読み、置き直したら描き直すフック。サーバーの今の札の hint と合うときだけ返す。
 * @param tableId 試合表の ID
 * @param kind 札の種類
 * @param hint サーバーの今の札の SHA-256 の頭（札がなければ null、まだ分からなければ undefined）
 * @returns 今の札（なければ undefined）・札を置く関数・端末の札が古いか（ほかの端末で作り直された）
 */
export function useStoredLink(
  tableId: string,
  kind: LinkKind,
  hint: string | null | undefined,
): [StoredLink | undefined, (link: StoredLink) => void, boolean] {
  const [link, setLink] = useState(() => readLink(tableId, kind));
  const [checked, setChecked] = useState<{ token: string; hint: string }>();
  useEffect(() => {
    if (!link) return;
    let live = true;
    void tokenHint(link.token).then((value) => {
      if (live) setChecked({ token: link.token, hint: value });
    });
    return () => {
      live = false;
    };
  }, [link]);
  const save = useCallback(
    (next: StoredLink) => {
      writeLink(tableId, kind, next);
      setLink(next);
    },
    [tableId, kind],
  );
  const known = link !== undefined && checked?.token === link.token && hint !== undefined;
  const current = known && checked?.hint === hint ? link : undefined;
  return [current, save, known && checked?.hint !== hint];
}
