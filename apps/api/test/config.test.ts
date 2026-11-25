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
  LINE_CHANNEL_IDS: "1234567890",
  ORGANIZER_LINE_USER_ID: `U${"0123456789abcdef".repeat(2)}`,
  WEB_DIST_DIR: "/app/apps/web/dist",
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
    expect(config.databasePoolMax).toBe(10);
    expect(config.domainFeatures).toEqual([]);
    expect(config.lineChannelIds).toEqual([]);
    expect(config.organizerLineUserId).toBeUndefined();
    expect(config.openChatUrl).toBeUndefined();
    expect(config.webDistDir).toBeUndefined();
    expect(config.testLoginEnabled).toBe(false);
  });

  it('試験用のログインは、local・test で入にできる（"true"／"false" のほかは止める）', () => {
    expect(loadConfig({ ...LOCAL, TEST_LOGIN_ENABLED: "true" }).testLoginEnabled).toBe(true);
    expect(
      loadConfig({ ...LOCAL, APP_ENV: "test", TEST_LOGIN_ENABLED: "true" }).testLoginEnabled,
    ).toBe(true);
    expect(problemKeys({ ...LOCAL, TEST_LOGIN_ENABLED: "yes" })).toEqual(["TEST_LOGIN_ENABLED"]);
  });

  it("LINE・主催者・オープンチャット・画面の場所を読む（並びの空白と空の要素は除く・画面の場所は絶対の道）", () => {
    const config = loadConfig({
      ...LOCAL,
      LINE_CHANNEL_IDS: " 1234567890, ,2345678901 ",
      ORGANIZER_LINE_USER_ID: STAGING.ORGANIZER_LINE_USER_ID,
      OPEN_CHAT_URL: "https://line.me/ti/g2/example",
      WEB_DIST_DIR: "apps/web/dist",
    });
    expect(config.lineChannelIds).toEqual(["1234567890", "2345678901"]);
    expect(config.organizerLineUserId).toBe(STAGING.ORGANIZER_LINE_USER_ID);
    expect(config.openChatUrl).toBe("https://line.me/ti/g2/example");
    expect(config.webDistDir).toMatch(/^\/.*\/apps\/web\/dist$/);
  });

  it("LINE・主催者・オープンチャットの形が違えば、どの環境でも止める", () => {
    for (const base of [LOCAL, STAGING]) {
      expect(problemKeys({ ...base, LINE_CHANNEL_IDS: "123,abc" })).toEqual(["LINE_CHANNEL_IDS"]);
      expect(problemKeys({ ...base, ORGANIZER_LINE_USER_ID: "U123" })).toEqual([
        "ORGANIZER_LINE_USER_ID",
      ]);
      expect(problemKeys({ ...base, OPEN_CHAT_URL: "http://line.me/ti/g2/example" })).toEqual([
        "OPEN_CHAT_URL",
      ]);
      expect(problemKeys({ ...base, OPEN_CHAT_URL: "line.me" })).toEqual(["OPEN_CHAT_URL"]);
    }
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
    expect(problemKeys({ ...LOCAL, DOMAIN_FEATURES: "Event" })).toEqual(["DOMAIN_FEATURES"]);
  });

  it("DB の接続の数の上限（DATABASE_POOL_MAX）は1以上の整数だけを受け取る", () => {
    expect(loadConfig({ ...LOCAL, DATABASE_POOL_MAX: "5" }).databasePoolMax).toBe(5);
    for (const value of ["0", "-1", "1.5", "x"]) {
      expect(problemKeys({ ...LOCAL, DATABASE_POOL_MAX: value })).toEqual(["DATABASE_POOL_MAX"]);
    }
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

  it("staging・production では、手元とテストだけの設定（見本のデータ・試験用のログインなど）・見本の値・手元を指す源・LINE と主催者と画面の場所がないことを止める", () => {
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
      expect(problemKeys({ ...base, LINE_CHANNEL_IDS: " , " })).toEqual(["LINE_CHANNEL_IDS"]);
      expect(problemKeys({ ...base, ORGANIZER_LINE_USER_ID: undefined })).toEqual([
        "ORGANIZER_LINE_USER_ID",
      ]);
      expect(problemKeys({ ...base, WEB_DIST_DIR: "" })).toEqual(["WEB_DIST_DIR"]);
      expect(problemKeys({ ...base, TEST_LOGIN_ENABLED: "true" })).toEqual(["TEST_LOGIN_ENABLED"]);
      expect(problemKeys({ ...base, TEST_LOGIN_ENABLED: "false" })).toEqual([]);
    }
  });

  it("production では、窓口の文書を出せない（staging では出せる）", () => {
    expect(problemKeys({ ...STAGING, APP_ENV: "production" })).toEqual(["OPENAPI_DOC_ENABLED"]);
    expect(problemKeys(STAGING)).toEqual([]);
  });

  it("Meta のアプリの ID と秘密の値は、両方そろえて読む（threads-010）", () => {
    const secret = "m".repeat(32);
    expect(
      loadConfig({ ...LOCAL, THREADS_APP_ID: "123456", THREADS_APP_SECRET: secret }).threadsApp,
    ).toEqual({
      appId: "123456",
      appSecret: secret,
    });
    expect(loadConfig(LOCAL).threadsApp).toBeUndefined();
    expect(problemKeys({ ...LOCAL, THREADS_APP_ID: "123456" })).toEqual(["THREADS_APP_SECRET"]);
    expect(problemKeys({ ...LOCAL, THREADS_APP_SECRET: secret })).toEqual(["THREADS_APP_ID"]);
    expect(problemKeys({ ...LOCAL, THREADS_APP_ID: "abc", THREADS_APP_SECRET: secret })).toEqual([
      "THREADS_APP_ID",
    ]);
    expect(problemKeys({ ...LOCAL, THREADS_APP_ID: "1", THREADS_APP_SECRET: "short" })).toEqual([
      "THREADS_APP_SECRET",
    ]);
  });

  it("外のサービスのトークンを包む鍵の束・定期の仕事の合言葉・Threads の API の宛先を読む（値は文に出さない）", () => {
    const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
    const ring = JSON.stringify({ "1": key });
    const config = loadConfig({
      ...LOCAL,
      TOKEN_ENCRYPTION_KEYS: ring,
      TOKEN_ENCRYPTION_KEY_VERSION: "1",
      JOB_TRIGGER_SECRET: "j".repeat(32),
      THREADS_API_BASE_URL: "http://127.0.0.1:9790/",
    });
    expect(config.tokenEncryption).toEqual({ keyRing: ring, currentVersion: 1 });
    expect(config.jobTriggerSecret).toBe("j".repeat(32));
    expect(config.threadsApiBaseUrl).toBe("http://127.0.0.1:9790");
    const defaults = loadConfig(LOCAL);
    expect(defaults.tokenEncryption).toBeUndefined();
    expect(defaults.jobTriggerSecret).toBeUndefined();
    expect(defaults.threadsApiBaseUrl).toBe("https://graph.threads.net");

    expect(problemKeys({ ...LOCAL, TOKEN_ENCRYPTION_KEYS: ring })).toEqual([
      "TOKEN_ENCRYPTION_KEY_VERSION",
    ]);
    expect(problemKeys({ ...LOCAL, TOKEN_ENCRYPTION_KEY_VERSION: "1" })).toEqual([
      "TOKEN_ENCRYPTION_KEYS",
    ]);
    expect(
      problemKeys({ ...LOCAL, TOKEN_ENCRYPTION_KEYS: ring, TOKEN_ENCRYPTION_KEY_VERSION: "2" }),
    ).toEqual(["TOKEN_ENCRYPTION_KEYS"]);
    expect(problemKeys({ ...LOCAL, JOB_TRIGGER_SECRET: "short" })).toEqual(["JOB_TRIGGER_SECRET"]);
    expect(problemKeys({ ...LOCAL, THREADS_API_BASE_URL: "graph.threads.net" })).toEqual([
      "THREADS_API_BASE_URL",
    ]);
    expect(() =>
      loadConfig({
        ...LOCAL,
        TOKEN_ENCRYPTION_KEYS: `{"1":"${key}x"}`,
        TOKEN_ENCRYPTION_KEY_VERSION: "1",
      }),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining(key) as string }));
    // .env.example を写したままの空の値は「ない」とみなす（起動を止めない）
    expect(
      loadConfig({ ...LOCAL, TOKEN_ENCRYPTION_KEYS: "", TOKEN_ENCRYPTION_KEY_VERSION: "" })
        .tokenEncryption,
    ).toBeUndefined();
    expect(problemKeys({ ...STAGING, THREADS_API_BASE_URL: "http://127.0.0.1:9790" })).toEqual([
      "THREADS_API_BASE_URL",
    ]);
    expect(problemKeys({ ...STAGING, THREADS_API_BASE_URL: "https://graph.threads.net" })).toEqual(
      [],
    );
  });

  it("知らせの送り方と許可リストを読む（既定は off。手元とテストは偽の送り手だけ。booking-002）", () => {
    expect(loadConfig(LOCAL).notify).toEqual({ mode: "off", allowlist: [], fakeOnly: true });
    expect(loadConfig({ ...LOCAL, APP_ENV: "test" }).notify.fakeOnly).toBe(true);
    const lineUser = `U${"0123456789abcdef".repeat(2)}`;
    const config = loadConfig({
      ...STAGING,
      NOTIFY_MODE: "allowlist",
      NOTIFY_ALLOWLIST: ` ${lineUser}, Hanako@Example.com ,,`,
    });
    expect(config.notify).toEqual({
      mode: "allowlist",
      allowlist: [lineUser, "hanako@example.com"],
      fakeOnly: false,
    });
    expect(
      loadConfig({ ...STAGING, APP_ENV: "production", OPENAPI_DOC_ENABLED: "false" }).notify,
    ).toEqual({
      mode: "off",
      allowlist: [],
      fakeOnly: false,
    });
    expect(problemKeys({ ...LOCAL, NOTIFY_MODE: "always" })).toEqual(["NOTIFY_MODE"]);
    expect(problemKeys({ ...LOCAL, NOTIFY_ALLOWLIST: "U123,not-an-address" })).toEqual([
      "NOTIFY_ALLOWLIST",
    ]);
    // 合わない値は文に出さない
    expect(() => loadConfig({ ...LOCAL, NOTIFY_ALLOWLIST: "secret-person" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("secret-person") as string }),
    );
  });
});
