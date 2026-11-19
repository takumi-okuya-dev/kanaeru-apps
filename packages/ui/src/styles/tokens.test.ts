// 値のずれのテスト。DESIGN.md の先頭の YAML と、tokens.css の値を1つずつ比べる。
// DESIGN.md を直したら、このテストが落ちて気づける。読むのはプロダクトの DESIGN.md（_bmad-output/ux-kanaeru-reception/）。
// プロダクトの DESIGN.md は土台（docs/design/DESIGN.md）を引き継ぎ（先頭の YAML の inherits）、違う値だけを書くので、
// 土台の値を先に読み、プロダクトの値で上書きしてから比べる（specs/core/001-foundation/research.md R11）。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { SPACING_NAMES, TEXT_SIZE_NAMES } from "../lib/cn.ts";

const DESIGN_PATH = new URL(
  "../../../../_bmad-output/ux-kanaeru-reception/DESIGN.md",
  import.meta.url,
);
const TOKENS_PATH = new URL("./tokens.css", import.meta.url);

/** DESIGN.md の先頭の YAML（使う所だけ）。 */
type Design = {
  colors: Record<string, string>;
  typography: {
    fontFamily: string;
    size: Record<string, string>;
    lineHeight: Record<string, number>;
    weight: Record<string, number>;
  };
  spacing: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  breakpoints: Record<string, string>;
};

/**
 * DESIGN.md の先頭の YAML を、そのまま読む。
 * @param path DESIGN.md の場所
 * @returns 先頭の YAML の値
 */
function readFrontmatter(path: URL): Record<string, unknown> {
  const text = readFileSync(path, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match?.[1]) throw new Error(`${path.pathname} の先頭の YAML が見つかりません。`);
  return parse(match[1]) as Record<string, unknown>;
}

/**
 * ただのオブジェクト（配列でない）か。
 * @param value 調べる値
 * @returns オブジェクトなら true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 土台の値に、上書きの値を欄ごとに重ねる（入れ子のオブジェクトは中まで重ね、ほかは上書きの値にする）。
 * @param base 土台の値
 * @param override 上書きの値
 * @returns 重ねた値
 */
function merge(base: Record<string, unknown>, override: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value) ? merge(current, value) : value;
  }
  return merged;
}

/**
 * DESIGN.md の先頭の YAML を読む。inherits があれば、その DESIGN.md を土台にして重ねる。
 * @param path DESIGN.md の場所
 * @returns 見た目の値
 */
function readDesign(path: URL = DESIGN_PATH): Design {
  return readMerged(path) as Design;
}

/**
 * DESIGN.md の先頭の YAML を、inherits の土台と重ねて読む（readDesign の中身）。
 * @param path DESIGN.md の場所
 * @returns 重ねた値
 */
function readMerged(path: URL): Record<string, unknown> {
  const own = readFrontmatter(path);
  const { inherits } = own;
  if (typeof inherits !== "string") return own;
  return merge(readMerged(new URL(inherits, path)), own);
}

/**
 * tokens.css の変数を読む。
 * @returns 変数の名前（-- を除く）と値
 */
