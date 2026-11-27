// 名簿と設定の手順（① 名簿を入れる → ② 分け方と試合の数を選ぶ → ③ 試合表を作る。match-011）。状態を持たない関数だけ。
// はじめての運営が、次にすることを画面だけで知るため（説明の文書やツアーに頼らない。持ち主が決めた）。
import type { MatchTableContent } from "@workspace/contracts/match";

/** 手順の code（並びは画面の順）。 */
export const ROSTER_STEPS = ["roster", "settings", "build"] as const;

/** 手順。 */
export type RosterStep = (typeof ROSTER_STEPS)[number];

/** 手順の画面の言葉。 */
export const ROSTER_STEP_LABELS = {
  roster: "名簿を入れる",
  settings: "分け方と試合の数を選ぶ",
  build: "試合表を作る",
} as const satisfies Record<RosterStep, string>;

/** 手順の状態。 */
export type RosterStepsState = {
  /** 今やる手順（みな済んでいれば null） */
  current: RosterStep | null;
  /** 済んだ手順（画面の順） */
  done: RosterStep[];
  /** 来る人のうち、レベルを選んでいない人の数（試合に入らない） */
  noLevel: number;
};

/**
 * 中身から、手順の状態を決める（名簿に人がいなければ①、組んでいなければ②、組み合わせかミニゲームのチームがあればみな済み）。
 * @param content 試合表の中身
 * @returns 手順の状態
 */
export function rosterSteps(content: MatchTableContent): RosterStepsState {
  const noLevel = content.players.filter(
    (player) => player.status === "present" && player.level === null,
  ).length;
  if (content.players.length === 0) return { current: "roster", done: [], noLevel };
  const built = content.plan.some((plan) => plan.games.length > 0) || content.mini !== undefined;
  if (!built) return { current: "settings", done: ["roster"], noLevel };
  return { current: null, done: [...ROSTER_STEPS], noLevel };
}
