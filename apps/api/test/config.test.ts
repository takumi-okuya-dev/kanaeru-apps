// 設定の確かめ：合わない値を日本語で止め、staging・production の危ない組み合わせを止める。値そのものは文に出さない。
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/kernel/config.ts";

/** 手元の見本の値（.env.example と同じ形）。 */
const LOCAL = {
  APP_ENV: "local",
  APP_NAME: "見本のアプリ",
  API_PORT: "8787",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
};

/** staging で通る値（見本の値を使わない）。 */
const STAGING = {
  ...LOCAL,
  APP_ENV: "staging",
  API_HOST: "0.0.0.0",
  WEB_URL: "https://staging.example.com",
  DATABASE_URL: "postgres://app:Zq8-made-for-staging@127.0.0.1:5432/app",
  SAMPLE_DATA_ENABLED: "false",
  OPENAPI_DOC_ENABLED: "true",
};

/**
 * 設定を読み、合わない設定の名前を返す。
 * @param env 環境の変数
 * @returns 合わない設定の名前（通れば空）
 */
function problemKeys(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
    return [];
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return error.problems.map((problem) => problem.key);
  }
}

describe("設定", () => {
  it("手元の見本の値で読め、既定の値が入る", () => {
    const config = loadConfig(LOCAL);
    expect(config.apiHost).toBe("127.0.0.1");
    expect(config.webUrl).toBe("http://localhost:5173");
    expect(config.sampleDataEnabled).toBe(false);
    expect(config.openApiDocEnabled).toBe(false);
    expect(config.rateLimit).toEqual({ enabled: true, windowSeconds: 60, max: 100 });
    expect(config.domainFeatures).toEqual([]);
  });

  it("WEB_PORT から画面の源を作り、WEB_URL があればその源を使う", () => {
    expect(loadConfig({ ...LOCAL, WEB_PORT: "5999" }).webUrl).toBe("http://localhost:5999");
    expect(loadConfig({ ...LOCAL, WEB_URL: "http://localhost:6000/" }).webUrl).toBe(
      "http://localhost:6000",
    );
  });

  it("ない・合わない値は、名前と日本語の理由で止め、値そのものは出さない", () => {
    expect(() =>
      loadConfig({
        ...LOCAL,
        API_PORT: "x",
        DATABASE_URL: "mysql://secret-value",
        LOG_PRETTY: "yes",
      }),
    ).toThrow(ConfigError);
    try {
      loadConfig({ ...LOCAL, API_PORT: "x", DATABASE_URL: "mysql://secret-value" });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("API_PORT");
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain("secret-value");
    }
    expect(problemKeys({ ...LOCAL, APP_NAME: "  " })).toEqual(["APP_NAME"]);
    expect(problemKeys({ ...LOCAL, WEB_URL: "http://localhost:5173/path" })).toEqual(["WEB_URL"]);
    expect(problemKeys({ ...LOCAL, DOMAIN_FEATURES: "Notes" })).toEqual(["DOMAIN_FEATURES"]);
  });

  it("接続先の %xx の形が崩れていても投げず、DATABASE_URL の誤りとして止める（どの環境でも）", () => {
    const broken = "postgres://app:abc%zz@127.0.0.1:5432/app";
    expect(problemKeys({ ...LOCAL, DATABASE_URL: broken })).toEqual(["DATABASE_URL"]);
    expect(problemKeys({ ...STAGING, DATABASE_URL: broken })).toEqual(["DATABASE_URL"]);
    // 正しく書いた % （%25）は読める
    expect(
      problemKeys({ ...STAGING, DATABASE_URL: "postgres://app:a%25b-Zq8x@127.0.0.1:5432/app" }),
    ).toEqual([]);
  });

  it("staging は、見本の値でない設定で読める", () => {
    expect(problemKeys(STAGING)).toEqual([]);
  });

  it("staging・production では、手元とテストだけの設定・見本の値・手元を指す源を止める", () => {
    for (const appEnv of ["staging", "production"]) {
      const base = { ...STAGING, APP_ENV: appEnv, OPENAPI_DOC_ENABLED: "false" };
      expect(problemKeys({ ...base, SAMPLE_DATA_ENABLED: "true" })).toEqual([
        "SAMPLE_DATA_ENABLED",
      ]);
      expect(problemKeys({ ...base, RATE_LIMIT_ENABLED: "false" })).toEqual(["RATE_LIMIT_ENABLED"]);
      expect(problemKeys({ ...base, DATABASE_URL: LOCAL.DATABASE_URL })).toEqual(["DATABASE_URL"]);
      expect(problemKeys({ ...base, WEB_URL: undefined })).toEqual(["WEB_URL"]);
      expect(problemKeys({ ...base, WEB_URL: "http://app.example.com" })).toEqual(["WEB_URL"]);
      expect(problemKeys({ ...base, WEB_URL: "https://localhost" })).toEqual(["WEB_URL"]);
    }
  });

  it("production では、窓口の文書を出せない（staging では出せる）", () => {
    expect(problemKeys({ ...STAGING, APP_ENV: "production" })).toEqual(["OPENAPI_DOC_ENABLED"]);
    expect(problemKeys(STAGING)).toEqual([]);
  });
});
