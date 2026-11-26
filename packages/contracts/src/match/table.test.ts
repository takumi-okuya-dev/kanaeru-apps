// 試合表の中身の形：名簿・組み合わせ・設定の確かめ（ほかの欄〈氏名など〉を受けない・ID の重なり・試合の人数・名簿にいない人・
// 組と分け方の食い違い・試合の数・分け方を1つ以上・ミニゲームのチーム・前の形の設定を直す）と、選択肢の言葉と組の決まり。
import { describe, expect, it } from "vitest";
import {
  INITIAL_CONTENT,
  MATCH_FORMATS,
  MATCH_FORMAT_LABELS,
  MATCH_GROUPINGS,
  MATCH_GROUPING_LABELS,
  MATCH_GROUPS,
  MATCH_LEVELS,
  MatchTableContent,
  MatchTableCreateInput,
  PLAYER_STATUSES,
  PLAYER_STATUS_LABELS,
  matchGroupsOf,
} from "./index.ts";
import type { MatchTableContent as Content } from "./index.ts";

/**
 * 見本の中身（ダブルス・4つに分ける・上級の4人と1試合）。
 * @returns 中身
 */
function sample(): Content {
  return {
    ...INITIAL_CONTENT,
    players: ["a", "b", "c", "d"].map((id, index) => ({
      id,
      nickname: `人${index}`,
      level: "advanced",
      status: "present",
    })),
    plan: [{ key: "advanced", games: [{ players: ["a", "b", "c", "d"], done: false }] }],
  };
}

describe("試合表の選択肢", () => {
  it("どの code にも言葉があり、どの分け方でもレベルはちょうど1つの組に入る", () => {
    expect(Object.keys(MATCH_FORMAT_LABELS)).toEqual([...MATCH_FORMATS]);
    expect(Object.keys(MATCH_GROUPING_LABELS)).toEqual([...MATCH_GROUPINGS]);
    expect(Object.keys(PLAYER_STATUS_LABELS)).toEqual([...PLAYER_STATUSES]);
    for (const grouping of MATCH_GROUPINGS) {
      const levels = MATCH_GROUPS[grouping].flatMap((group) => [...group.levels]);
      expect([...levels].sort()).toEqual([...MATCH_LEVELS].sort());
    }
  });
});

