// GoodNotes から書き出した PDF を、端末の中の pdf.js で読む（PDF をサーバーに送らない。research R5・R6・AD-34）。
// pdf.js（pdfjs-dist 4.10.38 の legacy の束。iPhone の Safari の古めの版でも動く）は、読むときに初めて読みこむ（動的 import）。
// - worker と日本語の CMap は、Vite に画面の静かなファイルとして出させ、自分のドメインから読む（外の CDN を使わない。
//   CSP の script-src 'self'・connect-src 'self' のまま動く）。vite.config.ts（共通）は触らない
// - ページごとに operator list を追って線の四角を作り、getTextContent と書体の名前を取り出して goodnotes.ts に渡す。
//   読み終えたページは page.cleanup() で片づける。画像は要らないので、読まずに捨てる（maxImageSize: 0。記憶と時間を減らす）
// - 線の範囲は、constructPath の点（曲線の制御点を含む）を CTM でページの座標に直して、その最小・最大を取る
// - エラーの文は日本語にし、利用者の値（ファイルの名前・中身）を入れない
import { READING_IMPORT_LIMITS } from "@workspace/contracts/reading";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type * as PdfjsModule from "pdfjs-dist/legacy/build/pdf.min.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { extractGoodNotesMarkers } from "./goodnotes.ts";
import type { GoodNotesPage, GoodNotesStroke, GoodNotesText, ImportedMarker } from "./goodnotes.ts";

/** 読み取った結果。 */
export type GoodNotesResult = {
  /** 本の中の順のマーカー（文のないものはコメントだけのもの） */
  markers: ImportedMarker[];
  /** PDF のページの数 */
  pageCount: number;
};

/** 読めなかったわけ（too-large：大きすぎる・not-pdf：PDF でない・broken：壊れている・パスワードがある・aborted：やめた）。 */
export type GoodNotesReadErrorReason = "too-large" | "not-pdf" | "broken" | "aborted";

/** 読めなかったときのわけごとの文（利用者の値を入れない）。 */
const READ_ERROR_MESSAGES: Record<GoodNotesReadErrorReason, string> = {
  "too-large": `PDF が大きすぎます。${READING_IMPORT_LIMITS.fileBytes / 1024 / 1024}MB までの PDF を選んでください。`,
  "not-pdf": "PDF のファイルではありません。GoodNotes から書き出した PDF を選んでください。",
  broken: "PDF を読めませんでした。ファイルが壊れているか、パスワードがかかっています。",
  aborted: "PDF の読み取りをやめました。",
};

/** PDF を読めなかったときのエラー。 */
export class GoodNotesReadError extends Error {
  /** 読めなかったわけ */
  readonly reason: GoodNotesReadErrorReason;

  /**
   * 読めなかったわけから、エラーを作る。
   * @param reason 読めなかったわけ
   * @param options 元のエラー（cause）
   */
  constructor(reason: GoodNotesReadErrorReason, options?: { cause?: unknown }) {
    super(READ_ERROR_MESSAGES[reason], options);
    this.name = "GoodNotesReadError";
    this.reason = reason;
  }
}

/** readGoodNotesPdf に渡せるもの。 */
export type ReadGoodNotesPdfOptions = {
  /** 読んだページの数を知らせる（1ページ読むごとに呼ぶ） */
  onProgress?: (done: number, total: number) => void;
  /** やめる合図（ページの合間で見る） */
  signal?: AbortSignal;
};

/** pdf.js の束（動的 import で読む）。 */
type Pdfjs = typeof PdfjsModule;

/** 2次元の変換の行列（a, b, c, d, e, f）。 */
type Matrix = [number, number, number, number, number, number];

/** 日本語の CMap の名前から、画面の静かなファイルの URL を引く表（Vite が組み立てのときに作る）。 */
const CMAP_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("/node_modules/pdfjs-dist/cmaps/*.bcmap", {
      query: "?url&no-inline",
      import: "default",
      eager: true,
    }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".bcmap".length), url]),
);

/**
 * pdf.js に渡す CMap の読み手。名前から自分のドメインの URL を引いて fetch する（要る CMap だけを、要るときに読む）。
 * pdf.js が `new CMapReaderFactory({ baseUrl, isCompressed })` で作り、`fetch({ name })` を呼ぶ。
 */
class BundledCMapReaderFactory {
  /**
   * CMap を読む。
   * @param params CMap の名前
   * @returns CMap の中身（縮めた形）
   * @throws {Error} 知らない名前か、読めなかったとき
   */
  async fetch(params: { name: string }): Promise<{ cMapData: Uint8Array; isCompressed: boolean }> {
    const url = CMAP_URLS[params.name];
    if (!url) throw new Error("CMap が見つかりません。");
    const response = await fetch(url);
    if (!response.ok) throw new Error("CMap を読めませんでした。");
    return { cMapData: new Uint8Array(await response.arrayBuffer()), isCompressed: true };
  }
}

