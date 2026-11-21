// 設定の一覧（/settings。core-005）。どのアプリにも属さない外枠の画面で、まとまり（個人の設定・アプリの設定・運営）ごとに項目を並べる。
// スマホは、この画面から各項目へ入る（PC はサイドバーにも同じ項目が出る）。見えないアプリの項目・運営者でない人への運営の項目は出さない。
import { Link } from "@tanstack/react-router";
import { Icon } from "../../lib/icon.tsx";
import { Page } from "../../lib/page.tsx";
import { SETTINGS_GROUPS, SETTINGS_GROUP_LABELS } from "../../lib/settings.ts";
import { useVisibleSettingsSections } from "./settings-sections.ts";

/**
 * 設定の一覧の画面。
 * @returns 画面の要素
 */
export function SettingsIndexPage() {
  const sections = useVisibleSettingsSections();
  return (
    <Page title="全体の設定" lead="どのアプリでも共通の設定と、アプリごとの設定です。">
      {SETTINGS_GROUPS.map((group) => {
        const items = sections.filter((section) => section.group === group);
        if (items.length === 0) return null;
        const headingId = `settings-group-${group}`;
        return (
          <section key={group} aria-labelledby={headingId} className="flex flex-col gap-xxs">
            <h2 id={headingId} className="text-m leading-tight font-bold text-text-sub">
              {SETTINGS_GROUP_LABELS[group]}
            </h2>
            <ul className="flex flex-col rounded-md border border-border bg-surface">
              {items.map((item) => (
                <li key={item.id} className="border-b border-border last:border-b-0">
                  <Link
                    to={item.to}
                    className="flex min-h-xxl items-center justify-between gap-xs px-xs text-m text-text hover:bg-surface-over"
                  >
                    <span className="flex items-center gap-xxs">
                      <Icon name={item.icon ?? "list"} />
                      {item.label}
                    </span>
                    <Icon name="chevron" className="text-text-sub" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Page>
  );
}
