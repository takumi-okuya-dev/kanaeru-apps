// 人物メモの一覧の道の仮の画面（person-001 pr1。アプリの登録の確かめ〈アプリを開いたときの道が道の木にある〉のため）。
// 台帳に行がない間、人物メモは運営者だけに見える（AD-16）。中身は pr2 で一覧と検索に置きかえる。
import { Page } from "../../lib/page.tsx";

/**
 * 人物メモの一覧（準備中）。
 * @returns 画面の要素
 */
export function PlaceholderPage() {
  return <Page title="人物メモ" lead="人物メモは準備中です。" />;
}
