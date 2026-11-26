// 当日の「人を選んで直す」（markAttendance。PRD FR-M14・addendum.md 2章。match-003）の property-based のテスト（fast-check）。
// - 終わった試合（チェックの付いた試合）は変わらない。ほかの組の試合も変わらない
// - 今の試合は、入る人がみな出られるなら残る
// - 来なかった人・帰った人は、組み直した試合に入らない
// - 試合の数の差は、いた間で1以内（ずっといた人どうし・遅れて来た人は来た時の周に入る）
import {
  INITIAL_CONTENT,
  MATCH_GROUPINGS,
  MatchTableContent,
  settingsOfGrouping,
} from "@workspace/contracts/match";
import type { MatchPlayer, PlayerStatus } from "@workspace/contracts/match";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { actionsFor, describeAttendance, groupOfPlayer, markAttendance } from "./day-of.ts";
import type { AttendanceAction } from "./day-of.ts";
import { buildPlan } from "./plan.ts";
import { changeSettings } from "./regroup.ts";

/**
 * 1つの組（みな上級・4つに分ける）の中身を作る。
 * @param statuses 名簿の人の当日の印（ID は p0, p1, …）
 * @param games 組の試合の数
 * @param format 試合の形
 * @returns 中身（まだ組んでいない）
 */
function oneGroup(
  statuses: readonly PlayerStatus[],
  games: number,
  format: "doubles" | "singles" = "doubles",
): MatchTableContent {
  return {
    ...INITIAL_CONTENT,
    settings: {
      format,
      gameCount: games,
      ...settingsOfGrouping("four"),
      courts: null,
    },
    players: statuses.map((status, index): MatchPlayer => ({
      id: `p${index}`,
      nickname: `人${index}`,
      level: "advanced",
      status,
    })),
    plan: [],
  };
}

/**
 * 組の試合の頭から n 試合を、終わったことにする。
 * @param content 中身
 * @param upTo 終わった試合の数（組の頭から）
 * @returns 中身
 */
function markDone(content: MatchTableContent, upTo: number): MatchTableContent {
  return {
    ...content,
    plan: content.plan.map((group) => ({
      ...group,
      games: group.games.map((game, index) => (index < upTo ? { ...game, done: true } : game)),
    })),
  };
}

/**
 * 組の試合で、人ごとの出た数を数える。
 * @param games 試合
 * @returns 人の ID → 出た数
 */
function countOf(games: readonly { players: readonly string[] }[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const game of games) {
    for (const id of game.players) count.set(id, (count.get(id) ?? 0) + 1);
  }
  return count;
}

/**
 * 終わった試合の数（組の頭からの、チェックの付いた試合の並びの長さ）。
 * @param content 中身
 * @returns 数
 */
function doneLength(content: MatchTableContent): number {
  const games = content.plan[0]?.games ?? [];
  const index = games.findIndex((game) => !game.done);
  return index < 0 ? games.length : index;
}

