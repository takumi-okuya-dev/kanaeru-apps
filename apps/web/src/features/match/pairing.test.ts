// 組み方（planGames）と組む処理（buildPlan）の property-based のテスト（fast-check。addendum.md 4章・AD-29）。
// 人数（4〜40人）・試合の数・遅刻と欠席・レベルの分け方・試合の形・種を変えた名簿をたくさん作り、毎回次を確かめる。
// - 試合の数の差が1以内（いた間で比べる）
// - 1つの試合に同じ人が2回入らない
// - 来なかった人・まだ来ていない人がこれからの試合に入らない
// - 同じ名簿・同じ種なら同じ表になる
// - 組み直しで、終わった試合が変わらない
import {
  INITIAL_CONTENT,
  MATCH_GROUPINGS,
  MATCH_LEVELS,
  settingsOfGrouping,
} from "@workspace/contracts/match";
import type { MatchPlayer, MatchTableContent } from "@workspace/contracts/match";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRandom, deriveSeed, planGames } from "./pairing.ts";
import { buildPlan, gameCountFor, groupsOf } from "./plan.ts";

/**
 * 人ごとの出た数を数える。
 * @param games 試合（入った人の ID の並び）
 * @returns 人の ID → 出た数
 */
function countGames(games: readonly (readonly string[])[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const game of games) for (const id of game) count.set(id, (count.get(id) ?? 0) + 1);
  return count;
}

/**
 * 名簿の人を作る道具（ID は p0, p1, …）。
 * @param index 名簿の並びの番号
 * @returns 名簿の人を作る道具
 */
const playerArb = (index: number) =>
  fc
    .record({
      level: fc.constantFrom(...MATCH_LEVELS, ...MATCH_LEVELS, null),
      status: fc.constantFrom("present", "present", "present", "late", "absent"),
    })
    .map(({ level, status }): MatchPlayer => ({
      id: `p${index}`,
      nickname: `人${index}`,
      level,
      status,
    }));

/** 名簿（4〜40人）を作る道具。 */
const rosterArb = fc
  .integer({ min: 4, max: 40 })
  .chain((size) => fc.tuple(...Array.from({ length: size }, (_, index) => playerArb(index))));

/** 中身を作る道具（名簿・分け方・試合の形・試合の数）。 */
const contentArb = fc
  .record({
    players: rosterArb,
    grouping: fc.constantFrom(...MATCH_GROUPINGS),
    format: fc.constantFrom("doubles", "singles"),
    games: fc.integer({ min: 1, max: 16 }),
  })
  .map(({ players, grouping, format, games }): MatchTableContent => ({
    ...INITIAL_CONTENT,
    settings: {
      format,
      gameCount: games,
      ...settingsOfGrouping(grouping),
      courts: null,
    },
    players: [...players],
    plan: [],
  }));

