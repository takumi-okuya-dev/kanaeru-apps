// A5 書き出しと削除（主催者だけ。EXPERIENCE.md の A5・FR-15・FR-16）。
// 参加者の CSV（API が作る BOM つきの CSV を受け取り、保存する）と、参加者のデータを消す（確かめの枠で何が消えるかを書く）。
// アカウントのある人は account の窓口でアカウントごと消す（ほかの交流会のチェックインと回答も消える。AD-7）。この窓口は運営者だけが
// 使えるので、運営者でない主催者は、アカウントのある人もこの交流会のチェックインと回答だけを消す（event-002【仮決め】）。
// 手でのチェックインは、そのチェックインを取り消す。主催者自身のアカウントは、ここでは消さない（ログインが切れるため）。
// ほかの領域（survey の困りごとの CSV）は、差しこみの場所の節として足す（slots.ts。research R10）。
import type { EventView } from "@workspace/contracts/event";
import type { CheckinView } from "@workspace/contracts/reception";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { saveFile } from "../../lib/download.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate, useSession } from "../account/index.ts";
import { EventAccessGate, formatEventDateTime } from "../event/index.ts";
import { deleteCheckin, deleteParticipantAccount, downloadParticipantsCsv } from "./api.ts";
import { formatCheckinTime } from "./format.ts";
import { RECEPTION_QUERY_KEYS, useCheckinList } from "./queries.ts";
import { eventDataSections } from "./slots.ts";

/** まとまりが受け取るもの。 */
type SectionProps = {
  /** 見出しの ID */
  id: string;
  /** 見出し */
  title: string;
  /** 中身 */
  children: React.ReactNode;
};

/**
 * 画面のまとまり（見出し h2 つき）。
 * @param props 見出しの ID（id）・見出し（title）・中身（children）
 * @returns まとまりの要素
 */
