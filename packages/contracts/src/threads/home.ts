// 運用アカウントのホーム（threads-012。めぐるの pages/account-home.tsx の「次にやること」と材料の3枚のカード）の形と、
// 次にやることを決める計算（API と画面が同じものを使う）。
import { z } from "zod";

/** ホームの材料の数。 */
export const AccountHome = z.object({
  /** 戦略（課題）の入れた数と、数える項目の数 */
  strategy: z.object({ filledCount: z.number().int(), total: z.number().int() }),
  /** 宣伝の数（全部と、宣伝の対象〈宣伝中で期限内〉） */
  promotions: z.object({ totalCount: z.number().int(), targetableCount: z.number().int() }),
  /** リサーチの数（参考の投稿とキーワード） */
  research: z.object({
    referencePostCount: z.number().int(),
    keywordCount: z.number().int(),
  }),
});

/** ホームの材料の数の型。 */
export type AccountHome = z.infer<typeof AccountHome>;

/** 次にやることの行き先（strategy・promotions・research は材料の画面、create は案を作る、connect は Threads への接続）。 */
export type HomeStepTarget = "strategy" | "promotions" | "research" | "create" | "connect";

/** 次にやること。 */
export type HomeStep = {
  /** 行き先 */
  target: HomeStepTarget;
  /** 見出し */
  title: string;
  /** 説明 */
  body: string;
};

/**
 * 次にやることを決める（めぐるの nextStep。上から順に、最初に当てはまるもの）。
 * 未接続で承認済みの案があれば、まず Threads につなぐ。戦略が空なら課題、宣伝がなければ宣伝、参考の投稿がなければリサーチ、
 * そろっていれば案を作る。
 * @param home 材料の数
 * @param state 接続の状態と承認済みの案の数
 * @param state.connected Threads につないでいるか（接続し直しが要る状態も、つないだことがあるので含む）
 * @param state.approvedCount 承認済みの案の数（投稿中を含む）
 * @returns 次にやること
 */
export function homeNextStep(
  home: AccountHome,
  state: { connected: boolean; approvedCount: number },
): HomeStep {
  if (!state.connected && state.approvedCount > 0) {
    return {
      target: "connect",
      title: "Threads につないで、自動の投稿を始めましょう",
      body: "承認した案は、Threads につないで自動の投稿をオンにすると投稿されます。",
    };
  }
  if (home.strategy.filledCount === 0) {
    return {
      target: "strategy",
      title: "まずは「戦略」から埋めましょう",
      body: "だれに何を届けるかを決めておくと、投稿の向きが定まります。",
    };
  }
  if (home.promotions.totalCount === 0) {
    return {
      target: "promotions",
      title: "次は「宣伝」を足しましょう",
      body: "案内したいイベントやサービスがあれば足します（なくても投稿は作れます）。",
    };
  }
  if (home.research.referencePostCount === 0) {
    return {
      target: "research",
      title: "次は「リサーチ」がおすすめです",
      body: "Threads で伸びている投稿を残しておくと、案の質が上がります。",
    };
  }
  return {
    target: "create",
    title: "投稿の案を作りましょう",
    body: "プロンプトを ChatGPT や Claude に貼り、返ってきた答えを貼り戻して、投稿の案にためます。",
  };
}
