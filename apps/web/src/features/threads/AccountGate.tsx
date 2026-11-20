// 運用アカウントの画面の共通の入口：ログインを確かめ（SessionGate）、運用アカウントを読み、読めたときだけ中身を出す。
// 読みこみ中・見つからない（ない・ほかの人のもの・機能の印が切）・夜間の停止・ほかの失敗の見せ方をそろえる（EXPERIENCE.md State Patterns）。
import type { ThreadsAccount } from "@workspace/contracts/threads";
import { isNightStopWindow } from "@workspace/contracts/core";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import type * as React from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { useThreadsAccount } from "./queries.ts";

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
    <div>
      <Link to="/threads" className={buttonVariants({ variant: "secondary" })}>
        アカウントの一覧へ
      </Link>
    </div>
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
      <Page title={notFoundTitle} lead="URL が違うか、消された可能性があります。">
        <BackToAccounts />
      </Page>
    );
  }
  // 夜間の見出しは、日本時間 0時〜8時の DB に届かない 503 だけ
  if (error instanceof ApiError && error.code === "DB_UNAVAILABLE" && isNightStopWindow()) {
    return <Page title="夜間（0時〜8時）は止まっています" lead="8時からもう一度開いてください。" />;
  }
  return (
    <Page title="読みこめませんでした" lead={errorMessage(error)}>
      <div>
        <Button onClick={retry}>もう一度</Button>
      </div>
    </Page>
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
  if (query.isPending) return <Loading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}
