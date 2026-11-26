// ミニゲームのチーム分け（planTeams・buildMini）の property-based のテスト（fast-check。match-009 research R4）。
// 人数（1〜60人）・レベル・コート数・種を変えて、毎回次を確かめる。
// - チームの数はコート数×2・人数の差は1人まで
// - 来る人でレベルのある人が、みなちょうど1つのチームに入る
// - どの2人を入れかえても、チームの点の合計の差（最大 − 最小）が小さくならない
// - 同じ名簿・同じ種なら同じチーム分け
import { INITIAL_CONTENT, LEVEL_POINTS, MATCH_LEVELS } from "@workspace/contracts/match";
import type { MatchPlayer, MatchTableContent } from "@workspace/contracts/match";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildMini, miniSummary, planTeams } from "./mini-game.ts";

/**
 * チームの点の合計の差（最大 − 最小）。
 * @param teams チーム（人の点の並び）
 * @returns 差
 */
function spread(teams: readonly (readonly number[])[]): number {
  const sums = teams.map((team) => team.reduce((sum, value) => sum + value, 0));
  return Math.max(...sums) - Math.min(...sums);
}

const inputArb = fc.record({
  points: fc.array(fc.constantFrom(1, 2, 3, 4), { minLength: 1, maxLength: 60 }),
  courts: fc.integer({ min: 1, max: 8 }),
  seed: fc.integer(),
});

describe("ミニゲームのチーム分け", () => {
  it("チームの数はコート数×2・人数の差は1人まで・みな1つのチームに入る", () => {
    fc.assert(
      fc.property(inputArb, ({ points, courts, seed }) => {
        const players = points.map((value, index) => ({ id: `p${index}`, points: value }));
        const teams = planTeams({ players, teamCount: courts * 2, seed });
        if (players.length < courts * 2) {
          expect(teams).toBeNull();
          return;
        }
        expect(teams).not.toBeNull();
        if (!teams) return;
        expect(teams).toHaveLength(courts * 2);
        const sizes = teams.map((team) => team.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        const ids = teams.flat();
        expect(new Set(ids).size).toBe(players.length);
        expect([...ids].sort()).toEqual(players.map((player) => player.id).sort());
      }),
    );
  });

  it("どの2人を入れかえても、チームの点の差は小さくならない", () => {
    fc.assert(
      fc.property(inputArb, ({ points, courts, seed }) => {
        const players = points.map((value, index) => ({ id: `p${index}`, points: value }));
        const teams = planTeams({ players, teamCount: courts * 2, seed });
        if (!teams) return;
        const pointOf = new Map(players.map((player) => [player.id, player.points]));
        const scored = teams.map((team) => team.map((id) => pointOf.get(id) ?? 0));
        const best = spread(scored);
        for (let a = 0; a < scored.length; a += 1) {
          for (let b = a + 1; b < scored.length; b += 1) {
            for (let i = 0; i < (scored[a]?.length ?? 0); i += 1) {
              for (let j = 0; j < (scored[b]?.length ?? 0); j += 1) {
                const swapped = scored.map((team) => [...team]);
                const x = swapped[a]![i]!;
                swapped[a]![i] = swapped[b]![j]!;
                swapped[b]![j] = x;
                expect(spread(swapped)).toBeGreaterThanOrEqual(best);
              }
            }
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it("同じ名簿と種なら同じチーム分け", () => {
    fc.assert(
      fc.property(inputArb, ({ points, courts, seed }) => {
        const players = points.map((value, index) => ({ id: `p${index}`, points: value }));
        expect(planTeams({ players, teamCount: courts * 2, seed })).toEqual(
          planTeams({ players, teamCount: courts * 2, seed }),
        );
      }),
    );
  });

  it("18人・コート3なら6チームに3人ずつ、点の差は小さい（例）", () => {
    const levels = [...Array(18).keys()].map((index) => MATCH_LEVELS[index % 4]!);
    const players = levels.map((level, index) => ({
      id: `p${index}`,
      points: LEVEL_POINTS[level],
    }));
    const teams = planTeams({ players, teamCount: 6, seed: 7 });
    expect(teams?.map((team) => team.length)).toEqual([3, 3, 3, 3, 3, 3]);
    const pointOf = new Map(players.map((player) => [player.id, player.points]));
    expect(
      spread((teams ?? []).map((team) => team.map((id) => pointOf.get(id) ?? 0))),
    ).toBeLessThanOrEqual(1);
  });
});

describe("試合表の中身からチーム分けを作る", () => {
  /**
   * 名簿の人を作る。
   * @param id ID
   * @param level レベル
   * @param status 当日の印
   * @returns 名簿の人
   */
  const player = (
    id: string,
    level: MatchPlayer["level"],
    status: MatchPlayer["status"] = "present",
  ): MatchPlayer => ({ id, nickname: id, level, status });

  it("来る人でレベルのある人だけを入れる。ミニゲームを選んでいなければ作らない", () => {
    const content: MatchTableContent = {
      ...INITIAL_CONTENT,
      settings: { ...INITIAL_CONTENT.settings, courts: 1 },
      players: [
        player("a", "advanced"),
        player("b", "novice"),
        player("c", "beginner"),
        player("d", null),
        player("e", "advanced", "absent"),
      ],
    };
    const mini = buildMini(content, 1);
    expect(mini?.teams).toHaveLength(2);
    expect(mini?.teams.flat().sort()).toEqual(["a", "b", "c"]);
    expect(
      buildMini({ ...content, settings: { ...content.settings, courts: null } }, 1),
    ).toBeUndefined();
    expect(miniSummary(content)).toEqual({ teams: 2, players: 3, min: 1, max: 2, short: false });
    const short = { ...content, settings: { ...content.settings, courts: 2 } };
    expect(buildMini(short, 1)).toBeUndefined();
    expect(miniSummary(short)).toMatchObject({ teams: 4, players: 3, short: true });
  });
});
