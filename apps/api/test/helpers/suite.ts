// テストの手伝い：見本のアプリ（テストだけ。apps.list.ts に登録しない）と、その領域（道を1つ持つ）。
// 組み立ての extraApps・extraModules に渡すと、requireApp が見本の領域の道にも付く（AD-16 の確かめに使う）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { AppDefinition } from "@workspace/contracts/core";
import type { DomainModule } from "../../src/app.ts";
import type { ApiEnv } from "../../src/kernel/http.ts";

/** 見本のアプリの key（予約語でない英小文字）。 */
export const DEMO_APP_KEY = "demo";

/** 見本のアプリ（領域 demo だけを持つ）。 */
export const DEMO_APP: AppDefinition = {
  key: DEMO_APP_KEY,
  name: "見本のアプリ",
  summary: "テストだけのアプリ",
  description: "アプリの切り替えと公開の状態を確かめるための、テストだけのアプリです。",
  icon: "list",
  domains: ["demo"],
  basePath: "/demo",
  uses: [],
  accountData: "見本の記録",
};

/** 見本の領域の道（ログインなしで答える）。 */
const pingRoute = createRoute({
  method: "get",
  path: "/api/v1/demo/ping",
  tags: ["demo"],
  operationId: "demoPing",
  summary: "見本の領域が動いているか（テストだけ）",
  responses: {
    200: {
      description: "動いている",
      content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
    },
  },
});

/** 見本の領域（組み立ての extraModules に { demo: DEMO_MODULE } で渡す）。 */
export const DEMO_MODULE: DomainModule = {
  routes: () => new OpenAPIHono<ApiEnv>().openapi(pingRoute, (c) => c.json({ ok: true }, 200)),
};
