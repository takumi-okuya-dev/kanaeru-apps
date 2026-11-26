// 試合表の中身から組ごとの試合を組む（組み方は pairing.ts の planGames。AD-29）。状態を持たない関数だけ。
// - 組は分け方で決める（レベル別の組 +〈分けないなら〉全員の組 all。matchGroupsOf。match-009）。組ごとに別のくじ（種と組の key から
//   deriveSeed）で組む。分けない組（all）は、1試合の中のレベルの差の上限を守る
// - 試合の数は、設定の試合の数（組ごとに同じ。FR-M7。match-009）
// - 出られるのは当日の印が「来る」の人だけ（「遅れて来る」「来ない」は入れない。来たら当日の組み直しで足す【仮決め】research R6）
// - 組み直し：同じ組の、最後に終わった（チェックの付いた）試合までをそのまま残し、その先だけを組む（addendum.md 2章）
// - 当日の「来なかった・来た・帰る」は、その人の組だけを組み直す（replanGroup。今の試合も入る人がみな出られれば残す。match-003）
// - 当日に分け方や試合の形を変えたときの終わった試合の移し方は regroup.ts（組の行の数の差 offset と、前の分け方の試合 archive）
// - ミニゲームのチーム分けは mini-game.ts。rebuild で組み合わせとチーム分けをまとめて作る
import {
  MATCH_LEVELS,
  PLAYERS_PER_GAME,
  UNGROUPED_MAX_LEVEL_SPREAD,
  groupSetOf,
  matchGroupsOf,
} from "@workspace/contracts/match";
import type {
  MatchGroup,
  MatchGroupKey,
  MatchGroupPlan,
  MatchSet,
  MatchSettings,
  MatchTableContent,
} from "@workspace/contracts/match";
import { buildMini } from "./mini-game.ts";
import { deriveSeed, planGames } from "./pairing.ts";

/**
 * 組ごとの試合の数（設定の試合の数。match-009）。
 * @param settings 設定
 * @returns 試合の数
 */
export function gameCountFor(settings: MatchSettings): number {
  return settings.gameCount;
}

/**
 * 今の分け方の組（レベル別の組 +〈分けないなら〉全員の組）。
 * @param content 試合表の中身
 * @returns 組（レベル別の組を上のレベルから、そのあとに全員）
 */
export function groupsOf(content: Pick<MatchTableContent, "settings">): readonly MatchGroup[] {
  return matchGroupsOf(content.settings);
}

/**
 * 選んだ分け方（試合表の画面の「分け方」のタブの順：レベル別・分けない・ミニゲーム）。
 * @param settings 設定
 * @returns 分け方
 */
export function setsOf(settings: MatchSettings): MatchSet[] {
  return [
    ...(settings.levels ? (["levels"] as const) : []),
    ...(settings.ungrouped ? (["ungrouped"] as const) : []),
    ...(settings.courts !== null ? (["mini"] as const) : []),
  ];
}

/**
 * 分け方の組（レベル別ならレベル別の組、分けないなら全員の組。ミニゲームは組を持たない）。
 * @param content 試合表の中身
 * @param set 分け方
 * @returns 組
 */
