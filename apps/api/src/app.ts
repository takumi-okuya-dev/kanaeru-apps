// API の組み立て。
// platform の道と modules.list.ts の領域をつなぎ、要求の ID・ログ・エラーの形・守りの見出し・源の確かめ・回数の制限・
// 本文の大きさの上限をそろえる。領域を足しても、このファイルは直さない（modules.list.ts に1行足す。docs/rules/coding.md 6-6）。
// /api の下の道は、すべて @hono/zod-openapi の createRoute で書く（文書に出ない道があると、起動を止める）。
// 窓口の文書（GET /api/openapi.json）は、設定 OPENAPI_DOC_ENABLED が true のときだけ出す（production では止める）。
// 設定 WEB_DIST_DIR があれば、/api 以外の道に組み立てた画面を返す（platform/web。AD-8）。守りの見出しは /api と画面で分ける。
// ログインは account の領域が持つ（AD-12。道ごとに account の requireSession を付ける）。領域には、秘密でない設定（DomainConfig）と
// 外への出口（fetch）と、登録されたアプリ（apps）と、秘密の値を使う道具（秘密の箱・定期の仕事の合言葉の確かめ。値そのものは渡さない）を渡す。
// アプリが見えるか（AD-16）：packages/contracts/src/core/apps.list.ts の「アプリ → 属する領域」から、アプリに属する領域の
// すべての道に suite の requireApp を付ける（各アプリは付けない。見えなければ 404）。どのアプリにも共通にも属さない領域があれば、
// 起動を止める（requireApp の付け忘れで、作りかけのアプリが見えないように）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Hook } from "@hono/zod-openapi";
import {
  appOfDomain,
  appRegistryProblems,
  listApps,
  unassignedDomains,
} from "@workspace/contracts/core";
import type { AppDefinition, FieldError } from "@workspace/contracts/core";
import { createSecretBox } from "@workspace/secret-box";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import type { Config } from "./kernel/config.ts";
import type { Database } from "./kernel/db.ts";
import { AppError, toAppError, toErrorBody } from "./kernel/errors.ts";
import { assertKnownDomainFeatures, createDomainFeatures } from "./kernel/features.ts";
import type { DomainFeatures } from "./kernel/features.ts";
import type { ApiEnv, DomainRouteDeps } from "./kernel/http.ts";
import { createJobRequestCheck } from "./kernel/job-auth.ts";
import { createMetaApp } from "./kernel/meta-app.ts";
import type { Logger } from "./kernel/logger.ts";
import { REQUEST_ID_HEADER, requestIdMiddleware } from "./kernel/request-id.ts";
import * as modules from "./modules.list.ts";
import { requireApp, requireAppNotOff } from "./modules/suite/index.ts";
import { healthRoutes } from "./platform/health/index.ts";
import { createRateLimiter } from "./platform/rate-limit/index.ts";
import {
  HSTS_MAX_AGE_SECONDS,
  isApiPath,
  serveWeb,
  webSecureHeaders,
} from "./platform/web/index.ts";

/** 組み立てた API の文脈の型（要求ごとの値。kernel/http.ts の ApiEnv と同じ）。 */
export type AppEnv = ApiEnv;

export type { DomainRouteDeps };

/** 組み立てに使う道具。 */
export type AppDeps = {
  /** 確かめた設定 */
  config: Config;
  /** DB の接続 */
  database: Database;
  /** ログ */
  logger: Logger;
  /**
   * modules.list.ts のほかに足す領域（テストだけで使う）。並びなら "extra:<番号>"、名前つきならその名前を領域の名前にする
   * （extraApps のアプリの領域にするときは名前つきで渡す）
   */
  extraModules?: DomainModule[] | Readonly<Record<string, DomainModule>>;
  /** apps.list.ts のほかに足すアプリ（テストだけで使う。E2E の見本のアプリなど） */
  extraApps?: AppDefinition[];
  /** 領域の機能の印の差しかえ（テストだけ。なければ設定の DOMAIN_FEATURES で作る） */
  features?: DomainFeatures;
  /** 領域が外のサービスへ出る HTTP の出口の差しかえ（テストだけ。なければ globalThis.fetch） */
  fetch?: typeof fetch;
};

