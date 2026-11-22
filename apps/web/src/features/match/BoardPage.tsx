// M2・M6 試合表（/match/tables/$tableId/board）。モックアップの M2（ダブルス）と M6（シングルス）。
// - 組（レベルの分け方で分けた組）をタブで選び、1つずつ出す（PC もスマホも。FR-M11）。分けないときはタブを出さない
// - 1行が1試合。名前だけを並べ（ダブルスは4人・シングルスは2人）、列の見出しは付けず、左に試合の番号、名前の列の間に縦線
// - 担当の端末は、終わった試合の行にチェックを付けて進める。チェックのない最初の試合が今（墨の地）、その次が次（薄い地。FR-M12・FR-M15）
// - 「別の組み合わせにする」はくじの種を変えて、まだの試合を組み直す（終わった試合は残す）
// 1人ひとりの試合の数は出さない（FR-M13）。
import { MATCH_FORMAT_LABELS, PLAYERS_PER_GAME } from "@workspace/contracts/match";
import type { MatchGroup, MatchGroupPlan, MatchTable } from "@workspace/contracts/match";
import { Link, useParams } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { cn } from "@workspace/ui/lib/cn";
import { useId, useState } from "react";
import type * as React from "react";
import { Page } from "../../lib/page.tsx";
import { formatPlayDate } from "./format.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";
import { buildPlan, groupsOf, newSeed, presentPlayersOf } from "./plan.ts";
import { countRoster } from "./roster-edit.ts";
import { EditorState, TableFrame } from "./TableFrame.tsx";
import type { TableEditor } from "./table-editor.ts";

/**
 * 今の試合の番号（チェックのない最初の試合。0から。みな終わっていれば試合の数）。
 * @param plan 組の試合
 * @returns 今の試合の番号
 */
function currentGameIndex(plan: MatchGroupPlan | undefined): number {
  if (!plan) return 0;
  const index = plan.games.findIndex((game) => !game.done);
  return index < 0 ? plan.games.length : index;
}

/** GameTable が受け取るもの。 */
type GameTableProps = {
  /** 試合表 */
  table: MatchTable;
  /** 組 */
  group: MatchGroup;
  /** 組の試合 */
  plan: MatchGroupPlan;
  /** チェックを付けられるか（担当の端末） */
  editable: boolean;
  /** チェックを付け外したとき */
  onToggle: (index: number, done: boolean) => void;
};

/**
 * 1つの組の試合表（名前だけ・見出しなし・左に試合の番号・名前の列の間に縦線）。
 * @param props 試合表（table）・組（group）・組の試合（plan）・チェックを付けられるか（editable）・付け外し（onToggle）
 * @returns 表の要素
 */