describe("組み方（planGames）", () => {
  it("試合の数の差は1以内・同じ試合に同じ人は入らない・渡した人だけが入る・同じ種なら同じ表", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 40 }),
        fc.constantFrom(2, 4),
        fc.integer({ min: 0, max: 30 }),
        fc.integer(),
        (size, perGame, gameCount, seed) => {
          const players = Array.from({ length: size }, (_, index) => ({
            id: `p${index}`,
            level: index % 4,
          }));
          const input = { players, playersPerGame: perGame, gameCount, seed };
          const games = planGames(input);
          if (size < perGame) {
            expect(games).toEqual([]);
            return;
          }
          expect(games).toHaveLength(gameCount);
          const ids = new Set(players.map((player) => player.id));
          for (const game of games) {
            expect(game).toHaveLength(perGame);
            expect(new Set(game).size).toBe(perGame);
            for (const id of game) expect(ids.has(id)).toBe(true);
          }
          const count = countGames(games);
          const values = players.map((player) => count.get(player.id) ?? 0);
          expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
          expect(planGames(input)).toEqual(games);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("続きを組むと、遅れて来た人も含め、いた間の数の差が1以内（組み直しの前の試合は変えない）", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 24 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer(),
        (size, late, before, after, seed) => {
          const all = Array.from({ length: size + late }, (_, index) => ({
            id: `p${index}`,
            level: 0,
          }));
          const early = all.slice(0, size);
          const history = planGames({ players: early, playersPerGame: 4, gameCount: before, seed });
          const next = planGames({
            players: all,
            playersPerGame: 4,
            gameCount: after,
            seed: deriveSeed(seed, "next"),
            history,
          });
          // 遅れて来た人の「来るまで」を数えない：前の試合の分は、もとからいた人だけで比べる
          const beforeCount = countGames(history);
          const afterCount = countGames(next);
          const top = Math.max(0, ...early.map((player) => beforeCount.get(player.id) ?? 0));
          const adjusted = all.map((player, index) =>
            index < size
              ? (beforeCount.get(player.id) ?? 0) + (afterCount.get(player.id) ?? 0)
              : Math.max(0, top - 1) + (afterCount.get(player.id) ?? 0),
          );
          const values = adjusted;
          // もとからいた人どうしは、いつも差が1以内
          const original = values.slice(0, size);
          expect(Math.max(...original) - Math.min(...original)).toBeLessThanOrEqual(1);
          // 遅れて来た人は、来た時の周に入るので、数えなおした数で差が1以内
          const lowest = Math.min(...values);
          for (const value of values) expect(value - lowest).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("分けないときは、組み合わせがあれば1試合のレベルの差を2段以内にする", () => {
    fc.assert(
      fc.property(fc.integer({ min: 8, max: 32 }), fc.integer(), (size, seed) => {
        // 4つのレベルが同じ数ずつ（どの周の残りにも、差が2段以内の組み合わせがある形）
        const players = Array.from({ length: size }, (_, index) => ({
          id: `p${index}`,
          level: index % 4,
        }));
        const games = planGames({
          players,
          playersPerGame: 4,
          gameCount: 12,
          seed,
          maxLevelSpread: 2,
        });
        const levelOf = new Map(players.map((player) => [player.id, player.level]));
        const wide = games.filter((game) => {
          const levels = game.map((id) => levelOf.get(id) ?? 0);
          return Math.max(...levels) - Math.min(...levels) > 2;
        });
        // 周の変わり目は残りの人を必ず入れるので、上級と入門だけが残ると守れないことがある（docstring の「守れない場合」）。
        // それでも、ほとんどの試合は守る
        expect(wide.length).toBeLessThanOrEqual(Math.ceil(games.length / 4));
      }),
      { numRuns: 100 },
    );
  });

  it("乱数は種で決まり、別の種なら別の並びになる", () => {
    const a = createRandom(1);
    const b = createRandom(1);
    const c = createRandom(2);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    expect(deriveSeed(1, "advanced")).not.toBe(deriveSeed(1, "novice"));
  });
});

describe("組む処理（buildPlan）", () => {
  it("来ない人・遅れて来る人は入らず、組ごとに試合の数の差が1以内・同じ種なら同じ表", () => {
    fc.assert(
      fc.property(contentArb, fc.integer(), (content, seed) => {
        const plan = buildPlan(content, seed);
        const total = gameCountFor(content.settings);
        const statusOf = new Map(content.players.map((player) => [player.id, player.status]));
        for (const group of plan) {
          const ids = group.games.flatMap((game) => game.players);
          for (const id of ids) expect(statusOf.get(id)).toBe("present");
          if (group.games.length > 0) expect(group.games).toHaveLength(total);
          const count = countGames(group.games.map((game) => game.players));
          const levels = groupsOf(content).find((entry) => entry.key === group.key)
            ?.levels as readonly string[];
          const values = content.players
            .filter(
              (player) =>
                player.status === "present" &&
                player.level !== null &&
                levels.includes(player.level),
            )
            .map((player) => count.get(player.id) ?? 0);
          if (group.games.length > 0) {
            expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
          }
        }
        expect(buildPlan(content, seed)).toEqual(plan);
      }),
      { numRuns: 150 },
    );
  });

  it("組み直しで、最後に終わった試合までは変わらない（来なかった人を外しても）", () => {
    fc.assert(
      fc.property(
        contentArb,
        fc.integer(),
        fc.integer(),
        fc.integer({ min: 0, max: 15 }),
        (content, seed, nextSeed, doneUntil) => {
          const first = { ...content, plan: buildPlan(content, seed) };
          // 組ごとに doneUntil 番目までを終わったことにし、来る人の1人を「来ない」にする
          const marked: MatchTableContent = {
            ...first,
            plan: first.plan.map((group) => ({
              ...group,
              games: group.games.map((game, index) => ({ ...game, done: index <= doneUntil })),
            })),
          };
          const leaving = content.players.find((player) => player.status === "present");
          const changed: MatchTableContent = {
            ...marked,
            players: marked.players.map((player) =>
              player.id === leaving?.id ? { ...player, status: "absent" } : player,
            ),
          };
          const replanned = buildPlan(changed, nextSeed);
          for (const group of marked.plan) {
            const kept = group.games.filter((game) => game.done);
            const after = replanned.find((entry) => entry.key === group.key);
            expect(after?.games.slice(0, kept.length)).toEqual(kept);
            // 終わった試合のあとには、来なくなった人は入らない
            for (const game of after?.games.slice(kept.length) ?? []) {
              expect(game.players).not.toContain(leaving?.id);
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
