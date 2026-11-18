// 画面の外枠（EXPERIENCE.md 5・7・DESIGN.md Layout）。
// - 上に帯（アプリの名前）。752px 以上は左にサイドバー、751px 以下は1列（ナビは帯の下に横に並べる）。
// - 先頭に「本文へ移る」。道が変わったら、新しい画面の h1（tabindex="-1"）にフォーカスを移す（読み上げが題から読む）。
// - 画面の上の知らせの帯（lib/notice.ts）を、今の道の知らせがあるときだけ出す。トーストは使わない。
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { NotificationBar } from "@workspace/ui/components/notification-bar";
import { useEffect, useRef } from "react";
import { APP_NAME } from "../lib/app-name.ts";
import { clearNotice, useNotice } from "../lib/notice.ts";

/** ナビの項目。 */
export type NavItem = {
  /** 項目の ID（領域の ID） */
  id: string;
  /** 見える名前 */
  label: string;
  /** 行き先の道 */
  to: string;
};

/** 外枠が受け取るもの。 */
type AppShellProps = {
  /** ナビの項目（並びの順） */
  navItems: readonly NavItem[];
};

/**
 * 画面の外枠。
 * @param props ナビの項目（navItems）
 * @returns 外枠の要素
 */
export function AppShell({ navItems }: AppShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // 新しい画面を描き終えた道（開いたときに読む画面〈lazy〉も、読み終えてから変わる）
  const resolvedPath = useRouterState({ select: (state) => state.resolvedLocation?.pathname });
  const notice = useNotice();
  const previousPath = useRef(resolvedPath);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // 最初に開いたときは動かさない（先頭の「本文へ移る」から Tab で進めるように）
    if (previousPath.current === undefined || previousPath.current === resolvedPath) {
      previousPath.current = resolvedPath;
      return;
    }
    previousPath.current = resolvedPath;
    mainRef.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [resolvedPath]);

  useEffect(() => {
    // ほかの道へ移ったら、前の道の知らせを消す
    if (notice && notice.path !== pathname) clearNotice();
  }, [notice, pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-sm bg-surface px-xs py-xxs text-text-link focus:not-sr-only focus:fixed focus:top-xxs focus:left-xxs"
      >
        本文へ移る
      </a>
      <header className="border-b border-border bg-surface">
        <div className="flex min-h-xxl items-center px-xs wide:px-s">
          <Link to="/" className="text-l leading-tight font-bold text-text">
            {APP_NAME}
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col wide:flex-row">
        <nav
          aria-label="メイン"
          className="border-b border-border bg-surface-sunken wide:w-sidebar wide:shrink-0 wide:border-r wide:border-b-0"
        >
          <ul className="flex flex-wrap gap-x3s px-xs py-xxs wide:flex-col wide:px-xxs wide:py-xs">
            {navItems.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.to}
                  data-nav-item=""
                  className="flex min-h-l items-center rounded-sm px-xs text-m text-text hover:bg-surface-over aria-[current=page]:bg-surface aria-[current=page]:font-bold aria-[current=page]:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="flex w-full max-w-page min-w-0 flex-col gap-s px-xs py-s outline-none wide:px-m wide:py-m"
        >
          {notice && notice.path === pathname ? (
            <NotificationBar tone={notice.tone} onClose={clearNotice}>
              {notice.message}
            </NotificationBar>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
