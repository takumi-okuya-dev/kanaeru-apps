// 道の範囲を絞った Service Worker の plugin（core-015）：持つファイルの選び方・印の埋め方・版の印。
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fillServiceWorker,
  precachePaths,
  scopedServiceWorker,
  serviceWorkerVersion,
} from "./scoped-service-worker.ts";
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

describe("serviceWorkerVersion の public のファイル（match-007）", () => {
  it("持つ public のファイルの中身が変われば変わる", () => {
    const icon = new TextEncoder().encode("png-1");
    const base = serviceWorkerVersion(["/a.js"], "sw", "<html>", [icon]);
    expect(serviceWorkerVersion(["/a.js"], "sw", "<html>", [icon])).toBe(base);
    expect(
      serviceWorkerVersion(["/a.js"], "sw", "<html>", [new TextEncoder().encode("png-2")]),
    ).not.toBe(base);
    expect(serviceWorkerVersion(["/a.js"], "sw", "<html>")).not.toBe(base);
  });
});

describe("scopedServiceWorker の publicFiles（match-007）", () => {
  /**
   * 本文と public のフォルダを仮に作り、plugin の組み立てを1度動かす。
   * @param publicFiles 持つ public のファイル
   * @param icon 置くアイコンの中身（なければ置かない）
   * @returns 書き出した Service Worker の本文
   */
  const build = (publicFiles: readonly string[], icon?: string): string => {
    const dir = mkdtempSync(join(tmpdir(), "sw-"));
    const template = join(dir, "sw.js");
    writeFileSync(template, "const P = self.__SW_PRECACHE__; const V = self.__SW_VERSION__;");
    mkdirSync(join(dir, "public", "match"), { recursive: true });
    if (icon !== undefined) writeFileSync(join(dir, "public", "match", "icon.png"), icon);
    const plugin = scopedServiceWorker({
      fileName: "match/sw.js",
      template,
      includeModule: isMatch,
      publicFiles,
    });
    const hooks = plugin as unknown as {
      configResolved: (config: { publicDir: string }) => void;
      generateBundle: (this: unknown, output: unknown, bundle: unknown) => void;
    };
    hooks.configResolved({ publicDir: join(dir, "public") });
    let emitted = "";
    hooks.generateBundle.call(
      { emitFile: (file: { source: string }) => (emitted = file.source) },
      {},
      bundle,
    );
    return emitted;
  };

  it("名指しした public のファイルを持ち、中身が変われば版の印が変わる", () => {
    const first = build(["match/icon.png"], "png-1");
    expect(first).toContain('"/match/icon.png"');
    expect(build(["match/icon.png"], "png-2")).not.toBe(first);
  });

  it("名指しした public のファイルがなければ、組み立てを止める", () => {
    expect(() => build(["match/icon.png"])).toThrow("match/icon.png");
  });

  it("範囲（置いたフォルダ）の外の public のファイルは、組み立てを止める", () => {
    expect(() => build(["icon.png"], "png")).toThrow("範囲");
    expect(() => build(["match/../icon.png"], "png")).toThrow("範囲");
  });
});
