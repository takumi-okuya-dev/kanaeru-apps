// ほかの領域が、準備の画面（A4）に節を足す「差しこみの場所」（並行開発の決まり 3-1）。
// - 「持ち主と組織」のあとの節：registerSetupSection（booking の「使い方」。booking-001 research R13）
// 登録は、その領域の入口（index.ts）で1度だけ行う（features.list.ts が全部の入口を読むので、画面を描く前に済む）。
import type { EventView } from "@workspace/contracts/event";
import type * as React from "react";

/** 準備の画面の節。 */
export type SetupSection = {
  /** 節の ID（同じ ID をもう一度登録すると置きかえる） */
  id: string;
  /** 節の部品（交流会を受け取る。見出し h2 から始める） */
  Component: React.ComponentType<{ event: EventView }>;
};

const sections: SetupSection[] = [];

/**
 * 準備の画面に節を足す（主催者だけが見る画面。同じ ID は置きかえる）。
 * @param section 節
 */
export function registerSetupSection(section: SetupSection): void {
  const index = sections.findIndex((item) => item.id === section.id);
  if (index === -1) sections.push(section);
  else sections[index] = section;
}

/**
 * 準備の画面の節（登録した順）。
 * @returns 節の並び
 */
export function setupSectionList(): readonly SetupSection[] {
  return sections;
}
