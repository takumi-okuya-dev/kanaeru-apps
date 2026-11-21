// 自分の申込み（/my-bookings。参加者の画面。外枠のナビなし。booking-003 US3・モックアップ P6・PRD 11章の4）。
// タブ「自分の申込み」（今後の回・状態・カレンダーに追加・取り消す〈確かめを1つ〉）と「部の予定」（自分の組織の自前の会）。
// 下の「知らせと案内」で、メールアドレスを入れる・消す、案内を受け取る組織を外す。ほかの人の名前は出さない。
// キャンセル待ち（booking-004）：状態の札に何番目か、打診中なら期限と「参加する」「辞退する」、当日の空きなら「参加する」。
import type { MyEntryItem } from "@workspace/contracts/booking";
import { PAGE_STATE_LABELS } from "@workspace/contracts/booking";
import { PARTICIPANT_ROUTE_PATTERNS } from "@workspace/contracts/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { cn } from "@workspace/ui/lib/cn";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { formatEventDateTime } from "../event/index.ts";
import {
  cancelMyEntry,
  fetchMyConsents,
  fetchMyEntries,
  fetchMySchedule,
  removeMyConsent,
} from "./apply-api.ts";
import { APPLY_QUERY_KEYS, ContactSection, EXTERNAL_LINK } from "./apply-parts.tsx";
import { respondMyEntry } from "./waitlist-api.ts";
import { EntryStatusBadge, RespondButtons, StandingNote } from "./waitlist-parts.tsx";

/** タブ。 */
export type MyBookingsTab = "entries" | "schedule";

/**
 * 自分の申込みのタブ。
 * @returns 中身の要素
 */
