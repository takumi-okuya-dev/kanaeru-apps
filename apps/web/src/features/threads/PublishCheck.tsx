// 設定の「自動投稿」の中の、Threads に投稿できるかの確かめと、保存したあとの文（threads-012。めぐるの PostingScheduleSection を写した）。
// - 「投稿できるかを確かめる」：投稿はせず、投稿の権限と直近24時間の投稿の数（n/250件）を出す。結果は押したボタンの近く（EXPERIENCE.md）
// - 保存したあとの文：オンなら「次の投稿は〜の予定です」、承認済みの案がなければ「承認済みの案を用意してください」を添える
import { THREADS_CHECK_MESSAGES, threadsCheckOkMessage } from "@workspace/contracts/threads";
import type { PostingSchedule, ThreadsCheck } from "@workspace/contracts/threads";
import { jstDateTime } from "@workspace/contracts/core";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { checkThreadsPublish, fetchAutoPost } from "./api.ts";
import { THREADS_QUERY_KEYS } from "./queries.ts";

/** 結果の知らせ。 */
type Result = { tone: "success" | "danger"; message: string };

/**
 * 確かめの結果の文。
 * @param check 確かめの結果
 * @returns 文と色
 */
export function threadsCheckResult(check: ThreadsCheck): Result {
  if (check.status === "ok")
    return { tone: "success", message: threadsCheckOkMessage(check.quotaUsage, check.quotaTotal) };
  return { tone: "danger", message: THREADS_CHECK_MESSAGES[check.status] };
}

/**
 * 投稿の設定を保存したあとの文。オンにしたときは、次の投稿の予定か、承認済みの案を用意する案内を添える。
 * オンにしたときの確かめで接続を確かめられなかったら、あとで確かめるよう伝える。
 * @param accountId 運用アカウントの ID
 * @param schedule 保存した設定
 * @param connectionCheck オンにしたときの確かめの結果（オフなら null）
 * @returns 文と色
 */
export async function scheduleSavedResult(
  accountId: string,
  schedule: PostingSchedule,
  connectionCheck: ThreadsCheck | null,
): Promise<Result> {
  if (!schedule.enabled) return { tone: "success", message: "自動投稿をオフで保存しました。" };
  const base = `自動投稿をオンにしました（1日${schedule.slotTimes.length}回）。`;
  if (connectionCheck?.status === "unknown") {
    return {
      tone: "success",
      message: `${base}Threads との接続は確かめられませんでした。あとで「投稿できるかを確かめる」で確かめてください。`,
    };
  }
  try {
    const status = await fetchAutoPost(accountId);
    if (status.next)
      return {
        tone: "success",
        message: `${base}次の投稿は${jstDateTime(status.next.at)}の予定です。`,
      };
    if (status.notices.some((notice) => notice.kind === "no_approved"))
      return { tone: "success", message: `${base}承認済みの案を用意してください。` };
  } catch {
    // 予定を読めなくても、保存はできている
  }
  return { tone: "success", message: base };
}

/** PublishCheck が受け取るもの。 */
export type PublishCheckProps = {
  /** 運用アカウントの ID */
  accountId: string;
};

/**
 * 「投稿できるかを確かめる」のボタンと結果。
 * @param props 運用アカウントの ID（accountId）
 * @returns 要素
 */
export function PublishCheck({ accountId }: PublishCheckProps) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);

  /** 確かめる。 */
  const check = async () => {
    if (pending) return;
    setPending(true);
    setResult(undefined);
    try {
      const outcome = await checkThreadsPublish(accountId);
      setResult(threadsCheckResult(outcome));
      // 接続し直しが要るになったら、接続の表示と運用アカウントも読み直す
      if (outcome.status === "needs_reconnect")
        await queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEYS.account(accountId) });
    } catch {
      setResult({ tone: "danger", message: THREADS_CHECK_MESSAGES.unknown });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-xxs">
      <Button size="small" aria-disabled={pending || undefined} onClick={() => void check()}>
        {pending ? "確かめています…" : "投稿できるかを確かめる"}
      </Button>
      {result ? <ResponseMessage tone={result.tone}>{result.message}</ResponseMessage> : null}
    </div>
  );
}
