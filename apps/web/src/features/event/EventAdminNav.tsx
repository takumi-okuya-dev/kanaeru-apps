// 交流会の管理の画面どうしの行き来（参加者・合計／困りごと〈主催者だけ〉／準備〈主催者だけ〉。research R9）。
// event・reception・survey の管理の画面の上に置く。項目は、その道が道の木に登録されているときだけ出す。
// 今の画面は aria-current="page"。受付係には主催者だけの項目を出さない（EXPERIENCE「隠す」）。
import type { EventRole } from "@workspace/contracts/event";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/cn";
import { availableAdminTabs } from "./admin-tabs.ts";
import { InternalLink, useRegisteredPaths } from "./navigation.tsx";

/** EventAdminNav が受け取るもの。 */
export type EventAdminNavProps = {
  /** 交流会の ID */
  eventId: string;
  /** 今の利用者の、この交流会での役目（useEvent の myRole） */
  role: EventRole;
};

/**
 * 交流会の管理の画面どうしの行き来。出す項目が1つ以下なら何も出さない。
 * @param props 交流会の ID（eventId）・役目（role）
 * @returns ナビの要素（項目が1つ以下なら null）
 */
export function EventAdminNav({ eventId, role }: EventAdminNavProps) {
  const registered = useRegisteredPaths();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const tabs = availableAdminTabs(role, registered);
  if (tabs.length <= 1) return null;
  return (
    <nav aria-label="交流会の管理">
      <ul className="flex flex-wrap gap-x3s border-b border-border">
        {tabs.map((tab) => {
          const href = tab.path(eventId);
          const current = pathname === href;
          return (
            <li key={tab.id}>
              <InternalLink
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-l items-center border-b-2 px-xs text-m text-text",
                  current ? "border-primary font-bold" : "border-transparent hover:bg-surface-over",
                )}
              >
                {tab.label}
              </InternalLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