/** 読みこんだ pdf.js（2回目からは同じものを使う）。 */
let pdfjsPromise: Promise<Pdfjs> | undefined;

/**
 * pdf.js を読みこみ、worker を自分のドメインのファイルにする。
 * @returns pdf.js
 */
function loadPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.min.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * 行列をかける（m のあとに ctm をかける。PDF の cm と同じ）。
 * @param ctm 今の行列
 * @param m 足す行列
 * @returns かけた行列
 */
function multiply(ctm: Matrix, m: readonly number[]): Matrix {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = m;
  return [
    ctm[0] * a + ctm[2] * b,
    ctm[1] * a + ctm[3] * b,
    ctm[0] * c + ctm[2] * d,
    ctm[1] * c + ctm[3] * d,
    ctm[0] * e + ctm[2] * f + ctm[4],
    ctm[1] * e + ctm[3] * f + ctm[5],
  ];
}

/**
 * 点を行列で動かす。
 * @param ctm 行列
 * @param x 横
 * @param y 縦
 * @returns 動かした点
 */
function apply(ctm: Matrix, x: number, y: number): [number, number] {
  return [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
}

/** 線を数えるときの描き方の状態（save・restore で積む）。 */
type DrawState = { ctm: Matrix; lineWidth: number; strokeAlpha: number };

/**
 * ページの operator list を頭から追い、線（stroke）の範囲・幅・不透明度を集める。
 * @param pdfjs pdf.js
 * @param fnArray 命令の並び
 * @param argsArray 命令ごとの引数
 * @param origin ページの左下の点（view の x0・y0）
 * @returns 線の並び（ページの座標）
 */
function collectStrokes(
  pdfjs: Pick<Pdfjs, "OPS">,
  fnArray: readonly number[],
  argsArray: readonly unknown[],
  origin: readonly [number, number],
): GoodNotesStroke[] {
  const { OPS } = pdfjs;
  // 道の命令ごとの数の個数（矩形は x・y・幅・高さ）
  const pointCounts = new Map<number, number>([
    [OPS.moveTo, 2],
    [OPS.lineTo, 2],
    [OPS.curveTo, 6],
    [OPS.curveTo2, 4],
    [OPS.curveTo3, 4],
    [OPS.closePath, 0],
    [OPS.rectangle, 4],
  ]);
  const strokeOps = new Set<number>([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  const strokes: GoodNotesStroke[] = [];
  const stack: DrawState[] = [];
  let state: DrawState = { ctm: [1, 0, 0, 1, 0, 0], lineWidth: 1, strokeAlpha: 1 };
  let path: { x0: number; y0: number; x1: number; y1: number; ctm: Matrix } | undefined;
  const push = () => stack.push({ ...state, ctm: [...state.ctm] });
  const pop = () => {
    state = stack.pop() ?? state;
  };

  fnArray.forEach((fn, index) => {
    const args = argsArray[index] as unknown[] | null | undefined;
    switch (fn) {
      case OPS.save:
      case OPS.beginGroup:
        push();
        return;
      case OPS.restore:
      case OPS.endGroup:
      case OPS.paintFormXObjectEnd:
        pop();
        return;
      case OPS.paintFormXObjectBegin: {
        push();
        const matrix = args?.[0];
        if (Array.isArray(matrix) && matrix.length === 6) state.ctm = multiply(state.ctm, matrix);
        return;
      }
      case OPS.transform:
        if (args) state.ctm = multiply(state.ctm, args as number[]);
        return;
      case OPS.setLineWidth:
        state.lineWidth = Number(args?.[0] ?? state.lineWidth);
        return;
      case OPS.setGState:
        for (const pair of (args?.[0] as [string, unknown][] | undefined) ?? []) {
          if (pair[0] === "CA" && typeof pair[1] === "number") state.strokeAlpha = pair[1];
          if (pair[0] === "LW" && typeof pair[1] === "number") state.lineWidth = pair[1];
        }
        return;
      case OPS.constructPath: {
        const ops = (args?.[0] as number[] | undefined) ?? [];
        const coords = (args?.[1] as number[] | undefined) ?? [];
        const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        const add = (x: number, y: number) => {
          const [px, py] = apply(state.ctm, x, y);
          box.x0 = Math.min(box.x0, px - origin[0]);
          box.y0 = Math.min(box.y0, py - origin[1]);
          box.x1 = Math.max(box.x1, px - origin[0]);
          box.y1 = Math.max(box.y1, py - origin[1]);
        };
        let at = 0;
        for (const op of ops) {
          const count = pointCounts.get(op) ?? 0;
          const values = coords.slice(at, at + count);
          at += count;
          if (op === OPS.rectangle) {
            const [x = 0, y = 0, w = 0, h = 0] = values;
            add(x, y);
            add(x + w, y);
            add(x, y + h);
            add(x + w, y + h);
          } else {
            for (let i = 0; i + 1 < values.length; i += 2) add(values[i] ?? 0, values[i + 1] ?? 0);
          }
        }
        path = Number.isFinite(box.x0) ? { ...box, ctm: state.ctm } : undefined;
        return;
      }
      default:
        if (strokeOps.has(fn) && path) {
          const [a, b, c, d] = path.ctm;
          const scale = Math.sqrt(Math.abs(a * d - b * c));
          strokes.push({
            x0: path.x0,
            y0: path.y0,
            x1: path.x1,
            y1: path.y1,
            width: state.lineWidth * scale,
            opacity: state.strokeAlpha,
          });
        }
        if (strokeOps.has(fn) || fn === OPS.endPath || fn === OPS.fill || fn === OPS.eoFill) {
          path = undefined;
        }
    }
  });
  return strokes;
}

/**
 * ページの文の項目と書体の名前を取り出す。字の枠は、字の下の線の 0.12 字分下から 0.88 字分上まで（和文の字の枠に近い形）。
 * @param page pdf.js のページ（getOperatorList のあとに呼ぶ。書体が commonObjs に入っているため）
 * @param origin ページの左下の点
 * @returns 文の項目（ページの座標）
 */
async function collectTexts(
  page: PDFPageProxy,
  origin: readonly [number, number],
): Promise<GoodNotesText[]> {
  const content = await page.getTextContent();
  const texts: GoodNotesText[] = [];
  for (const item of content.items) {
    if (!("str" in item) || item.str === "") continue;
    const [, , c = 0, d = 0, e = 0, f = 0] = item.transform as number[];
    const size = item.height || Math.hypot(c, d);
    const font = page.commonObjs.has(item.fontName)
      ? (page.commonObjs.get(item.fontName) as { name?: unknown } | null)?.name
      : undefined;
    texts.push({
      text: item.str,
      font: typeof font === "string" && font !== "" ? font : item.fontName,
      x0: e - origin[0],
      x1: e + item.width - origin[0],
      y0: f - size * 0.12 - origin[1],
      y1: f + size * 0.88 - origin[1],
    });
  }
  return texts;
}

/**
 * ファイルの頭が PDF の印（%PDF-）か（PDF は頭の 1KB の中に印を置く）。
 * @param file ファイル
 * @returns PDF の印があれば true
 */
async function looksLikePdf(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const text = String.fromCharCode(...head);
  return text.includes("%PDF-");
}

/**
 * やめる合図が来ていれば、やめたエラーを投げる。
 * @param signal やめる合図
 * @throws {GoodNotesReadError} やめる合図が来ていたとき（aborted）
 */
function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new GoodNotesReadError("aborted");
}

/**
 * GoodNotes から書き出した PDF を端末の中で読み、マーカーとコメントを取り出す（research R5・R6）。
 * @param file 選んだ PDF のファイル
 * @param options 読んだページの数の知らせと、やめる合図
 * @returns マーカーと PDF のページの数
 * @throws {GoodNotesReadError} 大きすぎる（300MB をこえる）・PDF でない・壊れている・パスワードがある・やめたとき
 */
export async function readGoodNotesPdf(
  file: Blob,
  options: ReadGoodNotesPdfOptions = {},
): Promise<GoodNotesResult> {
  const { onProgress, signal } = options;
  if (file.size > READING_IMPORT_LIMITS.fileBytes) throw new GoodNotesReadError("too-large");
  checkAborted(signal);
  if (!(await looksLikePdf(file))) throw new GoodNotesReadError("not-pdf");
  const data = new Uint8Array(await file.arrayBuffer());
  checkAborted(signal);

  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    CMapReaderFactory: BundledCMapReaderFactory,
    maxImageSize: 0,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  const onAbort = () => void task.destroy();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    let document;
    try {
      document = await task.promise;
    } catch (cause) {
      checkAborted(signal);
      throw new GoodNotesReadError("broken", { cause });
    }
    const pages: GoodNotesPage[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      checkAborted(signal);
      try {
        const page = await document.getPage(number);
        const [x0 = 0, y0 = 0, , y1 = 0] = page.view;
        const origin = [x0, y0] as const;
        const operators = await page.getOperatorList({
          annotationMode: pdfjs.AnnotationMode.DISABLE,
        });
        const strokes = collectStrokes(pdfjs, operators.fnArray, operators.argsArray, origin);
        const texts = await collectTexts(page, origin);
        pages.push({ height: y1 - y0, strokes, texts });
        page.cleanup();
      } catch (cause) {
        checkAborted(signal);
        throw new GoodNotesReadError("broken", { cause });
      }
      onProgress?.(number, document.numPages);
    }
    return { markers: extractGoodNotesMarkers(pages), pageCount: document.numPages };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await task.destroy();
  }
}
