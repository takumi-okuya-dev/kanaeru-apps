// 設定の確かめ。
// 起動のときに process.env を zod で確かめ、合わなければ、どの値がなぜ合わないかを日本語で出して止める。
// DB の接続先など、値そのものはエラーに出さない。
// 環境ごとの違いはコードで分けず、設定の値で決める（docs/rules/coding.md 2）。APP_ENV は、危ない組み合わせを止めるためだけに見る：
// - staging・production：見本のデータの手順・試験用のログイン・回数の制限を外すこと・見本の DB のパスワード・手元を指す源・http の源を止め、
//   LINE のチャネル ID・主催者の LINE のユーザー ID・組み立てた画面の場所がないときも止める。
// - production：窓口の文書（OPENAPI_DOC_ENABLED）を止める。
// loadConfig の中で確かめるので、API の起動・手順（見本のデータ・OpenAPI の文書）のどの入口でも効く。
// DB の先が 127.0.0.1 なのは、DB への中継（Cloud SQL Auth Proxy など）の形なので止めない。
// ログインは LINE の ID トークンを API が確かめる（構成の決めごと AD-4）。確かめる client_id は LINE_CHANNEL_IDS。
import { resolve } from "node:path";
import { DOMAIN_FEATURE_KEY_FORMAT } from "./features.ts";
import { z } from "zod";

/** 環境の名前。危ない設定の組み合わせを止めるためだけに見る（ふるまいは設定の値で決める）。 */
const APP_ENVS = ["local", "test", "staging", "production"] as const;

/** ログの細かさ。 */
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

/** 本番に近い環境。手元とテストだけの設定を許さない。 */
const PROTECTED_ENVS: ReadonlySet<string> = new Set(["staging", "production"]);

const REQUIRED = "入れてください。";

/** 画面の口の番号の既定（apps/web/vite.config.ts と同じ）。 */
const DEFAULT_WEB_PORT = 5173;

/** 手元を指す宛先（staging・production の WEB_URL では使えない）。 */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** 見本の DB のパスワード（.env.example・docker-compose.yml・CI の値。staging・production の DATABASE_URL では使えない）。 */
const SAMPLE_DB_PASSWORD = "postgres";

/** LINE のチャネル ID の形（数字だけ）。 */
const LINE_CHANNEL_ID_FORMAT = /^\d+$/;

/** LINE のユーザー ID の形（U と16進の32文字）。 */
const LINE_USER_ID_FORMAT = /^U[0-9a-f]{32}$/;

/** 源の形が合わないときの文。 */
const ORIGIN_FORMAT = "http:// か https:// で始まる源（道を含まない URL）にしてください。";

/**
 * 必須の文字の値。空も「ない」とみなす。
 * @returns zod の形
 */
const requiredText = () => z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED });

/**
 * 任意の文字の値。空は「ない」とみなす。
 * @returns zod の形
 */
const optionalText = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined));

/**
 * "true"／"false" だけを受け取る真偽の値（ないときだけ既定の値。空の文字・ほかの書き方は合わない）。
 * @param defaultValue ないときの値
 * @returns zod の形
 */
const flag = (defaultValue: boolean) =>
  z
    .enum(["true", "false"], { error: '"true" か "false" にしてください。' })
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === "true"));

/**
 * 口の番号。
 * @returns zod の形
 */
const port = () =>
  z.coerce
    .number({ error: "数にしてください。" })
    .int({ error: "整数にしてください。" })
    .min(1, { error: "1〜65535 にしてください。" })
    .max(65535, { error: "1〜65535 にしてください。" });

/**
 * 1以上の整数。
 * @param defaultValue ないときの値
 * @returns zod の形
 */
const positiveInt = (defaultValue: number) =>
  z.coerce
    .number({ error: "数にしてください。" })
    .int({ error: "整数にしてください。" })
    .min(1, { error: "1以上にしてください。" })
    .default(defaultValue);

/**
 * URL の宛先が手元（localhost・127.0.0.1・::1）か。
 * @param value URL
 * @returns 手元なら true（URL として読めなければ false）
 */
function pointsToLocal(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const host = new URL(value).hostname.toLowerCase();
  return LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
}

/**
 * URL の一部の %xx をもとの文字に戻す（%xx の形が崩れていれば undefined。投げない）。
 * @param value URL の一部
 * @returns もとの文字（戻せなければ undefined）
 */
