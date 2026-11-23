// MCP の窓口（/api/mcp・Streamable HTTP）（core-021・AD-20・AD-21）。
// 構え（A の方針）：HTTP の受付・Bearer の確かめ・Origin・回数の制限・記録は kanaeru のコードが持つ。
// SDK は「要求を受けて、MCP の中身に渡す」部分（WebStandardStreamableHTTPServerTransport）だけを使う。
// - 状態を持たない（要求ごとに道具の一覧を作る。セッションの札は出さない）。応答は JSON（enableJsonResponse）。
// - 道具は、トークンの範囲（scope）で見せるものを決める。範囲にない道具は一覧にも出さず、呼べない。
// - クッキーのログインは受けない（Bearer だけ。FR-013）。宛先（resource）が /api/mcp でないトークンは断る（FR-007）。
// 仮決め：道具はまだ登録しない（最初の読む道具は次の PR で、本人の記録を返すものを1つ足す）。回数の制限は、このプロセスの中で数える。
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import type { z } from "zod";
import type { Context } from "hono";
import { createCounter } from "../../../platform/rate-limit/index.ts";
import { AppError } from "../../../kernel/errors.ts";
import type { ApiEnv, DomainRouteDeps } from "../../../kernel/http.ts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { canonicalMcpResource } from "./resource.ts";
import { findActiveToken, insertToolCall, touchGrant } from "./store.ts";
import { hashOpaqueToken } from "./tokens.ts";

/** 道具の定義（領域が自分の道具を1つずつ出す。窓口を呼ぶ中身は run の中に書く。AD-20）。 */
export type McpTool = {
  /** 道具の名前（例 reception_my_checkins） */
  name: string;
  /** AI に見せる説明 */
  description: string;
  /** 読むか書くか（書くは次の段階の仕組み。FR-025） */
  access: "read" | "write";
  /** 呼ぶのに要る範囲（例 reception:read） */
  requiredScope: string;
  /** 入力の形（zod 4 など Standard Schema） */
  inputSchema: z.ZodType;
  /**
   * 道具の中身。利用者の資格は bearer（そのまま窓口に付ける。AD-20）。
   * @param input 入力（inputSchema を通ったもの）
   * @param ctx 呼んだ利用者の ID と札
   * @returns 本文（テキスト）
   */
  run(input: unknown, ctx: { accountId: string; bearer: string }): Promise<string>;
};

/** 回数の制限：トークンごとに、1分あたりの呼び出し（仮決め）。 */
const MCP_RATE_LIMIT = { enabled: true, windowSeconds: 60, max: 120 } as const;

/**
 * 認可の要求の Bearer を取る（形が違えば undefined）。
 * @param c 要求の文脈
 * @returns 札
 */
function bearerOf(c: Context): string | undefined {
  const header = c.req.header("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  return match?.[1];
}

/**
 * 未ログイン・札が使えない応答（RFC 9728 の場所を WWW-Authenticate で示す）。
 * @param c 要求の文脈
 * @param issuer 発行者（画面の源）
 * @param error 札の問題の印（省けば、札がない）
 * @returns 401 の応答
 */
function unauthorized(c: Context, issuer: string, error?: string): Response {
  const parts = [`resource_metadata="${issuer}/.well-known/oauth-protected-resource"`];
  if (error) parts.push(`error="${error}"`);
  c.header("WWW-Authenticate", `Bearer ${parts.join(", ")}`);
  c.header("Cache-Control", "no-store");
  return c.json({ error: { code: "UNAUTHENTICATED", message: "札がない・使えない" } }, 401);
}

/**
 * /api/mcp の道を app に足す（registerOAuthRoutes から呼ぶ）。
 * @param app 領域の道
 * @param deps 土台の道具
 * @param tools 道具の一覧（最初は空。領域が足す）
 * @returns 同じ app
 */
export function registerMcpRoute<T extends OpenAPIHono<ApiEnv>>(app: T, deps: DomainRouteDeps, tools: readonly McpTool[] = []): T {
  const issuer = new URL(deps.config.webUrl).origin;
  const resource = canonicalMcpResource(deps.config.webUrl);
  const limiter = createCounter(MCP_RATE_LIMIT);

  // 文書：この道は createRoute を通さない（Streamable HTTP の応答は SDK が作る）。文書だけ登録して、起動の確かめを通す。
  const responses = {
    200: { description: "MCP の応答（JSON）" },
    401: { description: "札がない・使えない（WWW-Authenticate で認可の場所を示す）" },
    403: { description: "源が違う" },
    429: { description: "回数の制限を超えた" },
  };
  for (const method of ["get", "post", "delete"] as const) {
    app.openAPIRegistry.registerPath({
      method,
      path: "/api/mcp",
      tags: ["account"],
      operationId: `accountMcp${method.charAt(0).toUpperCase()}${method.slice(1)}`,
      summary: "MCP の窓口（Streamable HTTP。Bearer の札だけ）",
      responses,
    });
  }

  app.on(["GET", "POST", "DELETE"], "/api/mcp", async (c) => {
    // 源の確かめ：画面の源と違う Origin は断る（Origin のない要求は通す。クライアントは送らないことがある）
    const origin = c.req.header("origin");
    if (origin && origin !== issuer) throw new AppError("FORBIDDEN");

    const token = bearerOf(c);
    if (!token) return unauthorized(c, issuer);
    const row = await findActiveToken(deps.db, hashOpaqueToken(token), "access");
    if (!row) return unauthorized(c, issuer, "invalid_token");
    // 宛先の確かめ：このトークンは /api/mcp 宛てのものだけ（別の宛先のトークンは受けない。FR-007）
    if (row.resource !== resource) return unauthorized(c, issuer, "invalid_token");

    const retryAfter = limiter.consume(row.tokenId);
    if (retryAfter !== undefined) {
      c.header("Retry-After", String(Math.ceil(retryAfter)));
      c.header("Cache-Control", "no-store");
      return c.json({ error: { code: "RATE_LIMITED", message: "回数の制限を超えた" } }, 429);
    }
    await touchGrant(deps.db, row.grantId);

    // 範囲で見せる道具を決める（範囲にない道具は一覧にも出さず、呼べない）
    const allowed = tools.filter((tool) => row.scopes.includes(tool.requiredScope));
    const server = new McpServer({ name: "kanaeru", version: "0.0.0" });
    for (const tool of allowed) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema },
        async (input: unknown) => {
          let result = "ok";
          try {
            const text = await tool.run(input, { accountId: row.accountId, bearer: token });
            return { content: [{ type: "text" as const, text }] };
          } catch (error) {
            result = "error";
            throw error;
          } finally {
            // 記録は中身を持たない（道具の名前・誰が・結果の種類だけ。FR-018）
            await insertToolCall(deps.db, {
              accountId: row.accountId,
              toolName: tool.name,
              access: tool.access,
              result,
            });
          }
        },
      );
    }

    // 道具が1つもないときも、一覧には空で答える（SDK は道具を登録したときにだけ一覧の道を作るため）
    if (allowed.length === 0) {
      server.server.registerCapabilities({ tools: {} });
      server.server.setRequestHandler("tools/list", () => Promise.resolve({ tools: [] }));
    }

    // 状態を持たない：要求ごとに道具の一覧を作り、JSON で答える
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return app;
}
