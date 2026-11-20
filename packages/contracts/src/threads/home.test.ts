// ホームの次にやること（threads-012。めぐるの nextStep と同じ順）。
import { describe, expect, it } from "vitest";
import { homeNextStep } from "./home.ts";
import type { AccountHome } from "./home.ts";

/**
 * 材料の数を作る。
 * @param values 変える値
 * @returns 材料の数
 */
function home(
  values: { filled?: number; promotions?: number; references?: number } = {},
): AccountHome {
  return {
    strategy: { filledCount: values.filled ?? 0, total: 26 },
    promotions: { totalCount: values.promotions ?? 0, targetableCount: values.promotions ?? 0 },
    research: { referencePostCount: values.references ?? 0, keywordCount: 0 },
  };
}

describe("homeNextStep", () => {
  const disconnected = { connected: false, approvedCount: 0 };

  it("戦略 → 宣伝 → リサーチ → 案を作るの順に案内する", () => {
    expect(homeNextStep(home(), disconnected).target).toBe("strategy");
    expect(homeNextStep(home({ filled: 1 }), disconnected).target).toBe("promotions");
    expect(homeNextStep(home({ filled: 1, promotions: 1 }), disconnected).target).toBe("research");
    expect(
      homeNextStep(home({ filled: 1, promotions: 1, references: 1 }), disconnected).target,
    ).toBe("create");
  });

  it("未接続で承認済みの案があれば、まずつなぐ", () => {
    expect(homeNextStep(home(), { connected: false, approvedCount: 1 }).target).toBe("connect");
    expect(homeNextStep(home(), { connected: true, approvedCount: 1 }).target).toBe("strategy");
  });
});
