// 設定の項目の決め方（core-005）：まとまりの順に並べ、見えないアプリの項目と、運営者でない人への運営の項目を出さない。
// アプリの数や並びは書かない（並行開発の決まり 3-2）。項目は試しのもの。
import { describe, expect, it } from "vitest";
import { provideSettingsSections, settingsSections, visibleSettingsSections } from "./settings.ts";
import type { ResolvedSettingsSection } from "./settings.ts";

/** 試しの項目（アプリの項目は、試しのアプリ sample に属する）。 */
const SECTIONS: readonly ResolvedSettingsSection[] = [
  { id: "ledger", label: "台帳", to: "/settings/apps", group: "operator" },
  { id: "sample", label: "見本への接続", to: "/settings/sample", group: "app", appKey: "sample" },
  { id: "account", label: "アカウント", to: "/settings/account", group: "personal" },
];

/**
 * 出す項目の ID。
 * @param visibleAppKeys 見えるアプリの key（読む前は null）
 * @param isOperator 運営者か
 * @returns 項目の ID（並びの順）
 */
function ids(visibleAppKeys: string[] | null, isOperator: boolean): string[] {
  return visibleSettingsSections(SECTIONS, {
    visibleAppKeys: visibleAppKeys ? new Set(visibleAppKeys) : null,
    isOperator,
  }).map((section) => section.id);
}

describe("設定の項目", () => {
  it("個人の設定 → アプリの設定 → 運営 の順に並べる", () => {
    expect(ids(["sample"], true)).toEqual(["account", "sample", "ledger"]);
  });

  it("見えないアプリの項目は出さない（見えるアプリを読む前も出さない）", () => {
    expect(ids([], true)).toEqual(["account", "ledger"]);
    expect(ids(null, true)).toEqual(["account", "ledger"]);
  });

  it("運営のまとまりと operatorOnly の項目は、運営者にだけ出す", () => {
    expect(ids(["sample"], false)).toEqual(["account", "sample"]);
    const operatorOnly: ResolvedSettingsSection = {
      id: "secret",
      label: "運営者だけの個人の項目",
      to: "/settings/secret",
      group: "personal",
      operatorOnly: true,
    };
    const viewer = { visibleAppKeys: null, isOperator: false };
    expect(visibleSettingsSections([operatorOnly], viewer)).toEqual([]);
  });

  it("組み立てが渡した項目を、そのまま読める", () => {
    provideSettingsSections(SECTIONS);
    expect(settingsSections()).toBe(SECTIONS);
  });
});
