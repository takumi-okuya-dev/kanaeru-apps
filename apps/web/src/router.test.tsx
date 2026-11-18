// 道の組み立て：features.list.ts の領域のナビの項目と道が、つながっている（領域の数や並びは書かない。並行開発の決まり 3-2）。
import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { WebFeature } from "./lib/feature.ts";
import { createAppRouter, navItems, registeredFeatures } from "./router.tsx";

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
});
