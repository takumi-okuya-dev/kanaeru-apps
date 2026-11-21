// 見るだけのページと受付の形（match-004）：受付の入力は呼び名とレベルだけ（strict）・受付から入れた人の ID は名簿の ID の形。
import { describe, expect, it } from "vitest";
import { INITIAL_CONTENT, MatchJoinInput, MatchTableContent, joinPlayerId } from "./index.ts";

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
