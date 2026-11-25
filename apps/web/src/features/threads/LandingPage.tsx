// Threads の入口（/threads。threads-012。めぐるの pages/home.tsx の振り分け）：中身を持たず、
// 最後に開いた運用アカウントのホームへ移る。まだどれも開いていなければ（アカウントがない・開いたものがない）、一覧へ移る。
// 行き先は、開くたびに読み直した一覧で決める（古い一覧で決めると、消した運用アカウントへ移ってしまう）。
import type { ThreadsAccount } from "@workspace/contracts/threads";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { SessionGate } from "../account/index.ts";
import { LoadFailure, Loading } from "./AccountGate.tsx";
import { fetchAccounts } from "./api.ts";
import { THREADS_QUERY_KEYS } from "./queries.ts";

/**
 * 最後に開いた運用アカウント（どれも開いていなければ undefined）。
 * @param accounts 運用アカウントの一覧
 * @returns 運用アカウント
 */
export function lastOpenedAccount(accounts: readonly ThreadsAccount[]): ThreadsAccount | undefined {
  let latest: ThreadsAccount | undefined;
  for (const account of accounts) {
    if (!account.lastOpenedAt) continue;
    if (!latest?.lastOpenedAt || account.lastOpenedAt > latest.lastOpenedAt) latest = account;
  }
  return latest;
}

/**
 * 振り分け（ログインのあと）。
 * @returns 移る要素か、読みこみ中・失敗の画面
 */
function Landing() {
  const query = useQuery({
    queryKey: THREADS_QUERY_KEYS.accounts,
    queryFn: fetchAccounts,
    refetchOnMount: "always",
  });
  if (query.isPending || (query.isFetching && !query.isError)) return <Loading />;
  if (query.isError) {
    return (
      <LoadFailure
        error={query.error}
        retry={() => void query.refetch()}
        notFoundTitle="この画面は使えません"
      />
    );
  }
  const target = lastOpenedAccount(query.data.accounts);
  if (target) {
    return <Navigate to="/threads/accounts/$accountId" params={{ accountId: target.id }} replace />;
  }
  return <Navigate to="/threads/accounts" replace />;
}

/**
 * Threads の入口（ログインが要る）。
 * @returns 画面の要素
 */
export function LandingPage() {
  return (
    <SessionGate>
      <Landing />
    </SessionGate>
  );
}
