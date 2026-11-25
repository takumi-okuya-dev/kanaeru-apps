// 運用アカウントの切り替え（threads-012。めぐるの sidebar/AccountSwitcher.tsx を kanaeru の部品で作り直したもの）。
// 運用アカウントの画面（AccountGate の中）のページの題の上に、今の運用アカウントのボタンを出す（外枠には置かない）。
// 押すとメニュー：自分の運用アカウント（名前・@ユーザー名か未接続・入っているチーム〈threads-021〉・承認待ちの数・要再接続・今のものに「表示中」とチェック）、
// 担当している運用アカウント（持ち主の表示名つき。threads-013）、区切り、「アカウントを作る」。一覧はメニューを開いたときに読む（開かなければ問い合わせない）。
// Threads のプロフィールの画像は、画面の CSP（img-src。core-008）が許す Meta の画像の置き場所のものだけ出し、
// ないとき・読めないとき・ほかの置き場所のときは名前の頭文字の箱にする。
import type { ThreadsAccount } from "@workspace/contracts/threads";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuLinkItem,
  MenuSeparator,
  MenuTrigger,
} from "@workspace/ui/components/menu";
import { cn } from "@workspace/ui/lib/cn";
import { createContext, useContext, useState } from "react";
import { Icon } from "../../lib/icon.tsx";
import { fetchAccounts } from "./api.ts";
import { THREADS_QUERY_KEYS } from "./queries.ts";

/** 今の運用アカウント（AccountGate が渡す。運用アカウントの外は null）。 */
export const CurrentThreadsAccountContext = createContext<ThreadsAccount | null>(null);

/**
 * 今の運用アカウントを読む（運用アカウントの外は null）。
 * @returns 今の運用アカウント
 */
export function useCurrentThreadsAccount(): ThreadsAccount | null {
  return useContext(CurrentThreadsAccountContext);
}

/**
 * 運用アカウントの2行目（@ユーザー名か未接続）。
 * @param account 運用アカウント
 * @returns 文字
 */
export function accountSecondary(account: ThreadsAccount): string {
  return account.username ? `@${account.username}` : "未接続";
}

/** プロフィールの画像を出してよい置き場所（画面の CSP の img-src と同じ。apps/api/src/platform/web/web.ts）。 */
const PICTURE_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;

/**
 * プロフィールの画像の URL が、出してよい置き場所のものか。
 * @param url 画像の URL
 * @returns 出してよければ true
 */
export function isAllowedPictureUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && PICTURE_HOST.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * プロフィールの画像（出せないときは名前の頭文字の箱）。
 * @param props 運用アカウント（account）・今のものか（selected）
 * @returns 箱の要素
 */
export function AccountInitial({
  account,
  selected = false,
}: {
  account: ThreadsAccount;
  selected?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const initial = Array.from(account.displayName || account.name)[0] ?? "?";
  if (!broken && isAllowedPictureUrl(account.profilePictureUrl)) {
    return (
      <img
        src={account.profilePictureUrl}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={cn(
          "size-l shrink-0 rounded-md object-cover",
          "border",
          selected ? "border-primary" : "border-border",
        )}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-l shrink-0 items-center justify-center rounded-md text-m font-bold",
        selected
          ? "bg-primary text-on-primary"
          : "border border-border bg-surface-sunken text-text",
      )}
    >
      {initial}
    </span>
  );
}

/**
 * メニューの1行の中身。
 * @param props 運用アカウント（account）・今のものか（current）
 * @returns 行の中身
 */
