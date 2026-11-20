// 運用アカウントのホームと、開いた記録の窓口（threads-012）。道の頭は /api/v1/threads（AD-15）。ログインが要り、持ち主と担当の人（threads-013）。
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/threads";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { openAccount, readAccountHome } from "./home.ts";
import { countDrafts } from "./repository.ts";
import {
  ACCOUNTS_BASE,
  AccountParams,
  COMMON_ERRORS,
  TAGS,
  accountAccess,
  accountMiddleware,
  json,
  ownedAccount,
} from "./route-helpers.ts";
import { toThreadsAccount } from "./views.ts";

/**
 * ホームと開いた記録の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function homeRoutes(deps: DomainRouteDeps) {
  const middleware = accountMiddleware(deps);
  const routes = {
    getHome: createRoute({
      method: "get",
      path: `${ACCOUNTS_BASE}/{accountId}/home`,
      tags: TAGS,
      operationId: "threadsGetAccountHome",
      summary: "ホームの材料の数（戦略の入れた数・宣伝の数・参考の投稿とキーワードの数）",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.AccountHome.openapi("ThreadsAccountHome"), "ホームの材料の数"),
        ...COMMON_ERRORS,
      },
    }),
    openAccount: createRoute({
      method: "post",
      path: `${ACCOUNTS_BASE}/{accountId}/open`,
      tags: TAGS,
      operationId: "threadsOpenAccount",
      summary:
        "運用アカウントを開いたことを残す（/threads の行き先に使う）。つないでいれば、持っているトークンでプロフィールを読み直す",
      middleware,
      request: { params: AccountParams },
      responses: {
        200: json(contract.ThreadsAccount, "読み直した運用アカウント"),
        ...COMMON_ERRORS,
      },
    }),
  };
  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getHome, async (c) => {
      const account = await ownedAccount(deps, c, c.req.valid("param").accountId, "read_private");
      return c.json(await readAccountHome(deps.db, account.id, new Date()), 200);
    })
    .openapi(routes.openAccount, async (c) => {
      // 受け取った時刻で比べる（後から届いた古い要求で、最後に開いたものを戻さない）
      const openedAt = new Date();
      const access = await accountAccess(deps, c, c.req.valid("param").accountId, "read_private");
      // 最後に開いた日時とプロフィールの読み直しは、持ち主のときだけ（担当の人が開いても持ち主の行き先を変えない。threads-013）
      if (access.relation !== "owner") {
        const { account } = access;
        return c.json(
          {
            ...toThreadsAccount(account, await countDrafts(deps.db, account.id)),
            lastOpenedAt: null,
          },
          200,
        );
      }
      await openAccount(deps, access.account.id, openedAt);
      const fresh = await ownedAccount(deps, c, access.account.id);
      return c.json(toThreadsAccount(fresh, await countDrafts(deps.db, fresh.id)), 200);
    });
}
