// 組み立てた API から OpenAPI 3.1 の文書を作り、apps/api/openapi.json に書き出す（pnpm --filter api openapi）。
// 書き出したファイルはコミットしない（並行して作ると毎回ぶつかるため）。設定 OPENAPI_DOC_ENABLED によらず書き出す。
import { writeFile } from "node:fs/promises";
import { createApp, openApiDocument } from "../src/app.ts";
import { loadConfig } from "../src/kernel/config.ts";
import { createDatabase } from "../src/kernel/db.ts";
import { createLogger } from "../src/kernel/logger.ts";

const config = loadConfig();
const database = createDatabase(config.databaseUrl, config.databaseTimeouts);
try {
  const app = createApp({
    config,
    database,
    logger: createLogger({ level: "silent", pretty: false }),
  });
  const output = new URL("../openapi.json", import.meta.url);
  await writeFile(output, `${JSON.stringify(openApiDocument(app, config), null, 2)}\n`);
  console.log("apps/api/openapi.json に書き出しました。");
} finally {
  await database.pool.end();
}
