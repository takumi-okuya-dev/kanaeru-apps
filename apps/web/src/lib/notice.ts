// 画面の上の知らせの帯（EXPERIENCE.md 3「送った結果」：画面が切り替わるときだけ使う）に出す知らせ。
// 領域は、移る前に showNotice({ …, path: 移る先 }) を呼び、外枠は今の道が path と同じ間だけ帯を出す
// （ほかの道へ移ったら消える。トーストのように時間では消さない）。
import { useSyncExternalStore } from "react";

/** 知らせ。 */
export type Notice = {
  /** 状態（できた・誤り・お知らせ） */
  tone: "success" | "danger" | "info";
  /** 文 */
  message: string;
  /** 出す道（移る先の pathname） */
  path: string;
};

let current: Notice | undefined;
const listeners = new Set<() => void>();

/** 変わったことを知らせる。 */
function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * 知らせを置く（移る先の道で、外枠が帯にして出す）。
 * @param notice 知らせ
 */
export function showNotice(notice: Notice): void {
  current = notice;
  emit();
}

/** 知らせを消す（閉じたとき・ほかの道へ移ったとき）。 */
export function clearNotice(): void {
  if (!current) return;
  current = undefined;
  emit();
}

/**
 * 今の知らせを読む（変わると描き直す）。
 * @returns 知らせ（なければ undefined）
 */
export function useNotice(): Notice | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => undefined,
  );
}
