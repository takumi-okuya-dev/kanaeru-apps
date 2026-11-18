// API の単体と結合のテスト。
// 結合のテストは本物の PostgreSQL（手元の compose の容器）に当てる。設定は見本の値とここで決め、ルートの .env からは
// DB の接続先（作業場所ごとの DB の名前）だけを読む（docs/rules/coding.md 2「テストの設定は手元の設定で変わらない」）。
// DB の名前はテスト用（<DB名>_test_template から写した DB）に替える（test/setup/global-setup.ts）。
import { defineConfig } from "vitest/config";
import { readRootEnv } from "./test/setup/env.ts";

const rootEnv = readRootEnv();

export default defineConfig({
  test: {
    name: "api",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["./test/setup/global-setup.ts"],
    env: {
      APP_ENV: "test",
      APP_NAME: "テストのアプリ",
      API_PORT: "8787",
      WEB_URL: "http://localhost:5173",
      DATABASE_URL: rootEnv.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/app",
      SAMPLE_DATA_ENABLED: "true",
      OPENAPI_DOC_ENABLED: "true",
      DOMAIN_FEATURES: "",
      RATE_LIMIT_ENABLED: "true",
      LOG_PRETTY: "false",
      LOG_LEVEL: "silent",
    },
  },
});
