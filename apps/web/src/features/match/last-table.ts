// 直前に開いた試合表の記録（core-022）。外枠のナビは、試合表の一覧・作るの画面でも、名簿と設定・試合表・印刷などを出し、
// 押すとこの記録の試合表へ進む。端末の localStorage に置く（ナビのために問い合わせを始めない）。
// 鍵は kanaeru.match. で始める：今の利用者が替わったときの試合表の写しの片付け（offline/account-reset.ts）が、
// この頭の鍵を、写しと同じ時に消す（片付けを足さずに、前の人の記録が消える）。

/** 直前に開いた試合表の ID を置く localStorage の鍵。 */
export const LAST_TABLE_KEY = "kanaeru.match.last-table";

/**
 * 直前に開いた試合表の ID を読む。
 * @returns 試合表の ID（記録がなければ undefined）
 */
export function readLastTable(): string | undefined {
  try {
    const value = window.localStorage.getItem(LAST_TABLE_KEY);
    return value ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 直前に開いた試合表の ID を書く（空の文字は書かない。書けなければ、記録がないのと同じ）。
 * @param tableId 試合表の ID
 */
export function writeLastTable(tableId: string): void {
  if (!tableId) return;
  try {
    window.localStorage.setItem(LAST_TABLE_KEY, tableId);
  } catch {
    // localStorage が使えない（プライベートの画面など）なら、置かない
  }
}
