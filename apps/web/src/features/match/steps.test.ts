// 名簿と設定の手順（rosterSteps。match-011）のテスト：名簿・組み合わせ・ミニゲームのチームから、今の手順と済んだ手順を決める。
import { INITIAL_CONTENT } from "@workspace/contracts/match";
import type { MatchPlayer, MatchTableContent } from "@workspace/contracts/match";
import { describe, expect, it } from "vitest";
import { rosterSteps } from "./steps.ts";

/**
 * 名簿の人を作る。
 * @param id ID
 * @param level レベル
 * @returns 名簿の人
 */
function player(id: string, level: MatchPlayer["level"] = "advanced"): MatchPlayer {
  return { id, nickname: id, level, status: "present" };
}

/** 4人の名簿の中身。 */
const withPlayers: MatchTableContent = {
  ...INITIAL_CONTENT,
  players: ["a", "b", "c", "d"].map((id) => player(id)),
};

describe("名簿と設定の手順", () => {
  it("名簿がなければ①が今で、②③はまだ", () => {
    expect(rosterSteps(INITIAL_CONTENT)).toEqual({
      current: "roster",
      done: [],
      noLevel: 0,
    });
  });

  it("名簿があって組んでいなければ①は済み・②が今", () => {
    expect(rosterSteps(withPlayers)).toEqual({ current: "settings", done: ["roster"], noLevel: 0 });
  });

  it("組み合わせかミニゲームのチームがあれば③まで済み", () => {
    const planned: MatchTableContent = {
      ...withPlayers,
      plan: [{ key: "advanced", games: [{ players: ["a", "b", "c", "d"], done: false }] }],
    };
    expect(rosterSteps(planned)).toEqual({
      current: null,
      done: ["roster", "settings", "build"],
      noLevel: 0,
    });
    const mini: MatchTableContent = {
      ...withPlayers,
      settings: { ...withPlayers.settings, levels: null, courts: 1 },
      mini: {
        teams: [
          ["a", "b"],
          ["c", "d"],
        ],
      },
    };
    expect(rosterSteps(mini).current).toBeNull();
    // 組み合わせの行があっても、試合が1つもなければ組んでいない
    const empty: MatchTableContent = { ...withPlayers, plan: [{ key: "advanced", games: [] }] };
    expect(rosterSteps(empty).current).toBe("settings");
  });

  it("名簿を消すと①が今に戻り、レベルを選んでいない人を数える", () => {
    const noRoster: MatchTableContent = {
      ...INITIAL_CONTENT,
      plan: [{ key: "advanced", games: [] }],
    };
    expect(rosterSteps(noRoster).current).toBe("roster");
    const someNoLevel: MatchTableContent = {
      ...withPlayers,
      players: [...withPlayers.players, player("e", null), player("f", null)],
    };
    expect(rosterSteps(someNoLevel).noLevel).toBe(2);
  });
});
