// 書誌の検索（構成の決めごと AD-33・specs/reading/001-bookshelf-import/research.md R9）。外の書誌の API を呼ぶのは、この1つの部品だけ。
// - ISBN：openBD（鍵なし・一度に複数）。なければ国立国会図書館サーチ（NDL サーチ）の OpenSearch の ISBN の検索。
// - 書名：NDL サーチの OpenSearch に dpid=iss-ndl-opac を付ける（NDL が作った書誌に絞り、営利でも申請が要らない形。補足 8章）。
//   答えの RSS（XML）は fast-xml-parser で読む。候補の書影は、ISBN のあるものだけ openBD にまとめて問い合わせる。
// - 書影は openBD の書影の置き場所（https://cover.openbd.jp/）のものだけを返す（画面の CSP と同じ源）。
// 出口は deps.fetch（テストで差しかえる）。5秒で打ち切る。失敗・打ち切り・形の違う答えは READING_CATALOG_UNAVAILABLE（文に URL と検索の言葉を入れない）。
import { READING_COVER_URL_PREFIX, READING_ERRORS, toIsbn13 } from "@workspace/contracts/reading";
import type { CatalogItem } from "@workspace/contracts/reading";
import { XMLParser } from "fast-xml-parser";
import { AppError } from "../../kernel/errors.ts";

/** openBD の窓口。 */
const OPENBD_GET = "https://api.openbd.jp/v1/get";

/** NDL サーチの OpenSearch の窓口。 */
const NDL_OPENSEARCH = "https://ndlsearch.ndl.go.jp/api/opensearch";

/** 外への1回の問い合わせの打ち切り（ミリ秒）。 */
const TIMEOUT_MS = 5_000;

/** 返す候補の数の上限。 */
const MAX_ITEMS = 20;

/** 外の答えの本文の大きさの上限（文字の数。それより大きい答えは読まない）。 */
const MAX_BODY_CHARS = 1_000_000;

/** 書名・著者の長さの上限（字。本の表の上限と同じ。こえる分は切る）。 */
const MAX_TEXT_CHARS = 300;

/** XML の決まった実体（DOCTYPE の実体は展開しない）。 */
const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/**
 * XML の決まった実体と数の実体を、字に直す（fast-xml-parser の実体の展開は使わない）。
 * @param value 文字
 * @returns 直した文字
 */
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/giu, (whole, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    if (name.startsWith("#")) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** 書誌の検索の部品。 */
export type CatalogClient = {
  /**
   * 書名か ISBN で書誌を探す。
   * @param q 書名か ISBN（前後の空白を除いたもの）
   * @returns 候補（20件まで）
   */
  search(q: string): Promise<CatalogItem[]>;
};

/** openBD の1件（使う所だけ）。 */
type OpenBdRecord = {
  summary?: { isbn?: unknown; title?: unknown; author?: unknown; cover?: unknown };
} | null;

/**
 * 文字なら前後の空白を除いて返す（空なら null）。
 * @param value 値
 * @returns 文字か null
 */
function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = decodeEntities(value).trim();
  if (trimmed === "") return null;
  // 字（コードポイント）の数で切る（UTF-16 の単位で切ると、2つで1字の字が割れるため）
  return [...trimmed].slice(0, MAX_TEXT_CHARS).join("");
}

/**
 * 書影の URL を、openBD の書影の置き場所のものだけ通す。
 * @param value 値
 * @returns 書影の URL か null
 */
function coverOrNull(value: unknown): string | null {
  const url = textOrNull(value);
  return url !== null && url.startsWith(READING_COVER_URL_PREFIX) && url.length <= 300 ? url : null;
}

/**
 * 書誌の検索の部品を作る。
 * @param fetchImpl 外への出口（deps.fetch）
 * @returns 書誌の検索の部品
 */