function decodeUrlPart(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/**
 * DB の接続先として読めるか（URL の形で、利用者の名前・パスワード・DB の名前の %xx が崩れていない）。
 * @param value DB の接続先
 * @returns 読めれば true
 */
function isReadableDatabaseUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return [url.username, url.password, url.pathname].every(
    (part) => decodeUrlPart(part) !== undefined,
  );
}

/**
 * DB の接続先のパスワードが、見本の値か。
 * @param value DB の接続先
 * @returns 見本のパスワードなら true（URL として読めなければ false）
 */
function usesSampleDbPassword(value: string): boolean {
  if (!URL.canParse(value)) return false;
  return decodeUrlPart(new URL(value).password) === SAMPLE_DB_PASSWORD;
}

/**
 * URL の源（http か https で、道・問い合わせ・#・利用者の名前を持たない）か。末尾の / はあってよい。
 * @param value 設定の値
 * @returns 源なら true
 */
function isOrigin(value: string): boolean {
  if (!URL.canParse(value) || /[?#]/.test(value)) return false;
  const url = new URL(value);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.pathname === "/" &&
    !url.username &&
    !url.password
  );
}

/**
 * https の URL か（利用者の名前・パスワードを持たない）。
 * @param value 設定の値
 * @returns https の URL なら true
 */
function isHttpsUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname !== "" && !url.username && !url.password;
}

/**
 * カンマで並べた値を、前後の空白と空の要素を除いた並びにする。
 * @param value 設定の値
 * @returns 値の並び
 */
