// A1 交流会の一覧（EXPERIENCE.md）。主催者はすべての交流会、受付係は自分が受付係の交流会だけ（research R5）。
// 主催者には「交流会を追加」と、行ごとの「準備」「直す」を出す。受付係には出さない（EXPERIENCE「隠す」）。
// 行の名前は、その役目で出す最初の管理の画面へのリンク（なければ文字だけ。research R9）。
import type { EventView } from "@workspace/contracts/event";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { Button } from "@workspace/ui/components/button";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate, useSession } from "../account/index.ts";
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
  const session = useSession();
  const query = useEventList();
  const registered = useRegisteredPaths();
  const organizer = session.status === "authenticated" && session.account.isOrganizer;
  return (
    <Page
      title="交流会の一覧"
      actions={
        organizer ? (
          <Link to="/admin/events/new" className={buttonVariants({ variant: "primary" })}>
            交流会を追加
          </Link>
        ) : undefined
      }
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <div className="flex flex-col items-start gap-xxs">
          <p role="alert" className="text-m text-danger-text">
            {errorMessage(query.error)}
          </p>
          <Button onClick={() => void query.refetch()}>もう一度</Button>
        </div>
      ) : query.data.events.length === 0 ? (
        <p className="text-m">
          交流会はまだありません。
          {organizer ? "「交流会を追加」から作ってください。" : ""}
        </p>
      ) : (
        <ul aria-label="交流会" className="flex flex-col gap-xs">
          {query.data.events.map((event) => (
            <EventRow key={event.id} event={event} registered={registered} />
          ))}
        </ul>
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
