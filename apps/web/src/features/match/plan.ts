// 試合表の中身から組ごとの試合を組む（組み方は pairing.ts の planGames。AD-29）。状態を持たない関数だけ。
// - 組はレベルの分け方（MATCH_GROUPS）で決め、組ごとに別のくじ（種と組の key から deriveSeed）で組む
// - 試合の数は、試合の時間を1試合の長さで割った数（組ごとに同じ。FR-M7）
// - 出られるのは当日の印が「来る」の人だけ（「遅れて来る」「来ない」は入れない。来たら当日の組み直しで足す【仮決め】research R6）
// - 組み直し：同じ組の、最後に終わった（チェックの付いた）試合までをそのまま残し、その先だけを組む（addendum.md 2章）
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
  const games = gameCountFor(content.settings);
  return groupsOf(content).map((group) => {
    const players = presentPlayersOf(content, group).length;
    const short = players < size;
    return { group, players, games: short ? 0 : games, short };
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
 * 試合表を組む（組み直す）。終わった試合までは残し、その先を組む。試合の形が変わった組の試合は残さない
 * （人数が合わないため。当日に試合の形を変えたときの残し方は、当日の組み直しの段で決める【仮決め】research R7）。
 * @param content 試合表の中身
 * @param seed くじの種
 * @returns 組ごとの試合（レベルの分け方の組の順）
 */
export function buildPlan(content: MatchTableContent, seed: number): MatchGroupPlan[] {
  const size = PLAYERS_PER_GAME[content.settings.format];
  const total = gameCountFor(content.settings);
  const ungrouped = content.settings.grouping === "none";
  return groupsOf(content).map((group) => {
    const before = content.plan.find((plan) => plan.key === group.key);
    const kept = keptGames(before).filter((game) => game.players.length === size);
    const players = presentPlayersOf(content, group).map((player) => ({
      id: player.id,
      level: player.level ? MATCH_LEVELS.indexOf(player.level) : 0,
    }));
    const fresh = planGames({
      players,
      playersPerGame: size,
      gameCount: Math.max(0, total - kept.length),
      seed: deriveSeed(seed, `${group.key}:${kept.length}`),
      history: kept.map((game) => game.players),
      ...(ungrouped ? { maxLevelSpread: UNGROUPED_MAX_LEVEL_SPREAD } : {}),
    });
    return {
      key: group.key,
      games: [...kept, ...fresh.map((players) => ({ players, done: false }))],
    };
  });
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

/**
 * 設定に合わない組み合わせを外す（レベルの分け方に無い組と、試合の形と人数の合わない試合。終わった試合も外れる）。
 * 当日に分け方や試合の形を変えたときに終わった試合を残す形は、当日の組み直しの段で決める【仮決め】research R7。
 * @param plan 今の組ごとの試合
 * @param settings 新しい設定
 * @returns 設定に合う組ごとの試合
 */
export function fitPlanToSettings(
  plan: readonly MatchGroupPlan[],
  settings: MatchSettings,
): MatchGroupPlan[] {
  const allowed = new Set<string>(MATCH_GROUPS[settings.grouping].map((group) => group.key));
  const size = PLAYERS_PER_GAME[settings.format];
  return plan
    .filter((entry) => allowed.has(entry.key))
    .map((entry) => ({
      ...entry,
      games: entry.games.filter((game) => game.players.length === size),
    }));
}

/**
 * 設定を変えると外れる試合の数。
 * @param plan 今の組ごとの試合
 * @param settings 新しい設定
 * @returns 外れる試合の数
 */
export function droppedGameCount(plan: readonly MatchGroupPlan[], settings: MatchSettings): number {
  const before = plan.reduce((sum, entry) => sum + entry.games.length, 0);
  const after = fitPlanToSettings(plan, settings).reduce(
    (sum, entry) => sum + entry.games.length,
    0,
  );
  return before - after;
}
