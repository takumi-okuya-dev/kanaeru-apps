// QR の印刷の画面（主催者だけ。PRD FR-2・DESIGN.md の qr-display：1枚に1つの QR を大きく）。
// どちらの QR かを大きくことばで書き（色で分けない）、交流会の名前を添える。「印刷する」でブラウザの印刷を開く。
// 印刷では外枠の帯・ナビと画面だけの操作を隠す（print.css）。
import type { EventView, QrKind } from "@workspace/contracts/event";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { useEffect } from "react";
import { APP_NAME } from "../../lib/app-name.ts";
import { SessionGate } from "../account/index.ts";
import { EventAccessGate } from "./EventAccessGate.tsx";
import { QrCode } from "./QrCode.tsx";
import { formatEventDateTime } from "./format.ts";
import { QR_TITLES, qrValue } from "./links.ts";
import "./print.css";

/** 印刷の画面の QR の一辺（px。画面では幅に合わせて縮む）。 */
const PRINT_QR_SIZE = 480;

/**
 * 印刷の画面の中身。
 * @param props 交流会（event）・QR の種類（kind）
 * @param props.event 交流会
 * @param props.kind QR の種類
 * @returns 画面の要素
 */
function PrintSheet({ event, kind }: { event: EventView; kind: QrKind }) {
  const title = QR_TITLES[kind];
  useEffect(() => {
    document.title = `${title}（印刷）｜${APP_NAME}`;
  }, [title]);
  return (
    <div data-print-sheet="" className="flex flex-col items-center gap-s text-center">
      <div data-print-hidden="" className="flex w-full flex-wrap justify-between gap-xxs">
        <Link
          to="/admin/events/$eventId/setup"
          params={{ eventId: event.id }}
          className="flex min-h-l items-center text-m text-text-link underline"
        >
          準備へ戻る
        </Link>
        <Button variant="primary" onClick={() => window.print()}>
          印刷する
        </Button>
      </div>
      <h1 tabIndex={-1} className="text-xxl leading-tight font-bold outline-none">
        {title}
      </h1>
      <p className="text-l font-bold">{event.name}</p>
      <p className="text-m">{formatEventDateTime(event.startsAt)}</p>
      <QrCode
        value={qrValue(kind, event.id)}
        label={`${title}：${event.name}`}
        size={PRINT_QR_SIZE}
        className="h-auto max-w-full"
      />
      <p className="text-l">
        {kind === "checkin"
          ? "スマホのカメラで読んで、チェックインしてください"
          : "スマホのカメラで読んで、アンケートに答えてください"}
      </p>
    </div>
  );
}

/** QrPrintPage が受け取るもの。 */
export type QrPrintPageProps = {
  /** 交流会の ID */
  eventId: string;
  /** QR の種類 */
  kind: QrKind;
};

/**
 * QR の印刷の画面（ログインが要る・主催者だけ）。
 * @param props 交流会の ID（eventId）・QR の種類（kind）
 * @returns 画面の要素
 */
export function QrPrintPage({ eventId, kind }: QrPrintPageProps) {
  return (
    <SessionGate>
      <EventAccessGate eventId={eventId} roles={["organizer"]}>
        {(event) => <PrintSheet event={event} kind={kind} />}
      </EventAccessGate>
    </SessionGate>
  );
}

const printRouteApi = getRouteApi("/admin/events/$eventId/setup/qr/$kind");

/**
 * QR の印刷の道の部品（道の eventId と kind を渡す。kind の形は道が確かめる）。
 * @returns 画面の要素
 */
export function QrPrintRoute() {
  const { eventId, kind } = printRouteApi.useParams();
  return <QrPrintPage eventId={eventId} kind={kind} />;
}