function GameTable({ table, group, plan, editable, onToggle }: GameTableProps) {
  const names = new Map(table.content.players.map((player) => [player.id, player.nickname]));
  const now = currentGameIndex(plan);
  return (
    <table
      aria-label={`${group.label}の試合表`}
      className="w-full table-fixed border-collapse border border-border bg-surface"
    >
      <tbody>
        {plan.games.map((game, index) => {
          const isNow = index === now;
          const isNext = index === now + 1;
          return (
            <tr
              key={index}
              aria-current={isNow ? "true" : undefined}
              className={cn(
                "border-t border-border first:border-t-0",
                isNow && "bg-primary text-on-primary",
                isNext && "bg-primary-subtle",
                game.done && "text-text-sub",
              )}
            >
              {editable ? (
                <td className="w-l px-x3s text-center">
                  <input
                    type="checkbox"
                    aria-label={`第${index + 1}試合を終えた`}
                    checked={game.done}
                    onChange={(change) => onToggle(index, change.target.checked)}
                    className="size-s align-middle accent-primary"
                  />
                </td>
              ) : null}
              <td
                className={cn(
                  "w-m px-x3s py-xxs text-right text-xs tabular-nums",
                  isNow ? "text-on-primary" : "text-text-sub",
                )}
              >
                {index + 1}
              </td>
              {game.players.map((id, column) => (
                <td
                  key={column}
                  className={cn(
                    "truncate border-l border-border px-xxs py-xxs text-m",
                    game.done ? "font-normal" : "font-bold",
                  )}
                >
                  {names.get(id) ?? ""}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * 組のタブ（role="tablist"。左右の矢印で移る）。
 * @param props 組（groups）・選んだ組（selected）・選んだとき（onSelect）・今の試合（nowOf）・タブと中身の ID の頭（baseId）
 * @param props.groups 組
 * @param props.selected 選んだ組の key
 * @param props.onSelect 選んだとき
 * @param props.nowOf 組ごとの今の試合の番号（1から。終わっていれば null）
 * @param props.baseId タブと中身の ID の頭
 * @returns タブの要素
 */
function GroupTabs({
  groups,
  selected,
  onSelect,
  nowOf,
  baseId,
}: {
  groups: readonly MatchGroup[];
  selected: string;
  onSelect: (key: string) => void;
  nowOf: (key: string) => number | null;
  baseId: string;
}) {
  /**
   * 矢印で隣のタブへ移る。
   * @param keyEvent 押したキー
   * @param index 今のタブの番号
   */
  const move = (keyEvent: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = keyEvent.key === "ArrowRight" ? 1 : keyEvent.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    keyEvent.preventDefault();
    const next = groups[(index + delta + groups.length) % groups.length];
    if (!next) return;
    onSelect(next.key);
    document.getElementById(`${baseId}-tab-${next.key}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="レベル"
      className="flex flex-wrap gap-x3s border-b border-border"
    >
      {groups.map((group, index) => {
        const active = group.key === selected;
        const now = nowOf(group.key);
        return (
          <button
            key={group.key}
            id={`${baseId}-tab-${group.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${baseId}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(group.key)}
            onKeyDown={(keyEvent) => move(keyEvent, index)}
            className={cn(
              "-mb-px flex min-h-xl items-center gap-x3s border-b-2 px-xs text-m",
              active ? "border-primary font-bold" : "border-transparent text-text-sub",
            )}
          >
            {group.label}
            {now ? <span className="text-xs">第{now}試合</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 試合表の中身。
 * @param props 試合表（table）・直す道具（editor）
 * @param props.table 試合表
 * @param props.editor 試合表を直す道具
 * @returns 画面の要素
 */
function BoardBody({ table, editor }: { table: MatchTable; editor: TableEditor }) {
  const baseId = useId();
  const groups = groupsOf(table.content);
  const planOf = (key: string) => table.content.plan.find((plan) => plan.key === key);
  const firstWithGames = groups.find((group) => (planOf(group.key)?.games.length ?? 0) > 0);
  const [selected, setSelected] = useState(firstWithGames?.key ?? groups[0]?.key ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const group = groups.find((entry) => entry.key === selected) ?? groups[0];
  const plan = group ? planOf(group.key) : undefined;
  const counts = countRoster(table.content.players);
  const { settings } = table.content;
  const planned = table.content.plan.some((entry) => entry.games.length > 0);
  const lead = `${formatPlayDate(table.playDate)}・${MATCH_FORMAT_LABELS[settings.format]}・1試合${settings.minutesPerGame}分・${counts.present}人${counts.absent > 0 ? `（来ない ${counts.absent}人）` : ""}`;

  /**
   * 試合のチェックを付け外す。
   * @param key 組の key
   * @param index 試合の番号（0から）
   * @param done 終わったか
   */
  const toggle = (key: string, index: number, done: boolean) => {
    editor.apply((draft) => ({
      ...draft,
      content: {
        ...draft.content,
        plan: draft.content.plan.map((entry) =>
          entry.key !== key
            ? entry
            : {
                ...entry,
                games: entry.games.map((game, gameIndex) =>
                  gameIndex === index ? { ...game, done } : game,
                ),
              },
        ),
      },
    }));
  };

  return (
    <Page
      title={table.name}
      lead={lead}
      actions={
        planned ? (
          <>
            <Link
              to="/match/tables/$tableId/print"
              params={{ tableId: table.id }}
              className={buttonVariants({ size: "small" })}
            >
              印刷
            </Link>
            <Button size="small" disabled={!editor.isEditor} onClick={() => setConfirmOpen(true)}>
              別の組み合わせにする
            </Button>
          </>
        ) : null
      }
    >
      <EditorState editor={editor} />
      {!planned || !group ? (
        <p className="text-m text-text-sub">
          まだ試合表を作っていません。
          <Link
            to="/match/tables/$tableId"
            params={{ tableId: table.id }}
            className="text-text-link underline"
          >
            名簿と設定
          </Link>
          で「試合表を作る」を押してください。
        </p>
      ) : (
        <div className="flex flex-col gap-xs">
          {groups.length > 1 ? (
            <GroupTabs
              groups={groups}
              selected={group.key}
              onSelect={setSelected}
              baseId={baseId}
              nowOf={(key) => {
                const entry = planOf(key);
                if (!entry || entry.games.length === 0) return null;
                const now = currentGameIndex(entry);
                return now < entry.games.length ? now + 1 : null;
              }}
            />
          ) : null}
          <div
            id={`${baseId}-panel`}
            role={groups.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={groups.length > 1 ? `${baseId}-tab-${group.key}` : undefined}
            className="flex flex-col gap-xxs"
          >
            {plan && plan.games.length > 0 ? (
              <GameTable
                table={table}
                group={group}
                plan={plan}
                editable={editor.isEditor}
                onToggle={(index, done) => toggle(group.key, index, done)}
              />
            ) : (
              <p className="text-m text-text-sub">
                {`${group.label}は${presentPlayersOf(table.content, group).length}人で、${PLAYERS_PER_GAME[settings.format]}人に足りないため組めませんでした。名簿と設定で、一緒にする分け方にしてください。`}
              </p>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="別の組み合わせにしますか？"
        confirmLabel="別の組み合わせにする"
        onConfirm={() => {
          setConfirmOpen(false);
          editor.apply((draft) => {
            const seed = newSeed();
            return { seed, content: { ...draft.content, plan: buildPlan(draft.content, seed) } };
          });
        }}
      >
        <p className="text-m">
          くじを引き直して、まだの試合を組み直します。チェックの付いた試合（と、それより前の試合）はそのまま残します。
        </p>
      </ConfirmDialog>
    </Page>
  );
}

/**
 * 試合表の画面（道の部品）。
 * @returns 画面の要素
 */
export function BoardRoute() {
  const { tableId } = useParams({ from: MATCH_ROUTE_PATTERNS.board });
  return (
    <TableFrame tableId={tableId}>
      {(table, editor) => <BoardBody table={table} editor={editor} />}
    </TableFrame>
  );
}
