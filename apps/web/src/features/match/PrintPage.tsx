// M5・R1 印刷（/match/tables/$tableId/print）。モックアップの M5（刷るレベルと紙を選ぶ）と R1（印刷の版）。
// - 組ごとに1枚（刷る組を選べる。試合のない組は選べない）。紙は A5・B5・A4・B4・A3・B3・A2、向きは縦・横（既定は A3 縦【仮決め】）
// - 版は名前の列に縦線を引き、余白を少なくし、選んだ紙1枚にちょうど収まるよう字の大きさと行の高さを自動で合わせる
//   （print-layout.ts。試合が少ないときは大きく、多いときは小さく。小さすぎるときは大きい紙をすすめる）
// - 見るだけのリンクをこの端末で作ってあれば、版の右上に見るだけのページの QR を入れる（FR-M19・R1。今の試合の印は入れない）。
//   入口に貼る1枚（R2。A4 縦・大きな QR）も選んで刷れる（FR-M20。match-004）。下に「kanaeru で作った試合表」（FR-M25）
// - 版は SVG で描き、印刷では版だけを出す（print.css）
import { MATCH_FORMAT_LABELS, PLAYERS_PER_GAME } from "@workspace/contracts/match";
import type { MatchGroup, MatchGroupPlan, MatchTable } from "@workspace/contracts/match";
import { Link, useParams as useRouteParams } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ChoiceChips } from "@workspace/ui/components/choice-chips";
import { ResponseMessage } from "@workspace/ui/components/response-message";
import { useState } from "react";
import { Page } from "../../lib/page.tsx";
import { formatPlayDate } from "./format.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";
import { groupsOf } from "./plan.ts";
import {
  DEFAULT_PAPER,
  ORIENTATIONS,
  ORIENTATION_LABELS,
  PAPER_LABELS,
  PAPER_SIZES,
  layoutSheet,
  printableArea,
  textWidthEm,
} from "./print-layout.ts";
import type { Orientation, PaperSize } from "./print-layout.ts";
import { useStoredLink } from "./link-store.ts";
import { matchPaths } from "./paths.ts";
import { QrGroup, qrPattern } from "./qr.tsx";
import { TableFrame } from "./TableFrame.tsx";
import "./print.css";

/** Sheet が受け取るもの。 */
type SheetProps = {
  /** 試合表 */
  table: MatchTable;
  /** 組 */
  group: MatchGroup;
  /** 組の試合 */
  plan: MatchGroupPlan;
  /** 紙の大きさ */
  size: PaperSize;
  /** 向き */
  orientation: Orientation;
  /** 見るだけのページの URL（あれば右上に QR を入れる） */
  viewUrl?: string;
};

/**
 * 1つの組の印刷の版（SVG。大きさの単位は mm）。
 * @param props 試合表（table）・組（group）・組の試合（plan）・紙（size・orientation）・見るだけのページの URL（viewUrl）
 * @returns 版の要素
 */
