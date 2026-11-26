// 設定 › 届いた改善点（/settings/feedback/inbox。suite-004）。運営者だけが、送られた改善点を新しい順に読み、「済み」を付ける。
// アプリで絞る・まだのものだけを出せる。運営者でなければ OperatorOnlyPage（窓口も 403）。
import type { FeedbackEntry } from "@workspace/contracts/suite";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listApps } from "@workspace/contracts/core";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate, useSession } from "../account/index.ts";
import { OperatorOnlyPage } from "./OperatorOnlyPage.tsx";
import { fetchFeedback, setFeedbackDone } from "./api.ts";

/**
 * 届いた改善点の読み込みの鍵。
 * @param app アプリの key（すべてなら空）
 * @param pending まだのものだけか
 * @returns 鍵
 */
function feedbackKey(app: string, pending: boolean) {
  return ["suite", "feedback", app, pending] as const;
}

/**
 * 送った日時の文（日本時間）。
 * @param iso 日時
 * @returns 文
 */
function formatSent(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 届いた改善点の中身（運営者だけ）。
 * @returns 要素
 */
function InboxContent() {
  const session = useSession();
  const isOperator = session.status === "authenticated" && session.account.isOrganizer;
  const queryClient = useQueryClient();
  // 絞るアプリは登録されたすべて（台帳で切にしたアプリへの改善点も絞れるように）
  const apps = listApps();
  const [busy, setBusy] = useState<string>();
  const [app, setApp] = useState("");
  const [pendingOnly, setPendingOnly] = useState(true);
  const [failure, setFailure] = useState<string>();
  const query = useQuery({
    queryKey: feedbackKey(app, pendingOnly),
    queryFn: () => fetchFeedback({ app, pending: pendingOnly }),
    enabled: isOperator,
  });
  if (session.status !== "authenticated") return null;
  if (!isOperator) return <OperatorOnlyPage />;

  /**
   * 済みを付け外す。
   * @param item 改善点
   */
  const toggle = (item: FeedbackEntry) => {
    setFailure(undefined);
    setBusy(item.id);
    setFeedbackDone(item.id, !item.done)
      .then(() => queryClient.invalidateQueries({ queryKey: ["suite", "feedback"] }))
      .catch((caught: unknown) => setFailure(`変えられませんでした。${errorMessage(caught)}`))
      .finally(() => setBusy(undefined));
  };

  return (
    <Page
      title="届いた改善点"
      lead="利用者が送った改善点を、新しい順に出します。読んだら「済み」を付けます。運営者だけが開ける画面です。"
    >
      <div className="flex flex-wrap items-end gap-s">
        <label className="flex flex-col gap-x3s text-s font-bold">
          アプリ
          <select
            className="min-h-l rounded-sm border border-border-input bg-surface px-xxs text-m font-normal"
            value={app}
            onChange={(change) => setApp(change.target.value)}
          >
            <option value="">すべて</option>
            {apps.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-l items-center gap-xxs text-m">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(change) => setPendingOnly(change.target.checked)}
            className="size-s accent-primary"
          />
          まだのものだけ
        </label>
      </div>
      {failure ? <ResponseMessage tone="danger">{failure}</ResponseMessage> : null}
      {query.isPending ? (
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      ) : query.isError ? (
        <div className="flex flex-col items-start gap-xxs">
          <p className="text-m">{errorMessage(query.error)}</p>
          <Button onClick={() => void query.refetch()}>もう一度</Button>
        </div>
      ) : query.data.items.length === 0 ? (
        <p className="text-m text-text-sub">届いた改善点はありません。</p>
      ) : (
        <>
          {query.data.truncated ? (
            <ResponseMessage tone="info">
              新しい500件だけを出しています。古いものは、アプリで絞るか「まだのものだけ」で探してください。
            </ResponseMessage>
          ) : null}
          <ul aria-label="届いた改善点" className="flex flex-col gap-xs">
            {query.data.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
              >
                <div className="flex flex-wrap items-center gap-xxs text-s text-text-sub">
                  <span>{formatSent(item.createdAt)}</span>
                  <Badge>{item.appName ?? (item.appKey ? item.appKey : "全体")}</Badge>
                  <span>{item.sender || "（表示名なし）"}</span>
                  {item.done ? <Badge>済み</Badge> : null}
                </div>
                <p className="text-m break-words whitespace-pre-wrap">{item.body}</p>
                <div>
                  <Button size="small" disabled={busy === item.id} onClick={() => toggle(item)}>
                    {item.done ? "まだに戻す" : "済みにする"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}

/**
 * 届いた改善点の画面。
 * @returns 画面の要素
 */
export function FeedbackInboxPage() {
  return (
    <SessionGate>
      <InboxContent />
    </SessionGate>
  );
}
