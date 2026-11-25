// 道の組み立て：features.list.ts の領域のナビの項目と道が、つながっている（領域の数や並びは書かない。並行開発の決まり 3-2）。
// 外枠の形：参加者が開く道はどれもナビなし（"bare"）、管理の道はどれもナビあり（core-003）。
// アプリの登録（core-005・AD-15）：画面の領域は、どれもちょうど1つのアプリか、スイートの共通に属する。
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  PARTICIPANT_ROUTE_PATTERNS,
  appOfDomain,
  listApps,
  unassignedDomains,
} from "@workspace/contracts/core";
import { ADMIN_ROUTE_PATTERNS } from "@workspace/contracts/event";
import { startPathOf } from "./lib/apps.ts";
import type { WebFeature } from "./lib/feature.ts";
import { createAppRouter, navItems, registeredFeatures, settingsSectionList } from "./router.tsx";

describe("道の組み立て", () => {
  it("ナビの項目は、nav を持つ領域の数と同じで、どれも道の木にある", () => {
    expect(navItems.length).toBe(
      registeredFeatures.filter((feature: WebFeature) => feature.nav).length,
    );
    const router = createAppRouter(new QueryClient());
    const paths = new Set(Object.keys(router.routesByPath));
    for (const item of navItems) expect(paths, item.to).toContain(item.to);
  });

  it("領域の ID は重ならない", () => {
    const ids = registeredFeatures.map((feature: { id: string }) => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("参加者が開く道（登録されたもの）はどれもナビなし、管理の道はどれもナビなしでない", () => {
    const router = createAppRouter(new QueryClient());
    const layoutOf = (path: string) =>
      (router.routesByPath as Record<string, { options: { staticData?: { layout?: string } } }>)[
        path
      ]?.options.staticData?.layout;
    const registered = new Set(Object.keys(router.routesByPath));
    for (const path of Object.values(PARTICIPANT_ROUTE_PATTERNS).filter((p) => registered.has(p))) {
      expect(layoutOf(path), path).toBe("bare");
    }
    for (const path of Object.values(ADMIN_ROUTE_PATTERNS).filter((p) => registered.has(p))) {
      expect(layoutOf(path), path).not.toBe("bare");
    }
  });

  it("画面の領域は、どれもちょうど1つのアプリか、スイートの共通に属する", () => {
    expect(unassignedDomains(registeredFeatures.map((feature: WebFeature) => feature.id))).toEqual(
      [],
    );
  });

  it("アプリを開いたときの道は、道の木にある", () => {
    const router = createAppRouter(new QueryClient());
    const paths = new Set(Object.keys(router.routesByPath));
    for (const app of listApps()) expect(paths, app.key).toContain(startPathOf(app));
  });

  it("設定の項目は、どれも道の木にあり、アプリの領域の項目には属するアプリが付く", () => {
    const router = createAppRouter(new QueryClient());
    const paths = new Set(Object.keys(router.routesByPath));
    for (const feature of registeredFeatures as readonly WebFeature[]) {
      for (const section of feature.settings ?? []) {
        expect(paths, section.to).toContain(section.to);
        const resolved = settingsSectionList.find((item) => item.id === section.id);
        expect(resolved?.appKey).toBe(appOfDomain(feature.id)?.key);
      }
    }
  });
});