function Sheet({ table, group, plan, size, orientation, viewUrl }: SheetProps) {
  const names = new Map(table.content.players.map((player) => [player.id, player.nickname]));
  const columns = PLAYERS_PER_GAME[table.content.settings.format];
  const longest = Math.max(
    2,
    ...plan.games.flatMap((game) => game.players.map((id) => textWidthEm(names.get(id) ?? ""))),
  );
  const layout = layoutSheet({
    size,
    orientation,
    rows: plan.games.length,
    columns,
    longestNameEm: longest,
  });
  const { settings } = table.content;
  const subtitle = `${table.name}・${formatPlayDate(table.playDate)}・${MATCH_FORMAT_LABELS[settings.format]}・1試合${settings.minutesPerGame}分・試合 ${settings.startTime}〜${settings.endTime}`;
  const lineWidth = Math.max(0.2, layout.fontSize * 0.04);
  const tableBottom = layout.tableTop + layout.rowHeight * plan.games.length;
  // 右上の QR（表の上の帯の高さ）と、その左の小さな説明（2行）
  const qrSize = viewUrl ? Math.max(0, layout.tableTop - 1.5) : 0;
  const noteSize = layout.subtitleSize * 0.75;
  const noteWidth = viewUrl ? noteSize * 8 : 0;
  const madeAt = new Date(table.updatedAt).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  // 説明の文が長くて右の QR（なければ紙の端）にかかるときは、字の間を詰めて収める
  const subtitleRoom = layout.width - (viewUrl ? qrSize + noteWidth + noteSize * 2 : 0);
  const subtitleWidth = textWidthEm(subtitle) * layout.subtitleSize;
  return (
    <figure
      data-paper={`${size}-${orientation}`}
      aria-label={`${group.label}の印刷の版`}
      className="w-full max-w-form border border-border bg-surface shadow-layer1"
    >
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={`${group.label}の試合表（${plan.games.length}試合）`}
        className="block fill-text"
      >
        <text x={0} y={layout.titleSize} fontSize={layout.titleSize} fontWeight={700}>
          {group.label}
        </text>
        <text
          x={0}
          y={layout.titleSize * 1.3 + layout.subtitleSize * 1.1}
          fontSize={layout.subtitleSize}
          className="fill-text-sub"
          {...(subtitleWidth > subtitleRoom
            ? { textLength: subtitleRoom, lengthAdjust: "spacingAndGlyphs" }
            : {})}
        >
          {subtitle}
        </text>
        {viewUrl ? (
          <>
            <text
              x={layout.width - qrSize - noteSize}
              y={qrSize / 2 - noteSize * 0.2}
              fontSize={noteSize}
              fontWeight={700}
              textAnchor="end"
            >
              最新はスマホで
            </text>
            <text
              x={layout.width - qrSize - noteSize}
              y={qrSize / 2 + noteSize * 1.1}
              fontSize={noteSize}
              textAnchor="end"
              className="fill-text-sub"
            >
              {`${madeAt} の表`}
            </text>
            <QrGroup pattern={qrPattern(viewUrl)} size={qrSize} x={layout.width - qrSize} y={0} />
          </>
        ) : null}
        <g className="stroke-text" strokeWidth={lineWidth} fill="none">
          <rect
            x={lineWidth / 2}
            y={layout.tableTop}
            width={layout.width - lineWidth}
            height={tableBottom - layout.tableTop}
          />
          {plan.games.slice(1).map((_, index) => {
            const y = layout.tableTop + layout.rowHeight * (index + 1);
            return <line key={`row-${index}`} x1={0} x2={layout.width} y1={y} y2={y} />;
          })}
          {Array.from({ length: columns }, (_, column) => {
            const x = layout.numberWidth + layout.nameWidth * column;
            return (
              <line key={`col-${column}`} x1={x} x2={x} y1={layout.tableTop} y2={tableBottom} />
            );
          })}
        </g>
        {plan.games.map((game, index) => {
          const y = layout.tableTop + layout.rowHeight * (index + 0.5);
          return (
            <g key={index}>
              <text
                x={layout.numberWidth - layout.numberSize * 0.4}
                y={y}
                fontSize={layout.numberSize}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-text-sub"
              >
                {index + 1}
              </text>
              {game.players.map((id, column) => (
                <text
                  key={column}
                  x={layout.numberWidth + layout.nameWidth * column + layout.fontSize * 0.35}
                  y={y}
                  fontSize={layout.fontSize}
                  fontWeight={700}
                  dominantBaseline="central"
                >
                  {names.get(id) ?? ""}
                </text>
              ))}
            </g>
          );
        })}
        <text
          x={layout.width}
          y={layout.height - layout.footerSize * 0.4}
          fontSize={layout.footerSize}
          textAnchor="end"
          className="fill-text-sub"
        >
          kanaeru で作った試合表
        </text>
      </svg>
    </figure>
  );
}

