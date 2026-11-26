// 当日に分け方や試合の形を変える（changeSettings。match-003）のテスト。property-based（fast-check）と例。
// - 終わった試合は1つも消えない（新しい組か、前の分け方で終わった試合のどちらかに、そのまま残る）
// - 変わらない組（同じ key・同じ形）の試合は、まだの試合も含めて変わらない
// - 移したあとで組み直しても、終わった試合は変わらず、中身は約束の形のまま
// - 新しい組の行の数は「移した終わった試合 + 残りの時間の試合」
import {
  INITIAL_CONTENT,
  MATCH_GROUPINGS,
  MATCH_LEVELS,
  MatchTableContent,
  settingsOfGrouping,
} from "@workspace/contracts/match";
import type { MatchGame, MatchPlayer } from "@workspace/contracts/match";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildPlan, gameCountFor } from "./plan.ts";
import { changeSettings, describeSettingsChange } from "./regroup.ts";

/**
 * 中身を作る（ID は p0, p1, …。レベルは順に上級・中級・初級・入門）。
 * @param size 人数
 * @param games 組の試合の数
 * @param grouping 分け方
 * @param format 試合の形
 * @returns 中身（まだ組んでいない）
 */
function contentOf(
  size: number,
  games: number,
  grouping: (typeof MATCH_GROUPINGS)[number],
  format: "doubles" | "singles",
): MatchTableContent {
  return {
    ...INITIAL_CONTENT,
    settings: {
      format,
      gameCount: games,
      ...settingsOfGrouping(grouping),
      courts: null,
    },
    players: Array.from({ length: size }, (_, index): MatchPlayer => ({
      id: `p${index}`,
      nickname: `人${index}`,
      level: MATCH_LEVELS[index % 4] ?? "advanced",
      status: "present",
    })),
    plan: [],
  };
}

/**
 * 組ごとに頭から n 試合を終わったことにする（組ごとに n を変える）。
 * @param content 中身
 * @param doneOf 組の並びの番号 → 終わった試合の数
 * @returns 中身
 */
function markDone(content: MatchTableContent, doneOf: (index: number) => number) {
  return {
    ...content,
    plan: content.plan.map((group, groupIndex) => ({
      ...group,
      games: group.games.map((game, index) => ({ ...game, done: index < doneOf(groupIndex) })),
    })),
  };
}

/**
 * 終わった試合の並びを、比べられる文字にする（並びによらない）。
 * @param games 試合
 * @returns 文字の並び（整列済み）
 */
function keysOf(games: readonly MatchGame[]): string[] {
  return games.map((game) => JSON.stringify(game)).sort();
}