export function groupsOfSet(
  content: Pick<MatchTableContent, "settings">,
  set: MatchSet,
): readonly MatchGroup[] {
  if (set === "mini") return [];
  return groupsOf(content).filter((group) => groupSetOf(group.key) === set);
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
export function targetGameCount(
  settings: MatchSettings,
  plan: Pick<MatchGroupPlan, "offset"> | undefined,
): number {
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
  // 試合のなかった組（人が足りなかった組）を当日に組むときは、ほかの組が進んだ分だけ行を減らす（時間は同じだけ進んでいる）
  const fresh = !before || (before.games.length === 0 && before.offset === undefined);
  const offset =
    before?.offset ?? (fresh && kept.length === 0 ? -setElapsed(content.plan, group.key) : 0);
  const games = planGames({
    players: pairingPlayersOf(content, group),
    playersPerGame: size,
    gameCount: Math.max(0, targetGameCount(content.settings, { offset }) - kept.length),
    seed: deriveSeed(seed, `${group.key}:${kept.length}`),
    history: [...archivedHistoryOf(content, group), ...kept.map((game) => game.players)],
    ...(group.key === "all" ? { maxLevelSpread: UNGROUPED_MAX_LEVEL_SPREAD } : {}),
  });
  return {
    key: group.key,
    games: [...kept, ...games.map((ids) => ({ players: ids, done: false }))],
    ...(offset !== 0 ? { offset } : {}),
  };
}

/**
 * 組の、組める人（当日の印が「来る」の人）を planGames に渡す形にする。
 * @param content 試合表の中身
 * @param group 組
 * @returns 組む人（ID とレベルの段）
 */
function pairingPlayersOf(content: MatchTableContent, group: MatchGroup) {
  return presentPlayersOf(content, group).map((player) => ({
    id: player.id,
    level: player.level ? MATCH_LEVELS.indexOf(player.level) : 0,
  }));
}

/**
 * 組の進んだ試合の数（最後に終わった試合の番号 − offset。0 より下げない）。当日に組を変えたときの行の数に使う。
 * @param plan 組の試合
 * @returns 進んだ試合の数
 */
export function elapsedOf(plan: MatchGroupPlan): number {
  let last = -1;
  plan.games.forEach((game, index) => {
    if (game.done) last = index;
  });
  return Math.max(0, last + 1 - (plan.offset ?? 0));
}

/**
 * 試合表の進んだ試合の数（どの組も同じ時間に進むので、いちばん進んだ組の数）。
 * @param plan 組ごとの試合
 * @returns 進んだ試合の数
 */
export function tableElapsed(plan: readonly MatchGroupPlan[]): number {
  return Math.max(0, ...plan.map(elapsedOf));
}

/**
 * 同じ分け方の組の進んだ試合の数（レベル別の組どうし・全員の組だけ。別の分け方は別の時間に進むため。match-009 research R3）。
 * @param plan 組ごとの試合
 * @param key 組の key（この組と同じ分け方の組で数える）
 * @returns 進んだ試合の数
 */
export function setElapsed(plan: readonly MatchGroupPlan[], key: MatchGroupKey): number {
  const set = groupSetOf(key);
  return tableElapsed(plan.filter((entry) => groupSetOf(entry.key) === set));
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
 * 組み合わせとミニゲームのチーム分けをまとめて作る（「試合表を作る」「組み直す」「別の組み合わせにする」）。
 * ミニゲームのチームは、もう分けてあれば残す（配ったチームを組み直しで変えない。当日の人の出入りは「チーム分けをやり直す」。
 * research R5）。「別の組み合わせにする」（reshuffleMini）だけは分け直す。
 * @param content 試合表の中身
 * @param seed くじの種
 * @param options 分け直すか
 * @param options.reshuffleMini ミニゲームのチームも分け直すか
 * @returns 組み合わせとチーム分けを入れた中身（ミニゲームを選んでいない・組めないときはチーム分けを持たない）
 */
export function rebuild(
  content: MatchTableContent,
  seed: number,
  options: { reshuffleMini?: boolean } = {},
): MatchTableContent {
  const { mini: before, ...rest } = content;
  const mini =
    content.settings.courts === null
      ? undefined
      : before && !options.reshuffleMini
        ? before
        : (buildMini(content, seed) ?? before);
  return { ...rest, plan: buildPlan(content, seed), ...(mini ? { mini } : {}) };
}

/**
 * 1つの組だけを組み直す（当日の「来なかった・来た・帰る」。FR-M14）。ほかの組の試合は変えない。
 * 最後に終わった試合までを残し、続けて今の試合（最後のチェックの次の試合。もう始まっているかもしれない）も、入る人が
 * みな出られるなら残す。その先だけを組む【仮決め】research R2。最後のチェックより前のチェックのない試合に出られない人が
 * いれば、その1試合だけを組み直す。
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
  const available = new Set(presentPlayersOf(content, group).map((player) => player.id));
  // 最後のチェックより前のチェックのない試合（飛ばした試合）に出られない人がいれば、その1試合だけを組み直す
  // （終わった試合の場所は変えない）
  kept.forEach((game, index) => {
    if (game.done || game.players.every((id) => available.has(id))) return;
    const [replacement] = planGames({
      players: pairingPlayersOf(content, group),
      playersPerGame: size,
      gameCount: 1,
      seed: deriveSeed(seed, `${key}:gap:${index}`),
      history: [
        ...archivedHistoryOf(content, group),
        ...kept.slice(0, index).map((entry) => entry.players),
      ],
    });
    if (replacement) kept[index] = { players: replacement, done: false };
  });
  const current = before?.games[kept.length];
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