/**
 * 入口に貼る1枚（R2。A4 縦。見るだけのページの大きな QR。FR-M20）。
 * @param props 試合表（table）・見るだけのページの URL（url）
 * @param props.table 試合表
 * @param props.url 見るだけのページの URL
 * @returns 版の要素
 */
function EntranceSheet({ table, url }: { table: MatchTable; url: string }) {
  const { width, height } = printableArea("a4", "portrait");
  const qrSize = width * 0.6;
  const center = width / 2;
  return (
    <figure
      data-paper="a4-portrait"
      aria-label="入口に貼る1枚"
      className="w-full max-w-form border border-border bg-surface shadow-layer1"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={`${table.name}の試合表の QR（入口に貼る1枚）`}
        className="block fill-text"
      >
        <text x={center} y={14} fontSize={6} textAnchor="middle">
          {`${table.name}・${formatPlayDate(table.playDate)}`}
        </text>
        <text x={center} y={48} fontSize={22} fontWeight={700} textAnchor="middle">
          試合表は
        </text>
        <text x={center} y={76} fontSize={22} fontWeight={700} textAnchor="middle">
          こちら
        </text>
        <QrGroup pattern={qrPattern(url)} size={qrSize} x={center - qrSize / 2} y={88} />
        <text x={center} y={88 + qrSize + 14} fontSize={6} textAnchor="middle">
          スマホのカメラで読んでください（ログインは要りません）。
        </text>
        <text
          x={center}
          y={88 + qrSize + 23}
          fontSize={5}
          textAnchor="middle"
          className="fill-text-sub"
        >
          当日に組み直すことがあります。最新はスマホで見てください。
        </text>
        <text x={center} y={height - 3} fontSize={4} textAnchor="middle" className="fill-text-sub">
          kanaeru で作った試合表・自分のサークルでも使えます
        </text>
      </svg>
    </figure>
  );
}

/**
 * 印刷の中身。
 * @param props 試合表（table）
 * @param props.table 試合表
 * @returns 画面の要素
 */
