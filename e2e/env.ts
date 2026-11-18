// E2E の設定：E2E 専用の DB の名前と口の番号を作り、API と画面に渡す値を決める。
// 手元の .env（と環境の変数）からは、作業場所ごとに分ける値（DB の接続先と口の番号）だけを読む。ほかの値は、
// 手元の .env の機能の印や設定に左右されないよう、ここで決める（docs/rules/coding.md 2・6-5）。
// 手元で pnpm dev を動かしたままでも流せるよう、口の番号は .env の値から 1000 ずらす。
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/** 手元から読む値（作業場所ごとに分ける値だけ）。 */
const LOCAL_KEYS = ["DATABASE_URL", "API_PORT", "WEB_PORT"] as const;

const envFile = new URL("../.env", import.meta.url);
const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const env: Partial<Record<(typeof LOCAL_KEYS)[number], string>> = Object.fromEntries(
  LOCAL_KEYS.flatMap((key) => {
    const value = process.env[key] || fileEnv[key];
    return value ? [[key, value]] : [];
  }),
);

const baseDatabaseUrl = env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/app";
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.pathname = `${databaseUrl.pathname}_e2e`;

/** E2E の DB の接続先（<DB名>_e2e。なければ API の webServer の db:migrate が作る）。 */
export const E2E_DATABASE_URL = databaseUrl.toString();
/** E2E の API の口の番号。 */
export const E2E_API_PORT = Number(env.API_PORT || 8787) + 1000;
/** E2E の画面（vite preview）の口の番号。 */
export const E2E_WEB_PORT = Number(env.WEB_PORT || 5173) + 1000;
/** E2E の画面の源。 */
export const E2E_WEB_URL = `http://localhost:${E2E_WEB_PORT}`;

/**
 * E2E の API と画面に渡す環境の変数（E2E 専用の DB・口の番号・テストの値）。設定の値は、すべてここで決める。
 * Playwright は、これを今の環境の変数（PATH など）に重ねて渡す。
 */
export const E2E_ENV: Record<string, string> = {
  APP_ENV: "test",
  APP_NAME: "E2E のアプリ",
  API_HOST: "127.0.0.1",
  DATABASE_URL: E2E_DATABASE_URL,
  API_PORT: String(E2E_API_PORT),
  WEB_PORT: String(E2E_WEB_PORT),
  WEB_URL: E2E_WEB_URL,
  SAMPLE_DATA_ENABLED: "false",
  OPENAPI_DOC_ENABLED: "true",
  DOMAIN_FEATURES: "",
  LOG_PRETTY: "false",
  LOG_LEVEL: "warn",
  DATABASE_CONNECT_TIMEOUT_MS: "5000",
  DATABASE_QUERY_TIMEOUT_MS: "10000",
  // E2E の要求は、すべて vite preview の中継（同じ IP）から届く。テストが止まらないよう、上限を上げる
  // （回数の制限そのものは API の結合のテストで確かめる）
  RATE_LIMIT_ENABLED: "true",
  RATE_LIMIT_WINDOW_SECONDS: "60",
  RATE_LIMIT_MAX: "10000",
  TRUSTED_PROXY_HOPS: "0",
};