function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const schema = z
  .object({
    APP_ENV: z.enum(APP_ENVS, { error: `${APP_ENVS.join("／")} のどれかにしてください。` }),
    APP_NAME: requiredText(),
    API_PORT: port(),
    API_HOST: requiredText().default("127.0.0.1"),
    WEB_PORT: port().optional(),
    WEB_URL: optionalText(),
    DATABASE_URL: requiredText()
      .refine((value) => /^postgres(ql)?:\/\//.test(value), {
        error: "postgres:// で始まる接続先にしてください。",
      })
      .refine(isReadableDatabaseUrl, {
        error:
          "接続先の形が合いません（パスワードなどに % を使うときは %25 と書きます。% のあとは16進の2文字にしてください）。",
      }),
    DATABASE_CONNECT_TIMEOUT_MS: positiveInt(5000),
    DATABASE_QUERY_TIMEOUT_MS: positiveInt(10_000),
    SAMPLE_DATA_ENABLED: flag(false),
    TEST_LOGIN_ENABLED: flag(false),
    OPENAPI_DOC_ENABLED: flag(false),
    LOG_LEVEL: z
      .enum(LOG_LEVELS, { error: `${LOG_LEVELS.join("／")} のどれかにしてください。` })
      .default("info"),
    LOG_PRETTY: flag(false),
    RATE_LIMIT_ENABLED: flag(true),
    RATE_LIMIT_WINDOW_SECONDS: positiveInt(60),
    RATE_LIMIT_MAX: positiveInt(100),
    DOMAIN_FEATURES: z
      .string()
      .optional()
      .transform(splitList)
      .refine((keys) => keys.every((key) => DOMAIN_FEATURE_KEY_FORMAT.test(key)), {
        error:
          "「<領域>.<名前>」（例 event.export）をカンマで並べてください（領域は英小文字で始まる英小文字・数字、名前は英小文字で始まる英数字）。",
      }),
    TRUSTED_PROXY_HOPS: z.coerce
      .number({ error: "数にしてください。" })
      .int({ error: "整数にしてください。" })
      .min(0, { error: "0以上にしてください。" })
      .default(0),
    LINE_CHANNEL_IDS: z
      .string()
      .optional()
      .transform(splitList)
      .refine((ids) => ids.every((id) => LINE_CHANNEL_ID_FORMAT.test(id)), {
        error: "LINE のチャネル ID（数字だけ）をカンマで並べてください。",
      }),
    ORGANIZER_LINE_USER_ID: optionalText().refine(
      (value) => value === undefined || LINE_USER_ID_FORMAT.test(value),
      { error: "LINE のユーザー ID（U と16進の32文字）にしてください。" },
    ),
    OPEN_CHAT_URL: optionalText().refine((value) => value === undefined || isHttpsUrl(value), {
      error: "https:// で始まる URL にしてください。",
    }),
    WEB_DIST_DIR: optionalText(),
    COMPOSE_PROJECT_NAME: optionalText(),
  })
  .superRefine((env, ctx) => {
    const name = env.APP_ENV;
    if (env.WEB_URL !== undefined && !isOrigin(env.WEB_URL)) {
      ctx.addIssue({ code: "custom", path: ["WEB_URL"], message: ORIGIN_FORMAT });
    }
    if (PROTECTED_ENVS.has(name)) {
      if (env.SAMPLE_DATA_ENABLED) {
        ctx.addIssue({
          code: "custom",
          path: ["SAMPLE_DATA_ENABLED"],
          message: `APP_ENV が ${name} のときは true にできません（手元とテストだけで使う設定です）。`,
        });
      }
      if (env.TEST_LOGIN_ENABLED) {
        ctx.addIssue({
          code: "custom",
          path: ["TEST_LOGIN_ENABLED"],
          message: `APP_ENV が ${name} のときは true にできません（試験用のログインは手元とテストだけで使います）。`,
        });
      }
      if (!env.RATE_LIMIT_ENABLED) {
        ctx.addIssue({
          code: "custom",
          path: ["RATE_LIMIT_ENABLED"],
          message: `APP_ENV が ${name} のときは false にできません（回数の制限を外せるのは手元とテストだけです）。`,
        });
      }
      if (usesSampleDbPassword(env.DATABASE_URL)) {
        ctx.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message: `APP_ENV が ${name} のときは、見本の DB のパスワード（.env.example と同じ）を使えません（環境ごとに作った値にしてください）。`,
        });
      }
      if (env.LINE_CHANNEL_IDS.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["LINE_CHANNEL_IDS"],
          message: `APP_ENV が ${name} のときは要ります（LINE のログインを確かめるため）。`,
        });
      }
      if (env.ORGANIZER_LINE_USER_ID === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["ORGANIZER_LINE_USER_ID"],
          message: `APP_ENV が ${name} のときは要ります（主催者を決めるため）。`,
        });
      }
      if (env.WEB_DIST_DIR === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["WEB_DIST_DIR"],
          message: `APP_ENV が ${name} のときは要ります（API が組み立てた画面を返すため）。`,
        });
      }
      if (env.WEB_URL === undefined) {
        ctx.addIssue({ code: "custom", path: ["WEB_URL"], message: REQUIRED });
      } else if (isOrigin(env.WEB_URL)) {
        if (new URL(env.WEB_URL).protocol !== "https:") {
          ctx.addIssue({
            code: "custom",
            path: ["WEB_URL"],
            message: `APP_ENV が ${name} のときは https:// で始まる源にしてください。`,
          });
        }
        if (pointsToLocal(env.WEB_URL)) {
          ctx.addIssue({
            code: "custom",
            path: ["WEB_URL"],
            message: `APP_ENV が ${name} のときは、手元（localhost など）を指せません。`,
          });
        }
      }
    }
    if (name === "production" && env.OPENAPI_DOC_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAPI_DOC_ENABLED"],
        message:
          "APP_ENV が production のときは true にできません（窓口の文書は、手元・テスト・ステージングだけで出します）。",
      });
    }
  });

