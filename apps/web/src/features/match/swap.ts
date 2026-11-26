// 組み合わせを手で入れかえる（試合表の「組み合わせを直す」。match-010）。状態を持たない関数だけ。
// - 試合：同じ組の、まだの試合（チェックのない試合）の名前どうしを入れかえる。終わった試合は動かさない。
//   入れかえて同じ試合に同じ人が2回入るときは入れかえない
// - ミニゲーム：チームの人どうしを入れかえる・ほかのチームの最後へ移す（空のチームは作らない）
import type { MatchMini, MatchTableContent } from "@workspace/contracts/match";

/** 試合の名前の場所（組・試合の番号・列）。 */
export type GameSlot = {
  /** 組の key */
  key: string;
  /** 試合の番号（0から） */
  game: number;
  /** 列（0から） */
  column: number;
};

/** 入れかえの結果（入れかえられなければ理由）。 */
export type SwapResult =
  | { ok: true; content: MatchTableContent }
  | { ok: false; reason: "done" | "duplicate" | "other-group" | "missing" | "same" | "empty" };

/** 入れかえられない理由の文。 */
export const SWAP_REASON_TEXT = {
  done: "終わった試合の名前は動かせません。",
  duplicate: "同じ試合に同じ人が2回入るため、入れかえられません。",
  "other-group": "違う組の試合とは入れかえられません。",
  missing: "その名前は、もう表にありません。",
  same: "同じ場所です。",
  empty: "チームを空にはできません。",
} as const satisfies Record<Extract<SwapResult, { ok: false }>["reason"], string>;

/**
 * 試合の2つの名前を入れかえる。
 * @param content 試合表の中身
 * @param a 1つ目の場所
 * @param b 2つ目の場所
 * @returns 入れかえた中身か、入れかえられない理由
 */
export function swapGameSlots(content: MatchTableContent, a: GameSlot, b: GameSlot): SwapResult {
  if (a.key !== b.key) return { ok: false, reason: "other-group" };
  if (a.game === b.game && a.column === b.column) return { ok: false, reason: "same" };
  const plan = content.plan.find((entry) => entry.key === a.key);
  const gameA = plan?.games[a.game];
  const gameB = plan?.games[b.game];
  const idA = gameA?.players[a.column];
  const idB = gameB?.players[b.column];
  if (!plan || !gameA || !gameB || idA === undefined || idB === undefined) {
    return { ok: false, reason: "missing" };
  }
  if (gameA.done || gameB.done) return { ok: false, reason: "done" };
  if (a.game !== b.game && (gameA.players.includes(idB) || gameB.players.includes(idA))) {
    return { ok: false, reason: "duplicate" };
  }
  const games = plan.games.map((game) => ({ ...game, players: [...game.players] }));
  (games[a.game] as { players: string[] }).players[a.column] = idB;
  (games[b.game] as { players: string[] }).players[b.column] = idA;
  return {
    ok: true,
    content: {
      ...content,
      plan: content.plan.map((entry) => (entry.key === a.key ? { ...entry, games } : entry)),
    },
  };
}

/** ミニゲームのチームの人の場所（チーム・並び）。 */
export type TeamSlot = {
  /** チームの番号（0から） */
  team: number;
  /** チームの中の並び（0から） */
  index: number;
};

/**
 * ミニゲームの2人を入れかえる（同じチームなら並びだけ入れかわる）。
 * @param content 試合表の中身
 * @param a 1人目
 * @param b 2人目
 * @returns 入れかえた中身か、入れかえられない理由
 */
export function swapTeamMembers(content: MatchTableContent, a: TeamSlot, b: TeamSlot): SwapResult {
  if (a.team === b.team && a.index === b.index) return { ok: false, reason: "same" };
  const teams = content.mini?.teams.map((team) => [...team]);
  const idA = teams?.[a.team]?.[a.index];
  const idB = teams?.[b.team]?.[b.index];
  if (!teams || idA === undefined || idB === undefined) return { ok: false, reason: "missing" };
  (teams[a.team] as string[])[a.index] = idB;
  (teams[b.team] as string[])[b.index] = idA;
  return { ok: true, content: { ...content, mini: { teams } satisfies MatchMini } };
}

/**
 * ミニゲームの1人を、ほかのチームの最後へ移す。
 * @param content 試合表の中身
 * @param from 移す人
 * @param team 移す先のチームの番号（0から）
 * @returns 移した中身か、移せない理由
 */
export function moveTeamMember(
  content: MatchTableContent,
  from: TeamSlot,
  team: number,
): SwapResult {
  const teams = content.mini?.teams.map((members) => [...members]);
  const source = teams?.[from.team];
  const id = source?.[from.index];
  const target = teams?.[team];
  if (!teams || !source || id === undefined || !target) return { ok: false, reason: "missing" };
  if (from.team === team) return { ok: false, reason: "same" };
  if (source.length <= 1) return { ok: false, reason: "empty" };
  source.splice(from.index, 1);
  target.push(id);
  return { ok: true, content: { ...content, mini: { teams } } };
}
