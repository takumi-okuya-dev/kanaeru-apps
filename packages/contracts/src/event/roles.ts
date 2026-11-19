// 交流会ごとの役目（構成の決めごと AD-5：主催者か・交流会ごとの受付係か）。zod を読まない。

/** 交流会ごとの役目の並び。 */
export const EVENT_ROLES = ["organizer", "staff"] as const;

/** 交流会ごとの役目（主催者・受付係）。どちらでもないときは null で表す。 */
export type EventRole = (typeof EVENT_ROLES)[number];

/** 役目の画面の言葉（PRD 3章の用語集）。 */
export const EVENT_ROLE_LABELS = {
  organizer: "主催者",
  staff: "受付係",
} as const satisfies Record<EventRole, string>;
