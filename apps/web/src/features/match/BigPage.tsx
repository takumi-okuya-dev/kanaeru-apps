// M3 大きく映す（/match/tables/$tableId/big）。モックアップの M3。PRD FR-M17。match-003。
// - コートの横の端末に、選んだ組の今の試合と次の試合だけを大きな字で出す（組はタブで切り替える。組の数だけ端末を置いてもよい）
// - 担当の端末で出すのを基本にする（試合表の画面でチェックを付けると、同じ端末のこの画面もすぐ進む）。担当でない端末は、
//   つながっている間だけ30秒おきに読み直す（直さないので、読み直しても上書きしない。AD-28）
// - ナビのない外枠（"bare"）。「戻る」で試合表へ。全画面にできるブラウザでは「全画面にする」を出す
// - 分け方が2つ以上なら分け方のタブ。ミニゲームはコートごとのチームの呼び名を大きな字で出す（レベルは出さない。match-009）
// 名前は SVG で描き、画面の幅に合わせて大きくする（tokens.css の文字の段〈いちばん大きくて 32px〉では足りないため。
// 印刷の版と同じく、字の大きさは SVG の単位で決める。research R5）。1人ひとりの試合の数は出さない（FR-M13）。
import type { MatchGroup, MatchGroupPlan, MatchSet, MatchTable } from "@workspace/contracts/match";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/cn";
import { useEffect, useId, useState } from "react";
import { GroupTabs, currentGameIndex, currentGameNumber } from "./GroupTabs.tsx";
import { MatchGate } from "./MatchGate.tsx";
import { MiniTeams } from "./MiniTeams.tsx";
import { useOnline } from "./online.ts";
import { loadTable } from "./offline/table-sync.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";
import { textWidthEm } from "./print-layout.ts";
import { groupsOfSet, setsOf } from "./plan.ts";
import { SetTabs } from "./SetTabs.tsx";
import { MATCH_QUERY_KEYS } from "./queries.ts";
import { useTableEditor } from "./table-editor.ts";

/** 担当でない端末が読み直す間（ミリ秒。見るだけのページと同じ30秒。AD-26）。 */
const REFRESH_MS = 30_000;

/** 名前の行の SVG の幅（単位。画面の幅いっぱいに広げる）。 */
const ROW_WIDTH = 400;

/** 名前の字の大きさの上限（SVG の単位。広い画面で約 70px）。 */
const NAME_SIZE_MAX = 28;

/**
 * 名前の字の大きさ（いちばん長い呼び名も列に収まる大きさ。SVG の単位）。
 * @param names 出す呼び名
 * @param columns 1行の列の数
 * @returns 字の大きさ
 */
function nameSize(names: readonly string[], columns: number): number {
  const cell = ROW_WIDTH / Math.max(1, columns);
  return Math.min(
    NAME_SIZE_MAX,
    ...names.map((name) => (cell * 0.9) / Math.max(1, textWidthEm(name))),
  );
}

/**
 * 1試合（今か次）を大きく出す。
 * @param props 呼び名（names）・試合の番号（index）・今か次か（kind）・字の大きさ（fontSize）
 * @param props.names 入る人の呼び名（列の順）
 * @param props.index 試合の番号（0から）
 * @param props.kind 今の試合か、次の試合か
 * @param props.fontSize 名前の字の大きさ（SVG の単位）
 * @returns 要素
 */
function BigGame({
  names,
  index,
  kind,
  fontSize,
}: {
  names: readonly string[];
  index: number;
  kind: "now" | "next";
  fontSize: number;
}) {
  const label = `${kind === "now" ? "今" : "次"}・第${index + 1}試合`;
  const cell = ROW_WIDTH / Math.max(1, names.length);
  const height = fontSize * 1.5;
  return (
    <li
      aria-label={label}
      className={cn(
        "flex flex-col gap-xxs rounded-md border p-xs wide:p-s",
        kind === "now"
          ? "border-primary bg-primary text-on-primary"
          : "border-border bg-primary-subtle text-text",
      )}
    >
      <p className="text-xl font-bold">{label}</p>
      <svg
        viewBox={`0 0 ${ROW_WIDTH} ${height}`}
        width="100%"
        aria-hidden="true"
        className={cn("block", kind === "now" ? "fill-on-primary" : "fill-text")}
      >
        {names.map((name, column) => (
          <text
            key={column}
            x={cell * column + cell * 0.05}
            y={height / 2}
            fontSize={fontSize}
            fontWeight={700}
            dominantBaseline="central"
          >
            {name}
          </text>
        ))}
      </svg>
      <p className="sr-only">{names.join("・")}</p>
    </li>
  );
}

/**
 * 1つの組の今と次（次は、今より後のチェックのない最初の試合）。
 * @param props 試合表（table）・組（group）
 * @param props.table 試合表
 * @param props.group 組
 * @returns 要素
 */
function BigGroup({ table, group }: { table: MatchTable; group: MatchGroup }) {
  const plan: MatchGroupPlan | undefined = table.content.plan.find(
    (entry) => entry.key === group.key,
  );
  if (!plan || plan.games.length === 0) {
    return <p className="text-xl text-text-sub">{`${group.label}の試合はありません。`}</p>;
  }
  const now = currentGameIndex(plan);
  if (now >= plan.games.length) {
    return (
      <p className="text-xl text-text-sub">{`${group.label}の試合は、すべて終わりました。`}</p>
    );
  }
  const next = plan.games.findIndex((game, index) => index > now && !game.done);
  const nickname = new Map(table.content.players.map((player) => [player.id, player.nickname]));
  const namesOf = (index: number) =>
    (plan.games[index]?.players ?? []).map((id) => nickname.get(id) ?? "");
  const shown = [namesOf(now), ...(next >= 0 ? [namesOf(next)] : [])];
  const fontSize = nameSize(shown.flat(), shown[0]?.length ?? 1);
  return (
    <ol className="flex flex-col gap-xs">
      <BigGame names={namesOf(now)} index={now} kind="now" fontSize={fontSize} />
      {next >= 0 ? (
        <BigGame names={namesOf(next)} index={next} kind="next" fontSize={fontSize} />
      ) : null}
    </ol>
  );
}

