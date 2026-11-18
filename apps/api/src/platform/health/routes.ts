// 動いているかの窓口（GET /api/v1/health）。API と DB につながるかだけを返す。名前や中身は返さない。
// DB に触るので、置き場所（Cloud Run）の起動の確かめ（probe）には使わない（夜間は DB が止まるため。AD-10）。
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { Health as HealthContract } from "@workspace/contracts/core";
import { AppError, errorResponse } from "../../kernel/errors.ts";

/** 動いているかの答え（文書の名前 Health を付けたもの）。 */
const Health = HealthContract.openapi("Health");

const getHealth = createRoute({
  method: "get",
  path: "/api/v1/health",
  tags: ["core"],
  operationId: "getHealth",
  summary: "動いているかを見る",
  description:
    "API と DB につながるかを返す。名前や中身は返さない。DB に触るので、置き場所の起動の確かめ（probe）には使わない。",
  responses: {
    200: { description: "動いている", content: { "application/json": { schema: Health } } },
    503: errorResponse("DB_UNAVAILABLE", "DB につながらない（夜間の停止など）"),
  },
});

/** 動いているかの窓口が使う道具。 */
export type HealthDeps = {
  /** DB につながるかを確かめる（select 1）。つながらなければ投げる */
  ping: () => Promise<void>;
};

/**
 * 動いているかの道を作る。
 * @param deps 道が使う道具
 * @returns 道（OpenAPIHono）
 */
export function healthRoutes(deps: HealthDeps) {
  return new OpenAPIHono().openapi(getHealth, async (c) => {
    try {
      await deps.ping();
    } catch {
      throw new AppError("DB_UNAVAILABLE");
    }
    return c.json({ status: "ok" as const }, 200);
  });
}
