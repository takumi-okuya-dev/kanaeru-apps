// 運用アカウントの画面の共通の入口：ログインを確かめ（SessionGate）、運用アカウントを読み、読めたときだけ中身を出す。
// 読みこみ中・見つからない（ない・ほかの人のもの・機能の印が切）・夜間の停止・ほかの失敗の見せ方をそろえる（EXPERIENCE.md State Patterns）。
// 今の利用者の関わり（持ち主・担当の人。threads-013）も読み、画面の出し分けに渡す（読めるまでは、すべてできる扱い）。
import type { ThreadsAccount } from "@workspace/contracts/threads";
import { isNightStopWindow } from "@workspace/contracts/core";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { ThreadsPage } from "./ThreadsPage.tsx";
import { SessionGate } from "../account/index.ts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { openAccount } from "./api.ts";
import { CurrentThreadsAccountContext } from "./AccountSwitcher.tsx";
import { THREADS_QUERY_KEYS, useAccountAccess, useThreadsAccount } from "./queries.ts";
import { ThreadsAccessContext } from "./team-access.ts";

/**
 * 読みこみ中。
 * @returns 要素
 */
export function Loading() {
  return (
    <p aria-busy="true" className="text-m text-text-sub">
      読みこんでいます…
    </p>
  );
}

/**
 * 運用アカウントの一覧へ戻るリンク。
 * @returns 要素
 */
function BackToAccounts() {
  return (
    <ButtonRow>
      <Link to="/threads/accounts" className={buttonVariants({ variant: "secondary" })}>
        アカウントの一覧へ
      </Link>
    </ButtonRow>
  );
}

/** LoadFailure が受け取るもの。 */
export type LoadFailureProps = {
  /** 投げられたもの */
  error: unknown;
  /** もう一度読む */
  retry: () => void;
  /** 見つからないときの題（既定は運用アカウント） */
  notFoundTitle?: string;
};

/**
 * 読めなかったとき（見つからない・夜間の停止・ほかの失敗）。
 * @param props 投げられたもの（error）・もう一度（retry）・見つからないときの題（notFoundTitle）
 * @returns 画面の要素
 */
export function LoadFailure({
  error,
  retry,
  notFoundTitle = "このアカウントは見つかりません",
}: LoadFailureProps) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <ThreadsPage title={notFoundTitle} lead="URL が違うか、消された可能性があります。">
        <BackToAccounts />
      </ThreadsPage>
    );
  }
  // 夜間の見出しは、日本時間 0時〜8時の DB に届かない 503 だけ
  if (error instanceof ApiError && error.code === "DB_UNAVAILABLE" && isNightStopWindow()) {
    return (
      <ThreadsPage
        title="夜間（0時〜8時）は止まっています"
        lead="8時からもう一度開いてください。"
      />
    );
  }
  return (
    <ThreadsPage title="読みこめませんでした" lead={errorMessage(error)}>
      <ButtonRow>
        <Button onClick={retry}>もう一度</Button>
      </ButtonRow>
    </ThreadsPage>
  );
}

/** AccountGate が受け取るもの。 */
export type AccountGateProps = {
  /** 運用アカウントの ID */
  accountId: string;
  /** 中身（読んだ運用アカウントを受け取る） */
  children: (account: ThreadsAccount) => React.ReactNode;
};

/**
 * 運用アカウントを読み、読めたときだけ中身を出す（読む前にログインを確かめる）。
 * @param props 運用アカウントの ID（accountId）・中身（children）
 * @returns 中身か、読みこみ中・見つからない・失敗の画面
 */
export function AccountGate({ accountId, children }: AccountGateProps) {
  return (
    <SessionGate>
      <AccountLoader accountId={accountId}>{children}</AccountLoader>
    </SessionGate>
  );
}

/**
 * 運用アカウントを読む（ログインのあと）。
 * @param props 運用アカウントの ID（accountId）・中身（children）
 * @returns 中身か、読みこみ中・見つからない・失敗の画面
 */
function AccountLoader({ accountId, children }: AccountGateProps) {
  const query = useThreadsAccount(accountId);
  const access = useAccountAccess(accountId, query.isSuccess);
  useOpenAccount(query.isSuccess ? accountId : null);
  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  return (
    <CurrentThreadsAccountContext.Provider value={query.data}>
      <ThreadsAccessContext.Provider value={access.data ?? null}>
        {children(query.data)}
      </ThreadsAccessContext.Provider>
    </CurrentThreadsAccountContext.Provider>
  );
}

/** 最後に「開いた」と知らせた運用アカウントの ID（同じ運用アカウントの中の行き来では、もう一度知らせない）。 */
let lastOpenedAccountId: string | null = null;

/**
 * 運用アカウントを開いたことを API に知らせる（threads-012。/threads の行き先と、プロフィールの読み直し）。
 * 読み直した運用アカウントで画面の値を差しかえる。失敗しても画面は止めない（次に開いたときにまた知らせる）。
 * @param accountId 読めた運用アカウントの ID（まだなら null）
 */
function useOpenAccount(accountId: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!accountId || lastOpenedAccountId === accountId) return;
    lastOpenedAccountId = accountId;
    openAccount(accountId)
      .then((fresh) => {
        queryClient.setQueryData(THREADS_QUERY_KEYS.detail(accountId), fresh);
        void queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.accounts });
      })
      .catch(() => {
        if (lastOpenedAccountId === accountId) lastOpenedAccountId = null;
      });
  }, [accountId, queryClient]);
}
