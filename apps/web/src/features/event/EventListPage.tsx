// A1 交流会の一覧（EXPERIENCE.md）。自分が主催者の交流会（持ち主のもの・組織のもの）と、受付係の交流会（event-002）。
// 「交流会を追加」はログインした誰にも出す。行ごとの「準備」「直す」は主催者にだけ出す（EXPERIENCE「隠す」）。
// 行ごとに持ち主と組織（なければ「個人」）を出し、組織の交流会があればチップで組織ごと・個人に絞れる（research R7）。
// 行の名前は、その役目で出す最初の管理の画面へのリンク（なければ文字だけ。event-001 research R9）。
import type { EventView } from "@workspace/contracts/event";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { Loading } from "./EventAccessGate.tsx";
import { firstAdminPath } from "./admin-tabs.ts";
import { formatEventDateTime, formatFee } from "./format.ts";
import { InternalLink, useRegisteredPaths } from "./navigation.tsx";
import { useEventList } from "./queries.ts";

/** EventRow が受け取るもの。 */
type EventRowProps = {
  /** 交流会 */
  event: EventView;
  /** 道の木に登録されている道の形 */
  registered: ReadonlySet<string>;
};

/**
 * 持ち主の出し方（自分なら「あなた」）。
 * @param event 交流会
 * @returns 画面の言葉
 */
function ownerLabel(event: EventView): string {
  if (event.isOwner) return "あなた";
  if (!event.owner) return "まだいません";
  return event.owner.displayName || "名前のない人";
}

/** 絞りこみの「すべて」と「個人」の値（組織の ID は uuid なので重ならない）。 */
const ALL = "all";
const PERSONAL = "personal";

/**
 * 絞りこみの値に当たる交流会か。
 * @param event 交流会
 * @param filter 絞りこみの値（すべて・個人・組織の ID）
 * @returns 当たれば true
 */
function matchesFilter(event: EventView, filter: string): boolean {
  if (filter === ALL) return true;
  if (filter === PERSONAL) return event.organization === null;
  return event.organization?.id === filter;
}

/**
 * 一覧に出てくる組織（出てきた順・重ねない）。
 * @param events 交流会の並び
 * @returns 組織の並び
 */
function organizationsIn(events: readonly EventView[]): { id: string; name: string }[] {
  const found = new Map<string, string>();
  for (const event of events) {
    if (event.organization) found.set(event.organization.id, event.organization.name);
  }
  return [...found].map(([id, name]) => ({ id, name }));
}

/**
 * 交流会の一覧の1行（カードの形）。
 * @param props 交流会（event）・登録されている道（registered）
 * @returns 行の要素
 */
function EventRow({ event, registered }: EventRowProps) {
  const destination = firstAdminPath(event.id, event.myRole, registered);
  const headingId = `event-${event.id}`;
  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-xxs rounded-md border border-border bg-surface p-xs"
    >
      <h2 id={headingId} className="text-l leading-tight font-bold">
        {destination ? (
          <InternalLink href={destination} className="text-text-link underline">
            {event.name}
          </InternalLink>
        ) : (
          event.name
        )}
      </h2>
      <dl className="flex flex-col gap-x3s text-m">
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">日時</dt>
          <dd>{formatEventDateTime(event.startsAt)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">会場</dt>
          <dd className="min-w-0 break-words">{event.venue}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">参加費</dt>
          <dd className="tabular-nums">{formatFee(event.fee)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">持ち主</dt>
          <dd className="min-w-0 break-words">{ownerLabel(event)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-xs">
          <dt className="text-text-sub">組織</dt>
          <dd className="min-w-0 break-words">{event.organization?.name ?? "個人"}</dd>
        </div>
      </dl>
      {event.myRole === "organizer" ? (
        <div className="flex flex-wrap gap-xxs">
          <Link
            to="/admin/events/$eventId/setup"
            params={{ eventId: event.id }}
            aria-label={`準備：${event.name}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            準備
          </Link>
          <Link
            to="/admin/events/$eventId/edit"
            params={{ eventId: event.id }}
            aria-label={`直す：${event.name}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            直す
          </Link>
        </div>
      ) : null}
    </li>
  );
}

/**
 * 交流会の一覧の中身（ログインしているとき）。
 * @returns 画面の要素
 */
function EventList() {
  const query = useEventList();
  const registered = useRegisteredPaths();
  const [filter, setFilter] = useState<string>(ALL);
  const events = query.data?.events ?? [];
  const organizations = organizationsIn(events);
  // 絞りこんだ組織が一覧から消えたら（組織から外したなど）、すべてに戻す
  const current =
    filter === ALL || filter === PERSONAL || organizations.some((item) => item.id === filter)
      ? filter
      : ALL;
  const shown = events.filter((event) => matchesFilter(event, current));
  return (
    <Page
      title="交流会の一覧"
      actions={
        <Link to="/admin/events/new" className={buttonVariants({ variant: "primary" })}>
          交流会を追加
        </Link>
      }
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <div className="flex flex-col items-start gap-xxs">
          <p role="alert" className="text-m text-danger-text">
            {errorMessage(query.error)}
          </p>
          <ButtonRow>
            <Button onClick={() => void query.refetch()}>もう一度</Button>
          </ButtonRow>
        </div>
      ) : events.length === 0 ? (
        <p className="text-m">交流会はまだありません。「交流会を追加」から作ってください。</p>
      ) : (
        <>
          {organizations.length > 0 ? (
            <ChoiceChips
              label="組織で絞る"
              options={[
                { value: ALL, label: "すべて" },
                ...organizations.map((item) => ({ value: item.id, label: item.name })),
                { value: PERSONAL, label: "個人" },
              ]}
              value={current}
              onValueChange={setFilter}
            />
          ) : null}
          {shown.length === 0 ? (
            <p className="text-m">この絞りこみの交流会はありません。</p>
          ) : (
            <ul aria-label="交流会" className="flex flex-col gap-xs">
              {shown.map((event) => (
                <EventRow key={event.id} event={event} registered={registered} />
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}

/**
 * A1 交流会の一覧（ログインが要る）。
 * @returns 画面の要素
 */
export function EventListPage() {
  return (
    <SessionGate>
      <EventList />
    </SessionGate>
  );
}
