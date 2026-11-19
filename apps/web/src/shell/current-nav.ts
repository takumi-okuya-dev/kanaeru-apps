// ナビの今の項目の決め方（core-003 research R3）。
// - 項目の行き先と同じ道：その項目が「今の画面」（aria-current="page"）
// - 行き先の下の道（/ で区切った頭が同じ）：いちばん長く当たる項目が「今いる所」（aria-current="true"）
//   項目の also（ほかに含める道の頭）も、行き先と同じに当てる。
import type { NavItem } from "../lib/feature.ts";

/** 今の項目と、その当たり方。 */
export type CurrentNav = {
  /** 今の項目の ID */
  id: string;
  /** aria-current の値（同じ道は page、下の道は true） */
  ariaCurrent: "page" | "true";
};

/**
 * 道が、頭の道と同じか、その下か（/ で区切った所でだけ当てる。/admin/events は /admin/eventsx に当てない）。
 * @param pathname 今の道
 * @param prefix 頭の道
 * @returns 同じか下なら true
 */
function isUnder(pathname: string, prefix: string): boolean {
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * 今の項目を決める。
 * @param items ナビの項目
 * @param pathname 今の道
 * @returns 今の項目（どれにも当たらなければ undefined）
 */
export function currentNav(items: readonly NavItem[], pathname: string): CurrentNav | undefined {
  const exact = items.find((item) => item.to === pathname);
  if (exact) return { id: exact.id, ariaCurrent: "page" };
  let best: { id: string; length: number } | undefined;
  for (const item of items) {
    for (const prefix of [item.to, ...(item.also ?? [])]) {
      if (isUnder(pathname, prefix) && (!best || prefix.length > best.length)) {
        best = { id: item.id, length: prefix.length };
      }
    }
  }
  return best ? { id: best.id, ariaCurrent: "true" } : undefined;
}
