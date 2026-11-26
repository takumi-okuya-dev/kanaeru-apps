// 組み合わせを手で入れかえる（match-010）のテスト。property-based（fast-check）と例。
// - どう入れかえても、試合の人数・名簿にいる人・同じ試合に同じ人がいないこと・終わった試合・ほかの組は変わらない
// - ミニゲームの入れかえ・移しで、人は増えも減りもせず、空のチームはできない
import { INITIAL_CONTENT, MatchTableContent } from "@workspace/contracts/match";
import type { MatchPlayer } from "@workspace/contracts/match";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildPlan } from "./plan.ts";
import { moveTeamMember, swapGameSlots, swapTeamMembers } from "./swap.ts";

/**
 * 組んだ中身（上級・中級に分ける・各 size 人・8試合。頭から done 試合を終えた）。
 * @param size 1つの組の人数
 * @param done 終わった試合の数
 * @param seed くじの種
 * @returns 中身
 */
function planned(size: number, done: number, seed: number): MatchTableContent {
  const players = Array.from({ length: size * 2 }, (_, index): MatchPlayer => ({
    id: `p${index}`,
    nickname: `人${index}`,
    level: index < size ? "advanced" : "intermediate",
    status: "present",
  }));
  const content: MatchTableContent = {
    ...INITIAL_CONTENT,
    settings: { ...INITIAL_CONTENT.settings, levels: "two", courts: 2 },
    players,
    mini: {
      teams: [0, 1, 2, 3].map((team) =>
        players.filter((_, index) => index % 4 === team).map((player) => player.id),
      ),
    },
  };
  const plan = buildPlan(content, seed).map((group) => ({
    ...group,
    games: group.games.map((game, index) => ({ ...game, done: index < done })),
  }));
  return { ...content, plan };
}

describe("試合の名前の入れかえ", () => {
  it("どう入れかえても、中身は約束の形のまま、終わった試合とほかの組は変わらない", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 10 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer(),
        fc.array(fc.tuple(fc.nat(7), fc.nat(3), fc.nat(7), fc.nat(3)), { maxLength: 12 }),
        (size, done, seed, moves) => {
          let content = planned(size, done, seed);
          const before = content;
          for (const [gameA, columnA, gameB, columnB] of moves) {
            const result = swapGameSlots(
              content,
              { key: "advanced_intermediate", game: gameA, column: columnA },
              { key: "advanced_intermediate", game: gameB, column: columnB },
            );
            if (result.ok) content = result.content;
            else if (gameA < done || gameB < done) {
              expect(["done", "same", "duplicate"]).toContain(result.reason);
            }
          }
          expect(MatchTableContent.safeParse(content).success).toBe(true);
          const group = content.plan.find((entry) => entry.key === "advanced_intermediate");
          const original = before.plan.find((entry) => entry.key === "advanced_intermediate");
          expect(group?.games.slice(0, done)).toEqual(original?.games.slice(0, done));
          expect(content.plan.filter((entry) => entry.key !== "advanced_intermediate")).toEqual(
            before.plan.filter((entry) => entry.key !== "advanced_intermediate"),
          );
        },
      ),
    );
  });

  it("同じ試合に同じ人が2回入る入れかえ・違う組・終わった試合は、理由を返して変えない", () => {
    const base = planned(4, 0, 3);
    const key = "advanced_intermediate";
    // 第1試合 [p0 p1 p2 p3]・第2試合 [p0 p4 p5 p6]・第3試合（終わった）[p1 p4 p5 p6]
    const content: MatchTableContent = {
      ...base,
      plan: base.plan.map((group) =>
        group.key === key
          ? {
              ...group,
              games: [
                { players: ["p0", "p1", "p2", "p3"], done: false },
                { players: ["p0", "p4", "p5", "p6"], done: false },
                { players: ["p1", "p4", "p5", "p6"], done: true },
              ],
            }
          : group,
      ),
    };
    // 第1試合の p1 と第2試合の p0 を入れかえると、第1試合に p0 が2人
    expect(
      swapGameSlots(content, { key, game: 0, column: 1 }, { key, game: 1, column: 0 }),
    ).toEqual({ ok: false, reason: "duplicate" });
    // 第1試合の p1 と第2試合の p4 なら入れかわる
    const swapped = swapGameSlots(
      content,
      { key, game: 0, column: 1 },
      { key, game: 1, column: 1 },
    );
    expect(
      swapped.ok && swapped.content.plan.find((g) => g.key === key)?.games.slice(0, 2),
    ).toEqual([
      { players: ["p0", "p4", "p2", "p3"], done: false },
      { players: ["p0", "p1", "p5", "p6"], done: false },
    ]);
    // 同じ試合の中の入れかえは、並びが変わるだけ
    const inside = swapGameSlots(content, { key, game: 0, column: 0 }, { key, game: 0, column: 3 });
    expect(inside.ok && inside.content.plan.find((g) => g.key === key)?.games[0]?.players).toEqual([
      "p3",
      "p1",
      "p2",
      "p0",
    ]);
    expect(
      swapGameSlots(content, { key, game: 2, column: 0 }, { key, game: 0, column: 0 }),
    ).toEqual({ ok: false, reason: "done" });
    expect(
      swapGameSlots(
        content,
        { key, game: 0, column: 0 },
        { key: "beginner_novice", game: 0, column: 0 },
      ),
    ).toEqual({ ok: false, reason: "other-group" });
  });
});

describe("ミニゲームのチームの直し", () => {
  it("入れかえ・移しで人は増えも減りもせず、空のチームはできない", () => {
    const content = planned(4, 0, 1);
    const swapped = swapTeamMembers(content, { team: 0, index: 0 }, { team: 1, index: 1 });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.content.mini?.teams.flat().sort()).toEqual(content.mini?.teams.flat().sort());
    expect(swapped.content.mini?.teams[0]?.[0]).toBe(content.mini?.teams[1]?.[1]);
    const moved = moveTeamMember(swapped.content, { team: 2, index: 0 }, 3);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.content.mini?.teams[3]).toHaveLength(3);
    expect(MatchTableContent.safeParse(moved.content).success).toBe(true);
    const lone = { ...content, mini: { teams: [["p0"], ["p1", "p2"], ["p3"], ["p4"]] } };
    expect(moveTeamMember(lone, { team: 0, index: 0 }, 1)).toEqual({ ok: false, reason: "empty" });
  });
});