function Section({ id, title, children }: SectionProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-xs">
      <h2 id={id} className="text-l leading-tight font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * 参加者の CSV の書き出し。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns まとまりの要素
 */
function ExportSection({ event }: { event: EventView }) {
  const mutation = useMutation({
    mutationFn: () => downloadParticipantsCsv(event.id),
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
  });
  return (
    <Section id="data-export" title="参加者をCSVで書き出す">
      <p className="text-s text-text-sub">
        名前・チェックインの時刻・申し込みの媒体・知ったきっかけ・支払い方法・金額・入れ方を、Excel
        で開ける CSV にします。
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <Button
          aria-disabled={mutation.isPending || undefined}
          onClick={() => {
            if (!mutation.isPending) mutation.mutate();
          }}
        >
          {mutation.isPending ? "書き出しています…" : "参加者をCSVで書き出す"}
        </Button>
        {mutation.isSuccess ? (
          <ResponseMessage tone="success">{`${mutation.data.filename} を保存しました。`}</ResponseMessage>
        ) : null}
        {mutation.isError ? (
          <ResponseMessage tone="danger">
            {`書き出せませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * 消す前の確かめの文（何が消えるか・元に戻せないこと）。
 * @param checkin 消す人のチェックイン
 * @param operator 運営者か（アカウントごと消す窓口は運営者だけ）
 * @returns 文
 */
function deletionText(checkin: CheckinView, operator: boolean): string {
  if (checkin.accountId && operator) {
    return `${checkin.name}さんのアカウント・チェックイン・アンケートの回答を消します。ほかの交流会のチェックインと回答も消えます。元に戻せません。`;
  }
  if (checkin.accountId) {
    return `${checkin.name}さんの、この交流会のチェックインとアンケートの回答を消します。アカウントそのものは消えません（本人の退会で消えます）。元に戻せません。`;
  }
  return `${checkin.name}さんの手でのチェックインとアンケートの回答を消します。元に戻せません。`;
}

/**
 * 参加者のデータを消す。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns まとまりの要素
 */
function DeleteSection({ event }: { event: EventView }) {
  const queryClient = useQueryClient();
  const session = useSession();
  const myAccountId = session.status === "authenticated" ? session.account.id : undefined;
  // アカウントごと消す窓口は運営者だけ（account）。運営者でなければ、この交流会のチェックインだけを消す
  const operator = session.status === "authenticated" && session.account.isOrganizer;
  const list = useCheckinList(event.id);
  const [target, setTarget] = useState<CheckinView>();
  const [deleted, setDeleted] = useState<string>();
  const mutation = useMutation({
    mutationFn: async (checkin: CheckinView) => {
      if (checkin.accountId && operator) await deleteParticipantAccount(checkin.accountId);
      else await deleteCheckin(event.id, checkin.id);
    },
    onSuccess: async (_result, checkin) => {
      setDeleted(checkin.name);
      setTarget(undefined);
      await queryClient.invalidateQueries({ queryKey: RECEPTION_QUERY_KEYS.all });
    },
  });

  return (
    <Section id="data-delete" title="参加者のデータを消す">
      <p className="text-s text-text-sub">
        {operator
          ? "参加者に頼まれたときに使います。アカウントのある人は、アカウントごと消えます。"
          : "参加者に頼まれたときに使います。この交流会のチェックインとアンケートの回答を消します。"}
      </p>
      {list.isPending ? (
        <p aria-busy="true" className="text-m text-text-sub">
          読みこんでいます…
        </p>
      ) : list.isError && !list.data ? (
        <ResponseMessage tone="danger">{errorMessage(list.error)}</ResponseMessage>
      ) : list.data.checkins.length === 0 ? (
        <p className="text-m">まだチェックインした人はいません。</p>
      ) : (
        <ul aria-label="参加者" className="flex flex-col divide-y divide-border">
          {list.data.checkins.map((checkin) => (
            <li key={checkin.id} className="flex flex-wrap items-center gap-xs py-xxs">
              <span className="min-w-0 flex-1 text-m break-words">
                {checkin.name}
                <span className="ml-xxs text-s text-text-sub">
                  {`${checkin.method === "manual" ? "手でのチェックイン" : "LINE"}・${formatCheckinTime(checkin.checkedInAt)}`}
                </span>
              </span>
              {checkin.accountId !== null && checkin.accountId === myAccountId ? (
                <span className="text-s text-text-sub">自分のアカウントはここでは消せません</span>
              ) : (
                <Button
                  size="small"
                  variant="danger"
                  aria-label={`${checkin.name}さんのデータを削除`}
                  onClick={() => {
                    mutation.reset();
                    setDeleted(undefined);
                    setTarget(checkin);
                  }}
                >
                  削除
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleted !== undefined ? (
        <ResponseMessage tone="success">{`${deleted}さんのデータを消しました。`}</ResponseMessage>
      ) : null}
      <ConfirmDialog
        open={target !== undefined}
        onOpenChange={(open) => {
          if (!open) setTarget(undefined);
        }}
        title="参加者のデータを削除しますか"
        confirmLabel="削除"
        pendingLabel="削除しています…"
        pending={mutation.isPending}
        error={mutation.isError ? errorMessage(mutation.error) : undefined}
        onConfirm={() => {
          if (target) mutation.mutate(target);
        }}
      >
        <p>{target ? deletionText(target, operator) : ""}</p>
      </ConfirmDialog>
    </Section>
  );
}

/**
 * 書き出しと削除の中身（主催者だけ）。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns 画面の要素
 */
function DataScreen({ event }: { event: EventView }) {
  return (
    <Page title="書き出しと削除" lead={`${event.name}（${formatEventDateTime(event.startsAt)}）`}>
      <ExportSection event={event} />
      {eventDataSections().map(({ id, Component }) => (
        <Component key={id} event={event} />
      ))}
      <DeleteSection event={event} />
    </Page>
  );
}

/** DataPage が受け取るもの。 */
export type DataPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * A5 書き出しと削除（ログインが要る・主催者だけ）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function DataPage({ eventId }: DataPageProps) {
  return (
    <SessionGate>
      <EventAccessGate eventId={eventId} roles={["organizer"]}>
        {(event) => <DataScreen event={event} />}
      </EventAccessGate>
    </SessionGate>
  );
}

const dataRouteApi = getRouteApi("/admin/events/$eventId/data");

/**
 * A5 の道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function DataRoute() {
  const { eventId } = dataRouteApi.useParams();
  return <DataPage eventId={eventId} />;
}