describe("試合表の中身", () => {
  it("見本の中身と、作ったときの中身は通る", () => {
    expect(MatchTableContent.safeParse(sample()).success).toBe(true);
    expect(MatchTableContent.safeParse(INITIAL_CONTENT).success).toBe(true);
  });

  it("当日の印の「帰った」・組の行の数の差・前の分け方で終わった試合（2人と4人が混ざってよい）は通る（match-003）", () => {
    const content = sample();
    const day = {
      ...content,
      players: content.players.map((player, index) =>
        index === 0 ? { ...player, status: "left" as const } : player,
      ),
      plan: [{ ...content.plan[0]!, offset: -2 }],
      archive: [
        {
          key: "beginner_novice" as const,
          games: [
            { players: ["a", "b"], done: true },
            { players: ["a", "b", "c", "d"], done: true },
          ],
        },
      ],
    };
    expect(MatchTableContent.safeParse(day).success).toBe(true);
  });

  it("前の分け方の試合は、終わった試合・別々の2人か4人・名簿にいる人・key の重なりなしだけが通る", () => {
    const content = sample();
    const archive = (games: unknown[], key = "all") => ({ ...content, archive: [{ key, games }] });
    expect(
      MatchTableContent.safeParse(archive([{ players: ["a", "b"], done: false }])).success,
    ).toBe(false);
    expect(
      MatchTableContent.safeParse(archive([{ players: ["a", "b", "c"], done: true }])).success,
    ).toBe(false);
    expect(
      MatchTableContent.safeParse(archive([{ players: ["a", "a"], done: true }])).success,
    ).toBe(false);
    expect(
      MatchTableContent.safeParse(archive([{ players: ["a", "z"], done: true }])).success,
    ).toBe(false);
    const twice = {
      ...content,
      archive: [
        { key: "all", games: [] },
        { key: "all", games: [] },
      ],
    };
    expect(MatchTableContent.safeParse(twice).success).toBe(false);
    expect(
      MatchTableContent.safeParse({ ...content, plan: [{ ...content.plan[0], offset: 1.5 }] })
        .success,
    ).toBe(false);
  });

  it("名簿の人にほかの欄（氏名など）があれば通らない（サーバーに氏名を持たない）", () => {
    const content = sample();
    const players = content.players.map((player) => ({ ...player, fullName: "高橋 拓真" }));
    expect(MatchTableContent.safeParse({ ...content, players }).success).toBe(false);
  });

  it("受付の交流会から入れた人の account は、ID の形だけ通る（match-006）", () => {
    const content = sample();
    const withAccount = (accountId: unknown) => ({
      ...content,
      players: content.players.map((player, index) =>
        index === 0 ? { ...player, accountId } : player,
      ),
    });
    expect(
      MatchTableContent.safeParse(withAccount("0193a1b2-0000-7000-8000-00000000000a")).success,
    ).toBe(true);
    expect(MatchTableContent.safeParse(withAccount("中村 さき")).success).toBe(false);
    expect(MatchTableContent.safeParse(withAccount(null)).success).toBe(false);
  });

  it("ID の重なり・試合の人数・名簿にいない人・組の食い違いは通らない", () => {
    const content = sample();
    const duplicated = {
      ...content,
      players: [...content.players, { ...content.players[0] }],
    };
    expect(MatchTableContent.safeParse(duplicated).success).toBe(false);
    const short = {
      ...content,
      plan: [{ key: "advanced", games: [{ players: ["a", "b"], done: false }] }],
    };
    expect(MatchTableContent.safeParse(short).success).toBe(false);
    const twice = {
      ...content,
      plan: [{ key: "advanced", games: [{ players: ["a", "a", "c", "d"], done: false }] }],
    };
    expect(MatchTableContent.safeParse(twice).success).toBe(false);
    const stranger = {
      ...content,
      plan: [{ key: "advanced", games: [{ players: ["a", "b", "c", "z"], done: false }] }],
    };
    expect(MatchTableContent.safeParse(stranger).success).toBe(false);
    const wrongGroup = { ...content, plan: [{ key: "all", games: [] }] };
    expect(MatchTableContent.safeParse(wrongGroup).success).toBe(false);
    const sameGroup = {
      ...content,
      plan: [
        { key: "advanced", games: [] },
        { key: "advanced", games: [] },
      ],
    };
    expect(MatchTableContent.safeParse(sameGroup).success).toBe(false);
  });

  it("シングルスは2人の試合だけが通る", () => {
    const content = sample();
    const singles = {
      ...content,
      settings: { ...content.settings, format: "singles" },
      plan: [{ key: "advanced", games: [{ players: ["a", "b"], done: true }] }],
    };
    expect(MatchTableContent.safeParse(singles).success).toBe(true);
    expect(MatchTableContent.safeParse({ ...content, settings: singles.settings }).success).toBe(
      false,
    );
  });

  it("試合の数は1〜60の整数、コート数は1〜20、呼び名は1〜20文字（match-009）", () => {
    const content = sample();
    for (const gameCount of [0, 61, 2.5]) {
      expect(
        MatchTableContent.safeParse({ ...content, settings: { ...content.settings, gameCount } })
          .success,
      ).toBe(false);
    }
    for (const courts of [0, 21, 1.5]) {
      expect(
        MatchTableContent.safeParse({ ...content, settings: { ...content.settings, courts } })
          .success,
      ).toBe(false);
    }
    const long = content.players.map((player) => ({ ...player, nickname: "あ".repeat(21) }));
    expect(MatchTableContent.safeParse({ ...content, players: long }).success).toBe(false);
  });

  it("分け方を1つも選ばないと、欄のそばに出せる誤りの文を返す（match-009）", () => {
    const content = sample();
    const none = {
      ...content,
      settings: { ...content.settings, levels: null, ungrouped: false, courts: null },
      plan: [],
    };
    const result = MatchTableContent.safeParse(none);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("分け方を1つ以上選んでください。");
    expect(result.error?.issues[0]?.path).toEqual(["settings", "levels"]);
  });

  it("レベル別と分けないの両方の組を持てる。選んでいない分け方の組は持てない（match-009）", () => {
    const content = sample();
    const both = {
      ...content,
      settings: { ...content.settings, ungrouped: true },
      plan: [
        ...content.plan,
        { key: "all", games: [{ players: ["a", "b", "c", "d"], done: true }] },
      ],
    };
    expect(MatchTableContent.safeParse(both).success).toBe(true);
    expect(matchGroupsOf(both.settings).map((group) => group.key)).toEqual([
      "advanced",
      "intermediate",
      "beginner",
      "novice",
      "all",
    ]);
    const onlyAll = { ...both, settings: { ...both.settings, levels: null }, plan: both.plan };
    expect(MatchTableContent.safeParse(onlyAll).success).toBe(false);
  });

  it("ミニゲームのチームは、コート数×2・同じ人は1つのチームまで・名簿にいる人だけ（match-009）", () => {
    const content = sample();
    const mini = (teams: string[][], courts: number | null = 1) => ({
      ...content,
      settings: { ...content.settings, courts },
      mini: { teams },
    });
    expect(
      MatchTableContent.safeParse(
        mini([
          ["a", "b"],
          ["c", "d"],
        ]),
      ).success,
    ).toBe(true);
    expect(MatchTableContent.safeParse(mini([["a", "b"], ["c"]])).success).toBe(true);
    expect(MatchTableContent.safeParse(mini([["a", "b", "c", "d"]])).success).toBe(false);
    expect(
      MatchTableContent.safeParse(
        mini([
          ["a", "b"],
          ["b", "c"],
        ]),
      ).success,
    ).toBe(false);
    expect(
      MatchTableContent.safeParse(
        mini([
          ["a", "z"],
          ["c", "d"],
        ]),
      ).success,
    ).toBe(false);
    expect(
      MatchTableContent.safeParse(
        mini(
          [
            ["a", "b"],
            ["c", "d"],
          ],
          null,
        ),
      ).success,
    ).toBe(false);
    expect(MatchTableContent.safeParse(mini([["a", "b"], []])).success).toBe(false);
  });

  it("前の形の設定（1試合の長さと試合の時間・分け方1つ）は、新しい形に直して読む（match-009）", () => {
    const content = sample();
    const legacy = (settings: Record<string, unknown>, plan = content.plan) =>
      MatchTableContent.parse({ ...content, settings, plan });
    expect(
      legacy({
        format: "doubles",
        grouping: "four",
        minutesPerGame: 15,
        startTime: "12:30",
        endTime: "14:30",
      }).settings,
    ).toEqual({ format: "doubles", gameCount: 8, levels: "four", ungrouped: false, courts: null });
    const ungrouped = MatchTableContent.parse({
      ...content,
      settings: {
        format: "doubles",
        grouping: "none",
        minutesPerGame: 20,
        startTime: "10:00",
        endTime: "10:10",
      },
      plan: [{ key: "all", games: [] }],
    });
    expect(ungrouped.settings).toEqual({
      format: "doubles",
      gameCount: 1,
      levels: null,
      ungrouped: true,
      courts: null,
    });
    expect(
      legacy(
        {
          format: "singles",
          grouping: "two",
          minutesPerGame: 5,
          startTime: "08:00",
          endTime: "20:00",
        },
        [],
      ).settings.gameCount,
    ).toBe(60);
  });

  it("作る入力は名前の前後の空白を消し、空なら誤りの文を返す", () => {
    const ok = MatchTableCreateInput.parse({
      name: "  練習会  ",
      playDate: "2026-12-13",
      deviceId: "device",
    });
    expect(ok.name).toBe("練習会");
    const empty = MatchTableCreateInput.safeParse({
      name: " ",
      playDate: "2026-12-13",
      deviceId: "device",
    });
    expect(empty.error?.issues[0]?.message).toBe("試合表の名前を入れてください。");
  });
});