export function createCatalogClient(fetchImpl: typeof fetch): CatalogClient {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    htmlEntities: false,
    isArray: (name) => ["item", "dc:creator", "dc:identifier", "dc:title"].includes(name),
  });

  /**
   * 外に問い合わせて本文を読む。失敗はすべて READING_CATALOG_UNAVAILABLE にする。
   * @param url 問い合わせる URL
   * @returns 本文の文字
   * @throws {AppError} 失敗・打ち切り・200 でない
   */
  async function get(url: URL): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new AppError(READING_ERRORS.CATALOG_UNAVAILABLE);
    }
    if (!response.ok) throw new AppError(READING_ERRORS.CATALOG_UNAVAILABLE);
    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new AppError(READING_ERRORS.CATALOG_UNAVAILABLE);
    }
    if (body.length > MAX_BODY_CHARS) throw new AppError(READING_ERRORS.CATALOG_UNAVAILABLE);
    return body;
  }

  /**
   * openBD に ISBN をまとめて問い合わせる。
   * @param isbns 13桁の ISBN
   * @returns ISBN ごとの1件（ないものは入らない）
   * @throws {AppError} 失敗・形が違う
   */
  async function openBd(isbns: string[]): Promise<Map<string, CatalogItem>> {
    const found = new Map<string, CatalogItem>();
    if (isbns.length === 0) return found;
    const url = new URL(OPENBD_GET);
    url.searchParams.set("isbn", isbns.join(","));
    let records: unknown;
    try {
      records = JSON.parse(await get(url));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(READING_ERRORS.CATALOG_UNAVAILABLE);
    }
    if (!Array.isArray(records)) throw new AppError(READING_ERRORS.CATALOG_UNAVAILABLE);
    for (const record of records as OpenBdRecord[]) {
      const summary = record?.summary;
      const isbn = toIsbn13(typeof summary?.isbn === "string" ? summary.isbn : "");
      const title = textOrNull(summary?.title);
      if (isbn === null || title === null) continue;
      found.set(isbn, {
        title,
        author: textOrNull(summary?.author),
        isbn,
        coverUrl: coverOrNull(summary?.cover),
        source: "openbd",
      });
    }
    return found;
  }

  /**
   * NDL サーチの OpenSearch を呼ぶ。
   * @param params 問い合わせの値（title か isbn）
   * @returns 候補（同じ ISBN は1つ）
   * @throws {AppError} 失敗・形が違う
   */
  async function ndl(params: Record<string, string>): Promise<CatalogItem[]> {
    const url = new URL(NDL_OPENSEARCH);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("dpid", "iss-ndl-opac");
    url.searchParams.set("cnt", String(MAX_ITEMS));
    let parsed: unknown;
    try {
      parsed = parser.parse(await get(url));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(READING_ERRORS.CATALOG_UNAVAILABLE);
    }
    const channel = (parsed as { rss?: { channel?: { item?: unknown[] } } } | null)?.rss?.channel;
    if (!channel || typeof channel !== "object") {
      throw new AppError(READING_ERRORS.CATALOG_UNAVAILABLE);
    }
    const items: CatalogItem[] = [];
    const seen = new Set<string>();
    for (const raw of channel.item ?? []) {
      const item = raw as Record<string, unknown>;
      const titles = (item["dc:title"] as unknown[] | undefined) ?? [];
      const title = textOrNull(nodeText(titles[0])) ?? textOrNull(nodeText(item.title));
      if (title === null) continue;
      const creators = ((item["dc:creator"] as unknown[] | undefined) ?? [])
        .map((creator) => textOrNull(nodeText(creator)))
        .filter((creator): creator is string => creator !== null);
      const isbn =
        ((item["dc:identifier"] as unknown[] | undefined) ?? [])
          .filter((id) => attribute(id, "@_xsi:type") === "dcndl:ISBN")
          .map((id) => toIsbn13(nodeText(id) ?? ""))
          .find((value): value is string => value !== null) ?? null;
      const key = isbn ?? `title:${title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        title,
        author: creators.length === 0 ? null : textOrNull(creators.slice(0, 3).join("・")),
        isbn,
        coverUrl: null,
        source: "ndl",
      });
      if (items.length >= MAX_ITEMS) break;
    }
    return items;
  }

  return {
    async search(q) {
      const isbn = toIsbn13(q);
      if (isbn !== null) {
        const fromOpenBd = (await openBd([isbn])).get(isbn);
        if (fromOpenBd) return [fromOpenBd];
        return ndl({ isbn });
      }
      const items = await ndl({ title: q });
      const withIsbn = items.flatMap((item) => (item.isbn ? [item.isbn] : []));
      // 書影は openBD にあるときだけ（なくても候補は返す。書影の問い合わせの失敗で、検索まで失敗にしない）
      const covers = await openBd(withIsbn).catch(() => new Map<string, CatalogItem>());
      return items.map((item) => ({
        ...item,
        coverUrl: item.isbn ? (covers.get(item.isbn)?.coverUrl ?? null) : null,
      }));
    },
  };
}

/**
 * XML の節の文字（属性つきの節は #text）。
 * @param node 節
 * @returns 文字（なければ null）
 */
function nodeText(node: unknown): string | null {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node && typeof node === "object" && "#text" in node) {
    const text = node["#text"];
    return typeof text === "string" || typeof text === "number" ? String(text) : null;
  }
  return null;
}

/**
 * XML の節の属性。
 * @param node 節
 * @param name 属性の名前（@_ つき）
 * @returns 属性の値（なければ null）
 */
function attribute(node: unknown, name: string): string | null {
  if (!node || typeof node !== "object") return null;
  const value = (node as Record<string, unknown>)[name];
  return typeof value === "string" ? value : null;
}
