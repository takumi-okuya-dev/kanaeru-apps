// M7 QR で受け付ける（/match/tables/$tableId/join）。モックアップの M7。PRD FR-M29。AD-30。
// - 受付の QR とリンク（札はこの端末にだけある。ほかの端末で出すときは作り直す）・リンクをコピー
// - 受け付けた人の一覧（受け付けた順・レベル・時刻・同じ名前の印・消す）。5秒おきに読み直す
// - 担当の端末は、受け付けた人を名簿に入れる（use-joins.ts）。消すと名簿からも消す
// - 「受付を締める」（受付のページは見られなくなる）・「この名簿で試合表を作る」（名簿と設定へ）
import { MATCH_LEVELS, MATCH_LEVEL_LABELS, joinPlayerId } from "@workspace/contracts/match";
import type { MatchJoinEntry, MatchTable } from "@workspace/contracts/match";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { closeJoin, deleteJoin, issueJoinLink } from "./api.ts";
import { formatPlayDate } from "./format.ts";
import { useStoredLink } from "./link-store.ts";
import { MATCH_ROUTE_PATTERNS, matchPaths } from "./paths.ts";
import { QrCode } from "./qr.tsx";
import { removePlayer } from "./roster-edit.ts";
import { EditorState, TableFrame } from "./TableFrame.tsx";
import type { TableEditor } from "./table-editor.ts";
import { joinsQueryKey, useJoins } from "./use-joins.ts";

/**
 * 時刻を「12:21」の形にする。
 * @param iso 時刻（ISO 8601）
 * @returns 文字
 */
function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

/**
 * リンクを写す（できたら true）。
 * @param text 写す文字
 * @returns できたか
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 受付の中身。
 * @param props 試合表（table）・直す道具（editor）
 * @param props.table 試合表
 * @param props.editor 試合表を直す道具
 * @returns 画面の要素
 */
