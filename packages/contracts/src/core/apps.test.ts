// アプリの登録（AD-15）：登録されたアプリが決まりに合い、決まりの確かめが合わない一覧を見つけること。
// アプリの数や並びは書かない（並行開発の決まり 3-2）。
import { describe, expect, it } from "vitest";
import type { AppDefinition } from "./app-definition.ts";
import {
  APP_KEY_FORMAT,
  COMMON_DOMAINS,
  RESERVED_APP_KEYS,
  appOfDomain,
  appRegistryProblems,
  listApps,
  unassignedDomains,
} from "./apps.ts";

/**
 * 試しのアプリの定義。
 * @param overrides 替える値
 * @returns アプリの定義
 */
function app(overrides: Partial<AppDefinition>): AppDefinition {
  return {
    key: "sample",
    name: "見本",
    summary: "見本のアプリ",
    description: "見本のアプリです。",
    icon: "list",
    domains: ["sample"],
    basePath: "/sample",
    uses: [],
    accountData: "見本の記録",
    ...overrides,
  };
}

describe("登録されたアプリ", () => {
  it("1つ以上あり、決まり（key の形・一意・予約語でない・領域は1つのアプリだけ）に合う", () => {
    expect(listApps().length).toBeGreaterThan(0);
    expect(appRegistryProblems(listApps())).toEqual([]);
    for (const registered of listApps()) {
      expect(registered.key).toMatch(APP_KEY_FORMAT);
      expect(RESERVED_APP_KEYS).not.toContain(registered.key);
      expect(registered.name.length).toBeGreaterThan(0);
    }
  });

  it("領域から、属するアプリを引ける。共通の領域はどのアプリにも属さない", () => {
    for (const registered of listApps()) {
      for (const domain of registered.domains)
        expect(appOfDomain(domain)?.key).toBe(registered.key);
    }
    for (const domain of COMMON_DOMAINS) expect(appOfDomain(domain)).toBeUndefined();
  });
});

describe("登録の決まりの確かめ", () => {
  it("key の重なり・予約語・形の違いを見つける", () => {
    expect(appRegistryProblems([app({}), app({ domains: ["other"], basePath: "/other" })])).toEqual(
      ["key が重なっています：sample"],
    );
    expect(appRegistryProblems([app({ key: "settings", basePath: "/settings" })])).toEqual([
      "key が予約語です：settings",
    ]);
    expect(appRegistryProblems([app({ key: "Sample" })])).toEqual(["key の形が合いません：Sample"]);
  });

  it("2つのアプリに属する領域・共通の領域・重なった道の頭・登録されていない使ってよいアプリを見つける", () => {
    expect(appRegistryProblems([app({}), app({ key: "second", basePath: "/second" })])).toEqual([
      "領域 sample が2つのアプリに属しています：sample・second",
    ]);
    expect(appRegistryProblems([app({ domains: ["account"] })])).toEqual([
      "共通の領域はアプリに入れられません：sample の account",
    ]);
    expect(appRegistryProblems([app({}), app({ key: "second", domains: ["second"] })])).toEqual([
      "道の頭が重なっています：/sample",
    ]);
    expect(appRegistryProblems([app({ uses: ["missing"] })])).toEqual([
      "使ってよいアプリが登録されていません：sample の missing",
    ]);
  });

  it("どのアプリにも属さない領域を見つける（共通の領域は属さなくてよい）", () => {
    const apps = [app({})];
    expect(unassignedDomains(["sample", ...COMMON_DOMAINS], apps)).toEqual([]);
    expect(unassignedDomains(["sample", "threads"], apps)).toEqual(["threads"]);
  });
});
