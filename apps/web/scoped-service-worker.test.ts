// 道の範囲を絞った Service Worker の plugin（core-015）：持つファイルの選び方・印の埋め方・版の印。
import { describe, expect, it } from "vitest";
import { fillServiceWorker, precachePaths, serviceWorkerVersion } from "./scoped-service-worker.ts";
import type { BundleAsset, BundleChunk } from "./scoped-service-worker.ts";

/**
 * 束をまねて作る。
 * @param fileName ファイルの名前
 * @param extra ほかの値
 * @returns 束
 */
function chunk(fileName: string, extra: Partial<BundleChunk> = {}): BundleChunk {
  return {
    type: "chunk",
    fileName,
    isEntry: false,
    isDynamicEntry: false,
    imports: [],
    dynamicImports: [],
    moduleIds: [],
    ...extra,
  };
}

const isMatch = (id: string) => id.includes("/src/features/match/");

/** 入口・共通の束・試合表の画面・ほかのアプリの画面・試合表だけが開いたときに読む道具。 */
const bundle: Record<string, BundleChunk | BundleAsset> = {
  "assets/index-a.js": chunk("assets/index-a.js", {
    isEntry: true,
    imports: ["assets/react-b.js"],
    dynamicImports: ["assets/BoardPage-c.js", "assets/EventPage-d.js"],
    moduleIds: ["/app/src/main.tsx", "/app/src/features/match/routes.ts"],
    viteMetadata: { importedCss: new Set(["assets/index-a.css"]), importedAssets: new Set() },
  }),
  "assets/react-b.js": chunk("assets/react-b.js"),
  "assets/BoardPage-c.js": chunk("assets/BoardPage-c.js", {
    isDynamicEntry: true,
    imports: ["assets/api-e.js", "assets/react-b.js"],
    dynamicImports: ["assets/jsqr-f.js"],
    moduleIds: ["/app/src/features/match/BoardPage.tsx"],
    viteMetadata: { importedCss: new Set(["assets/BoardPage-c.css"]), importedAssets: new Set() },
  }),
  "assets/EventPage-d.js": chunk("assets/EventPage-d.js", {
    isDynamicEntry: true,
    imports: ["assets/event-only-g.js"],
    moduleIds: ["/app/src/features/event/EventPage.tsx"],
  }),
  "assets/api-e.js": chunk("assets/api-e.js"),
  "assets/jsqr-f.js": chunk("assets/jsqr-f.js", {
    isDynamicEntry: true,
    moduleIds: ["/app/node_modules/jsqr/dist/jsQR.js"],
  }),
  "assets/event-only-g.js": chunk("assets/event-only-g.js"),
  "index.html": { type: "asset", fileName: "index.html", source: "<html></html>" },
};

describe("precachePaths", () => {
  it("入口と試合表の画面の束（とその読み込み・CSS）を持ち、ほかのアプリの画面を持たない", () => {
    expect(precachePaths(bundle, isMatch)).toEqual([
      "/index.html",
      "/assets/BoardPage-c.css",
      "/assets/BoardPage-c.js",
      "/assets/api-e.js",
      "/assets/index-a.css",
      "/assets/index-a.js",
      "/assets/jsqr-f.js",
      "/assets/react-b.js",
    ]);
  });

  it("範囲の画面がなければ、入口とその静かな読み込みだけ", () => {
    expect(precachePaths(bundle, () => false)).toEqual([
      "/index.html",
      "/assets/index-a.css",
      "/assets/index-a.js",
      "/assets/react-b.js",
    ]);
  });
});

describe("fillServiceWorker", () => {
  it("持つ道と版の印を埋める", () => {
    const filled = fillServiceWorker(
      "const P = self.__SW_PRECACHE__;\nconst V = self.__SW_VERSION__;",
      ["/index.html", "/assets/a.js"],
      "abc",
    );
    expect(filled).toBe('const P = ["/index.html","/assets/a.js"];\nconst V = "abc";');
  });

  it("道に $ が入っていても、そのまま埋める", () => {
    expect(
      fillServiceWorker("P=self.__SW_PRECACHE__;V=self.__SW_VERSION__", ["/a$&b.js"], "v"),
    ).toBe('P=["/a$&b.js"];V="v"');
  });

  it("印がない・2つあると止める", () => {
    expect(() => fillServiceWorker("const V = self.__SW_VERSION__;", [], "a")).toThrow(
      /__SW_PRECACHE__/u,
    );
    expect(() =>
      fillServiceWorker("self.__SW_PRECACHE__ self.__SW_PRECACHE__ self.__SW_VERSION__", [], "a"),
    ).toThrow(/__SW_PRECACHE__/u);
  });
});

describe("serviceWorkerVersion", () => {
  it("持つ道・本文・index.html のどれかが変われば変わる", () => {
    const base = serviceWorkerVersion(["/a.js"], "sw", "<html>");
    expect(base).toMatch(/^[0-9a-f]{12}$/u);
    expect(serviceWorkerVersion(["/a.js"], "sw", "<html>")).toBe(base);
    expect(serviceWorkerVersion(["/b.js"], "sw", "<html>")).not.toBe(base);
    expect(serviceWorkerVersion(["/a.js"], "sw2", "<html>")).not.toBe(base);
    expect(serviceWorkerVersion(["/a.js"], "sw", "<html lang>")).not.toBe(base);
  });
});
