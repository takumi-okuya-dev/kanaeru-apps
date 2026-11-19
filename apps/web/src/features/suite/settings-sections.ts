// 設定の項目を、見る人で絞る（設定の一覧の画面が使う。外枠のナビは組み立てが同じ決め方で作る）。
import { settingsSections, visibleSettingsSections } from "../../lib/settings.ts";
import type { ResolvedSettingsSection } from "../../lib/settings.ts";
import { useVisibleApps } from "./queries.ts";

/**
 * 見る人に出す設定の項目（見えないアプリの項目・運営者でない人への運営の項目は出さない）。
 * @returns 出す項目（まとまりの順）
 */
export function useVisibleSettingsSections(): ResolvedSettingsSection[] {
  const { status, apps, isOperator } = useVisibleApps();
  return visibleSettingsSections(settingsSections(), {
    visibleAppKeys: status === "success" ? new Set(apps.map((app) => app.key)) : null,
    isOperator,
  });
}
