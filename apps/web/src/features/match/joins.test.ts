// QR の受付を名簿に入れる（joins.ts。match-004）：まだの受付だけを入れ、二度入れない・人数の上限・受付の ID を引く。
import { INITIAL_CONTENT, ROSTER_MAX, joinPlayerId } from "@workspace/contracts/match";
import type { MatchJoinEntry, MatchTableContent } from "@workspace/contracts/match";
import { describe, expect, it } from "vitest";
import { importJoins, joinIdOfPlayer, pendingJoins } from "./joins.ts";

/**
 * 受付の行を作る。
 * @param index 番号
 * @returns 受付の行
 */
function entry(index: number): MatchJoinEntry {
  return {
    id: `0199a1b2-c3d4-7e5f-8a9b-${String(index).padStart(12, "0")}`,
    nickname: `人${index}`,
    level: "beginner",
    createdAt: "2026-12-13T03:00:00.000Z",
    duplicate: false,
  };
}

describe("受付を名簿に入れる", () => {
  it("まだの受付だけを「来る」で入れ、二度入れない", () => {
    const joins = [entry(1), entry(2)];
    const first = importJoins(INITIAL_CONTENT, joins);
    expect(first.added).toBe(2);
    expect(first.content.players.map((player) => [player.nickname, player.status])).toEqual([
      ["人1", "present"],
      ["人2", "present"],
    ]);
    expect(pendingJoins(first.content, [...joins, entry(3)])).toEqual([entry(3)]);
    const again = importJoins(first.content, joins);
    expect(again.added).toBe(0);
    expect(again.content).toBe(first.content);
    expect(joinIdOfPlayer(joinPlayerId(entry(2).id), joins)).toBe(entry(2).id);
    expect(joinIdOfPlayer("abc", joins)).toBeUndefined();
  });

  it("名簿の上限を超える分は入れない", () => {
    const content: MatchTableContent = {
      ...INITIAL_CONTENT,
      players: Array.from({ length: ROSTER_MAX - 1 }, (_, index) => ({
        id: `p${index}`,
        nickname: `名${index}`,
        level: "advanced" as const,
        status: "present" as const,
      })),
    };
    expect(importJoins(content, [entry(1), entry(2)]).added).toBe(1);
  });
});
