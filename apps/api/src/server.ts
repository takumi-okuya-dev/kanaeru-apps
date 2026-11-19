// API を立ち上げる手順（src/index.ts と、E2E の立ち上げ〈test/e2e-server.ts〉が使う）。
// 設定を確かめてから、@hono/node-server で API_HOST の API_PORT に立てる。止める合図で、受け付けを閉じてから DB の接続を片付ける。
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import type { AppDeps } from "./app.ts";
import { ConfigError, loadConfig } from "./kernel/config.ts";
import { createDatabase } from "./kernel/db.ts";
import { createLogger } from "./kernel/logger.ts";

/**
 * API を立ち上げる。設定が合わなければ、理由を出して終わる。
 * @param extra 組み立てに足すもの（E2E の見本のアプリだけ。本番の入口〈src/index.ts〉は渡さない）
 */
export function startServer(extra: Pick<AppDeps, "extraApps" | "extraModules"> = {}): void {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({ level: config.logLevel, pretty: config.logPretty });
  const databaseOptions = { ...config.databaseTimeouts, poolMax: config.databasePoolMax };
  const database = createDatabase(config.databaseUrl, databaseOptions, (error) => {
    logger.warn(
      { err: { name: error.name, message: error.message } },
      "待っている DB の接続が切れました。",
    );
  });
  const app = createApp({ config, database, logger, ...extra });

  const server = serve(
    { fetch: app.fetch, port: config.apiPort, hostname: config.apiHost },
    (info) => {
      logger.info({ host: info.address, port: info.port }, "API を立ち上げました。");
    },
  );

  /**
   * 止める合図を受けたら、受け付けを閉じ、DB の接続を片付ける。
   * @param signal 受けた合図の名前
   */
  function shutdown(signal: string) {
    logger.info({ signal }, "API を止めます。");
    server.close(() => {
      void database.pool.end().finally(() => process.exit(0));
    });
  }
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
