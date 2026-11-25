// PC のサイドバーを出すか隠すかを、見ている人のブラウザに覚える（core-003 research R5）。
// 保存（localStorage）は、プライベートの窓・消した設定・止めた設定で、空のことも投げることもある。
// 読み書きはどれも try/catch で包み、使えなければ「出す」（書けなければ、その画面の間だけ効く）。

/** 覚える鍵。 */
export const SIDEBAR_STORAGE_KEY = "app-shell.sidebar-open";

/**
 * サイドバーを出すか（覚えていなければ・読めなければ出す）。
 * @returns 出すなら true
 */
export function readSidebarOpen(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * サイドバーを出すかを覚える（書けなければ何もしない）。
 * @param open 出すなら true
 */
export function writeSidebarOpen(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // 覚えられなくても、切り替えはその画面の間だけ効く
  }
}