function PrintBody({ table }: { table: MatchTable }) {
  const groups = groupsOf(table.content)
    .map((group) => ({ group, plan: table.content.plan.find((plan) => plan.key === group.key) }))
    .filter((entry): entry is { group: MatchGroup; plan: MatchGroupPlan } =>
      Boolean(entry.plan && entry.plan.games.length > 0),
    );
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(groups.map((entry) => entry.group.key)),
  );
  const [size, setSize] = useState<PaperSize>(DEFAULT_PAPER.size);
  const [orientation, setOrientation] = useState<Orientation>(DEFAULT_PAPER.orientation);
  const [viewLink] = useStoredLink(table.id, "view", table.links.viewHint);
  const viewUrl = viewLink
    ? new URL(matchPaths.view(viewLink.token), window.location.origin).href
    : undefined;
  const [entrance, setEntrance] = useState(false);
  const selected = groups.filter((entry) => chosen.has(entry.group.key));
  const names = new Map(table.content.players.map((player) => [player.id, player.nickname]));
  const columns = PLAYERS_PER_GAME[table.content.settings.format];
  const tooSmall = selected.some((entry) => {
    const longest = Math.max(
      2,
      ...entry.plan.games.flatMap((game) =>
        game.players.map((id) => textWidthEm(names.get(id) ?? "")),
      ),
    );
    return layoutSheet({
      size,
      orientation,
      rows: entry.plan.games.length,
      columns,
      longestNameEm: longest,
    }).tooSmall;
  });
  const paperLabel = `${PAPER_LABELS[size]} ${ORIENTATION_LABELS[orientation]}`;

  if (groups.length === 0) {
    return (
      <Page title="印刷" lead={table.name}>
        <p className="text-m text-text-sub">
          まだ試合表を作っていません。名簿と設定で「試合表を作る」を押してください。
        </p>
      </Page>
    );
  }

  return (
    <Page title="印刷" lead={`${table.name}・組ごとに1枚ずつ刷ります。`}>
      <div className="flex max-w-form flex-col gap-xs">
        <fieldset className="flex flex-col gap-x3s">
          <legend className="mb-x3s text-m font-bold">刷るレベル（1つの組を1枚）</legend>
          {groups.map(({ group }) => (
            <label key={group.key} className="flex min-h-l items-center gap-xxs text-m">
              <input
                type="checkbox"
                checked={chosen.has(group.key)}
                onChange={(change) => {
                  const next = new Set(chosen);
                  if (change.target.checked) next.add(group.key);
                  else next.delete(group.key);
                  setChosen(next);
                }}
                className="size-s accent-primary"
              />
              {group.label}
            </label>
          ))}
        </fieldset>
        <ChoiceChips
          label="紙の大きさ"
          options={PAPER_SIZES.map((value) => ({ value, label: PAPER_LABELS[value] }))}
          value={size}
          onValueChange={setSize}
        />
        <ChoiceChips
          label="向き"
          options={ORIENTATIONS.map((value) => ({ value, label: ORIENTATION_LABELS[value] }))}
          value={orientation}
          onValueChange={setOrientation}
        />
        <p className="text-s text-text-sub">
          選んだ紙1枚に収まるよう、字の大きさを自動で合わせます（試合が少ないときは大きく、多いときは小さく）。印刷の画面でも、同じ紙の大きさと向きを選んでください。
        </p>
        {viewUrl ? (
          <>
            <p className="text-s text-text-sub">
              版の右上に、見るだけのページの QR が入ります（今の試合の印は入りません）。
            </p>
            <label className="flex min-h-l items-center gap-xxs text-m">
              <input
                type="checkbox"
                checked={entrance}
                onChange={(change) => setEntrance(change.target.checked)}
                className="size-s accent-primary"
              />
              入口に貼る1枚（大きな QR・A4 縦）も刷る
            </label>
          </>
        ) : (
          <p className="text-s text-text-sub">
            <Link
              to="/match/tables/$tableId/view-link"
              params={{ tableId: table.id }}
              className="text-text-link underline"
            >
              見るだけのページ
            </Link>
            のリンクをこの端末で作ると、版に QR が入り、入口に貼る1枚も刷れます。
          </p>
        )}
        {tooSmall ? (
          <ResponseMessage tone="info">
            字が小さくなりすぎて読みにくい組があります。大きい紙をすすめます。
          </ResponseMessage>
        ) : null}
        <div>
          <Button
            variant="primary"
            disabled={selected.length === 0 && !(viewUrl && entrance)}
            onClick={() => window.print()}
          >
            {viewUrl && entrance
              ? `${selected.length + 1}枚を印刷する（${paperLabel}・入口の1枚は A4 縦）`
              : `${selected.length}枚を印刷する（${paperLabel}）`}
          </Button>
        </div>
      </div>
      <section
        aria-label="印刷の版の見本"
        data-match-sheets=""
        className="flex flex-col items-start gap-s"
      >
        {selected.map(({ group, plan }) => (
          <Sheet
            key={group.key}
            table={table}
            group={group}
            plan={plan}
            size={size}
            orientation={orientation}
            viewUrl={viewUrl}
          />
        ))}
        {viewUrl && entrance ? <EntranceSheet table={table} url={viewUrl} /> : null}
      </section>
    </Page>
  );
}

/**
 * 印刷の画面（道の部品）。
 * @returns 画面の要素
 */
export function PrintRoute() {
  const { tableId } = useRouteParams({ from: MATCH_ROUTE_PATTERNS.print });
  return <TableFrame tableId={tableId}>{(table) => <PrintBody table={table} />}</TableFrame>;
}
