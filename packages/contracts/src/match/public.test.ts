// 見るだけのページと受付の形（match-004）：受付の入力は呼び名とレベルだけ（strict）・受付から入れた人の ID は名簿の ID の形。
import { describe, expect, it } from "vitest";
import {
  INITIAL_CONTENT,
  MatchJoinInput,
  MatchTableContent,
  MatchView,
  joinPlayerId,
} from "./index.ts";

describe("受付の入力", () => {
  it("呼び名（前後の空白を除いて1〜20文字）とレベルだけを受ける", () => {
    expect(MatchJoinInput.parse({ nickname: " 石川 ", level: "novice" })).toEqual({
      nickname: "石川",
      level: "novice",
    });
    for (const bad of [
      { nickname: "石川", level: "novice", fullName: "石川 海" },
      { nickname: "", level: "novice" },
      { nickname: "あ".repeat(21), level: "novice" },
      { nickname: "石川", level: "pro" },
      { nickname: "石\u202e川", level: "novice" },
      { nickname: "石\u0007川", level: "novice" },
    ]) {
      expect(MatchJoinInput.safeParse(bad).success).toBe(false);
    }
  });
});

describe("受付から入れた人の ID", () => {
  it("名簿の人の ID の形（英小文字と数字の16文字）で、受付ごとに違う", () => {
    const a = joinPlayerId("0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b");
    const b = joinPlayerId("0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c");
    expect(a).toBe("ja9b0c1d2e3f4a5b");
    expect(a).toMatch(/^[a-z0-9]{16}$/u);
    expect(a).not.toBe(b);
    const content = {
      ...INITIAL_CONTENT,
      players: [{ id: a, nickname: "石川", level: "novice" as const, status: "present" as const }],
    };
    expect(MatchTableContent.safeParse(content).success).toBe(true);
  });
});

describe("見るだけのページの答え（match-009）", () => {
  it("ミニゲームのチームの呼び名を持て、端末に残した前の答え（1試合の長さあり）も読める", () => {
    const base = {
      name: "練習会",
      playDate: "2026-12-13",
      version: 3,
      groups: [{ key: "all", label: "全員", games: [] }],
      updatedAt: "2026-12-13T03:00:00.000Z",
      expiresAt: "2026-12-13T15:00:00.000Z",
    };
    const withTeams = MatchView.parse({ ...base, teams: [["石川"], ["森"]] });
    expect(withTeams.teams).toEqual([["石川"], ["森"]]);
    const legacy = MatchView.parse({ ...base, minutesPerGame: 15 });
    expect(legacy).not.toHaveProperty("minutesPerGame");
    expect(legacy.teams).toBeUndefined();
  });
});