/** 領域（modules/<領域>/index.ts）が出すもの。どの欄も任意。 */
export type DomainModule = {
  /** 領域の道を作る（なければ道を持たない）。戻り値の型は書かず、.openapi() のつながりのまま返す（書くと画面の型が消える） */
  routes?: (deps: DomainRouteDeps) => OpenAPIHono<AppEnv>;
};

/** 領域の名前空間の一覧から、領域ごとの道の型を作る（routes を持たない領域は never）。 */
export type ModuleRoutesOf<M> = {
  [K in keyof M]: M[K] extends { routes: (...args: never[]) => infer R } ? R : never;
};

/** 領域ごとの道の型（modules.list.ts から作る。client.ts から import type で出す。領域を足しても直さない）。 */
export type ModuleRoutes = ModuleRoutesOf<typeof modules>;

/**
 * 登録された領域の一覧（modules.list.ts の名前と、テストの extraModules を "extra:<番号>" にしたもの）。
 * @param deps 組み立てに使う道具
 * @returns 領域の名前と領域の組の一覧（modules.list.ts の順のあとに extraModules）
 */
function listDomains(deps: Pick<AppDeps, "extraModules">): [name: string, module: DomainModule][] {
  const listed: Record<string, DomainModule> = modules;
  const extra = deps.extraModules ?? [];
  return [
    ...Object.entries(listed),
    ...(Array.isArray(extra)
      ? extra.map((module, index): [string, DomainModule] => [`extra:${index}`, module])
      : Object.entries(extra)),
  ];
}

/**
 * 登録されたアプリ（apps.list.ts の順のあとに、テストの extraApps）を決まりで確かめて返す。
 * 組み立てる領域（modules.list.ts と、テストの名前つきの extraModules）が、どれもちょうど1つのアプリか共通に属することも
 * 確かめる（AD-15。並びの extraModules〈"extra:<番号>"〉は、組み立てのテストの道具なので確かめない）。
 * @param deps 組み立てに使う道具
 * @param domainNames 組み立てる領域の名前
 * @returns アプリの並び
 * @throws {Error} 決まりに合わないアプリの一覧・どこにも属さない領域があるとき（起動を止める）
 */
function resolveApps(
  deps: Pick<AppDeps, "extraApps">,
  domainNames: readonly string[],
): readonly AppDefinition[] {
  const apps = [...listApps(), ...(deps.extraApps ?? [])];
  const problems = [
    ...appRegistryProblems(apps),
    ...unassignedDomains(
      domainNames.filter((name) => !name.startsWith("extra:")),
      apps,
    ).map(
      (domain) =>
        `領域 ${domain} がどのアプリにも属していません（packages/contracts/src/core/apps.list.ts に足してください）`,
    ),
  ];
  if (problems.length > 0) {
    throw new Error(`アプリの登録が決まりに合いません：${problems.join("、")}`);
  }
  return apps;
}

/**
 * 機械の道（定期の仕事・外のサービスの Webhook）。見る人がいないので、requireApp の代わりに requireAppNotOff を付ける
 * （アプリが切のときだけ 404。道が自分で合言葉・署名を確かめる。AD-16）。
 */
const MACHINE_PATH = /^\/api\/v1\/[a-z]+\/(?:jobs|webhooks)\//;

/** 状態を変えない動き。 */
const SAFE_METHODS = /^(GET|HEAD|OPTIONS)$/;

/** 領域の Webhook の道（外のサービスが送る。クッキーを使わず、領域が署名で確かめる）。 */
const WEBHOOK_PATH = /^\/api\/v1\/[a-z]+\/webhooks\//;

/** /api/v1 の本文の大きさの上限（バイト）。ファイルを受け取る窓口を足すときは、その窓口だけ別に決める。 */
const MAX_BODY_BYTES = 100 * 1024;

/** 窓口の文書の道。 */
export const OPENAPI_DOC_PATH = "/api/openapi.json";

