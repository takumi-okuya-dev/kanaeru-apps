// M3 大きく映す（/match/tables/$tableId/big）。モックアップの M3。PRD FR-M17。match-003。
// - コートの横の端末に、選んだ組の今の試合と次の試合だけを大きな字で出す（組はタブで切り替える。組の数だけ端末を置いてもよい）
// - 担当の端末で出すのを基本にする（試合表の画面でチェックを付けると、同じ端末のこの画面もすぐ進む）。担当でない端末は、
//   つながっている間だけ30秒おきに読み直す（直さないので、読み直しても上書きしない。AD-28）
// - ナビのない外枠（"bare"）。「戻る」で試合表へ。全画面にできるブラウザでは「全画面にする」を出す
// 字の大きさは big.css（tokens.css の段では足りないため）。1人ひとりの試合の数は出さない（FR-M13）。
import type { MatchGroup, MatchGroupPlan, MatchTable } from "@workspace/contracts/match";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/cn";
import { useEffect, useId, useState } from "react";
import { fetchTable } from "./api.ts";
import { GroupTabs, currentGameIndex, currentGameNumber } from "./GroupTabs.tsx";
import { MatchGate } from "./MatchGate.tsx";
import { useOnline } from "./online.ts";
import { MATCH_ROUTE_PATTERNS } from "./paths.ts";
import { groupsOf } from "./plan.ts";
import { MATCH_QUERY_KEYS } from "./queries.ts";
import { useTableEditor } from "./table-editor.ts";
import "./big.css";

/** 担当でない端末が読み直す間（ミリ秒。見るだけのページと同じ30秒。AD-26）。 */
const REFRESH_MS = 30_000;

/**
 * 1試合（今か次）を大きく出す。
 * @param props 試合表（table）・組の試合（plan）・試合の番号（index）・今か次か（kind）
 * @param props.table 試合表
 * @param props.plan 組の試合
 * @param props.index 試合の番号（0から）
 * @param props.kind 今の試合か、次の試合か
 * @returns 要素
 */
function BigGame({
  table,
  plan,
  index,
  kind,
}: {
  table: MatchTable;
  plan: MatchGroupPlan;
  index: number;
  kind: "now" | "next";
}) {
  const game = plan.games[index];
  if (!game) return null;
  const names = new Map(table.content.players.map((player) => [player.id, player.nickname]));
  const label = `${kind === "now" ? "今" : "次"}・第${index + 1}試合`;
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
      <p className="match-big-label font-bold">{label}</p>
      <div
        className={cn(
          "grid gap-x-s gap-y-xxs",
          game.players.length === 4 ? "grid-cols-2 wide:grid-cols-4" : "grid-cols-2",
        )}
      >
        {game.players.map((id, column) => (
          <span key={column} className="match-big-name font-bold">
            {names.get(id) ?? ""}
          </span>
        ))}
      </div>
    </li>
  );
}

/**
 * 1つの組の今と次。
 * @param props 試合表（table）・組（group）
 * @param props.table 試合表
 * @param props.group 組
 * @returns 要素
 */
function BigGroup({ table, group }: { table: MatchTable; group: MatchGroup }) {
  const plan = table.content.plan.find((entry) => entry.key === group.key);
  if (!plan || plan.games.length === 0) {
    return <p className="match-big-label text-text-sub">{`${group.label}の試合はありません。`}</p>;
  }
  const now = currentGameIndex(plan);
  if (now >= plan.games.length) {
    return (
      <p className="match-big-label text-text-sub">{`${group.label}の試合は、すべて終わりました。`}</p>
    );
  }
  return (
    <ol className="flex flex-col gap-xs">
      <BigGame table={table} plan={plan} index={now} kind="now" />
      <BigGame table={table} plan={plan} index={now + 1} kind="next" />
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
  if (!supported) return null;
  return (
    <Button
      size="small"
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => undefined);
      }}
    >
      全画面にする
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
  const groups = groupsOf(table.content);
  const planOf = (key: string) => table.content.plan.find((plan) => plan.key === key);
  const firstWithGames = groups.find((group) => (planOf(group.key)?.games.length ?? 0) > 0);
  const [selected, setSelected] = useState(firstWithGames?.key ?? groups[0]?.key ?? "");
  const group = groups.find((entry) => entry.key === selected) ?? groups[0];
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
        aria-labelledby={groups.length > 1 && group ? `${baseId}-tab-${group.key}` : undefined}
      >
        {group ? <BigGroup table={table} group={group} /> : null}
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
    queryFn: () => fetchTable(tableId),
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
