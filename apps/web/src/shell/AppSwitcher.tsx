// アプリの切り替え（core-005。構成の決めごと AD-15・AD-16。めぐるの切り替えを kanaeru の部品で作り直したもの）。
// 見る人に見えるアプリが2つ以上のときだけ、外枠が出す（1つなら今までと同じ見た目）。アプリの名前は組み立てから受け取り、ここに書かない。
// - PC：サイドバーの上のボタン（アイコンの箱と今のアプリの名前）。押すとメニュー：「使えるアプリ」（今のアプリにチェック・
//   運営者だけに見えているアプリに「運営者だけ」の札）、区切り、「すべてのアプリ」
// - スマホ：上の帯の右のボタン。押すと下から出す枠：同じ並び、区切り、「すべてのアプリ」と「設定」
// ボタンの読み上げの名前は、見えている文字（「アプリ」と今のアプリの名前）から始め、操作を括弧で足す（WCAG 2.5.3。axe の
// label-content-name-mismatch は、見えている文字の語が名前の中に続けて並ぶかを見る）。
import { Link, useRouterState } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuLinkItem,
  MenuSeparator,
  MenuTrigger,
} from "@workspace/ui/components/menu";
import { Sheet } from "@workspace/ui/components/sheet";
import { cn } from "@workspace/ui/lib/cn";
import { useState } from "react";
import { isFeedbackPath } from "../lib/apps.ts";
import type { ShellApp, ShellAppsView } from "../lib/apps.ts";
import { Icon } from "../lib/icon.tsx";
import type { IconName } from "../lib/icon.tsx";

/** 切り替えが受け取るもの。 */
type AppSwitcherProps = {
  /** 外枠のアプリの状態（2つ以上のアプリが見えるときだけ描く） */
  view: ShellAppsView;
};

/**
 * 今いる所の名前とアイコン（アプリの中ならそのアプリ、すべてのアプリ・設定ならその名前）。
 * @param view 外枠のアプリの状態
 * @returns 名前とアイコンと、今のアプリの key
 */
function currentOf(view: ShellAppsView): { label: string; icon: IconName; key?: string } {
  const place = view.place;
  if (place?.kind === "apps") return { label: "すべてのアプリ", icon: "apps" };
  if (place?.kind === "settings") return { label: "全体の設定", icon: "settings" };
  const app = place?.kind === "app" ? view.apps.find((item) => item.key === place.key) : undefined;
  return app
    ? { label: app.name, icon: app.icon, key: app.key }
    : { label: "アプリ", icon: "apps" };
}

/**
 * アイコンの小さな箱（今のアプリは墨の地。選んだ状態）。
 * @param props アイコン（icon）・選んだ状態か（selected）・大きさ（size）
 * @returns 箱の要素
 */
function IconBox({
  icon,
  selected,
  size = "m",
}: {
  icon: IconName;
  selected: boolean;
  size?: "m" | "l";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        size === "l" ? "size-l" : "size-m",
        selected
          ? "bg-primary text-on-primary"
          : "border border-border bg-surface-sunken text-text",
      )}
    >
      <Icon name={icon} className="size-xs" />
    </span>
  );
}

/**
 * アプリの行の中身（アイコン・名前と短い説明・札・今のアプリのチェック）。
 * @param props アプリ（app）・今のアプリか（current）
 * @returns 行の中身
 */
function AppRow({ app, current }: { app: ShellApp; current: boolean }) {
  return (
    <>
      <IconBox icon={app.icon} selected={current} />
      <span className="flex min-w-0 flex-1 flex-col py-x3s">
        <span className="flex flex-wrap items-center gap-x-xxs leading-tight font-bold">
          {app.name}
          {app.operatorOnly ? <Badge>運営者だけ</Badge> : null}
        </span>
        {/* 今のアプリの行は primary-subtle の地なので、説明も本文の色にする（text-sub では 4.5:1 に届かない） */}
        <span className={cn("text-xs leading-tight", current ? "text-text" : "text-text-sub")}>
          {app.summary}
        </span>
      </span>
      {current ? <Icon name="check" className="size-xs text-text" /> : <span className="size-xs" />}
    </>
  );
}