/**
 * 守りの見出し。API の応答は JSON だけなので、CSP はすべてを止める形にする。
 * HSTS は、設定の WEB_URL が https のときだけ出す（環境の名前で分けない）。
 * @param webUrl 画面の源（設定の WEB_URL）
 * @returns middleware
 */
function apiSecureHeaders(webUrl: string) {
  const https = new URL(webUrl).protocol === "https:";
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
    xFrameOptions: "DENY",
    referrerPolicy: "no-referrer",
    strictTransportSecurity: https ? `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains` : false,
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  });
}

/** 日本語（ひらがな・カタカナ・漢字）を含むか。約束（zod）に日本語の文を書いた誤りだけを、そのまま画面に出す。 */
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

/**
 * 送られた値の中に、道（issue.path）の所の欄があるかを調べる。
 * @param input 受け取った値（検査の前）
 * @param path issue の道
 * @returns 欄があれば true（値が null でも、ある）
 */
function hasValueAt(input: unknown, path: readonly PropertyKey[]): boolean {
  let current: unknown = input;
  for (const key of path) {
    if (typeof current !== "object" || current === null || !(key in current)) return false;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current !== undefined;
}

/**
 * 入力が合わないときの欄の理由（zod の issue を日本語の文に読みかえる）。
 * 約束に書いた日本語の文はそのまま使い、zod の英語の既定の文は、決まった日本語に置きかえる。
 * @param issues zod の issue
 * @param input 受け取った値（検査の前。欄がないのか、型が違うのかを見分ける）
 * @returns 欄ごとの理由
 */
export function toFieldErrors(issues: readonly z.core.$ZodIssue[], input: unknown): FieldError[] {
  return issues.flatMap((issue): FieldError[] => {
    const path = issue.path.map(String).join(".");
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        path: path ? `${path}.${key}` : key,
        message: "この欄は受け取れません。",
      }));
    }
    if (JAPANESE.test(issue.message)) return [{ path, message: issue.message }];
    if (issue.code === "invalid_type" && !hasValueAt(input, issue.path)) {
      return [{ path, message: "入れてください。" }];
    }
    return [{ path, message: "形が合いません。" }];
  });
}

// 入力の検査に合わないとき、INVALID_INPUT と欄ごとの理由で返す（OpenAPIHono の defaultHook）。
// 道の値（param。ID など）が合わないときは、その道のものはないので、ないときと同じ 404（NOT_FOUND）にする
const defaultHook: Hook<unknown, AppEnv, string, unknown> = (result) => {
  if (!result.success) {
    if (result.target === "param") throw new AppError("NOT_FOUND");
    // @hono/zod-validator は、合わなかったときも受け取った値を data に入れて渡す（型には出ていない）
    const { data } = result as { data?: unknown };
    throw new AppError("INVALID_INPUT", { fields: toFieldErrors(result.error.issues, data) });
  }
};

/** 窓口の文書の窓口（文書にも出る）。 */
const getOpenApiDocument = createRoute({
  method: "get",
  path: OPENAPI_DOC_PATH,
  tags: ["core"],
  operationId: "getOpenApiDocument",
  summary: "窓口の文書（OpenAPI 3.1）",
  description: "設定 OPENAPI_DOC_ENABLED が true のときだけある（production では出さない）。",
  responses: {
    200: {
      description: "OpenAPI 3.1 の文書",
      content: { "application/json": { schema: z.record(z.string(), z.unknown()) } },
    },
  },
});

/**
 * platform の道をまとめる（画面に渡す型 AppRoutes のもと）。
 * @param deps 道が使う道具
 * @param deps.database DB の接続
 * @returns platform の道
 */
export function buildPlatformRoutes(deps: { database: Database }) {
  return new OpenAPIHono<AppEnv>({ defaultHook }).route(
    "/",
    healthRoutes({
      ping: async () => {
        await deps.database.pool.query("SELECT 1");
      },
    }),
  );
}

/** 画面に渡す土台の道の型（client.ts から import type で出す）。 */
export type AppRoutes = ReturnType<typeof buildPlatformRoutes>;

/**
 * OpenAPI 3.1 の文書を作る。
 * @param app 組み立てた API
 * @param config 確かめた設定
 * @returns OpenAPI 3.1 の文書
 */
