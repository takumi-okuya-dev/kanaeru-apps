// 試合表をホーム画面に置く（match-007）：manifest の中身（名前・始まりと範囲・表示・色は tokens.css の値）・アイコンの PNG の
// 大きさ・Service Worker が持つファイルの一覧・見出しのリンクは試合表の運営の画面を開いている間だけ付く。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  MATCH_APPLE_TOUCH_ICON_PATH,
  MATCH_HOME_SCREEN_FILES,
  MATCH_MANIFEST_PATH,
} from "./home-screen.ts";
import {
  addHomeScreenLinks,
  removeHomeScreenLinks,
  useHomeScreenLinks,
} from "./use-home-screen.ts";

/** 画面の public のフォルダ（jsdom の中では import.meta.url が file: でないので、フォルダの道で読む）。 */
const PUBLIC_DIR = join(import.meta.dirname, "../../../public");

/** manifest のアイコンの形。 */
type ManifestIcon = { src: string; sizes: string; type: string; purpose: string };

/**
 * public のファイルを読む。
 * @param path public からの道（先頭の / はあってもよい）
 * @returns 中身
 */
function readPublic(path: string): Buffer {
  return readFileSync(join(PUBLIC_DIR, path.replace(/^\//u, "")));
}

/**
 * PNG の幅と高さ（IHDR）を読む。
 * @param png PNG のバイト
 * @returns 幅と高さ
 */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * tokens.css の色の値を読む。
 * @param name 色の名前（--color- のあと）
 * @returns 値（小文字）
 */
function tokenColor(name: string): string {
  const css = readFileSync(
    join(import.meta.dirname, "../../../../../packages/ui/src/styles/tokens.css"),
    "utf8",
  );
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, "iu").exec(css);
  if (!match?.[1]) throw new Error(`tokens.css に --color-${name} がありません。`);
  return match[1].toLowerCase();
}

const manifest = JSON.parse(readPublic(MATCH_MANIFEST_PATH).toString("utf8")) as {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
};

describe("ホーム画面の manifest とアイコン", () => {
  it("名前・始まりと範囲（/match/）・表示（standalone）・色は tokens.css の値", () => {
    expect(manifest).toMatchObject({
      id: "/match/",
      name: "kanaeru 試合表",
      short_name: "試合表",
      start_url: "/match/",
      scope: "/match/",
      display: "standalone",
    });
    expect(manifest.theme_color).toBe(tokenColor("surface"));
    expect(manifest.background_color).toBe(tokenColor("background"));
  });

  it("アイコンは 192 と 512 の any と maskable。PNG の大きさが書いたとおり", () => {
    for (const purpose of ["any", "maskable"]) {
      expect(
        manifest.icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes),
      ).toEqual(["192x192", "512x512"]);
    }
    for (const icon of manifest.icons) {
      expect(icon.type).toBe("image/png");
      expect(icon.src.startsWith("/match/")).toBe(true);
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(pngSize(readPublic(icon.src))).toEqual({ width, height });
    }
    expect(pngSize(readPublic(MATCH_APPLE_TOUCH_ICON_PATH))).toEqual({ width: 180, height: 180 });
  });

  it("Service Worker が持つ一覧に、manifest と、manifest・見出しが指すアイコンがすべてあり、どれも /match/ の下", () => {
    const listed = MATCH_HOME_SCREEN_FILES.map((file) => `/${file}`);
    expect(listed).toContain(MATCH_MANIFEST_PATH);
    expect(listed).toContain(MATCH_APPLE_TOUCH_ICON_PATH);
    for (const icon of manifest.icons) expect(listed).toContain(icon.src);
    for (const file of MATCH_HOME_SCREEN_FILES) {
      expect(file.startsWith("match/")).toBe(true);
      expect(readPublic(file).length).toBeGreaterThan(0);
    }
  });
});

describe("見出しのリンク", () => {
  afterEach(() => removeHomeScreenLinks());

  /**
   * 見出しの manifest のリンクの数。
   * @returns 数
   */
  const manifestLinks = () => document.head.querySelectorAll('link[rel="manifest"]').length;

  it("付けると manifest・iPhone のアイコン・名前が1つずつ。2度付けても増えない", () => {
    addHomeScreenLinks();
    addHomeScreenLinks();
    expect(manifestLinks()).toBe(1);
    expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe(
      MATCH_MANIFEST_PATH,
    );
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")).toBe(
      MATCH_APPLE_TOUCH_ICON_PATH,
    );
    expect(
      document.head
        .querySelector('meta[name="apple-mobile-web-app-title"]')
        ?.getAttribute("content"),
    ).toBe("試合表");
  });

  it("画面を開いている間だけ付き、最後の部品が消えたら外れる", () => {
    expect(manifestLinks()).toBe(0);
    const first = renderHook(() => useHomeScreenLinks());
    const second = renderHook(() => useHomeScreenLinks());
    expect(manifestLinks()).toBe(1);
    first.unmount();
    expect(manifestLinks()).toBe(1);
    second.unmount();
    expect(manifestLinks()).toBe(0);
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')).toBeNull();
  });
});
