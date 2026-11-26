// ミニゲームのチーム分け（コート数×2 のチームに、レベルの合計がほぼ同じになるよう分ける。PRD FR-M31・match-009 research R4）。
// 状態を持たない関数だけ。チーム分けだけを作り、チームの中の出る順・対戦の回し方は作らない（持ち主が決めた）。
// 1. くじで人を混ぜ、点（上級4・中級3・初級2・入門1）の高い順に並べ直す（同じ点の中はくじの順）
// 2. 蛇の順（1→n、n→1…）でチームに配る（人数の差は1人まで）
// 3. 2つのチームの2人を入れかえて「点の合計の最大 − 最小」（同じなら合計の二乗の和）が小さくなる入れかえがなくなるまで続ける
//    （人数は変わらない。終わったあとは、どの2人を入れかえても差が小さくならない）
// チームの並びはコートの順に2つずつ（コート1はチーム1と2、コート2は3と4…）。
import { LEVEL_POINTS, MATCH_LEVEL_LABELS, PLAYER_STATUS_LABELS } from "@workspace/contracts/match";
import type { MatchMini, MatchTableContent } from "@workspace/contracts/match";
import { createRandom, deriveSeed } from "./pairing.ts";

/** チームに分ける人（ID と点）。 */
export type MiniPlayer = {
  /** 名簿の人の ID */
  id: string;
  /** レベルの点 */
  points: number;
};

/**
 * くじで並びを混ぜる。
 * @param items 並び
 * @param random くじ
 * @returns 混ぜた並び（もとの並びは変えない）
 */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}

/**
 * チームの点の合計の差（最大 − 最小）と、合計の二乗の和。
 * @param sums チームごとの点の合計
 * @returns 差と二乗の和
 */
function score(sums: readonly number[]): [number, number] {
  let max = -Infinity;
  let min = Infinity;
  let squares = 0;
  for (const sum of sums) {
    if (sum > max) max = sum;
    if (sum < min) min = sum;
    squares += sum * sum;
  }
  return [max - min, squares];
}

/**
 * 人をチームに分ける（人数の差は1人まで・点の合計の差をできるだけ小さく）。
 * @param input 分ける人・チームの数・くじの種
 * @param input.players 分ける人
 * @param input.teamCount チームの数（コート数×2）
 * @param input.seed くじの種
 * @returns チームごとの人の ID（人がチームの数より少なければ null）
 */
export function planTeams(input: {
  players: readonly MiniPlayer[];
  teamCount: number;
  seed: number;
}): string[][] | null {
  const { teamCount } = input;
  if (teamCount < 1 || input.players.length < teamCount) return null;
  const random = createRandom(input.seed);
  // 同じ点の中はくじの順（並べ直しは安定なので、混ぜた順が残る）
  const ordered = shuffle(input.players, random).sort((a, b) => b.points - a.points);
  const teams: MiniPlayer[][] = Array.from({ length: teamCount }, () => []);
  ordered.forEach((player, index) => {
    const round = Math.floor(index / teamCount);
    const position = index % teamCount;
    teams[round % 2 === 0 ? position : teamCount - 1 - position]?.push(player);
  });
  const sums = teams.map((team) => team.reduce((sum, player) => sum + player.points, 0));
  let current = score(sums);
  let improved = true;
  while (improved) {
    improved = false;
    for (let a = 0; a < teamCount; a += 1) {
      for (let b = a + 1; b < teamCount; b += 1) {
        const teamA = teams[a] as MiniPlayer[];
        const teamB = teams[b] as MiniPlayer[];
        for (let i = 0; i < teamA.length; i += 1) {
          for (let j = 0; j < teamB.length; j += 1) {
            const x = teamA[i] as MiniPlayer;
            const y = teamB[j] as MiniPlayer;
            const delta = y.points - x.points;
            if (delta === 0) continue;
            const next = [...sums];
            next[a] = (sums[a] ?? 0) + delta;
            next[b] = (sums[b] ?? 0) - delta;
            const candidate = score(next);
            if (
              candidate[0] < current[0] ||
              (candidate[0] === current[0] && candidate[1] < current[1])
            ) {
              teamA[i] = y;
              teamB[j] = x;
              sums[a] = next[a] ?? 0;
              sums[b] = next[b] ?? 0;
              current = candidate;
              improved = true;
            }
          }
        }
      }
    }
  }
  return teams.map((team) => team.map((player) => player.id));
}