export function openApiDocument(app: OpenAPIHono<AppEnv>, config: Pick<Config, "appName">) {
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: `${config.appName} の窓口`, version: "0.1.0" },
  });
}

/**
 * /api の下の道が、すべて createRoute で書かれて文書に出ているかを確かめる（出ていない道があれば起動を止める）。
 * Hono の .get・.post などで足した道は、入力の確かめも文書もないため止める。
 * @param app 組み立てた API
 * @throws {Error} 文書に出ていない道があるとき（その道を出す）
 */
export function assertDocumentedRoutes(app: OpenAPIHono<AppEnv>): void {
  const documented = new Set(
    app.openAPIRegistry.definitions.flatMap((definition) =>
      definition.type === "route"
        ? [
            `${definition.route.method.toUpperCase()} ${definition.route.path.replace(/\{([^}]+)\}/g, ":$1")}`,
          ]
        : [],
    ),
  );
  const undocumented = [
    ...new Set(
      app.routes
        .filter((route) => route.method !== "ALL" && route.path.startsWith("/api"))
        .map((route) => `${route.method} ${route.path}`)
        .filter((key) => !documented.has(key)),
    ),
  ];
  if (undocumented.length > 0) {
    throw new Error(
      `createRoute を通さない道があります（入力の確かめと文書がないので、起動を止めました）：${undocumented.join("、")}`,
    );
  }
}

/**
 * API を組み立てる。
 * @param deps 組み立てに使う道具
 * @returns 組み立てた API
 * @throws {Error} createRoute を通さない道があるとき・DOMAIN_FEATURES に登録されていない領域の名前があるとき・
 *   WEB_DIST_DIR に index.html がないとき・アプリの登録が決まりに合わないとき（起動を止める）
 */