describe("分け方と試合の形を変える（changeSettings）", () => {
  it("終わった試合は消えず、変わらない組はそのまま、組み直しても終わった試合は変わらない", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 40 }),
        fc.integer({ min: 2, max: 12 }),
        fc.constantFrom(...MATCH_GROUPINGS),
        fc.constantFrom(...MATCH_GROUPINGS),
        fc.constantFrom("doubles" as const, "singles" as const),
        fc.constantFrom("doubles" as const, "singles" as const),
        fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 4, maxLength: 4 }),
        fc.integer(),
        (size, games, fromGrouping, toGrouping, fromFormat, toFormat, done, seed) => {
          const initial = contentOf(size, games, fromGrouping, fromFormat);
          const planned = markDone(
            { ...initial, plan: buildPlan(initial, seed) },
            (index) => done[index] ?? 0,
          );
          const next = { ...planned.settings, ...settingsOfGrouping(toGrouping), format: toFormat };
          const { content, report } = changeSettings(planned, next);
          expect(MatchTableContent.safeParse(content).success).toBe(true);

          const doneBefore = planned.plan.flatMap((group) => group.games.filter((g) => g.done));
          const doneAfter = [
            ...content.plan.flatMap((group) => group.games.filter((g) => g.done)),
            ...(content.archive ?? []).flatMap((entry) => entry.games),
          ];
          expect(keysOf(doneAfter)).toEqual(keysOf(doneBefore));

          for (const key of report.carried) {
            expect(content.plan.find((group) => group.key === key)).toEqual(
              planned.plan.find((group) => group.key === key),
            );
          }
          const archivedCount = report.archived.reduce((sum, entry) => sum + entry.count, 0);
          if (report.regrouped) expect(report.moved + archivedCount).toBe(report.doneTotal);

          // 組み直しても、終わった試合は同じ場所に残り、中身は約束の形
          const rebuilt = { ...content, plan: buildPlan(content, seed) };
          expect(MatchTableContent.safeParse(rebuilt).success).toBe(true);
          for (const group of content.plan) {
            const after = rebuilt.plan.find((entry) => entry.key === group.key);
            group.games.forEach((game, index) => {
              if (game.done) expect(after?.games[index]).toEqual(game);
            });
          }
          expect(describeSettingsChange(report, true).length > 0).toBe(report.regrouped);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("組を一緒にすると、終わった試合を交互に並べて移し、行の数は「移した試合 + 残りの時間の試合」", () => {
    // 16人・4つ（各4人）・8試合。初級は3試合、入門は2試合終わったところで、初級＆入門にする
    const initial = contentOf(16, 8, "four", "doubles");
    const planned = markDone({ ...initial, plan: buildPlan(initial, 5) }, (index) =>
      index === 2 ? 3 : index === 3 ? 2 : 1,
    );
    const beginner = planned.plan.find((group) => group.key === "beginner")?.games ?? [];
    const novice = planned.plan.find((group) => group.key === "novice")?.games ?? [];
    const { content, report } = changeSettings(planned, {
      ...planned.settings,
      ...settingsOfGrouping("three"),
    });
    expect(report.carried).toEqual(["advanced", "intermediate"]);
    expect(report.moved).toBe(5);
    expect(report.archived).toEqual([]);
    const merged = content.plan.find((group) => group.key === "beginner_novice");
    expect(merged?.games).toEqual([beginner[0], novice[0], beginner[1], novice[1], beginner[2]]);
    // 進んだのは3試合（いちばん進んだ初級）。行の数は 5 + (8 − 3) = 10
    expect(merged?.offset).toBe(2);
    const rebuilt = buildPlan(content, 5).find((group) => group.key === "beginner_novice");
    expect(rebuilt?.games).toHaveLength(5 + gameCountFor(planned.settings) - 3);
    expect(describeSettingsChange(report, true)).toEqual([
      "上級・中級の試合は、そのまま残します。",
      "終わった試合 5試合のうち、5試合は新しい組に移して残します（組の中の試合の番号は変わります）。",
      "まだの試合 11試合は、新しい組で組み直します。",
    ]);
  });

  it("人が足りずに試合のなかった組を一緒にしても、ほかの組が進んだ分だけ行を減らす", () => {
    // 上級4人・中級4人・初級2人・入門2人・8試合。上級は3試合、中級は1試合終わったところで、初級＆入門にする
    const base = contentOf(12, 8, "four", "doubles");
    const order = ["advanced", "intermediate", "beginner", "novice"] as const;
    const initial: MatchTableContent = {
      ...base,
      players: base.players.map((player, index) => ({
        ...player,
        level: order[index < 4 ? 0 : index < 8 ? 1 : index < 10 ? 2 : 3] ?? "advanced",
      })),
    };
    const planned = markDone({ ...initial, plan: buildPlan(initial, 6) }, (index) =>
      index === 0 ? 3 : 1,
    );
    expect(planned.plan.find((group) => group.key === "beginner")?.games ?? []).toHaveLength(0);
    const { content } = changeSettings(planned, {
      ...planned.settings,
      ...settingsOfGrouping("three"),
    });
    const merged = buildPlan(content, 6).find((group) => group.key === "beginner_novice");
    expect(merged?.games).toHaveLength(8 - 3);
    expect(merged?.offset).toBe(-3);
  });

  it("組を分けると、レベルの混ざった終わった試合は「前の分け方で終わった試合」に残し、数を均すときに数える", () => {
    // 8人・分けない・6試合で2試合終わったところで、2つ（上級＆中級・初級＆入門）に分ける
    const initial = contentOf(8, 6, "none", "doubles");
    const planned = markDone({ ...initial, plan: buildPlan(initial, 9) }, () => 2);
    const { content, report } = changeSettings(planned, {
      ...planned.settings,
      ...settingsOfGrouping("two"),
    });
    const mixed = report.archived.find((entry) => entry.key === "all")?.count ?? 0;
    expect(report.moved + mixed).toBe(2);
    // 進んだのは2試合。移せなかった分だけ行が減る
    for (const group of content.plan) {
      expect(group.games.length - (group.offset ?? 0)).toBe(2);
    }
    expect(describeSettingsChange(report, false).join("")).toContain("「組み直す」を押す");
  });

  it("試合の形を変えると、終わった試合は組から外して残し、行の数は残りの時間の試合", () => {
    const initial = contentOf(8, 6, "four", "singles");
    const planned = markDone({ ...initial, plan: buildPlan(initial, 2) }, () => 2);
    const { content, report } = changeSettings(planned, { ...planned.settings, format: "doubles" });
    expect(report.formatChanged).toBe(true);
    expect(report.moved).toBe(0);
    expect(content.plan.every((group) => group.games.length === 0 && group.offset === -2)).toBe(
      true,
    );
    expect(content.archive?.reduce((sum, entry) => sum + entry.games.length, 0)).toBe(8);
    const rebuilt = buildPlan(content, 2);
    // 2人ずつの組は、ダブルスでは4人に足りないので組めない
    expect(rebuilt.every((group) => group.games.length === 0)).toBe(true);
    expect(describeSettingsChange(report, true).join("")).toContain("試合の形が変わるため");
  });

  it("分け方も試合の形も変わらなければ、組み合わせは変えない", () => {
    const initial = contentOf(8, 6, "two", "doubles");
    const planned = { ...initial, plan: buildPlan(initial, 4) };
    const { content, report } = changeSettings(planned, {
      ...planned.settings,
      gameCount: 9,
    });
    expect(report.regrouped).toBe(false);
    expect(content.plan).toEqual(planned.plan);
    expect(describeSettingsChange(report, false)).toEqual([]);
  });
});

