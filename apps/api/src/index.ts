// API の起動。設定を確かめてから、@hono/node-server で API_HOST の API_PORT に立てる。
// API_HOST の既定は 127.0.0.1（手元の外から届かない）。容器で動かすときは設定で 0.0.0.0 にする。
// 止める合図で、受け付けを閉じてから DB の接続を片付ける。
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { ConfigError, loadConfig } from "./kernel/config.ts";
import { createDatabase } from "./kernel/db.ts";
import { createLogger } from "./kernel/logger.ts";

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
const database = createDatabase(config.databaseUrl, config.databaseTimeouts, (error) => {
  logger.warn(
    { err: { name: error.name, message: error.message } },
    "待っている DB の接続が切れました。",
  );
});
const app = createApp({ config, database, logger });

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