export function createApp(deps: AppDeps): OpenAPIHono<AppEnv> {
  const { config, logger } = deps;
  const { db } = deps.database;
  const allowedOrigin = new URL(config.webUrl).origin;
  const domains = listDomains(deps);
  const apps = resolveApps(
    deps,
    domains.map(([name]) => name),
  );
  // 設定 DOMAIN_FEATURES の領域の名前は、登録された領域だけ（書き違いで黙って切のままにしない）
  assertKnownDomainFeatures(
    config.domainFeatures,
    domains.map(([name]) => name),
  );

  const app = new OpenAPIHono<AppEnv>({ defaultHook });

  // 要求の ID・守りの見出し（/api は API の CSP、ほかは画面の CSP）・応答の見出し・要求ごとのログ1行
  app.use("*", requestIdMiddleware());
  const apiHeaders = apiSecureHeaders(config.webUrl);
  const webHeaders = webSecureHeaders(config.webUrl);
  app.use(
    "*",
    createMiddleware<AppEnv>(async (c, next) => {
      await (isApiPath(c.req.path) ? apiHeaders(c, next) : webHeaders(c, next));
    }),
  );
  app.use("*", async (c, next) => {
    const startedAt = performance.now();
    await next();
    // 画面のファイルは platform/web がキャッシュを決める。ほか（API の答え・エラー）は持たせない
    if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
    c.res.headers.set(REQUEST_ID_HEADER, c.var.requestId);
    // 本文と、決めたもののほかの見出しは出さない。道は定義の形（実際の値ではない）
    logger.info(
      {
        requestId: c.var.requestId,
        method: c.req.method,
        route: routePath(c as Context, -1),
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "要求",
    );
  });

  // 状態を変える道の源の確かめ：Hono の csrf（フォームの形）と、画面の源と違う Origin を止める（Origin のない要求は通す）。
  // ログインを足したら、クッキーを守るために、この確かめが要る
  // 領域の Webhook の道（/api/v1/<領域>/webhooks/…）は、外のサービスがクッキーなしで送り、領域が署名で確かめるので、フォームの形の確かめを通さない
  const formCsrf = csrf({ origin: allowedOrigin });
  app.use(
    "/api/v1/*",
    createMiddleware<AppEnv>(async (c, next) => {
      if (WEBHOOK_PATH.test(c.req.path)) return next();
      return formCsrf(c, next);
    }),
  );
  app.use(
    "/api/v1/*",
    createMiddleware<AppEnv>(async (c, next) => {
      const origin = c.req.header("origin");
      if (!SAFE_METHODS.test(c.req.method) && origin && origin !== allowedOrigin) {
        throw new AppError("FORBIDDEN");
      }
      await next();
    }),
  );
  // 本文の大きさの上限と、回数の制限（IP ごと。/api/v1 の状態を変える道）
  app.use(
    "/api/v1/*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new AppError("PAYLOAD_TOO_LARGE");
      },
    }),
  );
  app.use(
    "/api/v1/*",
    createRateLimiter(
      { ...config.rateLimit, trustedProxyHops: config.trustedProxyHops },
      { applies: (c) => !SAFE_METHODS.test(c.req.method) },
    ),
  );

  app.onError((error, c) => {
    const requestId = c.var.requestId ?? "";
    // 読みかえは kernel/errors.ts の toAppError だけ（DB に届かないときの 503 DB_UNAVAILABLE も）
    const appError = toAppError(error);
    if (appError) {
      if (appError.code === "DB_UNAVAILABLE") {
        logger.warn({ requestId, errorName: error.name }, "DB に届きません");
      }
      return c.json(toErrorBody(appError, requestId), appError.status);
    }
    // 予期しないエラー：ログにはエラーの名前と積み重ねと要求の ID だけ
    logger.error({ requestId, errorName: error.name, stack: error.stack }, "予期しないエラー");
    return c.json(toErrorBody(new AppError("INTERNAL"), requestId), 500);
  });
  app.notFound((c) => c.json(toErrorBody(new AppError("NOT_FOUND"), c.var.requestId ?? ""), 404));

  // 組み立てた画面（/api 以外の GET・HEAD）。index.html がなければ、ここで起動を止める
  if (config.webDistDir) app.use("*", serveWeb({ distDir: config.webDistDir }));

  // platform の道と、領域の道
  app.route("/", buildPlatformRoutes(deps));
  const routeDeps: DomainRouteDeps = {
    db,
    logger,
    features: deps.features ?? createDomainFeatures(config.domainFeatures),
    config: {
      webUrl: config.webUrl,
      lineChannelIds: config.lineChannelIds,
      organizerLineUserId: config.organizerLineUserId,
      openChatUrl: config.openChatUrl,
      testLoginEnabled: config.testLoginEnabled,
      threadsApiBaseUrl: config.threadsApiBaseUrl,
    },
    fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
    apps,
    secretBox: config.tokenEncryption
      ? createSecretBox(config.tokenEncryption.keyRing, config.tokenEncryption.currentVersion)
      : undefined,
    isJobRequest: createJobRequestCheck(config.jobTriggerSecret),
    metaApp: createMetaApp(config.threadsApp),
  };
  for (const [name, domain] of domains) {
    if (!domain.routes) continue;
    const domainRoutes = domain.routes(routeDeps);
    const owner = appOfDomain(name, apps);
    if (owner) {
      // アプリに属する領域のすべての道の前に、suite の requireApp を置く（同じ動きと道に先に足した処理が先に動く。AD-16）
      const guard = requireApp(routeDeps, owner.key);
      const machineGuard = requireAppNotOff(routeDeps, owner.key);
      const seen = new Set<string>();
      for (const route of domainRoutes.routes) {
        const key = `${route.method} ${route.path}`;
        if (route.method === "ALL" || seen.has(key)) continue;
        seen.add(key);
        app.on(route.method, route.path, MACHINE_PATH.test(route.path) ? machineGuard : guard);
      }
    }
    app.route("/", domainRoutes);
  }

  // 窓口の文書は、すべての道を足したあとに1度だけ作る（要求ごとに作り直さない）
  if (config.openApiDocEnabled) {
    let document: Record<string, unknown> = {};
    app.openapi(getOpenApiDocument, (c) => c.json(document, 200));
    document = openApiDocument(app, config) as unknown as Record<string, unknown>;
  }

  assertDocumentedRoutes(app);
  return app;
}
