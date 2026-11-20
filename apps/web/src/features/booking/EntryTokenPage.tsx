// 札のページ（/e/{eventId}/entry/{entryToken}。メールで申し込んだ人が確認のメール・確定の知らせのリンクから開く。外枠のナビなし。
// booking-003 US5・research R10）。ログインは要らない（この人はアカウントを持たない。札を知る本人だけが開ける）。
// 確認の前は「申込みを確定する」（主のボタン。開いただけでは確定しない。S5）。確定のあとは状態・カレンダーに追加・取り消す（始まりまで）。
// 期限切れ・知らない札は理由と、申込みページへの入口。札は画面の文に出さない。
import type { EntryTokenView } from "@workspace/contracts/booking";
import { PARTICIPANT_ROUTE_PATTERNS } from "@workspace/contracts/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { StatusIcon } from "@workspace/ui/components/status-icon";
import { cn } from "@workspace/ui/lib/cn";
import { useState } from "react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { cancelEntryToken, confirmEntryToken, fetchEntryToken } from "./apply-api.ts";
import {
  APPLY_QUERY_KEYS,
  ApplyEventList,
  CalendarSection,
  PRIMARY_ACTION_CLASS,
} from "./apply-parts.tsx";

/**
 * 申込みページへの入口。
 * @param props 交流会の ID
 * @param props.eventId 交流会の ID
 * @returns リンクの要素
 */
function ApplyPageLink({ eventId }: { eventId: string }) {
  return (
    <Link
      to={PARTICIPANT_ROUTE_PATTERNS.apply}
      params={{ eventId }}
      className={cn(buttonVariants({ variant: "secondary" }), "min-h-xl self-start")}
    >
      申込みページを開く
    </Link>
  );
}

/**
 * 札のページの中身。
 * @param props 交流会の ID・札
 * @param props.eventId 交流会の ID（道の値）
 * @param props.entryToken 札
 * @returns 画面の要素
 */
export function EntryTokenPage({ eventId, entryToken }: { eventId: string; entryToken: string }) {
  const queryClient = useQueryClient();
  const key = APPLY_QUERY_KEYS.entryToken(entryToken);
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchEntryToken(entryToken),
    retry: (count, error) =>
      !(error instanceof ApiError && (error.status === 404 || error.status === 410)) && count < 2,
  });
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  /**
   * 答えを問い合わせに入れる。
   * @param view 札のページ
   * @returns 入れた値
   */
  const store = (view: EntryTokenView) => queryClient.setQueryData(key, view);
  const confirm = useMutation({
    mutationFn: () => confirmEntryToken(entryToken),
    onSuccess: (view) => {
      store(view);
      setJustConfirmed(true);
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelEntryToken(entryToken),
    onSuccess: (view) => {
      store(view);
      setConfirmingCancel(false);
      setJustConfirmed(false);
    },
  });

  if (query.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiError && error.status === 410) {
      return (
        <Page title="このリンクは期限が切れました" lead={error.message}>
          <ApplyPageLink eventId={eventId} />
        </Page>
      );
    }
    if (error instanceof ApiError && error.status === 404) {
      return <Page title="このリンクは使えません" lead={error.message} />;
    }
    return (
      <Page title="読みこめませんでした" lead={errorMessage(error)}>
        <div>
          <Button className="min-h-xl" onClick={() => void query.refetch()}>
            もう一度
          </Button>
        </div>
      </Page>
    );
  }
  const view = query.data;
  // 道の交流会と札の交流会が違えば、使えないリンクとして扱う
  if (view.event.id !== eventId) return <Page title="このリンクは使えません" />;

  if (view.state === "pending") {
    return (
      <Page
        title="申込みを確定する"
        lead={`${view.name}さん、次の会への申込みを確定してください。`}
      >
        <ApplyEventList event={view.event} hostName={view.hostName} />
        {view.confirmable ? (
          <div className="flex flex-col gap-xxs">
            <Button
              variant="primary"
              className={PRIMARY_ACTION_CLASS}
              aria-busy={confirm.isPending || undefined}
              onClick={() => {
                if (!confirm.isPending) confirm.mutate();
              }}
            >
              {confirm.isPending ? "確定しています…" : "申込みを確定する"}
            </Button>
            {confirm.isError ? (
              <ResponseMessage tone="danger">
                {`確定できませんでした。${errorMessage(confirm.error)}`}
              </ResponseMessage>
            ) : null}
          </div>
        ) : (
          <p className="text-m">
            いまは申込みを受け付けていません。主催者が受付を閉じたか、始まりを過ぎました。
          </p>
        )}
      </Page>
    );
  }

  const entry = view.entry;
  const confirmed = entry?.status === "confirmed";
  return (
    <div className="flex flex-col gap-s">
      <section
        aria-labelledby="entry-done"
        className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-s"
      >
        <div className="flex items-center gap-xxs">
          {confirmed ? <StatusIcon tone="success" className="size-s" /> : null}
          <h1
            id="entry-done"
            tabIndex={-1}
            className="text-xl leading-tight font-bold outline-none"
          >
            {justConfirmed ? "申し込みました" : view.event.name}
          </h1>
        </div>
        {justConfirmed ? <p className="text-m font-bold break-words">{view.event.name}</p> : null}
        <div>{confirmed ? <Badge variant="success">確定</Badge> : <Badge>取り消し</Badge>}</div>
        <p className="text-m">{`お名前：${view.name}`}</p>
        <p className="text-m">
          {confirmed
            ? "当日は受付でお名前を伝えてください。このリンクから、申込みを見る・取り消すことができます。"
            : "この申込みは取り消しています。申し込み直すときは、申込みページから申し込んでください。"}
        </p>
      </section>
      <ApplyEventList event={view.event} hostName={view.hostName} />
      {confirmed ? (
        <CalendarSection calendar={view.calendar} />
      ) : (
        <ApplyPageLink eventId={eventId} />
      )}
      {entry?.cancellable ? (
        <Button
          variant="text"
          className="min-h-xl self-start"
          onClick={() => setConfirmingCancel(true)}
        >
          この申込みを取り消す
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title="申込みを取り消しますか"
        confirmLabel="取り消す"
        pendingLabel="取り消しています…"
        danger
        pending={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : undefined}
        onConfirm={() => cancel.mutate()}
      >
        <p>{`${view.event.name}の申込みを取り消します。`}</p>
      </ConfirmDialog>
    </div>
  );
}

const entryRouteApi = getRouteApi(PARTICIPANT_ROUTE_PATTERNS.entry);

/**
 * 札のページの道の部品（道の eventId と札を渡す）。
 * @returns 画面の要素
 */
export function EntryTokenRoute() {
  const { eventId, entryToken } = entryRouteApi.useParams();
  return <EntryTokenPage eventId={eventId} entryToken={entryToken} />;
}
