// 交流会の管理の画面どうしの行き来の項目（外枠のナビ〈nav-items.ts〉と交流会の一覧の行き先が使う。research R9・core-003）。
// 道の形は @workspace/contracts/event の ADMIN_ROUTE_PATTERNS。項目は、その道が道の木に登録されているときだけ出す
// （reception・survey が道を足すと、event を直さずに出る。並行開発の決まり 3-1 の差しこみの場所）。
import { ADMIN_ROUTE_PATTERNS, adminPaths } from "@workspace/contracts/event";
import type { EventRole } from "@workspace/contracts/event";
import type { NavIcon } from "../../lib/feature.ts";

/** 管理の画面の行き来の項目。 */
export type EventAdminTab = {
  /** 項目の ID */
  id: "reception" | "concerns" | "setup";
  /** 見える名前 */
  label: string;
  /** ナビのアイコン */
  icon: NavIcon;
  /** 道の形（TanStack Router の path） */
  pattern: string;
  /** 値を入れた道を作る */
  path: (eventId: string) => string;
  /** 見られる役目 */
  roles: readonly EventRole[];
};

/** 管理の画面の行き来の項目（並びの順。EXPERIENCE.md の A3 のタブと A4）。 */
export const EVENT_ADMIN_TABS: readonly EventAdminTab[] = [
  {
    id: "reception",
    label: "参加者・合計",
    icon: "people",
    pattern: ADMIN_ROUTE_PATTERNS.eventReception,
    path: adminPaths.eventReception,
    roles: ["organizer", "staff"],
  },
  {
    id: "concerns",
    label: "困りごと",
    icon: "concerns",
    pattern: ADMIN_ROUTE_PATTERNS.eventConcerns,
    path: adminPaths.eventConcerns,
    roles: ["organizer"],
  },
  {
    id: "setup",
    label: "準備",
    icon: "setup",
    pattern: ADMIN_ROUTE_PATTERNS.eventSetup,
    path: adminPaths.eventSetup,
    roles: ["organizer"],
  },
];

/**
 * その役目で出す項目（道が登録されているものだけ）。
 * @param role 今の利用者の役目
 * @param registered 道の木に登録されている道の形
 * @returns 出す項目（並びの順）
 */
export function availableAdminTabs(
  role: EventRole,
  registered: ReadonlySet<string>,
): EventAdminTab[] {
  return EVENT_ADMIN_TABS.filter((tab) => tab.roles.includes(role) && registered.has(tab.pattern));
}

/**
 * 交流会を選んだときの行き先（その役目で出す最初の項目）。
 * @param eventId 交流会の ID
 * @param role 今の利用者の役目
 * @param registered 道の木に登録されている道の形
 * @returns 行き先の道（出す項目がなければ undefined）
 */
export function firstAdminPath(
  eventId: string,
  role: EventRole,
  registered: ReadonlySet<string>,
): string | undefined {
  return availableAdminTabs(role, registered)[0]?.path(eventId);
}