describe("人を選んで直す（markAttendance）", () => {
  it("終わった試合とほかの組は変わらず、出られない人はこれからの試合に入らず、今の試合は残せれば残る", () => {
    // いろいろな分け方の名簿で、組ごとに終わった試合を付けてから、1人を直す
    const arb = fc.record({
      size: fc.integer({ min: 8, max: 32 }),
      grouping: fc.constantFrom("four" as const, "three" as const, "two" as const, "none" as const),
      games: fc.integer({ min: 2, max: 14 }),
      done: fc.integer({ min: 0, max: 14 }),
      pick: fc.nat(),
      choice: fc.nat(),
      seed: fc.integer(),
    });
    fc.assert(
      fc.property(arb, ({ size, grouping, games, done, pick, choice, seed }) => {
        const levels = ["advanced", "intermediate", "beginner", "novice"] as const;
        const base = oneGroup(
          Array.from({ length: size }, (_, index) => (index % 7 === 6 ? "late" : "present")),
          games,
        );
        const content: MatchTableContent = {
          ...base,
          settings: { ...base.settings, ...settingsOfGrouping(grouping) },
          players: base.players.map((player, index) => ({
            ...player,
            level: levels[index % 4] ?? "advanced",
          })),
        };
        const planned = markDone({ ...content, plan: buildPlan(content, seed) }, done);
        const player = planned.players[pick % planned.players.length];
        if (!player) return;
        const actions = actionsFor(player.status);
        const action = actions[choice % actions.length] as AttendanceAction;
        const result = markAttendance(planned, seed, player.id, action);
        expect(result).toBeDefined();
        if (!result) return;
        // 中身の形は約束どおり（サーバーが受ける形）
        expect(MatchTableContent.safeParse(result.content).success).toBe(true);
        const targetKey = groupOfPlayer(result.content, player.id)?.key;
        const kept = (result.report.fromGame ?? 1) - 1;
        const status = result.content.players.find((entry) => entry.id === player.id)?.status;
        for (const before of planned.plan) {
          const after = result.content.plan.find((entry) => entry.key === before.key);
          // 終わった試合は、どの組でも変わらない
          before.games.forEach((game, index) => {
            if (game.done) expect(after?.games[index]).toEqual(game);
          });
          if (before.key !== targetKey) {
            // ほかの組は変わらない
            expect(after).toEqual(before);
            continue;
          }
          // 今の試合は、入る人がみな出られるなら残る
          const doneUntil = before.games.findLastIndex((game) => game.done) + 1;
          const current = before.games[doneUntil];
          const available = new Set(
            result.content.players
              .filter((entry) => entry.status === "present")
              .map((entry) => entry.id),
          );
          if (current && current.players.every((id) => available.has(id))) {
            expect(after?.games[doneUntil]).toEqual(current);
          }
          // 出られない人は、組み直した試合に入らない
          if (status !== "present") {
            for (const later of after?.games.slice(kept) ?? []) {
              expect(later.players).not.toContain(player.id);
            }
          }
        }
        expect(describeAttendance(result.report)).toContain(player.nickname);
      }),
      { numRuns: 200 },
    );
  });

  it("当日に分け方や試合の形を変えたあと（offset・archive のある中身）でも、終わった試合は変わらず、中身は約束の形", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 28 }),
        fc.constantFrom(...MATCH_GROUPINGS),
        fc.constantFrom("doubles" as const, "singles" as const),
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 4 }),
        fc.nat(),
        fc.integer(),
        (size, grouping, format, firstDone, moreDone, pick, seed) => {
          const levels = ["advanced", "intermediate", "beginner", "novice"] as const;
          const base = oneGroup(
            Array.from({ length: size }, (): PlayerStatus => "present"),
            10,
          );
          const content: MatchTableContent = {
            ...base,
            players: base.players.map((player, index) => ({
              ...player,
              level: levels[index % 4] ?? "advanced",
            })),
          };
          const first = markDone({ ...content, plan: buildPlan(content, seed) }, firstDone);
          const changed = changeSettings(first, {
            ...first.settings,
            ...settingsOfGrouping(grouping),
            format,
          }).content;
          const rebuilt = { ...changed, plan: buildPlan(changed, seed) };
          const planned: MatchTableContent = {
            ...rebuilt,
            plan: rebuilt.plan.map((group) => {
              const start = group.games.findIndex((game) => !game.done);
              const from = start < 0 ? group.games.length : start;
              return {
                ...group,
                games: group.games.map((game, index) =>
                  index < from + moreDone ? { ...game, done: true } : game,
                ),
              };
            }),
          };
          const player = planned.players[pick % planned.players.length];
          if (!player) return;
          const result = markAttendance(planned, seed, player.id, "left");
          if (!result) throw new Error("名簿にいない人です");
          expect(MatchTableContent.safeParse(result.content).success).toBe(true);
          expect(result.content.archive).toEqual(planned.archive);
          for (const before of planned.plan) {
            const after = result.content.plan.find((entry) => entry.key === before.key);
            before.games.forEach((game, index) => {
              if (game.done) expect(after?.games[index]).toEqual(game);
            });
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it("今の試合は、入る人がみな出られるなら残る（入る人が帰ると組み直す）", () => {
    const content = oneGroup(Array(9).fill("present"), 8);
    const planned = markDone({ ...content, plan: buildPlan(content, 7) }, 2);
    const current = planned.plan[0]?.games[2];
    const outsider = planned.players.find((player) => !current?.players.includes(player.id));
    const insider = planned.players.find((player) => current?.players.includes(player.id));
    if (!current || !outsider || !insider) throw new Error("見本の名簿が合いません");

    const keep = markAttendance(planned, 7, outsider.id, "left");
    expect(keep?.content.plan[0]?.games[2]).toEqual(current);
    expect(keep?.report.fromGame).toBe(4);

    const replan = markAttendance(planned, 7, insider.id, "left");
    expect(replan?.content.plan[0]?.games[2]?.players).not.toContain(insider.id);
    expect(replan?.report.fromGame).toBe(3);
    expect(describeAttendance(replan!.report)).toBe(
      `組み直しました。${insider.nickname}：帰る（上級の第3試合から）`,
    );
  });

  it("来なかった・帰ったが続いても、ずっといた人どうしの試合の数の差は1以内", () => {
    const event = fc.record({
      advance: fc.integer({ min: 0, max: 4 }),
      action: fc.constantFrom("absent" as const, "left" as const),
      pick: fc.nat(),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 20 }),
        fc.integer({ min: 4, max: 16 }),
        fc.constantFrom("doubles" as const, "singles" as const),
        fc.array(event, { minLength: 1, maxLength: 5 }),
        fc.integer(),
        (size, games, format, events, seed) => {
          const initial = oneGroup(
            Array.from({ length: size }, (): PlayerStatus => "present"),
            games,
            format,
          );
          let content: MatchTableContent = { ...initial, plan: buildPlan(initial, seed) };
          const changed = new Set<string>();
          for (const step of events) {
            content = markDone(content, doneLength(content) + step.advance);
            const present = content.players.filter((player) => player.status === "present");
            const player = present[step.pick % Math.max(1, present.length)];
            if (!player) break;
            const before = content;
            const result = markAttendance(content, seed, player.id, step.action);
            if (!result) throw new Error("名簿にいない人です");
            changed.add(player.id);
            // 終わった試合は変わらない
            before.plan[0]?.games.forEach((game, index) => {
              if (game.done) expect(result.content.plan[0]?.games[index]).toEqual(game);
            });
            content = result.content;
          }
          const all = content.plan[0]?.games ?? [];
          if (all.length === 0) return;
          const count = countOf(all);
          const stayed = content.players
            .filter((player) => !changed.has(player.id))
            .map((player) => count.get(player.id) ?? 0);
          if (stayed.length < 2) return;
          expect(Math.max(...stayed) - Math.min(...stayed)).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("遅れて来た人は来た時の周に入り、来るまでの試合を数えなければ、試合の数の差は1以内", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 16 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 4, max: 16 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer(),
        (size, late, games, advance, seed) => {
          const initial = oneGroup(
            [
              ...Array.from({ length: size }, (): PlayerStatus => "present"),
              ...Array.from({ length: late }, (): PlayerStatus => "late"),
            ],
            games,
          );
          let content: MatchTableContent = markDone(
            { ...initial, plan: buildPlan(initial, seed) },
            advance,
          );
          const arriving = content.players.filter((player) => player.status === "late");
          const keptOf = new Map<string, number>();
          for (const player of arriving) {
            const result = markAttendance(content, seed, player.id, "arrived");
            if (!result) throw new Error("名簿にいない人です");
            keptOf.set(player.id, (result.report.fromGame ?? 1) - 1);
            content = result.content;
          }
          const all = content.plan[0]?.games ?? [];
          const total = countOf(all);
          // 遅れて来た人は、来た時（組み直した最初の試合の前）の「いちばん少ない数（最大 − 1）」から数える
          const adjusted = content.players.map((player, index) => {
            if (index < size) return total.get(player.id) ?? 0;
            const kept = keptOf.get(player.id) ?? 0;
            const before = countOf(all.slice(0, kept));
            const top = Math.max(
              0,
              ...content.players.slice(0, size).map((entry) => before.get(entry.id) ?? 0),
            );
            const own = before.get(player.id) ?? 0;
            return Math.max(own, top - 1) + (total.get(player.id) ?? 0) - own;
          });
          expect(Math.max(...adjusted) - Math.min(...adjusted)).toBeLessThanOrEqual(1);
          const kept = Math.max(0, ...keptOf.values());
          const after = countOf(all.slice(kept));
          // 来た人は、組み直した試合に入る（試合が残っていれば）
          if (all.length - kept >= size + late) {
            for (const player of arriving) expect(after.get(player.id) ?? 0).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("まだ組んでいない試合表では、当日の印だけを直す", () => {
    const content = oneGroup(["present", "present", "late", "present", "present"], 8);
    const result = markAttendance(content, 1, "p2", "arrived");
    expect(result?.content.players[2]?.status).toBe("present");
    expect(result?.content.plan).toEqual([]);
    expect(describeAttendance(result!.report)).toBe(
      "直しました。人2：来た（まだ試合表を作っていないので、当日の印だけを直しました）",
    );
  });

  it("人が足りなくなったら、その先は組まず、そう知らせる", () => {
    const content = oneGroup(Array(4).fill("present"), 6);
    const planned = markDone({ ...content, plan: buildPlan(content, 3) }, 2);
    const result = markAttendance(planned, 3, "p0", "left");
    expect(result?.content.plan[0]?.games).toHaveLength(2);
    expect(result?.report.short).toBe(true);
    expect(describeAttendance(result!.report)).toContain("先を組めません");
  });

  it("最後のチェックより前の飛ばした試合に帰った人がいれば、その1試合だけを組み直す（終わった試合の場所は変えない）", () => {
    const content = oneGroup(
      Array.from({ length: 9 }, (): PlayerStatus => "present"),
      8,
    );
    const planned = { ...content, plan: buildPlan(content, 21) };
    const games = planned.plan[0]?.games ?? [];
    // 第1・第3試合にチェック、第2試合は飛ばした
    const skipped: MatchTableContent = {
      ...planned,
      plan: [
        {
          ...planned.plan[0]!,
          games: games.map((game, index) => ({ ...game, done: index === 0 || index === 2 })),
        },
      ],
    };
    const leaving = games[1]?.players[0];
    if (!leaving) throw new Error("見本の名簿が合いません");
    const result = markAttendance(skipped, 21, leaving, "left");
    const after = result?.content.plan[0]?.games ?? [];
    expect(after[0]).toEqual(skipped.plan[0]?.games[0]);
    expect(after[2]).toEqual(skipped.plan[0]?.games[2]);
    expect(after[1]?.players).not.toContain(leaving);
    expect(after[1]?.done).toBe(false);
    for (const game of after.slice(3)) expect(game.players).not.toContain(leaving);
  });

  it("人が足りなかった組が当日に組めるようになったら、ほかの組が進んだ分だけ試合を減らす", () => {
    // 上級4人（3試合終わった）・中級3人（組めない）→ 中級の1人が来る
    const base = oneGroup(
      [
        ...Array.from({ length: 4 }, (): PlayerStatus => "present"),
        ...Array.from({ length: 3 }, (): PlayerStatus => "present"),
        "late",
      ],
      8,
    );
    const content: MatchTableContent = {
      ...base,
      players: base.players.map((player, index) =>
        index >= 4 ? { ...player, level: "intermediate" } : player,
      ),
    };
    const planned = markDone({ ...content, plan: buildPlan(content, 4) }, 3);
    expect(planned.plan.find((group) => group.key === "intermediate")?.games ?? []).toHaveLength(0);
    const result = markAttendance(planned, 4, "p7", "arrived");
    const intermediate = result?.content.plan.find((group) => group.key === "intermediate");
    expect(intermediate?.games).toHaveLength(8 - 3);
    expect(intermediate?.offset).toBe(-3);
    expect(MatchTableContent.safeParse(result?.content).success).toBe(true);
  });

  it("選べる直し方は、今の当日の印で決まる", () => {
    expect(actionsFor("present")).toEqual(["absent", "left"]);
    expect(actionsFor("late")).toEqual(["arrived", "absent"]);
    expect(actionsFor("absent")).toEqual(["arrived"]);
    expect(actionsFor("left")).toEqual(["arrived"]);
  });
});

describe("当日の印とミニゲーム（match-009）", () => {
  it("当日の印を変えても、ミニゲームのチーム分けは変えない", () => {
    const base = oneGroup(["present", "present", "present", "present", "present", "late"], 4);
    const content: MatchTableContent = {
      ...base,
      settings: { ...base.settings, courts: 1 },
      mini: { teams: [["p0", "p1", "p2"], ["p3", "p4"]] },
    };
    const planned = { ...content, plan: buildPlan(content, 5) };
    const left = markAttendance(planned, 5, "p0", "left");
    expect(left?.content.mini).toEqual(content.mini);
    const arrived = markAttendance(planned, 5, "p5", "arrived");
    expect(arrived?.content.mini).toEqual(content.mini);
  });
});
