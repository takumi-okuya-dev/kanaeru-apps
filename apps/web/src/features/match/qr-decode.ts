// QR を読む（カメラの映像・写真から。FR-M24・AD-30。match-005）。ブラウザの BarcodeDetector を先に使い、ないブラウザでは
// jsQR（core-015 で足した依存）を開いたときに読む。読んだ文字だけを返し、映像・写真はどこにも送らない・残さない。
// 写真は createImageBitmap で読む（blob: の URL を作らない。画面の CSP を広げないため）。

/** BarcodeDetector の要るところだけ（型の定義がないブラウザがあるので、ここで書く）。 */
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource | ImageBitmap): Promise<{ rawValue: string }[]>;
};

/** BarcodeDetector の作り方。 */
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** 作った BarcodeDetector（使えなければ null。まだ確かめていなければ undefined）。 */
let detector: BarcodeDetectorLike | null | undefined;

/**
 * BarcodeDetector（QR を読めるもの）を返す。
 * @returns 道具（使えなければ null）
 */
async function barcodeDetector(): Promise<BarcodeDetectorLike | null> {
  if (detector !== undefined) return detector;
  const ctor = (
    globalThis as {
      BarcodeDetector?: BarcodeDetectorConstructor & {
        getSupportedFormats?: () => Promise<string[]>;
      };
    }
  ).BarcodeDetector;
  try {
    const formats = ctor ? ((await ctor.getSupportedFormats?.()) ?? ["qr_code"]) : [];
    detector = ctor && formats.includes("qr_code") ? new ctor({ formats: ["qr_code"] }) : null;
  } catch {
    detector = null;
  }
  return detector;
}

/**
 * 色の並び（RGBA）から QR を読む（jsQR）。
 * @param data 色の並び（1点に4バイト）
 * @param width 幅
 * @param height 高さ
 * @returns 読んだ文字（読めなければ undefined）
 */
export async function decodeQrPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<string | undefined> {
  const { default: jsQR } = await import("jsqr");
  const found = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  return found?.data || undefined;
}

/** 読み取りに使う下書きの canvas（1つだけ）。 */
let scratch: HTMLCanvasElement | undefined;

/**
 * 映像か写真から QR を読む。
 * @param source カメラの映像（video）か写真（ImageBitmap）
 * @param width 幅
 * @param height 高さ
 * @param thorough BarcodeDetector で読めなかったときも jsQR で読むか（写真。カメラの映像は次の絵で読み直すので false）
 * @returns 読んだ文字（読めなければ undefined）
 */
export async function detectQr(
  source: HTMLVideoElement | ImageBitmap,
  width: number,
  height: number,
  thorough = false,
): Promise<string | undefined> {
  if (width === 0 || height === 0) return undefined;
  const native = await barcodeDetector();
  if (native) {
    try {
      const [found] = await native.detect(source);
      if (found?.rawValue) return found.rawValue;
      if (!thorough) return undefined;
    } catch {
      // 読めなければ jsQR で読む
    }
  }
  // 大きな写真は縮めてから読む（jsQR は点の数に比べて時間がかかる）
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  scratch ??= document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const context = scratch.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(source, 0, 0, w, h);
  return decodeQrPixels(context.getImageData(0, 0, w, h).data, w, h);
}

/**
 * 写真のファイルから QR を読む。
 * @param file 写真
 * @returns 読んだ文字（読めなければ undefined）
 */
export async function detectQrInFile(file: Blob): Promise<string | undefined> {
  const bitmap = await createImageBitmap(file);
  try {
    return await detectQr(bitmap, bitmap.width, bitmap.height, true);
  } finally {
    bitmap.close();
  }
}
