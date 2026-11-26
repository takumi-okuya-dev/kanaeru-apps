// A4 準備（主催者だけ。EXPERIENCE.md）：持ち主と組織（event-002）・受付QR・アンケートQRの表示と印刷・アンケートの開閉・
// 受付係の招待のリンク（写す・作り直す）・受付係の一覧（外す）。「持ち主と組織」のあとに、ほかの領域が差しこみの場所
// （setup-slots.ts の registerSetupSection）から出す節を並べる（booking の「使い方」。booking-001）。
// 送った結果は押したボタンの近く（ResponseMessage）、作り直す・外す前は確かめの枠（ConfirmDialog）。
import type { EventView } from "@workspace/contracts/event";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { EventAccessGate, Loading } from "./EventAccessGate.tsx";
import { OwnerOrganizationSection } from "./OwnerOrganizationSection.tsx";
import { QrCode } from "./QrCode.tsx";
import {
  createStaffInvite,
  fetchStaff,
  fetchStaffInvite,
  removeStaff,
  setSurveyOpen,
} from "./api.ts";
import { formatEventDateTime, formatJstDate } from "./format.ts";
import { QR_DESCRIPTIONS, QR_TITLES, inviteLinkValue, qrValue, usesMiniAppUrl } from "./links.ts";
import { EVENT_QUERY_KEYS } from "./queries.ts";
import { setupSectionList } from "./setup-slots.ts";

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
 * 準備の画面のまとまり（見出し h2 つき）。
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
 * 受付QR・アンケートQR。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns まとまりの要素
 */
