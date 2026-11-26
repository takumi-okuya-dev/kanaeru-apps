// クライアントの ID メタデータ文書（CIMD・draft-00。MCP の仕様は SHOULD で対応を求める）。
// client_id は https の URL。その URL から JSON を取り、client_id が一致し、戻り先の登録があることを確かめる。
// 取りに行く先の守り（SSRF）：https だけ・利用者の情報なし・IP の直書きと localhost なし・解決先が私的な番地なら断る。
// 転送（リダイレクト）は追わない。応答の大きさと時間に上限を付ける。
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isRegistrableRedirectUri } from "./redirect.ts";

/** 文書の大きさの上限（バイト）。 */
export const CIMD_MAX_BYTES = 8 * 1024;

/** 取りに行く時間の上限（ミリ秒）。 */
export const CIMD_TIMEOUT_MS = 5_000;

/** 戻り先の登録の数の上限。 */
const MAX_REDIRECT_URIS = 10;

/** 検証を通ったクライアントのメタデータ。 */
export type ClientMetadata = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
};

/** 取得や検証の失敗（code はログと応答に出してよい短い印）。 */
export class CimdError extends Error {
  readonly code: "UNSAFE_URL" | "FETCH_FAILED" | "TOO_LARGE" | "INVALID_DOCUMENT";
  constructor(
    code: "UNSAFE_URL" | "FETCH_FAILED" | "TOO_LARGE" | "INVALID_DOCUMENT",
    message: string,
  ) {
    super(message);
    this.name = "CimdError";
    this.code = code;
  }
}

/**
 * 私的・予約の番地か（取りに行く先として断る）。
 * @param address IPv4 または IPv6 の番地
 * @returns 私的・ループバック・リンクローカル・予約なら true
 */
export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
    if (
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    )
      return true; // fe80::/10
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // 番地として読めないものは断る
}

/** 解決の関数（テストで差し替える）。 */
export type HostResolver = (hostname: string) => Promise<string[]>;

/**
 * 既定の解決（DNS の全部の番地）。
 * @param hostname ホスト名
 * @returns 番地の一覧
 */
export const resolveHostDefault: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((r) => r.address);

/**
 * client_id の URL を取りに行ってよいか（形だけの確かめ。番地は取りに行く前に確かめる）。
 * @param clientId client_id（URL）
 * @returns 形が合えば URL、合わなければ null
 */
export function parseCimdUrl(clientId: string): URL | null {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || url.hash) return null;
  if (url.pathname === "/" || url.pathname === "") return null;
  if (
    isIP(url.hostname) !== 0 ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost")
  )
    return null;
  if (!url.hostname.includes(".")) return null;
  return url;
}

/**
 * CIMD の文書を取り、検証して返す。
 * @param clientId client_id（https の URL）
 * @param deps 取得と解決（テストで差し替える）
 * @returns 検証を通ったメタデータ
 * @throws CimdError 取れない・大きすぎる・形が違う・取りに行く先が安全でない
 */
export async function fetchClientMetadata(
  clientId: string,
  deps: { fetch: typeof fetch; resolveHost?: HostResolver },
): Promise<ClientMetadata> {
  const url = parseCimdUrl(clientId);
  if (!url) throw new CimdError("UNSAFE_URL", "client_id の URL の形が使えない");

  const addresses = await (deps.resolveHost ?? resolveHostDefault)(url.hostname).catch(() => []);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new CimdError("UNSAFE_URL", "取りに行く先が私的な番地に解決された");
  }

  let response: Response;
  try {
    response = await deps.fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch {
    throw new CimdError("FETCH_FAILED", "文書が取れない");
  }
  if (!response.ok) throw new CimdError("FETCH_FAILED", `文書の応答が ${response.status}`);

  const body = await readBounded(response, CIMD_MAX_BYTES);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new CimdError("INVALID_DOCUMENT", "JSON として読めない");
  }
  return validateClientMetadata(json, clientId);
}

/**
 * 応答の本文を上限つきで読む（超えたら止める）。
 * @param response 応答
 * @param maxBytes 上限（バイト）
 * @returns 本文の文字列
 */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new CimdError("TOO_LARGE", "文書が大きすぎる");
  if (!response.body) return "";
  const stream = response.body as unknown as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = Buffer.from(next.value);
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new CimdError("TOO_LARGE", "文書が大きすぎる");
    }
    chunks.push(chunk);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * 文書の形を確かめる（client_id の一致・戻り先の登録・名前）。
 * @param json 読んだ JSON
 * @param clientId 要求の client_id（文書の client_id と一致しなければならない）
 * @returns 検証を通ったメタデータ
 * @throws CimdError 形が違う
 */
export function validateClientMetadata(json: unknown, clientId: string): ClientMetadata {
  const bad = (message: string): never => {
    throw new CimdError("INVALID_DOCUMENT", message);
  };
  if (typeof json !== "object" || json === null || Array.isArray(json))
    bad("文書が JSON の箱ではない");
  const doc = json as Record<string, unknown>;
  if (doc.client_id !== clientId) bad("文書の client_id が一致しない");
  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS)
    bad("redirect_uris の数が使えない");
  const redirectUris = (uris as unknown[]).map((u) => {
    if (typeof u !== "string" || !isRegistrableRedirectUri(u))
      bad("redirect_uris に使えない戻り先がある");
    return u as string;
  });
  const name = doc.client_name;
  if (name !== undefined && (typeof name !== "string" || name.length > 100))
    bad("client_name が使えない");
  return { clientId, clientName: typeof name === "string" ? name : "", redirectUris };
}
