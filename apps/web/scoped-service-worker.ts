// 道の範囲を絞った Service Worker を、組み立て（vite build）のときに書き出す Vite の plugin（core-015。構成の決めごと AD-27）。
// - 領域が持つ Service Worker の本文（ふつうの JS。import を書かない）を読み、持つファイルの一覧と版の印を埋めて書き出す
//   （例：試合表の match/sw.js。置いたフォルダの下〈/match/〉が範囲の上限になるので、ほかのアプリの道に効かない）
// - 持つファイルは、入口の束とその静かな読み込み、範囲の画面の束（includeModule に当たるモジュールを含む、開いたときに読む束）と
//   その読み込み、それらの CSS。ほかのアプリの開いたときに読む束は持たない（AD-27：持つのは範囲の画面のファイルだけ）
// - 版の印は、持つファイルの名前（中身の印つき）と本文と index.html から作る。画面を組み直すと印が変わり、ブラウザが新しい
//   Service Worker に気づく
// - 本文には `self.__SW_PRECACHE__`（持つ道の並び）と `self.__SW_VERSION__`（版の印）を1つずつ書く。なければ組み立てを止める
// 開発のサーバー（vite dev）では書き出さない（Service Worker は組み立てた画面だけで動かす）。
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** 書き出す Service Worker の決め方。 */
export type ScopedServiceWorkerOptions = {
  /** 書き出す先（組み立てたフォルダからの道。例："match/sw.js"。置いたフォルダが範囲の上限） */
  fileName: string;
  /** 本文のファイル（絶対の道） */
  template: string;
  /** 範囲の画面のモジュールか（モジュールの ID〈ファイルの絶対の道〉を受け取る） */
  includeModule: (moduleId: string) => boolean;
};

/** 束（chunk）の、ここで読むところだけ。 */
export type BundleChunk = {
  /** 種類 */
  type: "chunk";
  /** ファイルの名前（組み立てたフォルダからの道） */
  fileName: string;
  /** 入口の束か */
  isEntry: boolean;
  /** 開いたときに読む束か */
  isDynamicEntry: boolean;
  /** 静かに読む束 */
  imports: readonly string[];
  /** 開いたときに読む束 */
  dynamicImports: readonly string[];
  /** 入っているモジュールの ID */
  moduleIds: readonly string[];
  /** Vite が足す情報（読む CSS と画像など） */
  viteMetadata?: { importedCss: Set<string>; importedAssets: Set<string> };
};

/** 書き出したファイル（asset）の、ここで読むところだけ。 */
export type BundleAsset = {
  /** 種類 */
  type: "asset";
  /** ファイルの名前 */
  fileName: string;
  /** 中身 */
  source: string | Uint8Array;
};

/** 埋める印：持つ道の並び。 */
const PRECACHE_MARK = "self.__SW_PRECACHE__";
/** 埋める印：版の印。 */
const VERSION_MARK = "self.__SW_VERSION__";
/** 画面の外枠（どの道でも同じ index.html を返す）。 */
const SHELL_PATH = "/index.html";

/**
 * 持つファイルの道を選ぶ（入口の束と、範囲の画面の束から、読み込みをたどる）。
 * 範囲の画面の束からは、開いたときに読む束もたどる（範囲の画面だけが開いたときに読む道具など）。入口からはたどらない
 * （ほかのアプリの画面を持たないため）。
 * @param bundle 組み立てた束とファイル
 * @param includeModule 範囲の画面のモジュールか
 * @returns 持つ道（"/" で始まる。外枠の index.html を先頭に、あとは名前の順）
 */
export function precachePaths(
  bundle: Readonly<Record<string, BundleChunk | BundleAsset | { type: string; fileName: string }>>,
  includeModule: (moduleId: string) => boolean,
): string[] {
  const chunks = new Map<string, BundleChunk>();
  for (const item of Object.values(bundle)) {
    if (item.type === "chunk") chunks.set(item.fileName, item as BundleChunk);
  }
  const picked = new Set<string>();
  const visit = (fileName: string, followDynamic: boolean): void => {
    const chunk = chunks.get(fileName);
    if (!chunk || picked.has(fileName)) return;
    picked.add(fileName);
    for (const css of chunk.viteMetadata?.importedCss ?? []) picked.add(css);
    for (const asset of chunk.viteMetadata?.importedAssets ?? []) picked.add(asset);
    for (const next of chunk.imports) visit(next, followDynamic);
    if (followDynamic) for (const next of chunk.dynamicImports) visit(next, true);
  };
  for (const chunk of chunks.values()) {
    if (chunk.isEntry) visit(chunk.fileName, false);
  }
  for (const chunk of chunks.values()) {
    if (chunk.isDynamicEntry && chunk.moduleIds.some(includeModule)) {
      // 入口からたどって選んだ束でも、範囲の画面の束なら、開いたときに読む束もたどる
      picked.delete(chunk.fileName);
      visit(chunk.fileName, true);
    }
  }
  return [SHELL_PATH, ...[...picked].sort().map((fileName) => `/${fileName}`)];
}

/**
 * 本文に、持つ道と版の印を埋める。
 * @param template 本文
 * @param paths 持つ道
 * @param version 版の印
 * @returns 埋めた本文
 * @throws {Error} 印が本文にちょうど1つずつないとき
 */
export function fillServiceWorker(template: string, paths: readonly string[], version: string) {
  for (const mark of [PRECACHE_MARK, VERSION_MARK]) {
    if (template.split(mark).length !== 2) {
      throw new Error(`Service Worker の本文に ${mark} をちょうど1つ書いてください。`);
    }
  }
  // 置きかえる文字の $& などを特別に読まないよう、関数で置きかえる
  return template
    .replace(PRECACHE_MARK, () => JSON.stringify(paths))
    .replace(VERSION_MARK, () => JSON.stringify(version));
}

/**
 * 版の印（持つ道・本文・index.html から作る。どれかが変われば変わる）。
 * @param paths 持つ道
 * @param template 本文
 * @param shell index.html の中身（まだなければ空）
 * @returns 16進の12文字
 */
export function serviceWorkerVersion(
  paths: readonly string[],
  template: string,
  shell: string | Uint8Array,
): string {
  return createHash("sha256")
    .update(paths.join("\n"))
    .update("\0")
    .update(template)
    .update("\0")
    .update(shell)
    .digest("hex")
    .slice(0, 12);
}

/**
 * 道の範囲を絞った Service Worker を書き出す plugin。
 * @param options 書き出す先・本文・範囲の画面のモジュールか
 * @returns Vite の plugin（組み立てのときだけ動く）
 */
export function scopedServiceWorker(options: ScopedServiceWorkerOptions): Plugin {
  return {
    name: "scoped-service-worker",
    apply: "build",
    enforce: "post",
    generateBundle(_output, bundle) {
      const template = readFileSync(options.template, "utf8");
      const paths = precachePaths(bundle, options.includeModule);
      const shell = (bundle["index.html"] as BundleAsset | undefined)?.source ?? "";
      const version = serviceWorkerVersion(paths, template, shell);
      this.emitFile({
        type: "asset",
        fileName: options.fileName,
        source: fillServiceWorker(template, paths, version),
      });
    },
  };
}