/**
 * 全画面にするボタン（できないブラウザでは出さない）。
 * @returns ボタンの要素
 */
function FullscreenButton() {
  const [supported] = useState(
    () => typeof document !== "undefined" && document.fullscreenEnabled === true,
  );
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  if (!supported) return null;
  return (
    <Button
      size="small"
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => undefined);
      }}
    >
      {active ? "全画面をやめる" : "全画面にする"}
    </Button>
  );
}

/**
 * 大きく映す中身。
 * @param props 試合表（table）・担当の端末か（isEditor）・最後に読んだ時刻（loadedAt）
 * @param props.table 試合表
 * @param props.isEditor この端末が担当の端末か
 * @param props.loadedAt 最後に読んだ時刻（ミリ秒）
 * @returns 画面の要素
 */
function BigBody({
  table,
  isEditor,
  loadedAt,
}: {
  table: MatchTable;
  isEditor: boolean;
  loadedAt: number;
}) {
  const baseId = useId();
  const sets = setsOf(table.content.settings);
  const planOf = (key: string) => table.content.plan.find((plan) => plan.key === key);
  const hasContent = (candidate: MatchSet) =>
    candidate === "mini"
      ? table.content.mini !== undefined
      : groupsOfSet(table.content, candidate).some(
          (group) => (planOf(group.key)?.games.length ?? 0) > 0,
        );
  const [chosenSet, setChosenSet] = useState<MatchSet | undefined>(
    () => sets.find(hasContent) ?? sets[0],
  );
  const set = chosenSet && sets.includes(chosenSet) ? chosenSet : (sets[0] ?? "levels");
  const groups = groupsOfSet(table.content, set);
  const firstWithGames = groups.find((group) => (planOf(group.key)?.games.length ?? 0) > 0);
  const [selected, setSelected] = useState(firstWithGames?.key ?? groups[0]?.key ?? "");
  const group = groups.find((entry) => entry.key === selected) ?? groups[0];
  const names = new Map(table.content.players.map((player) => [player.id, player.nickname]));

  /**
   * 分け方を選ぶ（その分け方の最初の組を選ぶ）。
   * @param next 分け方
   */
  const chooseSet = (next: MatchSet) => {
    setChosenSet(next);
    const first = groupsOfSet(table.content, next)[0];
    if (first) setSelected(first.key);
  };
  useEffect(() => {
    document.title = `${table.name}（大きく映す）`;
  }, [table.name]);
  const loaded = new Date(loadedAt).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center justify-between gap-xs">
        <h1 tabIndex={-1} className="text-xl leading-tight font-bold outline-none">
          {table.name}
        </h1>
        <div className="flex flex-wrap gap-xxs">
          <FullscreenButton />
          <Link
            to="/match/tables/$tableId/board"
            params={{ tableId: table.id }}
            className={buttonVariants({ size: "small" })}
          >
            戻る
          </Link>
        </div>
      </div>
      {!isEditor ? (
        <p className="text-s text-text-sub">{`${loaded} に読んだ表です。つながっている間は30秒おきに読み直します。`}</p>
      ) : null}
      {sets.length > 1 ? (
        <SetTabs sets={sets} selected={set} onSelect={chooseSet} baseId={baseId} size="large" />
      ) : null}
      <div
        id={`${baseId}-set-panel`}
        role={sets.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={sets.length > 1 ? `${baseId}-set-${set}` : undefined}
        className="flex flex-col gap-xs"
      >
        {set === "mini" ? (
          table.content.mini ? (
            <MiniTeams
              size="large"
              teams={table.content.mini.teams.map((team) =>
                team.map((id) => ({ name: names.get(id) ?? "" })),
              )}
            />
          ) : (
            <p className="text-l text-text-sub">ミニゲームのチームはまだありません。</p>
          )
        ) : (
          <>
            {groups.length > 1 ? (
              <GroupTabs
                groups={groups}
                selected={group?.key ?? ""}
                onSelect={setSelected}
                baseId={baseId}
                size="large"
                nowOf={(key) => currentGameNumber(planOf(key))}
              />
            ) : null}
            <div
              id={`${baseId}-panel`}
              role={groups.length > 1 ? "tabpanel" : undefined}
              aria-labelledby={
                groups.length > 1 && group ? `${baseId}-tab-${group.key}` : undefined
              }
            >
              {group ? <BigGroup table={table} group={group} /> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 大きく映す画面（道の部品）。
 * @returns 画面の要素
 */
export function BigRoute() {
  const { tableId } = useParams({ from: MATCH_ROUTE_PATTERNS.big });
  const editor = useTableEditor(tableId);
  const online = useOnline();
  // 担当でない端末だけ、つながっている間は読み直す（担当の端末は、自分で直した中身がいつも最新）
  const refresh = useQuery({
    queryKey: MATCH_QUERY_KEYS.table(tableId),
    queryFn: () => loadTable(tableId),
    networkMode: "always",
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchInterval: !editor.isEditor && online ? REFRESH_MS : false,
    retry: false,
  });
  return (
    <MatchGate query={editor.query}>
      {(table) => (
        <BigBody table={table} isEditor={editor.isEditor} loadedAt={refresh.dataUpdatedAt} />
      )}
    </MatchGate>
  );
}
