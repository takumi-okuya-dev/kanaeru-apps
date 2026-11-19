// テストの手伝い：API を組み立て、要求を送る。
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createApp } from "../../src/app.ts";
import type { AppDeps, AppEnv } from "../../src/app.ts";
import { loadConfig } from "../../src/kernel/config.ts";
import type { Config } from "../../src/kernel/config.ts";
import type { Database } from "../../src/kernel/db.ts";
import { createLogger } from "../../src/kernel/logger.ts";

/** 組み立てた API。 */
export type TestApp = OpenAPIHono<AppEnv>;

/** テストの画面の源（vitest.config.ts の WEB_URL）。 */
export const TEST_ORIGIN = "http://localhost:5173";

/**
 * テストの設定を読む（vitest.config.ts の値）。
 * @param overrides 替える値
 * @returns 設定
 */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig(), ...overrides };
}

/**
 * テストの既定の外への出口（呼ぶと投げる。テストがネットワークに出ないように）。外の答えが要るテストは extra.fetch で渡す。
 * @param input 宛先
 * @returns 返らない（いつも投げる）
 * @throws {Error} いつも
 */
export function offlineFetch(input: string | URL | Request): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  return Promise.reject(new Error(`テストから外へ出ようとしました：${url}`));
}

/**
 * API を組み立てる（ログは捨てる。外への出口は既定で offlineFetch）。
 * @param database DB の接続
 * @param config 設定
 * @param extra そのほかの道具（領域・機能の印）
 * @returns 組み立てた API
 */
export function buildApp(
  database: Database,
  config: Config = testConfig(),
  extra: Partial<Omit<AppDeps, "config" | "database">> = {},
): TestApp {
  return createApp({
    config,
    database,
    logger: createLogger({ level: "silent", pretty: false }),
    fetch: offlineFetch,
    ...extra,
  });
}

/**
 * JSON の本文を送る要求の中身（画面の源の Origin つき）。
 * @param method 動き
 * @param body 本文
 * @returns 要求の中身
 */
export function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json", origin: TEST_ORIGIN },
    body: JSON.stringify(body),
  };
}
