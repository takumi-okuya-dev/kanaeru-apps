// A3 一覧画面の参加者・合計（主催者・受付係。EXPERIENCE.md の A3・UJ-3・UJ-4）。
// 上に event の EventAdminNav（「参加者・合計」「困りごと」「準備」）。タブ「参加者」「合計」。
// 一覧・合計・内訳は5秒おきに読み直す（queries.ts）。読み直しが失敗しても前のものを出したまま「最新にできませんでした」。
// 主催者には「書き出しと削除」（A5）への入口と内訳を出す。受付係には出さない（隠す。EXPERIENCE）。
import type { EventView } from "@workspace/contracts/event";
import { Link, getRouteApi } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { cn } from "@workspace/ui/lib/cn";
import { useRef, useState } from "react";
import type * as React from "react";
import { errorMessage } from "../../lib/api.ts";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { EventAccessGate, EventAdminNav, formatEventDateTime } from "../event/index.ts";
import { ParticipantsTab } from "./ParticipantsTab.tsx";
import { TotalsTab } from "./TotalsTab.tsx";
import { isNightStop, useBreakdown, useCheckinList, useTotals } from "./queries.ts";

/** タブ。 */
const TABS = [
  { id: "participants", label: "参加者" },
  { id: "totals", label: "合計" },
] as const;

/** タブの ID。 */
type TabId = (typeof TABS)[number]["id"];

/** タブの並びが受け取るもの。 */
type TabListProps = {
  /** 選んだタブ */
  selected: TabId;
  /** 選んだとき */
  onSelect: (tab: TabId) => void;
};

/**
 * タブの並び（矢印で移って選ぶ。選んだタブだけ Tab で止まる）。
 * @param props 選んだタブ（selected）・選んだとき（onSelect）
 * @returns 要素
 */
function TabList({ selected, onSelect }: TabListProps) {
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({
    participants: null,
    totals: null,
  });

  /**
   * 矢印・Home・End で移る。
   * @param event キーの押下
   * @param index 今のタブの位置
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const tab = TABS[next];
    if (!tab) return;
    onSelect(tab.id);
    refs.current[tab.id]?.focus();
  };

  return (
    <div role="tablist" aria-label="一覧画面" className="flex gap-x3s border-b border-border">
      {TABS.map((tab, index) => {
        const current = tab.id === selected;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            id={`reception-tab-${tab.id}`}
            aria-selected={current}
            aria-controls={`reception-panel-${tab.id}`}
            tabIndex={current ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "-mb-px min-h-xl cursor-pointer border-b-2 px-xs text-m text-text",
              current ? "border-primary font-bold" : "border-transparent hover:bg-surface-over",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 一覧画面の中身（主催者・受付係）。
 * @param props 交流会（event）
 * @param props.event 交流会（役目つき）
 * @returns 画面の要素
 */
function Reception({ event }: { event: EventView }) {
  const organizer = event.myRole === "organizer";
  const [tab, setTab] = useState<TabId>("participants");
  const list = useCheckinList(event.id);
  const totals = useTotals(event.id);
  const breakdown = useBreakdown(event.id, organizer);
  const queries = [list, totals, ...(organizer ? [breakdown] : [])];
  const firstError = queries.find((query) => query.isError)?.error;
  const stale = queries.some((query) => query.isRefetchError);

  return (
    <Page
      title="参加者・合計"
      lead={`${event.name}（${formatEventDateTime(event.startsAt)}）`}
      actions={
        organizer ? (
          <Link
            to="/admin/events/$eventId/data"
            params={{ eventId: event.id }}
            className={buttonVariants({ variant: "secondary" })}
          >
            書き出しと削除
          </Link>
        ) : undefined
      }
    >
      <EventAdminNav eventId={event.id} role={event.myRole} />
      {stale ? (
        <p className="text-s text-text-sub">
          {isNightStop(firstError)
            ? "夜間（0時〜8時）は止まっています。8時からもう一度開いてください。"
            : "最新にできませんでした。電波の良い所で、しばらく待つと読み直します。"}
        </p>
      ) : firstError && !(list.data && totals.data) ? (
        <ResponseMessage tone="danger">{errorMessage(firstError)}</ResponseMessage>
      ) : null}
      <div className="flex flex-col gap-xs">
        <TabList selected={tab} onSelect={setTab} />
        <div
          role="tabpanel"
          id="reception-panel-participants"
          aria-labelledby="reception-tab-participants"
          hidden={tab !== "participants"}
        >
          <ParticipantsTab event={event} list={list.data} />
        </div>
        <div
          role="tabpanel"
          id="reception-panel-totals"
          aria-labelledby="reception-tab-totals"
          tabIndex={0}
          hidden={tab !== "totals"}
        >
          <TotalsTab totals={totals.data} breakdown={breakdown.data} showBreakdown={organizer} />
        </div>
      </div>
    </Page>
  );
}

/** ReceptionPage が受け取るもの。 */
export type ReceptionPageProps = {
  /** 交流会の ID */
  eventId: string;
};

/**
 * A3 一覧画面の参加者・合計（ログインが要る・主催者と受付係）。
 * @param props 交流会の ID（eventId）
 * @returns 画面の要素
 */
export function ReceptionPage({ eventId }: ReceptionPageProps) {
  return (
    <SessionGate>
      <EventAccessGate eventId={eventId} roles={["organizer", "staff"]}>
        {(event) => <Reception event={event} />}
      </EventAccessGate>
    </SessionGate>
  );
}

const receptionRouteApi = getRouteApi("/admin/events/$eventId");

/**
 * A3 の道の部品（道の eventId を渡す）。
 * @returns 画面の要素
 */
export function ReceptionRoute() {
  const { eventId } = receptionRouteApi.useParams();
  return <ReceptionPage eventId={eventId} />;
}