function EntriesTab() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: APPLY_QUERY_KEYS.myEntries, queryFn: fetchMyEntries });
  const [target, setTarget] = useState<MyEntryItem>();
  const [done, setDone] = useState<string>();
  const cancel = useMutation({
    mutationFn: (entryId: string) => cancelMyEntry(entryId),
    onSuccess: async (item) => {
      setTarget(undefined);
      setDone(`${item.event.name}の申込みを取り消しました。`);
      await queryClient.invalidateQueries({ queryKey: ["booking"] });
    },
  });
  if (query.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (query.isError)
    return <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>;
  const entries = query.data.entries;
  return (
    <div className="flex flex-col gap-xs">
      {done ? <ResponseMessage tone="success">{done}</ResponseMessage> : null}
      {entries.length === 0 ? (
        <p className="text-m text-text-sub">今後の申込みはありません。</p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {entries.map((item) => (
            <li
              key={item.entryId}
              className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
            >
              <div>
                <EntryStatusBadge status={item.status} waitlistPosition={item.waitlistPosition} />
              </div>
              <Link
                to={PARTICIPANT_ROUTE_PATTERNS.apply}
                params={{ eventId: item.event.id }}
                className="inline-flex min-h-xl items-center text-m font-bold break-words text-text-link underline"
              >
                {item.event.name}
              </Link>
              <p className="text-s text-text-sub">
                {[formatEventDateTime(item.event.startsAt), item.hostName]
                  .filter(Boolean)
                  .join("・")}
              </p>
              <StandingNote status={item.status} standing={item} />
              <RespondButtons
                status={item.status}
                standing={item}
                respond={(answer) => respondMyEntry(item.entryId, answer)}
                onDone={async (answer) => {
                  setDone(
                    answer === "accept"
                      ? `${item.event.name}に参加することにしました（確定）。`
                      : `${item.event.name}の打診を辞退しました。`,
                  );
                  await queryClient.invalidateQueries({ queryKey: ["booking"] });
                }}
              />
              <div className="flex flex-wrap gap-xs">
                {item.status === "confirmed" ? (
                  <a
                    href={item.googleCalendarUrl}
                    {...EXTERNAL_LINK}
                    className="inline-flex min-h-xl items-center text-s text-text-link underline"
                  >
                    カレンダーに追加
                  </a>
                ) : null}
                {item.cancellable ? (
                  <Button
                    variant="text"
                    className="min-h-xl text-danger-text"
                    onClick={() => {
                      setDone(undefined);
                      cancel.reset();
                      setTarget(item);
                    }}
                  >
                    取り消す
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={target !== undefined}
        onOpenChange={(open) => {
          if (!open) setTarget(undefined);
        }}
        title="申込みを取り消しますか"
        confirmLabel="取り消す"
        pendingLabel="取り消しています…"
        danger
        pending={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : undefined}
        onConfirm={() => {
          if (target) cancel.mutate(target.entryId);
        }}
      >
        <p>{target ? `${target.event.name}の申込みを取り消します。` : ""}</p>
      </ConfirmDialog>
    </div>
  );
}

/**
 * 部の予定のタブ。
 * @returns 中身の要素
 */
function ScheduleTab() {
  const query = useQuery({ queryKey: APPLY_QUERY_KEYS.mySchedule, queryFn: fetchMySchedule });
  if (query.isPending) {
    return (
      <p aria-busy="true" className="text-m text-text-sub">
        読みこんでいます…
      </p>
    );
  }
  if (query.isError)
    return <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>;
  const events = query.data.events;
  if (events.length === 0) {
    return (
      <p className="text-m text-text-sub">
        部の予定はありません。部（組織）に入ると、その部の会がここに出ます。
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-xs">
      {events.map((item) => (
        <li
          key={item.event.id}
          className="flex flex-col gap-x3s rounded-md border border-border bg-surface p-xs"
        >
          <div className="flex flex-wrap gap-xxs">
            {item.myStatus ? (
              <EntryStatusBadge status={item.myStatus} waitlistPosition={null} />
            ) : null}
            <Badge>{PAGE_STATE_LABELS[item.state]}</Badge>
            {item.visibility === "members" ? <Badge>部員だけ</Badge> : null}
          </div>
          <Link
            to={PARTICIPANT_ROUTE_PATTERNS.apply}
            params={{ eventId: item.event.id }}
            className="inline-flex min-h-xl items-center text-m font-bold break-words text-text-link underline"
          >
            {item.event.name}
          </Link>
          <p className="text-s text-text-sub">
            {[formatEventDateTime(item.event.startsAt), item.hostName].filter(Boolean).join("・")}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * 案内を受け取る組織（外せる）。
 * @returns 節の要素
 */
function ConsentSection() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: APPLY_QUERY_KEYS.myConsents, queryFn: fetchMyConsents });
  const remove = useMutation({
    mutationFn: (consentId: string) => removeMyConsent(consentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["booking"] });
    },
  });
  return (
    <section aria-labelledby="my-consents" className="flex flex-col gap-xxs">
      <h2 id="my-consents" className="text-l leading-tight font-bold">
        次の会の案内を受け取る主催
      </h2>
      {query.isError ? (
        <ResponseMessage tone="danger">{errorMessage(query.error)}</ResponseMessage>
      ) : null}
      {query.data && query.data.consents.length === 0 ? (
        <p className="text-m text-text-sub">案内を受け取る主催はありません。</p>
      ) : null}
      <ul className="flex flex-col gap-xxs">
        {(query.data?.consents ?? []).map((consent) => (
          <li
            key={consent.id}
            className="flex flex-wrap items-center justify-between gap-xxs rounded-md border border-border bg-surface px-xs"
          >
            <span className="text-m break-words">{consent.holderName}</span>
            <Button
              variant="text"
              className="min-h-xl"
              aria-busy={(remove.isPending && remove.variables === consent.id) || undefined}
              onClick={() => remove.mutate(consent.id)}
            >
              外す
            </Button>
          </li>
        ))}
      </ul>
      {remove.isError ? (
        <ResponseMessage tone="danger">{errorMessage(remove.error)}</ResponseMessage>
      ) : null}
    </section>
  );
}

/**
 * 自分の申込みの中身（ログインしているとき）。
 * @param props タブ
 * @param props.tab 今のタブ
 * @returns 画面の要素
 */
function MyBookings({ tab }: { tab: MyBookingsTab }) {
  const tabs: { id: MyBookingsTab; label: string }[] = [
    { id: "entries", label: "自分の申込み" },
    { id: "schedule", label: "部の予定" },
  ];
  return (
    <Page title="予約">
      <nav aria-label="予約の切り替え" className="grid grid-cols-2 border-b border-border">
        {tabs.map((item) => (
          <Link
            key={item.id}
            to={PARTICIPANT_ROUTE_PATTERNS.myBookings}
            search={item.id === "schedule" ? { tab: "schedule" } : {}}
            aria-current={tab === item.id ? "page" : undefined}
            className={cn(
              "flex min-h-xl items-center justify-center text-m",
              tab === item.id ? "border-b-2 border-primary font-bold text-text" : "text-text-sub",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "schedule" ? <ScheduleTab /> : <EntriesTab />}
      <section aria-labelledby="my-notify" className="flex flex-col gap-s">
        <h2 id="my-notify" className="text-l leading-tight font-bold">
          知らせと案内
        </h2>
        <ContactSection />
        <ConsentSection />
      </section>
    </Page>
  );
}

/**
 * 自分の申込みの画面（ログインが要る）。
 * @param props タブ
 * @param props.tab 今のタブ
 * @returns 画面の要素
 */
export function MyBookingsPage({ tab }: { tab: MyBookingsTab }) {
  return (
    <SessionGate>
      <MyBookings tab={tab} />
    </SessionGate>
  );
}

const myBookingsRouteApi = getRouteApi(PARTICIPANT_ROUTE_PATTERNS.myBookings);

/**
 * 自分の申込みの道の部品（問い合わせの tab を渡す）。
 * @returns 画面の要素
 */
export function MyBookingsRoute() {
  const { tab } = myBookingsRouteApi.useSearch();
  return <MyBookingsPage tab={tab === "schedule" ? "schedule" : "entries"} />;
}
