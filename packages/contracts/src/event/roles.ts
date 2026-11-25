// 交流会ごとの役目（構成の決めごと AD-5：主催者・受付係・部員）。zod を読まない。
// 交流会の答えの myRole は主催者か受付係（EventRole）。判定の関数は部員も返す（EventAccessRole。event-002 research R4）。

/** 交流会ごとの役目の並び。 */
export const EVENT_ROLES = ["organizer", "staff"] as const;

/** 交流会ごとの役目（主催者・受付係）。どちらでもないときは null で表す。 */
export type EventRole = (typeof EVENT_ROLES)[number];

/** 役目の画面の言葉（PRD 3章の用語集）。 */
export const EVENT_ROLE_LABELS = {
  organizer: "主催者",
  staff: "受付係",
} as const satisfies Record<EventRole, string>;

/** 判定の関数が返す役目の並び（部員は、交流会を入れた組織のメンバー。この版では管理の画面を使えない）。 */
export const EVENT_ACCESS_ROLES = ["organizer", "staff", "member"] as const;

/** 判定の関数が返す役目（主催者・受付係・部員）。どれでもないときは null で表す。 */
export type EventAccessRole = (typeof EVENT_ACCESS_ROLES)[number];

/** 判定の役目の画面の言葉（PRD 受付アプリの予約 3章の用語集）。 */
export const EVENT_ACCESS_ROLE_LABELS = {
  ...EVENT_ROLE_LABELS,
  member: "部員",
} as const satisfies Record<EventAccessRole, string>;
