// 書誌の検索の結合のテスト（AD-33・research R9）：外への出口（fetch）を差しかえ、openBD と NDL サーチの答え（架空の見本）から候補を作る。
// 失敗・打ち切り・形の違う答えは READING_CATALOG_UNAVAILABLE で、文に URL と検索の言葉が入らない。書影は openBD のものだけ。
import "@hono/zod-openapi";
import type { CatalogResult } from "@workspace/contracts/reading";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAs } from "../../../test/helpers/account.ts";
import { buildApp, testConfig } from "../../../test/helpers/app.ts";
import { truncateAllTables, useTestDatabase } from "../../../test/helpers/db.ts";
import { call } from "../../../test/helpers/event.ts";
import type { ErrorBody } from "../../../test/helpers/event.ts";
import { READING_API, showReadingApp } from "../../../test/helpers/reading.ts";

const database = useTestDatabase();

/** 架空の ISBN（確かめの数字が合うもの）。 */
const ISBN_A = "9784873117782";
const ISBN_B = "9784000000000";

/**
 * NDL サーチの OpenSearch の答え（RSS）の見本。
 * @param items 書名・著者・ISBN
 * @returns XML
 */
function ndlRss(items: { title: string; creators?: string[]; isbn?: string }[]): string {
  const body = items
    .map(
      (item) => `<item>
  <title>${item.title}</title>
  <dc:title>${item.title}</dc:title>
  ${(item.creators ?? []).map((creator) => `<dc:creator>${creator}</dc:creator>`).join("")}
  ${item.isbn ? `<dc:identifier xsi:type="dcndl:ISBN">${item.isbn}</dc:identifier>` : ""}
  <dc:identifier xsi:type="dcndl:JPNO">00000000</dc:identifier>
</item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:dcndl="http://ndl.go.jp/dcndl/terms/">
<channel><title>NDL</title>${body}</channel></rss>`;
}

/** 呼ばれた URL の記録と、差しかえる答え。 */
type FakeRoute = (url: URL) => Response | Promise<Response>;

describe("書誌の検索", () => {
  let calls: URL[];
  let route: FakeRoute;
  let cookie: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    await truncateAllTables(database);
    await showReadingApp(database);
    calls = [];
    route = () => new Response("not found", { status: 404 });
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      calls.push(url);
      return route(url);
    }) as typeof fetch;
    app = buildApp(database, testConfig(), { fetch: fakeFetch });
    cookie = (await loginAs(app, { displayName: "使う人" })).cookie;
  });

  /**
   * 書誌を探す。
   * @param q 書名か ISBN
   * @returns 応答
   */
  async function search(q: string): Promise<Response> {
    return call(app, cookie, `${READING_API}/catalog/search`, "POST", { q });
  }

  it("ISBN は openBD から取り、書影は openBD の置き場所のものだけ", async () => {
    route = (url) =>
      url.hostname === "api.openbd.jp"
        ? Response.json([
            {
              summary: {
                isbn: ISBN_A,
                title: "見本の本",
                author: "架空 太郎／著",
                cover: `https://cover.openbd.jp/${ISBN_A}.jpg`,
              },
            },
          ])
        : new Response("", { status: 500 });
    const response = await search("4-87311-778-X");
    expect(response.status).toBe(200);
    expect(((await response.json()) as CatalogResult).items).toEqual([
      {
        title: "見本の本",
        author: "架空 太郎／著",
        isbn: ISBN_A,
        coverUrl: `https://cover.openbd.jp/${ISBN_A}.jpg`,
        source: "openbd",
      },
    ]);
    expect(calls[0]?.searchParams.get("isbn")).toBe(ISBN_A);
  });

  it("openBD になければ NDL サーチの ISBN の検索で補う", async () => {
    route = (url) =>
      url.hostname === "api.openbd.jp"
        ? Response.json([null])
        : new Response(ndlRss([{ title: "NDL の本", creators: ["架空 花子 著"], isbn: ISBN_A }]));
    const items = ((await (await search(ISBN_A)).json()) as CatalogResult).items;
    expect(items).toEqual([
      { title: "NDL の本", author: "架空 花子 著", isbn: ISBN_A, coverUrl: null, source: "ndl" },
    ]);
    const ndl = calls.find((url) => url.hostname === "ndlsearch.ndl.go.jp");
    expect(ndl?.searchParams.get("isbn")).toBe(ISBN_A);
    expect(ndl?.searchParams.get("dpid")).toBe("iss-ndl-opac");
  });

  it("書名は NDL サーチで探し、同じ ISBN は1つにまとめ、書影を openBD にまとめて問い合わせる", async () => {
    route = (url) => {
      if (url.hostname === "ndlsearch.ndl.go.jp") {
        return new Response(
          ndlRss([
            { title: "見本の本", creators: ["架空 太郎", "架空 次郎"], isbn: ISBN_A },
            { title: "見本の本（電子版）", isbn: ISBN_A },
            { title: "見本の本 2", isbn: ISBN_B },
            { title: "ISBN のない本" },
          ]),
        );
      }
      return Response.json([
        {
          summary: {
            isbn: ISBN_A,
            title: "見本の本",
            cover: `https://cover.openbd.jp/${ISBN_A}.jpg`,
          },
        },
        { summary: { isbn: ISBN_B, title: "見本の本 2", cover: "https://example.com/evil.jpg" } },
      ]);
    };
    const items = ((await (await search("見本")).json()) as CatalogResult).items;
    expect(items.map((item) => item.title)).toEqual(["見本の本", "見本の本 2", "ISBN のない本"]);
    expect(items[0]).toMatchObject({
      author: "架空 太郎・架空 次郎",
      coverUrl: `https://cover.openbd.jp/${ISBN_A}.jpg`,
    });
    expect(items[1]?.coverUrl).toBeNull();
    const ndl = calls.find((url) => url.hostname === "ndlsearch.ndl.go.jp");
    expect(ndl?.searchParams.get("title")).toBe("見本");
    expect(ndl?.searchParams.get("dpid")).toBe("iss-ndl-opac");
    const openbd = calls.find((url) => url.hostname === "api.openbd.jp");
    expect(openbd?.searchParams.get("isbn")).toBe(`${ISBN_A},${ISBN_B}`);
  });

  it("書名と著者は300字で切り、XML の実体は字に直す（DOCTYPE の実体は展開しない）", async () => {
    route = (url) =>
      url.hostname === "ndlsearch.ndl.go.jp"
        ? new Response(
            ndlRss([{ title: `見本 &amp; ${"本".repeat(400)}`, creators: ["A &lt;B&gt;"] }]),
          )
        : Response.json([]);
    const [item] = ((await (await search("見本")).json()) as CatalogResult).items;
    expect(item?.title.startsWith("見本 & 本")).toBe(true);
    expect([...(item?.title ?? "")]).toHaveLength(300);
    expect(item?.author).toBe("A <B>");
  });

  it("答えが大きすぎれば 502", async () => {
    route = () => new Response("x".repeat(1_000_001));
    expect((await search("見本")).status).toBe(502);
  });

  it("書影の問い合わせが失敗しても、候補は返す", async () => {
    route = (url) =>
      url.hostname === "ndlsearch.ndl.go.jp"
        ? new Response(ndlRss([{ title: "見本の本", isbn: ISBN_A }]))
        : new Response("", { status: 503 });
    const response = await search("見本");
    expect(response.status).toBe(200);
    expect(((await response.json()) as CatalogResult).items[0]?.coverUrl).toBeNull();
  });

  it.each([
    ["500", () => new Response("", { status: 500 })],
    ["形の違う XML", () => new Response("<html>メンテナンス中</html>")],
    [
      "通信の失敗",
      () => {
        throw new TypeError(
          "fetch failed https://ndlsearch.ndl.go.jp/api/opensearch?title=秘密の言葉",
        );
      },
    ],
  ])("%s は 502 CATALOG_UNAVAILABLE で、文に URL と検索の言葉が入らない", async (_name, make) => {
    route = make;
    const response = await search("秘密の言葉");
    expect(response.status).toBe(502);
    const body = (await response.json()) as ErrorBody;
    expect(body.error.code).toBe("READING_CATALOG_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("秘密の言葉");
    expect(JSON.stringify(body)).not.toContain("ndlsearch");
  });

  it("空の言葉は 400。ログインしていなければ 401", async () => {
    expect((await search("  ")).status).toBe(400);
    const anonymous = await app.request(`${READING_API}/catalog/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: "見本" }),
    });
    expect([401, 403]).toContain(anonymous.status);
    expect(calls).toHaveLength(0);
  });
});