function QrSection({ event }: { event: EventView }) {
  return (
    <Section id="setup-qr" title="受付QR・アンケートQR">
      {usesMiniAppUrl() ? null : (
        <p className="text-s text-text-sub">
          LINE につながない手元の形のため、QR には画面の URL を入れています。
        </p>
      )}
      <div className="flex flex-col gap-xs wide:flex-row">
        {(["checkin", "survey"] as const).map((kind) => {
          const value = qrValue(kind, event.id);
          const headingId = `setup-qr-${kind}`;
          return (
            <article
              key={kind}
              aria-labelledby={headingId}
              className="flex min-w-0 flex-1 flex-col items-start gap-xxs rounded-md border border-border bg-surface p-xs"
            >
              <h3 id={headingId} className="text-l leading-tight font-bold">
                {QR_TITLES[kind]}
              </h3>
              <p className="text-m">{event.name}</p>
              <QrCode value={value} label={`${QR_TITLES[kind]}：${event.name}`} />
              <p className="text-s text-text-sub">{QR_DESCRIPTIONS[kind]}</p>
              <p className="max-w-full text-s break-all text-text-sub">{value}</p>
              <Link
                to="/admin/events/$eventId/setup/qr/$kind"
                params={{ eventId: event.id, kind }}
                className={buttonVariants({ variant: "secondary", size: "small" })}
              >
                {QR_TITLES[kind]}を印刷する
              </Link>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * アンケートの開閉。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns まとまりの要素
 */
function SurveySection({ event }: { event: EventView }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (open: boolean) => setSurveyOpen(event.id, open),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
    },
  });
  const open = event.surveyOpen;
  return (
    <Section id="setup-survey" title="アンケート">
      <p role="status" className="text-m font-bold">
        {open ? "アンケートは開いています" : "アンケートは閉じています"}
      </p>
      <p className="text-s text-text-sub">
        {open
          ? "閉じると、参加者の新しい回答を受け付けません。"
          : "交流会の終わりに開くと、参加者がアンケートに答えられます。"}
      </p>
      <div className="flex flex-col items-start gap-xxs">
        <ButtonRow>
          <Button
            aria-disabled={mutation.isPending || undefined}
            onClick={() => {
              if (!mutation.isPending) mutation.mutate(!open);
            }}
          >
            {open ? "アンケートを閉じる" : "アンケートを開く"}
          </Button>
        </ButtonRow>
        {mutation.isError ? (
          <ResponseMessage tone="danger">
            {`切りかえられませんでした。${errorMessage(mutation.error)}`}
          </ResponseMessage>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * 受付係の招待のリンク。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns まとまりの要素
 */
function InviteSection({ event }: { event: EventView }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: EVENT_QUERY_KEYS.invite(event.id),
    queryFn: () => fetchStaffInvite(event.id),
  });
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<"done" | "failed">();
  const mutation = useMutation({
    mutationFn: () => createStaffInvite(event.id),
    onSuccess: (invite) => {
      queryClient.setQueryData(EVENT_QUERY_KEYS.invite(event.id), { invite });
      setConfirming(false);
      setCopied(undefined);
    },
  });

  if (query.isPending) return <Loading />;
  if (query.isError) {
    return (
      <Section id="setup-invite" title="受付係の招待">
        <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>
      </Section>
    );
  }
  const invite = query.data.invite;
  const link = invite ? inviteLinkValue(invite.token) : undefined;

  /** リンクを写す。 */
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <Section id="setup-invite" title="受付係の招待">
      <p className="text-s text-text-sub">
        リンクを受付係に送ってください。開いて「受ける」を押すと、この交流会の受付係になります。リンクは何人でも使えます。
      </p>
      {invite && link ? (
        <div className="flex flex-col items-start gap-xxs">
          <p className="max-w-full rounded-sm border border-border-input bg-surface px-xxs py-x3s text-m break-all">
            {link}
          </p>
          <p className="text-s text-text-sub">
            {formatJstDate(new Date(new Date(invite.expiresAt).getTime() - 1).toISOString())}
            の終わりまで使えます。
          </p>
          <ButtonRow>
            <Button
              onClick={() => {
                // 前に失敗したときの誤りを、開いたばかりの確かめの枠に残さない
                mutation.reset();
                setConfirming(true);
              }}
            >
              作り直す
            </Button>
            <Button onClick={() => void copy()}>リンクを写す</Button>
          </ButtonRow>
          {copied === "done" ? (
            <ResponseMessage tone="success">写しました。</ResponseMessage>
          ) : null}
          {copied === "failed" ? (
            <ResponseMessage tone="danger">
              写せませんでした。リンクの文字を選んで写してください。
            </ResponseMessage>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-xxs">
          <p className="text-m">まだ招待のリンクはありません。</p>
          <ButtonRow>
            <Button
              aria-disabled={mutation.isPending || undefined}
              onClick={() => {
                if (!mutation.isPending) mutation.mutate();
              }}
            >
              招待のリンクを作る
            </Button>
          </ButtonRow>
          {mutation.isError && !confirming ? (
            <ResponseMessage tone="danger">
              {`作れませんでした。${errorMessage(mutation.error)}`}
            </ResponseMessage>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="招待のリンクを作り直しますか"
        confirmLabel="作り直す"
        pendingLabel="作り直しています…"
        pending={mutation.isPending}
        error={mutation.isError ? errorMessage(mutation.error) : undefined}
        onConfirm={() => mutation.mutate()}
      >
        <p>
          作り直すと、前のリンクは使えなくなります。すでに受付係になった人は、そのまま使えます。
        </p>
      </ConfirmDialog>
    </Section>
  );
}

/**
 * 受付係の一覧。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns まとまりの要素
 */
function StaffSection({ event }: { event: EventView }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: EVENT_QUERY_KEYS.staff(event.id),
    queryFn: () => fetchStaff(event.id),
  });
  const [target, setTarget] = useState<{ accountId: string; displayName: string }>();
  const [removed, setRemoved] = useState<string>();
  const mutation = useMutation({
    mutationFn: (accountId: string) => removeStaff(event.id, accountId),
    onSuccess: async () => {
      setRemoved(target?.displayName);
      setTarget(undefined);
      // 外すと招待のリンクも作り直される（research R3）ので、受付係の一覧と一緒に読み直す
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.staff(event.id) }),
        queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.invite(event.id) }),
      ]);
    },
  });

  return (
    <Section id="setup-staff" title="受付係">
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>
      ) : query.data.staff.length === 0 ? (
        <p className="text-m">まだ受付係はいません。</p>
      ) : (
        <ul aria-label="受付係" className="flex flex-col divide-y divide-border">
          {query.data.staff.map((member) => (
            <li key={member.accountId} className="flex flex-wrap items-center gap-xs py-xxs">
              <span className="min-w-0 flex-1 text-m break-words">
                {member.displayName || "（表示名なし）"}
              </span>
              <Button
                size="small"
                aria-label={`${member.displayName || "表示名なしの受付係"}を外す`}
                onClick={() => {
                  mutation.reset();
                  setTarget(member);
                }}
              >
                外す
              </Button>
            </li>
          ))}
        </ul>
      )}
      {removed !== undefined ? (
        <ResponseMessage tone="success">
          {`${removed || "受付係"}さんを外しました。招待のリンクも作り直したので、前のリンクは使えません。ほかの人を招くときは、新しいリンクを送ってください。`}
        </ResponseMessage>
      ) : null}
      <ConfirmDialog
        open={target !== undefined}
        onOpenChange={(open) => {
          if (!open) setTarget(undefined);
        }}
        title="受付係から外しますか"
        confirmLabel="外す"
        pendingLabel="外しています…"
        pending={mutation.isPending}
        error={mutation.isError ? errorMessage(mutation.error) : undefined}
        onConfirm={() => {
          if (target) mutation.mutate(target.accountId);
        }}
      >
        <p>
          {`${target?.displayName || "この受付係"}さんは、次に画面を開いたときから、この交流会の一覧画面を使えなくなります。`}
        </p>
        <p>
          前のリンクで受け直せないよう、招待のリンクも作り直します。ほかの受付係は、そのまま使えます。
        </p>
      </ConfirmDialog>
    </Section>
  );
}

/**
 * 準備の画面の中身（主催者だけ）。
 * @param props 交流会（event）
 * @param props.event 交流会
 * @returns 画面の要素
 */
function Setup({ event }: { event: EventView }) {
  return (
    <Page
      title="準備"
      lead={`${event.name}（${formatEventDateTime(event.startsAt)}）`}
      actions={
        <Link
          to="/admin/events/$eventId/edit"
          params={{ eventId: event.id }}
          className={buttonVariants({ variant: "secondary" })}
        >
          交流会を直す
        </Link>
      }
    >
      <OwnerOrganizationSection eventId={event.id} />
      {setupSectionList().map(({ id, Component }) => (
        <Component key={id} event={event} />
      ))}
      <QrSection event={event} />
      <SurveySection event={event} />
      <InviteSection event={event} />
      <StaffSection event={event} />
    </Page>
  );
}

/** EventSetupPage が受け取るもの。 */
export type EventSetupPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * A4 準備（ログインが要る・主催者だけ）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function EventSetupPage({ eventId }: EventSetupPageProps) {
  return (
    <SessionGate>
      <EventAccessGate eventId={eventId} roles={["organizer"]}>
        {(event) => <Setup event={event} />}
      </EventAccessGate>
    </SessionGate>
  );
}

const setupRouteApi = getRouteApi("/admin/events/$eventId/setup");

/**
 * A4 準備の道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function EventSetupRoute() {
  const { eventId } = setupRouteApi.useParams();
  return <EventSetupPage eventId={eventId} />;
}
