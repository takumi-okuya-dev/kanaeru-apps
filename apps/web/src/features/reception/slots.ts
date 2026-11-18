// ほかの領域（survey）が、受付の画面に節を足す「差しこみの場所」（並行開発の決まり 3-1。research R10）。
// - A5（書き出しと削除）の節：registerEventDataSection（survey の「困りごとをCSVで書き出す」）
// - A3 の直す枠の節：registerCheckinPanelSection（主催者が手でのチェックインを開いたときだけ出す。survey の「アンケートの回答を入れる」）
// 登録は、その領域の入口（index.ts）で1度だけ行う（features.list.ts が全部の入口を読むので、画面を描く前に済む）。
import type { EventView } from "@workspace/contracts/event";
import type { CheckinView } from "@workspace/contracts/reception";
import type * as React from "react";

/** A5 の節。 */
export type EventDataSection = {
  /** 節の ID（同じ ID をもう一度登録すると置きかえる） */
  id: string;
  /** 節の部品（交流会を受け取る。見出し h2 から始める） */
  Component: React.ComponentType<{ event: EventView }>;
};

/** A3 の直す枠の節。 */
export type CheckinPanelSection = {
  /** 節の ID（同じ ID をもう一度登録すると置きかえる） */
  id: string;
  /** 節の部品（交流会と、開いた手でのチェックインを受け取る） */
  Component: React.ComponentType<{ event: EventView; checkin: CheckinView }>;
};

const dataSections: EventDataSection[] = [];
const panelSections: CheckinPanelSection[] = [];

/**
 * 並びに足す（同じ ID は置きかえる）。
 * @param list 並び
 * @param section 足すもの
 */
function upsert<T extends { id: string }>(list: T[], section: T): void {
  const index = list.findIndex((item) => item.id === section.id);
  if (index === -1) list.push(section);
  else list[index] = section;
}

/**
 * A5（書き出しと削除）に節を足す（主催者だけが見る画面）。
 * @param section 節
 */
export function registerEventDataSection(section: EventDataSection): void {
  upsert(dataSections, section);
}

/**
 * A3 の直す枠に節を足す（主催者が、手でのチェックインを開いたときだけ出す）。
 * @param section 節
 */
export function registerCheckinPanelSection(section: CheckinPanelSection): void {
  upsert(panelSections, section);
}

/**
 * A5 の節（登録した順）。
 * @returns 節の並び
 */
export function eventDataSections(): readonly EventDataSection[] {
  return dataSections;
}

/**
 * A3 の直す枠の節（登録した順）。
 * @returns 節の並び
 */
export function checkinPanelSections(): readonly CheckinPanelSection[] {
  return panelSections;
}