function AccountRow({
  account,
  current,
  teamName,
}: {
  account: ThreadsAccount;
  current: boolean;
  teamName?: string;
}) {
  return (
    <>
      <AccountInitial account={account} selected={current} />
      <span className="flex min-w-0 flex-1 flex-col py-x3s leading-tight">
        <span className="truncate font-bold">{account.name}</span>
        <span className="truncate text-xs text-text">
          {accountSecondary(account)}
          {teamName ? `・チーム：${teamName}` : null}
        </span>
        <span className="flex flex-wrap items-center gap-x-xxs text-xs text-text">
          <span className="tabular-nums">承認待ち {account.counts.needsReview}件</span>
          {account.connectionStatus === "needs_reconnect" ? (
            <Badge variant="danger">要再接続</Badge>
          ) : null}
          {current ? <span>表示中</span> : null}
        </span>
      </span>
      {current ? <Icon name="check" className="size-xs text-text" /> : <span className="size-xs" />}
    </>
  );
}

/**
 * メニューの中の一覧（開いたときに読む）。
 * @param props 今の運用アカウントの ID（currentId）
 * @returns 一覧の要素
 */
function AccountMenuList({ currentId }: { currentId: string }) {
  const query = useQuery({ queryKey: THREADS_QUERY_KEYS.accounts, queryFn: fetchAccounts });
  if (query.isPending) {
    return (
      <p aria-busy="true" className="px-xs py-xxs text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="px-xs py-xxs text-m text-danger-text">
        アカウントを読みこめませんでした。開き直してください。
      </p>
    );
  }
  // 入っているチームの名前（threads-021）
  const teamOf = new Map(
    (query.data.placements ?? []).map((row) => [row.threadsAccountId, row.teamName]),
  );
  /**
   * 1行。
   * @param account 運用アカウント
   * @returns 行の要素
   */
  const item = (account: ThreadsAccount) => {
    const here = account.id === currentId;
    return (
      <MenuLinkItem
        key={account.id}
        render={<Link to="/threads/accounts/$accountId" params={{ accountId: account.id }} />}
        aria-current={here ? "page" : undefined}
        data-current={here ? "" : undefined}
      >
        <AccountRow account={account} current={here} teamName={teamOf.get(account.id)} />
      </MenuLinkItem>
    );
  };
  const assigned = query.data.assigned ?? [];
  return (
    <>
      <MenuGroup label="自分のアカウント">{query.data.accounts.map(item)}</MenuGroup>
      {/* 組織で担当している運用アカウント（持ち主の表示名つき。threads-013） */}
      {assigned.length > 0 ? (
        <MenuGroup label="担当している運用アカウント">
          {assigned.map((account) =>
            item({ ...account, name: `${account.name}（${account.ownerName}さん）` }),
          )}
        </MenuGroup>
      ) : null}
    </>
  );
}

/**
 * 運用アカウントの切り替え（ページの題の上）。
 * @param props 今の運用アカウント（account）
 * @returns 要素
 */
export function AccountSwitcher({ account }: { account: ThreadsAccount }) {
  const [open, setOpen] = useState(false);
  return (
    <Menu open={open} onOpenChange={setOpen}>
      {/* 名前は見えている文から作る（aria-label にすると、見えている文と名前が食い違う。axe の label-content-name-mismatch） */}
      <MenuTrigger className="flex min-h-xl w-full max-w-menu cursor-pointer items-center gap-xxs self-start rounded-md border border-border-input bg-surface px-xxs py-x3s text-left text-text hover:bg-surface-over">
        <AccountInitial account={account} selected />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-m leading-tight font-bold">
            <span className="sr-only">アカウント </span>
            {account.name}
            <span className="sr-only">（切り替える）</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-xxs text-xs leading-tight text-text-sub">
            {accountSecondary(account)}
            {account.connectionStatus === "needs_reconnect" ? (
              <Badge variant="danger">要再接続</Badge>
            ) : null}
          </span>
        </span>
        <Icon name="updown" className="size-xs text-text-sub" />
      </MenuTrigger>
      <MenuContent className="w-menu max-w-(--available-width)">
        {open ? <AccountMenuList currentId={account.id} /> : null}
        <MenuSeparator />
        <MenuLinkItem render={<Link to="/threads/accounts" hash="threads-create-account" />}>
          <Icon name="people" />
          アカウントを作る
        </MenuLinkItem>
      </MenuContent>
    </Menu>
  );
}