/**
 * ミニゲームに入る人（当日の印が「来る」でレベルのある人。名簿の順）。
 * @param content 試合表の中身
 * @returns 名簿の人
 */
export function miniPlayersOf(content: Pick<MatchTableContent, "players">) {
  return content.players.filter((player) => player.status === "present" && player.level !== null);
}

/**
 * 試合表の中身から、ミニゲームのチーム分けを作る。
 * @param content 試合表の中身
 * @param seed 試合表のくじの種（ミニゲームは deriveSeed(seed, "mini") で引く）
 * @returns チーム分け（ミニゲームを選んでいない・人が足りないときは undefined）
 */
export function buildMini(content: MatchTableContent, seed: number): MatchMini | undefined {
  const { courts } = content.settings;
  if (courts === null) return undefined;
  const teams = planTeams({
    players: miniPlayersOf(content).map((player) => ({
      id: player.id,
      points: player.level ? LEVEL_POINTS[player.level] : 0,
    })),
    teamCount: courts * 2,
    seed: deriveSeed(seed, "mini"),
  });
  return teams ? { teams } : undefined;
}

/** ミニゲームの人数とチームの数（設定の画面の一覧）。 */
export type MiniSummary = {
  /** チームの数 */
  teams: number;
  /** 入る人の数 */
  players: number;
  /** 1チームのいちばん少ない人数 */
  min: number;
  /** 1チームのいちばん多い人数 */
  max: number;
  /** 人がチームの数より少なくて組めない */
  short: boolean;
};

/**
 * ミニゲームの人数とチームの数を数える。
 * @param content 試合表の中身
 * @returns 数（ミニゲームを選んでいなければ undefined）
 */
export function miniSummary(content: MatchTableContent): MiniSummary | undefined {
  const { courts } = content.settings;
  if (courts === null) return undefined;
  const teams = courts * 2;
  const players = miniPlayersOf(content).length;
  return {
    teams,
    players,
    min: Math.floor(players / teams),
    max: Math.ceil(players / teams),
    short: players < teams,
  };
}

/** 運営の画面に出すチーム分け（チームごとの人と、チームに入っていない来る人）。 */
export type MiniTeamsView = {
  /** チームごとの人（呼び名・レベルと当日の印・来る人でないか） */
  teams: { name: string; note: string; away: boolean }[][];
  /** チームに入っていない来る人（組んだあとに来た人など）の呼び名 */
  unassigned: string[];
};

/**
 * 運営の画面に出すチーム分けを作る（当日の印を変えてもチームは変えないので、来る人でない人には印を付ける。research R5）。
 * @param content 試合表の中身
 * @returns チーム分け（組んでいなければ undefined）
 */
export function miniTeamsView(content: MatchTableContent): MiniTeamsView | undefined {
  if (!content.mini) return undefined;
  const byId = new Map(content.players.map((player) => [player.id, player]));
  const placed = new Set(content.mini.teams.flat());
  return {
    teams: content.mini.teams.map((team) =>
      team.map((id) => {
        const player = byId.get(id);
        const away = player?.status !== "present";
        const level = player?.level ? MATCH_LEVEL_LABELS[player.level] : "";
        const status = player && away ? PLAYER_STATUS_LABELS[player.status] : "";
        return {
          name: player?.nickname ?? "",
          note: [level, status].filter(Boolean).join("・"),
          away,
        };
      }),
    ),
    unassigned: miniPlayersOf(content)
      .filter((player) => !placed.has(player.id))
      .map((player) => player.nickname),
  };
}