function readTokens(): Map<string, string> {
  const css = readFileSync(TOKENS_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/--([\w*-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) tokens.set(name, value.trim());
  }
  return tokens;
}

/**
 * 色の書き方をそろえる（小文字・空白なし）。
 * @param value 色
 * @returns そろえた色
 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

/** DESIGN.md の角の名前を、Tailwind の名前に読みかえる（rounded-s・rounded-l は Tailwind で別の意味になるため）。 */
const RADIUS_RENAMES: Record<string, string> = { s: "sm", m: "md", l: "lg" };

const design = readDesign();
const tokens = readTokens();

describe("tokens.css と DESIGN.md の値", () => {
  it("プロダクトの DESIGN.md は土台を引き継ぐ（プロダクトの値で上書きし、書いていない値は土台のまま）", () => {
    const base = readDesign(new URL("../../../../docs/design/DESIGN.md", import.meta.url));
    expect(design.colors.primary).not.toBe(base.colors.primary);
    expect(design.colors["primary-subtle"]).toBeDefined();
    expect(design.colors.text).toBe(base.colors.text);
    expect(design.typography).toEqual(base.typography);
    expect(design.spacing).toEqual(base.spacing);
  });

  it("Tailwind の初期の色・文字・余白・角・影・幅の境目を消している", () => {
    for (const reset of [
      "color-*",
      "font-*",
      "text-*",
      "leading-*",
      "font-weight-*",
      "spacing-*",
      "radius-*",
      "shadow-*",
      "breakpoint-*",
      "container-*",
    ]) {
      expect(tokens.get(reset), reset).toBe("initial");
    }
  });

  it.each(Object.entries(design.colors))("色 %s", (name, value) => {
    expect(normalize(tokens.get(`color-${name}`) ?? ""), name).toBe(normalize(value));
  });

  it("DESIGN.md にない色を足していない", () => {
    const names = [...tokens.keys()].filter((key) => key.startsWith("color-") && key !== "color-*");
    expect(names.map((key) => key.slice("color-".length)).sort()).toEqual(
      Object.keys(design.colors).sort(),
    );
  });

  it("書体", () => {
    expect(tokens.get("font-sans")).toBe(design.typography.fontFamily);
  });

  it.each(Object.entries(design.typography.size))("文字の大きさ %s", (name, value) => {
    expect(tokens.get(`text-${name}`)).toBe(value);
  });

  it.each(Object.entries(design.typography.lineHeight))("行の高さ %s", (name, value) => {
    expect(tokens.get(`leading-${name}`)).toBe(String(value));
  });

  it.each(Object.entries(design.typography.weight))("太さ %s", (name, value) => {
    expect(tokens.get(`font-weight-${name}`)).toBe(String(value));
  });

  it.each(Object.entries(design.spacing))("余白 %s", (name, value) => {
    expect(tokens.get(`spacing-${name}`)).toBe(value);
  });

  it("DESIGN.md にない余白は、0 と画面の骨格の大きさ（sidebar）だけ", () => {
    const extra = [...tokens.keys()]
      .filter((key) => key.startsWith("spacing-") && key !== "spacing-*")
      .map((key) => key.slice("spacing-".length))
      .filter((name) => !(name in design.spacing));
    expect(extra.sort()).toEqual(["0", "sidebar"]);
  });

  it.each(Object.entries(design.radius))("角 %s", (name, value) => {
    expect(tokens.get(`radius-${RADIUS_RENAMES[name] ?? name}`)).toBe(value);
  });

  it.each(Object.entries(design.shadow).filter(([name]) => name !== "focus"))(
    "影 %s（色は rgba(3,3,2,0.3)）",
    (name, value) => {
      expect(normalize(tokens.get(`shadow-${name}`) ?? "")).toBe(
        normalize(`${value} rgba(3,3,2,0.3)`),
      );
    },
  );

  it("フォーカスの輪は、白の縁と primary の輪", () => {
    expect(normalize(tokens.get("shadow-focus") ?? "")).toBe(
      normalize(`0 0 0 2px #FFFFFF, 0 0 0 4px ${design.colors.primary}`),
    );
  });

  it("幅の境目：small（これ以下が狭い画面）の次の px から wide", () => {
    const small = Number.parseInt(design.breakpoints.small ?? "", 10);
    expect(tokens.get("breakpoint-wide")).toBe(`${small + 1}px`);
  });

  it("cn（tailwind-merge）に教えた名前が tokens.css と同じ", () => {
    expect([...TEXT_SIZE_NAMES].sort()).toEqual(Object.keys(design.typography.size).sort());
    const spacing = [...tokens.keys()]
      .filter((key) => key.startsWith("spacing-") && key !== "spacing-*")
      .map((key) => key.slice("spacing-".length));
    expect([...SPACING_NAMES].sort()).toEqual(spacing.sort());
  });
});
