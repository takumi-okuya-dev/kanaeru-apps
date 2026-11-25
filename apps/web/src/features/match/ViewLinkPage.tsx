// 見るだけのページのリンクと QR（/match/tables/$tableId/view-link）。PRD FR-M18・FR-M20。AD-26。
// - リンクを作る（札はこの端末にだけある。ほかの端末で出すときは作り直す。前の QR・刷った紙は使えなくなる）
// - QR・リンク・コピー・開く・期限。入口に貼る1枚と、印刷の版の QR は印刷の画面で刷る
import type { MatchTable } from "@workspace/contracts/match";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { issueViewLink } from "./api.ts";
import { formatPlayDate } from "./format.ts";
import { useStoredLink } from "./link-store.ts";
import { MATCH_ROUTE_PATTERNS, matchPaths } from "./paths.ts";
import { QrCode } from "./qr.tsx";
import { MATCH_QUERY_KEYS } from "./queries.ts";
import { TableFrame } from "./TableFrame.tsx";

/**
 * 期限の文（例：「2026/12/13(日) の終わりまで」）。期限は日本時間の翌日0時なので、1ミリ秒前の日付を出す。
 * @param expiresAt 期限（ISO 8601）
 * @returns 文
 */
export function expiryText(expiresAt: string): string {
  const last = new Date(Date.parse(expiresAt) - 1 + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `${formatPlayDate(last)} の終わりまで`;
}

/**
 * 見るだけのページのリンクの中身。
 * @param props 試合表（table）
 * @param props.table 試合表
 * @returns 画面の要素
 */
function ViewLinkBody({ table }: { table: MatchTable }) {
  const queryClient = useQueryClient();
  const [link, saveLink, stale] = useStoredLink(table.id, "view", table.links.viewHint);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string }>();
  const serverLive = table.links.viewExpiresAt !== null;
  const url = link ? new URL(matchPaths.view(link.token), window.location.origin).href : "";

  /** 札を作り直す。 */
  const issue = () => {
    setPending(true);
    setMessage(undefined);
    issueViewLink(table.id)
      .then((issued) => {
        saveLink({ token: issued.token, expiresAt: issued.expiresAt });
        queryClient.setQueryData<MatchTable>(MATCH_QUERY_KEYS.table(table.id), (current) =>
          current
            ? {
                ...current,
                links: { ...current.links, viewExpiresAt: issued.expiresAt, viewHint: issued.hint },
              }
            : current,
        );
        setMessage({ tone: "success", text: "見るだけのリンクを作りました。" });
      })
      .catch((caught: unknown) =>
        setMessage({ tone: "danger", text: `作れませんでした。${errorMessage(caught)}` }),
      )
      .finally(() => setPending(false));
  };

  return (
    <Page
      title="見るだけのページ"
      lead={`${table.name}・参加者と声をかける係が、ログインなしで試合表を見るページです。`}
    >
      <ul className="flex list-disc flex-col gap-x3s pl-s text-m">
        <li>出るのは呼び名・組み合わせ・進み具合だけです（レベルや氏名は出ません）。</li>
        <li>リンクを知っている人なら、だれでも見られます。検索には出ません。</li>
        <li>
          試合の日の終わりで見られなくなります。作り直すと、前のリンクと刷った QR
          は使えなくなります。
        </li>
      </ul>
      {link ? (
        <div className="flex flex-col items-start gap-xxs">
          <QrCode text={url} label="見るだけのページの QR" className="border border-border" />
          <p className="max-w-menu text-s break-all text-text-sub">{url}</p>
          <p className="text-m">{`${expiryText(link.expiresAt)}見られます。`}</p>
          <div className="flex flex-wrap gap-xxs">
            <Button
              size="small"
              onClick={() => {
                void navigator.clipboard
                  .writeText(url)
                  .then(() => setMessage({ tone: "success", text: "リンクをコピーしました。" }))
                  .catch(() =>
                    setMessage({
                      tone: "danger",
                      text: "コピーできませんでした。リンクを選んで写してください。",
                    }),
                  );
              }}
            >
              リンクをコピー
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-m items-center text-m text-text-link underline"
            >
              開く（新しいタブ）
            </a>
            <Button size="small" disabled={pending} onClick={() => setConfirmOpen(true)}>
              作り直す
            </Button>
          </div>
          <p className="text-s text-text-sub">
            <Link
              to="/match/tables/$tableId/print"
              params={{ tableId: table.id }}
              className="text-text-link underline"
            >
              印刷
            </Link>
            で、試合表の版の隅に QR が入ります。入口に貼る1枚も刷れます。
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-xxs">
          {serverLive ? (
            <p className="text-m">
              {stale
                ? "この端末の QR は古くなりました（ほかの端末でリンクを作り直しました）。この端末で QR を出すには、もう一度作り直します（今のリンクと刷った QR は使えなくなります）。"
                : "見るだけのリンクは、ほかの端末で作りました。この端末で QR を出すには、リンクを作り直します（前のリンクと刷った QR は使えなくなります）。"}
            </p>
          ) : null}
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => (serverLive ? setConfirmOpen(true) : issue())}
          >
            {serverLive ? "この端末で QR を出す（作り直す）" : "見るだけのリンクを作る"}
          </Button>
        </div>
      )}
      {message ? <ResponseMessage tone={message.tone}>{message.text}</ResponseMessage> : null}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="見るだけのリンクを作り直しますか？"
        confirmLabel="作り直す"
        onConfirm={() => {
          setConfirmOpen(false);
          issue();
        }}
      >
        <p className="text-m">
          作り直すと、前のリンクと、刷った紙や入口の QR は使えなくなります。刷り直してください。
        </p>
      </ConfirmDialog>
    </Page>
  );
}

/**
 * 見るだけのページのリンクの画面（道の部品）。
 * @returns 画面の要素
 */
export function ViewLinkRoute() {
  const { tableId } = useParams({ from: MATCH_ROUTE_PATTERNS.viewLink });
  return <TableFrame tableId={tableId}>{(table) => <ViewLinkBody table={table} />}</TableFrame>;
}
