// ファイルの受け取りと保存（core-004 R4。構成の決めごと AD-18 の画面だけの道具）。
// 受け取りは request と同じく、通信の失敗を NetworkError、エラーの応答を ApiError にする（401 の知らせも同じ）。
// ファイル名は API の Content-Disposition（RFC 6266。filename*=UTF-8''… を先に、なければ filename=）から読み、
// なければ呼んだ側の既定の名前にする。
import { NetworkError, apiErrorFrom } from "./api.ts";
import type { ResponseLike } from "./api.ts";

/** 受け取ったファイル。 */
export type DownloadedFile = {
  /** 中身 */
  blob: Blob;
  /** 保存するファイルの名前 */
  filename: string;
};

/** fetchDownload が受け取る応答（Hono の RPC の応答か、ふつうの Response）。 */
type DownloadResponse = ResponseLike & { blob(): Promise<Blob> };

/**
 * Content-Disposition からファイル名を読む（filename*=UTF-8''… を先に読み、なければ filename="…" か filename=…）。
 * @param disposition Content-Disposition の値
 * @returns ファイル名（読めなければ null）
 */
export function filenameFromDisposition(disposition: string): string | null {
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (extended) {
    try {
      return decodeURIComponent(extended.trim());
    } catch {
      // 読めない % の並びは、ふつうの filename に任せる
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(disposition)?.[1];
  if (quoted) return quoted;
  return /filename\s*=\s*([^;\s"]+)/i.exec(disposition)?.[1] ?? null;
}

/**
 * API からファイルを受け取る。
 * @param call API を呼ぶ関数（例：() => endpoint.export.$get({ param })）
 * @param fallbackName 応答にファイル名がないときの名前
 * @returns 中身とファイルの名前
 * @throws {ApiError} API がエラーを返したとき
 * @throws {NetworkError} 通信が届かなかったとき
 */
export async function fetchDownload(
  call: () => Promise<DownloadResponse>,
  fallbackName: string,
): Promise<DownloadedFile> {
  let response: DownloadResponse;
  try {
    response = await call();
  } catch (error) {
    throw new NetworkError(error);
  }
  // エラーの本文の読み方は request と同じ（401 の知らせも同じ）
  if (!response.ok) throw await apiErrorFrom(response);
  const filename =
    filenameFromDisposition(response.headers.get("content-disposition") ?? "") ?? fallbackName;
  return { blob: await response.blob(), filename };
}

/**
 * ファイルを保存させる（受け取った中身を、ブラウザの保存にわたす）。
 * @param blob 中身
 * @param filename ファイルの名前
 */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
