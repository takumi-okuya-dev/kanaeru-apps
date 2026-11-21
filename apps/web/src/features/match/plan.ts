// 試合表の中身から組ごとの試合を組む（組み方は pairing.ts の planGames。AD-29）。状態を持たない関数だけ。
// - 組はレベルの分け方（MATCH_GROUPS）で決め、組ごとに別のくじ（種と組の key から deriveSeed）で組む
// - 試合の数は、試合の時間を1試合の長さで割った数（組ごとに同じ。FR-M7）
// - 出られるのは当日の印が「来る」の人だけ（「遅れて来る」「来ない」は入れない。来たら当日の組み直しで足す【仮決め】research R6）
// - 組み直し：同じ組の、最後に終わった（チェックの付いた）試合までをそのまま残し、その先だけを組む（addendum.md 2章）
// - 当日の「来なかった・来た・帰る」は、その人の組だけを組み直す（replanGroup。今の試合も入る人がみな出られれば残す。match-003）
// - 当日に分け方や試合の形を変えたときの終わった試合の移し方は regroup.ts（組の行の数の差 offset と、前の分け方の試合 archive）
import {
  GAMES_MAX,
  MATCH_GROUPS,
  MATCH_LEVELS,
  PLAYERS_PER_GAME,
  UNGROUPED_MAX_LEVEL_SPREAD,
} from "@workspace/contracts/match";
import type {
  MatchGroup,
  MatchGroupPlan,
  MatchSettings,
  MatchTableContent,
} from "@workspace/contracts/match";
import { deriveSeed, planGames } from "./pairing.ts";

/**
 * 時刻（HH:MM）を分にする。
 * @param clock 時刻
 * @returns 0時からの分
 */
