// 名簿の直し（roster-edit.ts）のテスト：名簿を置きかえると、前の名簿の人で組んだ記録（組み合わせ・前の分け方で終わった試合）を
// 外し、約束の形のまま保存できる。後ろに足すだけなら記録を残す。
import { INITIAL_CONTENT, MatchTableContent } from "@workspace/contracts/match";
import type { MatchPlayer } from "@workspace/contracts/match";
import { describe, expect, it } from "vitest";
import { importPeople } from "./roster-edit.ts";

/**
 * 前の分け方で終わった試合のある中身（4人・上級）。
 * @returns 中身
 */
function withArchive(): MatchTableContent {
  const players = ["a", "b", "c", "d"].map((id): MatchPlayer => ({
    id,
    nickname: id,
    level: "advanced",
    status: "present",
  }));
  return {
    ...INITIAL_CONTENT,
    players,
    plan: [{ key: "advanced", games: [{ players: ["a", "b", "c", "d"], done: false }] }],
    archive: [{ key: "all", games: [{ players: ["a", "b", "c", "d"], done: true }] }],
  };
}

/** 入れる人。 */
const PEOPLE = [{ fullName: "新 人", nickname: "新", level: "novice" as const, nameCheck: false }];

describe("名簿を入れる", () => {
  it("置きかえると、組み合わせと前の分け方で終わった試合を外し、約束の形のまま", () => {
    const { content } = importPeople(withArchive(), PEOPLE, "replace");
    expect(content.plan).toEqual([]);
    expect(content.archive).toBeUndefined();
    expect(MatchTableContent.safeParse(content).success).toBe(true);
  });

  it("後ろに足すだけなら、組み合わせと前の分け方で終わった試合を残す", () => {
    const before = withArchive();
    const { content } = importPeople(before, PEOPLE, "append");
    expect(content.plan).toEqual(before.plan);
    expect(content.archive).toEqual(before.archive);
    expect(MatchTableContent.safeParse(content).success).toBe(true);
  });
});