describe("分け方を組み合わせる（match-009）", () => {
  it("レベル別と分けないの両方で組むと、両方の組ができ、分けない組はレベルの差の上限を守る", () => {
    const initial = contentOf(16, 6, "four", "doubles");
    const both = { ...initial, settings: { ...initial.settings, ungrouped: true } };
    const plan = buildPlan(both, 3);
    expect(plan.map((group) => group.key)).toEqual([
      "advanced",
      "intermediate",
      "beginner",
      "novice",
      "all",
    ]);
    const all = plan.find((group) => group.key === "all");
    expect(all?.games).toHaveLength(6);
    const levelOf = new Map(both.players.map((player) => [player.id, player.level]));
    for (const game of all?.games ?? []) {
      const ranks = game.players.map((id) => MATCH_LEVELS.indexOf(levelOf.get(id) ?? "advanced"));
      expect(Math.max(...ranks) - Math.min(...ranks)).toBeLessThanOrEqual(2);
    }
  });

  it("分けないを足すだけなら、レベル別の組はそのまま、足した組は試合の数のまま組む", () => {
    const initial = contentOf(16, 6, "four", "doubles");
    const planned = markDone({ ...initial, plan: buildPlan(initial, 8) }, () => 3);
    const { content, report } = changeSettings(planned, { ...planned.settings, ungrouped: true });
    expect(report.carried).toEqual(["advanced", "intermediate", "beginner", "novice"]);
    expect(report.doneTotal).toBe(0);
    for (const group of planned.plan) {
      expect(content.plan.find((entry) => entry.key === group.key)).toEqual(group);
    }
    const all = buildPlan(content, 8).find((group) => group.key === "all");
    expect(all?.games).toHaveLength(6);
    expect(all?.offset).toBeUndefined();
  });

  it("分けないを外すと、終わった試合は前の分け方の試合に残し、レベル別の組は変えない", () => {
    const initial = contentOf(16, 6, "four", "doubles");
    const both = { ...initial, settings: { ...initial.settings, ungrouped: true } };
    const planned = markDone({ ...both, plan: buildPlan(both, 4) }, () => 2);
    const { content, report } = changeSettings(planned, { ...planned.settings, ungrouped: false });
    expect(report.carried).toEqual(["advanced", "intermediate", "beginner", "novice"]);
    expect(content.plan.some((group) => group.key === "all")).toBe(false);
    expect(content.archive?.find((entry) => entry.key === "all")?.games).toHaveLength(2);
    expect(MatchTableContent.safeParse(content).success).toBe(true);
  });

  it("ミニゲームを外す・コート数を変えると、チーム分けを消す", () => {
    const initial = contentOf(8, 6, "four", "doubles");
    const withMini = {
      ...initial,
      settings: { ...initial.settings, courts: 1 },
      mini: {
        teams: [
          ["p0", "p1"],
          ["p2", "p3"],
        ],
      },
    };
    const removed = changeSettings(withMini, { ...withMini.settings, courts: null });
    expect(removed.content.mini).toBeUndefined();
    expect(describeSettingsChange(removed.report, false)).toEqual([
      "ミニゲームのチーム分けを消します。",
    ]);
    const resized = changeSettings(withMini, { ...withMini.settings, courts: 2 });
    expect(resized.content.mini).toBeUndefined();
    expect(MatchTableContent.safeParse(resized.content).success).toBe(true);
    const kept = changeSettings(withMini, { ...withMini.settings, gameCount: 9 });
    expect(kept.content.mini).toEqual(withMini.mini);
  });
});
