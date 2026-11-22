// M2・M6 試合表（/match/tables/$tableId/board）。モックアップの M2（ダブルス）と M6（シングルス）。
// - 組（レベルの分け方で分けた組）をタブで選び、1つずつ出す（PC もスマホも。FR-M11）。分けないときはタブを出さない
// - 1行が1試合。名前だけを並べ（ダブルスは4人・シングルスは2人）、列の見出しは付けず、左に試合の番号、名前の列の間に縦線
// - 担当の端末は、終わった試合の行にチェックを付けて進める。チェックのない最初の試合が今（墨の地）、その次が次（薄い地。FR-M12・FR-M15）
// - 「別の組み合わせにする」はくじの種を変えて、まだの試合を組み直す（終わった試合は残す）
// - 当日（match-003）：「人を選んで直す」（来なかった・来た・帰る → その人の組のこれからの試合だけを組み直す。FR-M14）・
//   「レベルの分け方」（当日に分け方や試合の形を変えても、終わった試合はできるだけ残す。何が変わるかを先に出す）・
//   「大きく映す」（M3）。組み直したら、画面の上に何を変えたかを出す。前の分け方で終わった試合は、下に畳んで出す
// 1人ひとりの試合の数は出さない（FR-M13）。
import { MATCH_FORMAT_LABELS, PLAYERS_PER_GAME } from "@workspace/contracts/match";
import type {
  MatchGroup,
  MatchGroupPlan,
  MatchSettings,
  MatchTable,
} from "@workspace/contracts/match";
import { Link, useParams } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog";
import { cn } from "@workspace/ui/lib/cn";
import { useId, useState } from "react";
import { Page } from "../../lib/page.tsx";
import { describeAttendance, markAttendance } from "./day-of.ts";
import type { AttendanceAction } from "./day-of.ts";
import { AttendanceDialog, RegroupDialog } from "./DayOfDialogs.tsx";
import { formatPlayDate } from "./format.ts";
import { GroupTabs, currentGameIndex, currentGameNumber } from "./GroupTabs.tsx";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";
import { buildPlan, groupsOf, newSeed, presentPlayersOf } from "./plan.ts";
import { changeSettings, groupLabelOf } from "./regroup.ts";
import { countRoster } from "./roster-edit.ts";
import { EditorState, TableFrame } from "./TableFrame.tsx";
import type { TableEditor } from "./table-editor.ts";

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
 * 前の分け方・試合の形で終わった試合（畳んで出す。記録だけで、チェックは付け外さない）。
 * @param props 試合表（table）
 * @param props.table 試合表
 * @returns 要素
 */
function ArchivedGames({ table }: { table: MatchTable }) {
  const names = new Map(table.content.players.map((player) => [player.id, player.nickname]));
  const archive = table.content.archive ?? [];
  const total = archive.reduce((sum, entry) => sum + entry.games.length, 0);
  return (
    <details className="rounded-md border border-border bg-surface p-xs">
      <summary className="cursor-pointer text-m font-bold">{`前の分け方・試合の形で終わった試合（${total}試合）`}</summary>
      <div className="mt-xxs flex flex-col gap-xs">
        {archive.map((entry) => (
          <section key={entry.key} className="flex flex-col gap-x3s">
            <h3 className="text-s font-bold">{groupLabelOf(entry.key)}</h3>
            <ol className="flex flex-col gap-x3s text-s text-text-sub">
              {entry.games.map((game, index) => (
                <li key={index}>{game.players.map((id) => names.get(id) ?? "").join("・")}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </details>
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
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [regroupOpen, setRegroupOpen] = useState(false);
  const [changeNote, setChangeNote] = useState<{ tone: "info" | "danger"; text: string }>();
  const group = groups.find((entry) => entry.key === selected) ?? groups[0];
  const plan = group ? planOf(group.key) : undefined;
  const counts = countRoster(table.content.players);
  const { settings } = table.content;
  const planned = table.content.plan.some((entry) => entry.games.length > 0);
  const lead = `${formatPlayDate(table.playDate)}・${MATCH_FORMAT_LABELS[settings.format]}・1試合${settings.minutesPerGame}分・${counts.present}人${counts.absent > 0 ? `（来ない ${counts.absent}人）` : ""}${counts.left > 0 ? `（帰った ${counts.left}人）` : ""}`;
  const archive = table.content.archive ?? [];

  /**
   * 人に「来なかった・来た・帰る」を付け、その人の組のこれからの試合だけを組み直す。
   * @param playerId 名簿の人の ID
   * @param action 直し方
   */
  const mark = (playerId: string, action: AttendanceAction) => {
    let text = "";
    const applied = editor.apply((draft) => {
      const result = markAttendance(draft.content, draft.seed, playerId, action);
      if (!result) return draft;
      text = describeAttendance(result.report);
      return { ...draft, content: result.content };
    });
    setAttendanceOpen(false);
    if (!applied) {
      setChangeNote({
        tone: "danger",
        text: "試合表を読み直しています。読み直したあとで、もう一度直してください。",
      });
    } else if (text) setChangeNote({ tone: "info", text });
  };

  /**
   * 分け方と試合の形を変え、終わった試合をできるだけ残して組み直す。
   * @param next 新しい設定
   */
  const regroup = (next: MatchSettings) => {
    const applied = editor.apply((draft) => {
      const changed = changeSettings(draft.content, next).content;
      return { ...draft, content: { ...changed, plan: buildPlan(changed, draft.seed) } };
    });
    setRegroupOpen(false);
    setChangeNote(
      applied
        ? { tone: "info", text: "分け方と試合の形を変えて、まだの試合を組み直しました。" }
        : {
            tone: "danger",
            text: "試合表を読み直しています。読み直したあとで、もう一度変えてください。",
          },
    );
    const firstGroup = groupsOf({ settings: next })[0];
    if (firstGroup) setSelected(firstGroup.key);
  };

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
            {editor.isEditor ? (
              <>
                <Button size="small" onClick={() => setAttendanceOpen(true)}>
                  人を選んで直す
                </Button>
                <Button size="small" onClick={() => setRegroupOpen(true)}>
                  レベルの分け方
                </Button>
              </>
            ) : null}
            <Link
              to="/match/tables/$tableId/big"
              params={{ tableId: table.id }}
              className={buttonVariants({ size: "small" })}
            >
              大きく映す
            </Link>
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
      {changeNote ? (
        <div
          role="status"
          className={cn(
            "rounded-md border bg-surface px-xs py-xxs text-m",
            changeNote.tone === "danger" ? "border-danger text-danger-text" : "border-warning",
          )}
        >
          {changeNote.text}
        </div>
      ) : null}
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
              nowOf={(key) => currentGameNumber(planOf(key))}
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
          {archive.length > 0 ? <ArchivedGames table={table} /> : null}
        </div>
      )}
      {/* 開いている間だけ描く（開き直すたびに、選んだ人・分け方を今の値から始める） */}
      {attendanceOpen ? (
        <AttendanceDialog open onOpenChange={setAttendanceOpen} table={table} onApply={mark} />
      ) : null}
      {regroupOpen ? (
        <RegroupDialog open onOpenChange={setRegroupOpen} table={table} onApply={regroup} />
      ) : null}
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
