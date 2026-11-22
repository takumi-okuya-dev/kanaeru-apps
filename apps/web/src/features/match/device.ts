// この端末の ID（担当の端末を見分ける乱数。AD-28）。端末の中（localStorage）に置き、読めない・書けないときはこの画面を開いている
// 間だけの値にする（プライベートブラウズなど）。ネットなしで開く段（AD-27）で IndexedDB に移す【仮決め】research R5。

/** 置き場所の鍵。 */
const STORAGE_KEY = "kanaeru.match.deviceId";

/** 読めなかったときの、この画面を開いている間だけの ID。 */
let fallback: string | undefined;

/**
 * この端末の ID を返す（なければ作って置く）。
 * @returns 端末の ID（"d-" と英数字）
 */
export function deviceId(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && /^d-[a-z0-9-]{8,60}$/u.test(stored)) return stored;
    const created = `d-${crypto.randomUUID()}`;
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    fallback ??= `d-${crypto.randomUUID()}`;
    return fallback;
  }
}
