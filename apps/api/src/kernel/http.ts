// 道の文脈の型と、領域の道に土台が渡す道具の型、領域の道で共に使う手伝い（道の値の形・よく使うエラーの応答）。
// 組み立て（app.ts）と領域（modules/<領域>/）が同じ型を使う。領域は組み立てを読めない（境界の決まり）ので、ここに置く。
import { z } from "@hono/zod-openapi";
import type { RequestIdVariables } from "hono/request-id";
import type { Config } from "./config.ts";
import type { Db } from "./db.ts";
import { errorResponse } from "./errors.ts";
import type { DomainFeatures } from "./features.ts";
import type { Logger } from "./logger.ts";

/** 道の文脈の型（要求ごとの値）。 */
export type ApiEnv = { Variables: RequestIdVariables };

/**
 * 設定のうち、領域が読んでよい値（秘密を含まない。DB の接続先などは渡さない）。
 * 環境の名前（appEnv）は渡さない（環境の名前でふるまいを分けないため。docs/rules/coding.md 2）。
 */
export type DomainConfig = Readonly<
  Pick<
    Config,
    "webUrl" | "lineChannelIds" | "organizerLineUserId" | "openChatUrl" | "testLoginEnabled"
  >
>;

/** 領域の道を作るときに、土台が渡す道具。設定のまるごとは渡さない。 */
export type DomainRouteDeps = {
  /** DB */
  db: Db;
  /** ログ（要求と応答の本文・利用者の入れた値は出さない） */
  logger: Logger;
  /** 領域の機能の印（設定 DOMAIN_FEATURES。enabled("<領域>.<名前>")。既定はどれも切） */
  features: DomainFeatures;
  /** 設定のうち、領域が読んでよい値（秘密を含まない） */
  config: DomainConfig;
  /** 外のサービス（LINE など）への HTTP の出口。テストでは差しかえる（既定は外へ出ない） */
  fetch: typeof fetch;
};

/**
 * 道の値の形（uuid の形の ID）。形が合わなければ、組み立ての入力の確かめ（app.ts の defaultHook）が、
 * 道の値の誤りとして、ないときと同じ 404（NOT_FOUND）にする（DB を読まない。各処理で形を確かめなくてよい）。
 * @param name 道の名前
 * @param description 説明
 * @returns zod の形
 */
export function uuidParam(name: string, description: string) {
  return z.guid().openapi({ param: { name, in: "path" }, format: "uuid", description });
}

/** 404 の応答。 */
export const notFoundResponse = errorResponse("NOT_FOUND", "ない（消した・ID が違う）");

/** 400 の応答。 */
export const invalidInputResponse = errorResponse(
  "INVALID_INPUT",
  "入力が合わない（欄ごとの理由）",
);