function minutesOf(clock: string): number {
  const [hours = 0, minutes = 0] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * 組ごとの試合の数（試合の時間 ÷ 1試合の長さ。上限は GAMES_MAX）。
 * @param settings 設定
 * @returns 試合の数
 */
export function gameCountFor(settings: MatchSettings): number {
  const span = minutesOf(settings.endTime) - minutesOf(settings.startTime);
  if (span <= 0 || settings.minutesPerGame <= 0) return 0;
  return Math.min(GAMES_MAX, Math.floor(span / settings.minutesPerGame));
}

/**
 * 今のレベルの分け方の組。
 * @param content 試合表の中身
 * @returns 組（上のレベルから）
 */
export function groupsOf(content: Pick<MatchTableContent, "settings">): readonly MatchGroup[] {
  return MATCH_GROUPS[content.settings.grouping];
}

/**
 * 組の、出られる人（当日の印が「来る」の人）。
 * @param content 試合表の中身
 * @param group 組
 * @returns 名簿の人（名簿の順）
 */
export function presentPlayersOf(content: Pick<MatchTableContent, "players">, group: MatchGroup) {
  return content.players.filter(
    (player) =>
      player.status === "present" && player.level !== null && group.levels.includes(player.level),
  );
}

/** 組ごとの人数と試合の数（設定の画面の「レベル別の試合」）。 */
export type GroupSummary = {
  /** 組 */
  group: MatchGroup;
  /** 出られる人の数 */
  players: number;
  /** 組む試合の数（人が足りなければ 0） */
  games: number;
  /** 1試合の人数に足りない（一緒にする分け方をすすめる） */
  short: boolean;
};

/**
 * 組ごとの人数と試合の数を数える。
 * @param content 試合表の中身
 * @returns 組ごとの数
 */
export function summarizeGroups(content: MatchTableContent): GroupSummary[] {
  const size = PLAYERS_PER_GAME[content.settings.format];
  return groupsOf(content).map((group) => {
    const players = presentPlayersOf(content, group).length;
    const short = players < size;
    const plan = content.plan.find((entry) => entry.key === group.key);
    return { group, players, games: short ? 0 : targetGameCount(content.settings, plan), short };
  });
}

/**
 * 組の試合のうち、そのまま残す試合（最後に終わった試合まで。間のまだの試合も残す）。
 * @param plan 組の今の試合（なければ undefined）
 * @returns 残す試合
 */
export function keptGames(plan: MatchGroupPlan | undefined): MatchGroupPlan["games"] {
  if (!plan) return [];
  let last = -1;
  plan.games.forEach((game, index) => {
    if (game.done) last = index;
  });
  return plan.games.slice(0, last + 1);
}

/**
 * 組の試合の行の数（設定から決まる試合の数 + 当日に分け方・試合の形を変えたときの差。0 より下げない）。
 * @param settings 設定
 * @param plan 組の今の試合（なければ undefined）
 * @returns 行の数
 */
export function targetGameCount(settings: MatchSettings, plan: MatchGroupPlan | undefined): number {
  return Math.max(0, gameCountFor(settings) + (plan?.offset ?? 0));
}

/**
 * 前の分け方・試合の形で終わった試合のうち、組の人（今のレベルが組のレベル）が入ったもの（試合の数を均すために数える）。
 * @param content 試合表の中身
 * @param group 組
 * @returns 試合（入った人の ID の並び。古い順）
 */
export function archivedHistoryOf(
  content: Pick<MatchTableContent, "players" | "archive">,
  group: MatchGroup,
): string[][] {
  const members = new Set(
    content.players
      .filter((player) => player.level !== null && group.levels.includes(player.level))
      .map((player) => player.id),
  );
  return (content.archive ?? []).flatMap((entry) =>
    entry.games
      .filter((game) => game.players.some((id) => members.has(id)))
      .map((game) => [...game.players]),
  );
}

/**
 * 1つの組を、残す試合の続きから組む（組み方は planGames。残す試合はそのまま前に置く）。
 * @param content 試合表の中身
 * @param seed くじの種
 * @param group 組
 * @param kept そのまま残す試合（古い順）
 * @returns 組の試合
 */
function planGroup(
  content: MatchTableContent,
  seed: number,
  group: MatchGroup,
  kept: MatchGroupPlan["games"],
): MatchGroupPlan {
  const size = PLAYERS_PER_GAME[content.settings.format];
  const before = content.plan.find((plan) => plan.key === group.key);
  const players = presentPlayersOf(content, group).map((player) => ({
    id: player.id,
    level: player.level ? MATCH_LEVELS.indexOf(player.level) : 0,
  }));
  const fresh = planGames({
    players,
    playersPerGame: size,
    gameCount: Math.max(0, targetGameCount(content.settings, before) - kept.length),
    seed: deriveSeed(seed, `${group.key}:${kept.length}`),
    history: [...archivedHistoryOf(content, group), ...kept.map((game) => game.players)],
    ...(content.settings.grouping === "none" ? { maxLevelSpread: UNGROUPED_MAX_LEVEL_SPREAD } : {}),
  });
  return {
    key: group.key,
    games: [...kept, ...fresh.map((ids) => ({ players: ids, done: false }))],
    ...(before?.offset ? { offset: before.offset } : {}),
  };
}

/**
 * 試合表を組む（組み直す）。終わった試合までは残し、その先を組む。試合の形が変わった組の試合は残さない
 * （人数が合わないため。当日に試合の形や分け方を変えたときは、先に regroup.ts の changeSettings で終わった試合を移しておく）。
 * 前の分け方・試合の形で終わった試合（archive）も数に入れて、試合の数を均す。
 * @param content 試合表の中身
 * @param seed くじの種
 * @returns 組ごとの試合（レベルの分け方の組の順）
 */
export function buildPlan(content: MatchTableContent, seed: number): MatchGroupPlan[] {
  const size = PLAYERS_PER_GAME[content.settings.format];
  return groupsOf(content).map((group) => {
    const before = content.plan.find((plan) => plan.key === group.key);
    const kept = keptGames(before).filter((game) => game.players.length === size);
    return planGroup(content, seed, group, kept);
  });
}

/**
 * 1つの組だけを組み直す（当日の「来なかった・来た・帰る」。FR-M14）。ほかの組の試合は変えない。
 * 最後に終わった試合までを残し、続けて今の試合（チェックのない最初の試合。もう始まっているかもしれない）も、入る人が
 * みな出られるなら残す。その先だけを組む【仮決め】research R2。
 * @param content 試合表の中身（当日の印を直したあとのもの）
 * @param seed くじの種
 * @param key 組み直す組の key
 * @returns 組ごとの試合と、残した試合の数（組み直した最初の試合の番号 − 1）。組が今の分け方にないときは今のまま
 */
export function replanGroup(
  content: MatchTableContent,
  seed: number,
  key: string,
): { plan: MatchGroupPlan[]; kept: number } {
  const group = groupsOf(content).find((entry) => entry.key === key);
  if (!group) return { plan: content.plan, kept: 0 };
  const size = PLAYERS_PER_GAME[content.settings.format];
  const before = content.plan.find((plan) => plan.key === key);
  const kept = keptGames(before).filter((game) => game.players.length === size);
  const current = before?.games[kept.length];
  const available = new Set(presentPlayersOf(content, group).map((player) => player.id));
  if (
    current &&
    current.players.length === size &&
    current.players.every((id) => available.has(id))
  ) {
    kept.push(current);
  }
  const replanned = planGroup(content, seed, group, kept);
  const others = content.plan.filter((plan) => plan.key !== key);
  // 組の並び（分け方の順）を保つ
  const order = groupsOf(content).map((entry) => entry.key as string);
  const plan = [...others, replanned].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return { plan, kept: kept.length };
}

/**
 * 終わった試合が1つでもあるか（組み直す前の確かめに使う）。
 * @param content 試合表の中身
 * @returns あれば true
 */
export function hasDoneGames(content: MatchTableContent): boolean {
  return content.plan.some((plan) => plan.games.some((game) => game.done));
}

/**
 * 新しいくじの種（32ビットの整数）。
 * @returns 種
 */
export function newSeed(): number {
  const values = new Int32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 0;
}
