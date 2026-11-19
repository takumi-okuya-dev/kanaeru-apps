// ナビのアイコン（線で描いた小さな SVG。アイコンの部品集に頼らない。packages/ui の status-icon.tsx と同じ作り）。
// 読み上げは、隣の名前が伝えるので隠す。色は文字の色（currentColor）。
import type * as React from "react";
import type { NavIcon as NavIconName } from "../lib/feature.ts";

/** アイコンごとの線。 */
const PATHS: Record<NavIconName | "menu", React.ReactNode> = {
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19.5c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.6 13.9c2.6.2 4.4 2.3 4.4 5" />
    </>
  ),
  concerns: (
    <>
      <path d="M4 5h16v11h-9.5L6 19.5V16H4z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </>
  ),
  setup: (
    <>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 3h6v3H9z" />
      <path d="M8.5 12.8l2.2 2.2 4.3-4.3" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

/**
 * ナビのアイコン（24px の四角）。
 * @param props アイコンの種類（name）
 * @returns アイコンの要素
 */
export function NavIcon({ name }: { name: NavIconName | "menu" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-s shrink-0"
    >
      {PATHS[name]}
    </svg>
  );
}