function JoinBody({ table, editor }: { table: MatchTable; editor: TableEditor }) {
  const queryClient = useQueryClient();
  const [link, saveLink] = useStoredLink(table.id, "join");
  const { joins } = useJoins(table, editor, true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string }>();
  const [confirm, setConfirm] = useState<"close" | "reissue" | null>(null);
  const list = joins.data?.joins ?? [];
  const closed = joins.data ? joins.data.closedAt !== null : false;
  const live = joins.data ? joins.data.expiresAt !== null && !closed : false;
  const url = link ? new URL(matchPaths.join(link.token), window.location.origin).href : "";
  const byLevel = MATCH_LEVELS.map(
    (level) => `${MATCH_LEVEL_LABELS[level]} ${list.filter((join) => join.level === level).length}`,
  ).join("・");

  /** 札を作り直して受付を開く。 */
  const issue = () => {
    setPending(true);
    setMessage(undefined);
    issueJoinLink(table.id)
      .then((issued) => {
        saveLink(issued);
        void queryClient.invalidateQueries({ queryKey: joinsQueryKey(table.id) });
      })
      .catch((caught: unknown) =>
        setMessage({ tone: "danger", text: `受付を始められませんでした。${errorMessage(caught)}` }),
      )
      .finally(() => setPending(false));
  };

  /** 受付を締める。 */
  const close = () => {
    setPending(true);
    setMessage(undefined);
    closeJoin(table.id)
      .then((next) => queryClient.setQueryData(joinsQueryKey(table.id), next))
      .catch((caught: unknown) =>
        setMessage({ tone: "danger", text: `締められませんでした。${errorMessage(caught)}` }),
      )
      .finally(() => setPending(false));
  };

  /**
   * 受付の行を消す（担当の端末なら名簿からも消す）。
   * @param join 受付の行
   */
  const remove = (join: MatchJoinEntry) => {
    setMessage(undefined);
    deleteJoin(table.id, join.id)
      .then(() => {
        if (editor.isEditor) {
          editor.apply((draft) => ({
            ...draft,
            content: removePlayer(draft.content, joinPlayerId(join.id)),
          }));
        }
        void queryClient.invalidateQueries({ queryKey: joinsQueryKey(table.id) });
      })
      .catch((caught: unknown) =>
        setMessage({ tone: "danger", text: `消せませんでした。${errorMessage(caught)}` }),
      );
  };

  const status = closed ? "受付を締めました" : live ? "受付中" : "まだ受付を始めていません";
  return (
    <Page title="QR で受け付ける" lead={`${table.name}・${formatPlayDate(table.playDate)}`}>
      <EditorState editor={editor} />
      <div className="flex flex-col gap-s wide:flex-row wide:items-start">
        <div className="flex flex-col items-center gap-xxs">
          {link && live ? (
            <>
              <QrCode text={url} label="受付のページの QR" className="border border-border" />
              <p className="max-w-menu text-s break-all text-text-sub">{url}</p>
              <Button
                size="small"
                onClick={() => {
                  void copyText(url).then((done) =>
                    setMessage(
                      done
                        ? { tone: "success", text: "リンクをコピーしました。" }
                        : {
                            tone: "danger",
                            text: "コピーできませんでした。リンクを選んで写してください。",
                          },
                    ),
                  );
                }}
              >
                リンクをコピー
              </Button>
            </>
          ) : live ? (
            <div className="flex max-w-menu flex-col gap-xxs">
              <p className="text-m">
                受付のリンクは、ほかの端末で作りました。この端末で QR
                を出すには、リンクを作り直します（前の QR とリンクは使えなくなります）。
              </p>
              <Button disabled={pending} onClick={() => setConfirm("reissue")}>
                この端末で QR を出す
              </Button>
            </div>
          ) : (
            <div className="flex max-w-menu flex-col gap-xxs">
              <p className="text-m">
                参加者は QR
                かリンクから、ログインなしで名前とレベルを答えます。答えはこの試合表の名簿に入ります。
              </p>
              <Button variant="primary" disabled={pending} onClick={issue}>
                {closed ? "受付をもう一度開く（新しい QR）" : "受付を始める"}
              </Button>
            </div>
          )}
        </div>
        <section
          aria-labelledby="match-join-status"
          className="flex min-w-0 flex-1 flex-col gap-xs"
        >
          <h2 id="match-join-status" className="text-l font-bold">
            {status}
          </h2>
          <p className="text-m text-text-sub">
            受け付けた人：<b className="text-text">{list.length}人</b>（{byLevel}）
          </p>
          {list.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
              {list.map((join) => (
                <li key={join.id} className="flex flex-wrap items-center gap-xxs px-xs py-xxs">
                  <span className="text-m font-bold">{join.nickname}</span>
                  <Badge>{MATCH_LEVEL_LABELS[join.level]}</Badge>
                  {join.duplicate ? <Badge>同じ名前</Badge> : null}
                  <span className="text-s text-text-sub">{clockOf(join.createdAt)}</span>
                  <Button
                    size="small"
                    variant="text"
                    className="ml-auto"
                    aria-label={`${join.nickname}の受付を消す`}
                    onClick={() => remove(join)}
                  >
                    消す
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {!editor.isEditor ? (
            <p className="text-s text-text-sub">
              受け付けた人を名簿に入れるのは、担当の端末です（担当の端末でこの画面か名簿と設定を開くと入ります）。
            </p>
          ) : list.length > 0 ? (
            <p className="text-s text-text-sub">
              受け付けた人は、名簿に入っています（名簿と設定で直せます）。
            </p>
          ) : null}
          <div className="flex flex-wrap gap-xxs">
            {live ? (
              <Button disabled={pending} onClick={() => setConfirm("close")}>
                受付を締める
              </Button>
            ) : null}
            <Link
              to="/match/tables/$tableId"
              params={{ tableId: table.id }}
              className={buttonVariants({ variant: "primary" })}
            >
              この名簿で試合表を作る
            </Link>
          </div>
          {message ? <ResponseMessage tone={message.tone}>{message.text}</ResponseMessage> : null}
        </section>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm === "close" ? "受付を締めますか？" : "受付のリンクを作り直しますか？"}
        confirmLabel={confirm === "close" ? "締める" : "作り直す"}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action === "close") close();
          else issue();
        }}
      >
        <p className="text-m">
          {confirm === "close"
            ? "締めると、受付のページは開けなくなります。受け付けた人はそのまま残ります。開き直すときは、新しい QR を作ります。"
            : "作り直すと、前の QR とリンクは使えなくなります。入口に出している QR があれば、出し直してください。"}
        </p>
      </ConfirmDialog>
    </Page>
  );
}

/**
 * QR で受け付ける画面（道の部品）。
 * @returns 画面の要素
 */
export function JoinAdminRoute() {
  const { tableId } = useParams({ from: MATCH_ROUTE_PATTERNS.joinAdmin });
  return (
    <TableFrame tableId={tableId}>
      {(table, editor) => <JoinBody table={table} editor={editor} />}
    </TableFrame>
  );
}
