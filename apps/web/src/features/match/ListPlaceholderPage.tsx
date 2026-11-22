// 試合表の一覧の道の仮の画面（match-001。アプリの登録の確かめ〈アプリを開いたときの道が道の木にある〉のため）。
// 台帳に行がない間、試合表アプリは運営者だけに見える（AD-16）。中身は match-002 で一覧と作るに置きかえる。
import { Page } from "../../lib/page.tsx";

/**
 * 試合表の一覧（準備中）。
 * @returns 画面の要素
 */
export function ListPlaceholderPage() {
  return <Page title="試合表" lead="試合表を作る画面は準備中です。" />;
}
