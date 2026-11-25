// 操作の記録の窓口（threads-005）。道の頭は /api/v1/threads（AD-15）。ログインが要り、持ち主だけ。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import { invalidInputResponse } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { listActivity } from "./activity-log.ts";
import {
  ACCOUNTS_BASE,
  AccountParams,
  COMMON_ERRORS,
  TAGS,
  accountMiddleware,
  json,
  accountAccess,
} from "./route-helpers.ts";

/** 操作の記録の問い合わせ（文書の説明つき）。 */
const ActivityQuery = z.object({
  kind: contract.ActivityQuery.shape.kind.openapi({
    param: { name: "kind", in: "query" },
    description: "種類（review・draft・content・settings・autopost。なければすべて）",
  }),
});

/**
 * 操作の記録の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function activityRoutes(deps: DomainRouteDeps) {
  const route = createRoute({
    method: "get",
    path: `${ACCOUNTS_BASE}/{accountId}/activity`,
    tags: TAGS,
    operationId: "threadsListActivity",
    summary: "操作の記録（新しい順に100件まで。90日を過ぎたものは消える）",
    middleware: accountMiddleware(deps),
    request: { params: AccountParams, query: ActivityQuery },
    responses: {
      200: json(contract.ActivityList.openapi("ThreadsActivityList"), "操作の記録"),
      400: invalidInputResponse,
      ...COMMON_ERRORS,
    },
  });
  return new OpenAPIHono<ApiEnv>().openapi(route, async (c) => {
    const access = await accountAccess(deps, c, c.req.valid("param").accountId, "activity");
    // 組織に入っている運用アカウントでは、した人の表示名を出す（threads-013 FR-T50）
    return c.json(
      {
        items: await listActivity(
          deps.db,
          access.account.id,
          c.req.valid("query").kind,
          access.placed,
        ),
      },
      200,
    );
  });
}
