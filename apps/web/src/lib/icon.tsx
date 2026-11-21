// 線で描いた小さなアイコン（アイコンの部品集に頼らない。packages/ui の status-icon.tsx と同じ作り）。
// 外枠のナビ・アプリの切り替え・すべてのアプリ・設定の画面が使う。読み上げは隣の名前が伝えるので隠す。色は文字の色（currentColor）。
// アプリのアイコン（@workspace/contracts/core の APP_ICONS）を足したら、ここに線を足す。
import type { AppIcon } from "@workspace/contracts/core";
import { cn } from "@workspace/ui/lib/cn";
import type * as React from "react";
import type { NavIcon } from "./feature.ts";

/** アイコンの種類（ナビ・アプリ・外枠の操作）。 */
export type IconName =
  NavIcon | AppIcon | "menu" | "apps" | "settings" | "chevron" | "updown" | "check" | "back";

/** アイコンごとの線。 */
const PATHS: Record<IconName, React.ReactNode> = {
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
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" />
    </>
  ),
  ledger: (
    <>
      <rect x="4" y="4.5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M10 9.5v10" />
    </>
  ),
  home: (
    <>
      <path d="M4 11l8-6.5 8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  at: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.3 6.7" />
    </>
  ),
  drafts: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
    </>
  ),
  pen: (
    <>
      <path d="M5 19l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L9 17.5z" />
      <path d="M13.5 7l3 3M5 19h4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5L20 20" />
    </>
  ),
  heart: (
    <path d="M12 19.5s-7.5-4.4-7.5-9.8A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.4c0 5.4-7.5 9.8-7.5 9.8z" />
  ),
  chart: <path d="M4 20h16M7 16.5v-5M12 16.5V7M17 16.5v-8" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5h16v11h-9.5L6 19.5V16H4z" />
      <path d="M8.5 10.5h7" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z" />
      <path d="M5 16.5a3 3 0 0 1 3-3h10" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  apps: (
    <>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1.2" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1.2" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1.2" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  chevron: <path d="M9.5 6l6 6-6 6" />,
  updown: <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  back: <path d="M14.5 6l-6 6 6 6" />,
};

/**
 * アイコン（既定は 24px の四角）。
 * @param props アイコンの種類（name）・追加の class（className。大きさを変えるとき）
 * @returns アイコンの要素
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-s shrink-0", className)}
    >
      {PATHS[name]}
    </svg>
  );
}