/**
 * PC のアプリの切り替え（サイドバーの上）。
 * @param props 外枠のアプリの状態（view）
 * @returns 要素
 */
export function SidebarAppSwitcher({ view }: AppSwitcherProps) {
  const current = currentOf(view);
  return (
    <Menu>
      <MenuTrigger
        aria-label={`アプリ ${current.label}（切り替える）`}
        className="flex min-h-xl w-full cursor-pointer items-center gap-xxs rounded-md border border-border-input bg-surface px-xxs py-x3s text-left text-text hover:bg-surface-over"
      >
        <IconBox icon={current.icon} selected={current.key !== undefined} size="l" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs leading-tight text-text-sub">アプリ</span>
          <span className="truncate text-m leading-tight font-bold">{current.label}</span>
        </span>
        <Icon name="updown" className="size-xs text-text-sub" />
      </MenuTrigger>
      <MenuContent className="w-menu max-w-(--available-width)">
        <MenuGroup label="使えるアプリ">
          {view.apps.map((app) => {
            const here = app.key === current.key;
            return (
              <MenuLinkItem
                key={app.key}
                render={<Link to={app.startPath} />}
                aria-current={here ? "page" : undefined}
                data-current={here ? "" : undefined}
              >
                <AppRow app={app} current={here} />
              </MenuLinkItem>
            );
          })}
        </MenuGroup>
        {view.appsPath ? (
          <>
            <MenuSeparator />
            <MenuLinkItem
              render={<Link to={view.appsPath} />}
              aria-current={view.place?.kind === "apps" ? "page" : undefined}
            >
              <Icon name="apps" />
              すべてのアプリ
            </MenuLinkItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

/** 下から出す枠の行の見た目。 */
const sheetItemClassName =
  "flex min-h-xl items-center gap-xs rounded-md px-xs text-m text-text hover:bg-surface-over";

/**
 * スマホのアプリの切り替え（上の帯の右のボタンと、下から出す枠）。
 * @param props 外枠のアプリの状態（view）
 * @returns 要素
 */
export function MobileAppSwitcher({ view }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const current = currentOf(view);
  const close = () => setOpen(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // 改善点のページでは、ヘッダーの「改善点を送る」が今のページ（全体の設定は今にしない。今のページの印は1つ）
  const settingsCurrent =
    view.place?.kind === "settings" && !isFeedbackPath(pathname, view.feedbackPath);
  return (
    <>
      <button
        type="button"
        aria-label={`${current.label}（アプリを切り替える）`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex min-h-xl max-w-full min-w-0 cursor-pointer items-center gap-x3s rounded-md border border-border-input bg-surface px-xxs text-m font-bold text-text hover:bg-surface-over"
      >
        <Icon name={current.icon} className="size-xs" />
        <span className="truncate">{current.label}</span>
        <Icon name="updown" className="size-xs text-text-sub" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="アプリを切り替える">
        <nav aria-label="アプリ" className="flex flex-col gap-x3s">
          <ul className="flex flex-col gap-x3s">
            {view.apps.map((app) => {
              const here = app.key === current.key;
              return (
                <li key={app.key}>
                  <Link
                    to={app.startPath}
                    onClick={close}
                    aria-current={here ? "page" : undefined}
                    className={cn(sheetItemClassName, here && "bg-primary-subtle")}
                  >
                    <AppRow app={app} current={here} />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="my-x3s h-px bg-border" />
          <ul className="flex flex-col gap-x3s">
            {view.appsPath ? (
              <li>
                <Link
                  to={view.appsPath}
                  onClick={close}
                  aria-current={view.place?.kind === "apps" ? "page" : undefined}
                  className={sheetItemClassName}
                >
                  <Icon name="apps" />
                  すべてのアプリ
                </Link>
              </li>
            ) : null}
            {view.settingsPath ? (
              <li>
                <Link
                  to={view.settingsPath}
                  onClick={close}
                  // 道の部品は下の道でも自動で aria-current を付けるので、同じ道のときだけにする
                  activeOptions={{ exact: true }}
                  aria-current={settingsCurrent ? "page" : undefined}
                  className={sheetItemClassName}
                >
                  <Icon name="settings" />
                  全体の設定
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      </Sheet>
    </>
  );
}
