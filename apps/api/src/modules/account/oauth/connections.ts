// 接続（同意）の一覧と取り消し（設定の画面の窓口。core-021・FR-015・SC-004）。
// 自分の同意だけを読んで止められる。取り消した同意の札は、次の呼び出しから使えない（store の findActiveToken が見る）。
import { createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/account";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { AppError } from "../../../kernel/errors.ts";
import type { ApiEnv, DomainRouteDeps } from "../../../kernel/http.ts";
import { currentAccount, requireSession } from "../session.ts";
import { listActiveGrants, revokeGrantOwnedBy } from "./store.ts";

const ConnectionList = contract.ConnectionListView.openapi("ConnectionListView");

const listRoute = createRoute({
  method: "get",
  path: "/api/v1/accounts/me/connections",
  tags: ["account"],
  operationId: "accountListConnections",
  summary: "自分の接続（AI のアプリへの同意）の一覧",
  middleware: [] as const,
  responses: {
    200: { description: "接続の一覧", content: { "application/json": { schema: ConnectionList } } },
  },
});

const revokeRoute = createRoute({
  method: "delete",
  path: "/api/v1/accounts/me/connections/{grantId}",
  tags: ["account"],
  operationId: "accountRevokeConnection",
  summary: "接続を取り消す（その同意の札は次の呼び出しから使えない）",
  request: { params: z.object({ grantId: z.uuid() }) },
  middleware: [] as const,
  responses: {
    204: { description: "取り消した" },
    404: { description: "その接続はない（ほかの人の接続も含む）" },
  },
});

/**
 * 接続の一覧と取り消しの道を足す（registerOAuthRoutes から呼ぶ）。
 * @param app 領域の道
 * @param deps 土台の道具
 * @returns 同じ app
 */
export function registerConnectionRoutes<T extends OpenAPIHono<ApiEnv>>(app: T, deps: DomainRouteDeps): T {
  const session = requireSession(deps);
  const listWithSession = createRoute({ ...listRoute, middleware: [session] as const });
  const revokeWithSession = createRoute({ ...revokeRoute, middleware: [session] as const });

  app.openapi(listWithSession, async (c) => {
    const rows = await listActiveGrants(deps.db, currentAccount(c).accountId);
    return c.json(
      {
        connections: rows.map((row) => ({
          id: row.id,
          clientName: row.clientName,
          scopes: row.scopes,
          lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
      },
      200,
    );
  });

  app.openapi(revokeWithSession, async (c) => {
    const { grantId } = c.req.valid("param");
    const revoked = await revokeGrantOwnedBy(deps.db, grantId, currentAccount(c).accountId);
    if (!revoked) throw new AppError("NOT_FOUND");
    return c.body(null, 204);
  });

  return app;
}
