// 試合表の約束の選択肢：code と言葉がそろう。
import { describe, expect, it } from "vitest";
import { MATCH_LEVELS, MATCH_LEVEL_LABELS } from "./index.ts";

describe("試合表の選択肢", () => {
  it("どのレベルにも言葉がある（並びと言葉の鍵がそろう）", () => {
    expect(Object.keys(MATCH_LEVEL_LABELS)).toEqual([...MATCH_LEVELS]);
  });
});
