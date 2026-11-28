// 読書記録の本棚の道の仮の画面（reading-001 pr1。アプリの登録の確かめ〈アプリを開いたときの道が道の木にある〉のため）。
// 台帳に行がない間、読書記録は運営者だけに見える（AD-16）。中身は pr2 で本棚に置きかえる。
import { Page } from "../../lib/page.tsx";

/**
 * 読書記録の本棚（準備中）。
 * @returns 画面の要素
 */
export function PlaceholderPage() {
  return <Page title="読書" lead="読書記録は準備中です。" />;
}
