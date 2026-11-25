// この端末の ID（担当の端末を見分ける乱数。AD-28）。端末の中（localStorage）に置き、IndexedDB にも写す（match-005）。
// localStorage が消えて IndexedDB に残っているときは、IndexedDB の ID に戻す（syncDeviceId。試合表の道を開いたときに呼ぶ）。
// 読めない・書けないときは、この画面を開いている間だけの値にする（プライベートブラウズなど）。
import { offlineStore } from "./offline/store.ts";

/** 置き場所の鍵。 */
export const DEVICE_STORAGE_KEY = "kanaeru.match.deviceId";

/** IndexedDB の鍵。 */
export const DEVICE_META_KEY = "deviceId";

/** 端末の ID の形。 */
const DEVICE_ID_PATTERN = /^d-[a-z0-9-]{8,60}$/u;

/** 読めなかったときの、この画面を開いている間だけの ID。 */
let fallback: string | undefined;

/** この画面を開いてから新しく作った ID（IndexedDB に前の ID があれば戻す）。 */
let createdNow: string | undefined;

/**
 * この端末の ID を返す（なければ作って置く）。
 * @returns 端末の ID（"d-" と英数字）
 */
export function deviceId(): string {
  try {
    const stored = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (stored && DEVICE_ID_PATTERN.test(stored)) return stored;
    const created = `d-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_STORAGE_KEY, created);
    createdNow = created;
    return created;
  } catch {
    fallback ??= `d-${crypto.randomUUID()}`;
    return fallback;
  }
}

/**
 * 端末の ID を IndexedDB とそろえる：この画面で新しく作った ID より IndexedDB の ID を先にし、ほかは IndexedDB に写す。
 * @returns 終わり（失敗しても投げない）
 */
export async function syncDeviceId(): Promise<void> {
  try {
    const store = await offlineStore();
    if (!store.durable) return;
    const saved = await store.readMeta<string>(DEVICE_META_KEY);
    const current = deviceId();
    if (saved && DEVICE_ID_PATTERN.test(saved) && saved !== current && current === createdNow) {
      window.localStorage.setItem(DEVICE_STORAGE_KEY, saved);
      createdNow = undefined;
      return;
    }
    if (saved !== current) await store.writeMeta(DEVICE_META_KEY, current);
  } catch {
    // そろえられなくても、localStorage の ID で動く
  }
}

/**
 * 端末の短い名前（ID の終わりの4文字。担当の端末がどれかを見分けるため。例：「端末 3F9A」）。
 * @param id 端末の ID
 * @returns 短い名前
 */
export function deviceLabel(id: string): string {
  return `端末 ${id
    .replace(/[^a-z0-9]/giu, "")
    .slice(-4)
    .toUpperCase()}`;
}