/** 確かめた設定。名前はコードの形（camelCase）にそろえる。 */
export type Config = {
  /** 環境の名前（危ない組み合わせを止めるためだけに見る） */
  appEnv: (typeof APP_ENVS)[number];
  /** 画面に出す名前 */
  appName: string;
  /** API の口の番号 */
  apiPort: number;
  /** API が受け付ける宛先（手元は 127.0.0.1。容器で動かすときは設定で 0.0.0.0 にする） */
  apiHost: string;
  /** 画面の源（末尾の / なし）。API はこの源からの書きこみだけを受け付ける。なければ手元の口の番号から作る */
  webUrl: string;
  /** DB の接続先 */
  databaseUrl: string;
  /** DB の時間の上限（ミリ秒。つなぐまで・1つの命令） */
  databaseTimeouts: { connectTimeoutMs: number; queryTimeoutMs: number };
  /** 見本のデータを入れる手順を許すか */
  sampleDataEnabled: boolean;
  /** 試験用のログイン（POST /api/v1/auth/test-login。account の領域）を使えるか。staging・production では false だけ */
  testLoginEnabled: boolean;
  /** 窓口の文書（GET /api/openapi.json）を出すか */
  openApiDocEnabled: boolean;
  /** ログの細かさ */
  logLevel: (typeof LOG_LEVELS)[number];
  /** ログを人が読みやすい形にするか */
  logPretty: boolean;
  /** 回数の制限（IP ごと）。windowSeconds の秒の間に、/api/v1 の書く操作を max 回まで */
  rateLimit: { enabled: boolean; windowSeconds: number; max: number };
  /** 入にする領域の機能の名前（DOMAIN_FEATURES。"<領域>.<名前>"。既定は空＝どれも切。領域の名前は組み立てが確かめる） */
  domainFeatures: string[];
  /** 前に置いた中継（ロードバランサーなど）の数。0 なら接続の相手を、1以上なら X-Forwarded-For の右から数えた値を、利用者の IP とする */
  trustedProxyHops: number;
  /** LINE の ID トークンを確かめるときの client_id（LINE のチャネル ID）の並び。local・test では空のことがある */
  lineChannelIds: string[];
  /** 主催者の LINE のユーザー ID（秘密ではない。AD-5）。local・test ではないことがある */
  organizerLineUserId: string | undefined;
  /** コミュニティのオープンチャットの URL（https。PRD FR-17）。なければ案内を出さない */
  openChatUrl: string | undefined;
  /** 組み立てた画面のフォルダ（絶対の道）。あれば API が画面のファイルを返す（AD-8） */
  webDistDir: string | undefined;
};

/** 設定が合わないときのエラー。文は日本語で、値そのものは入れない。 */
export class ConfigError extends Error {
  /** 合わない設定の名前と理由の一覧 */
  readonly problems: { key: string; message: string }[];

  /**
   * 合わない設定の一覧から、日本語の文を作る。
   * @param problems 合わない設定の名前と理由の一覧
   */
  constructor(problems: { key: string; message: string }[]) {
    super(
      [
        "設定が合わないため、起動を止めました。ルートの .env（見本は .env.example）を確かめてください。",
        ...problems.map(({ key, message }) => `- ${key}：${message}`),
      ].join("\n"),
    );
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/**
 * 環境の変数から設定を読み、確かめる。
 * @param env 読む環境の変数（既定は process.env）
 * @returns 確かめた設定
 * @throws {ConfigError} 合わない値があるとき（どの値がなぜ合わないかを日本語で持つ）
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => ({
        key: issue.path.map(String).join(".") || "（全体）",
        message: issue.message,
      })),
    );
  }
  const value = result.data;
  return {
    appEnv: value.APP_ENV,
    appName: value.APP_NAME,
    apiPort: value.API_PORT,
    apiHost: value.API_HOST,
    webUrl: value.WEB_URL
      ? new URL(value.WEB_URL).origin
      : `http://localhost:${value.WEB_PORT ?? DEFAULT_WEB_PORT}`,
    databaseUrl: value.DATABASE_URL,
    databaseTimeouts: {
      connectTimeoutMs: value.DATABASE_CONNECT_TIMEOUT_MS,
      queryTimeoutMs: value.DATABASE_QUERY_TIMEOUT_MS,
    },
    sampleDataEnabled: value.SAMPLE_DATA_ENABLED,
    testLoginEnabled: value.TEST_LOGIN_ENABLED,
    openApiDocEnabled: value.OPENAPI_DOC_ENABLED,
    logLevel: value.LOG_LEVEL,
    logPretty: value.LOG_PRETTY,
    rateLimit: {
      enabled: value.RATE_LIMIT_ENABLED,
      windowSeconds: value.RATE_LIMIT_WINDOW_SECONDS,
      max: value.RATE_LIMIT_MAX,
    },
    domainFeatures: value.DOMAIN_FEATURES,
    trustedProxyHops: value.TRUSTED_PROXY_HOPS,
    lineChannelIds: value.LINE_CHANNEL_IDS,
    organizerLineUserId: value.ORGANIZER_LINE_USER_ID,
    openChatUrl: value.OPEN_CHAT_URL,
    webDistDir: value.WEB_DIST_DIR === undefined ? undefined : resolve(value.WEB_DIST_DIR),
  };
}
