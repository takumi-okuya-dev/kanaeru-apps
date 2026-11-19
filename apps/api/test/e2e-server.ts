// E2E の API の立ち上げ（e2e/playwright.config.ts の webServer が使う。本番では使わない）。
// 本番と同じ手順（src/server.ts）に、テストだけの見本のアプリ（test/helpers/suite.ts。apps.list.ts に登録しない）を足す。
// アプリの切り替え（2つ以上のアプリが見えるとき）を確かめるため（core-005）。立ち上げる前に、台帳を決まった状態にする：
// 見本のアプリは切（ほかの E2E の画面を変えない）、受付アプリは公開（DB の変更が入れる値。前の回が途中で止まっても戻す）。
// 約束（zod）を読む前に、窓口の文書の道具（.openapi()）を zod に足す（API の入口と同じ順）
import "@hono/zod-openapi";
import { loadConfig } from "../src/kernel/config.ts";
import { createDatabase } from "../src/kernel/db.ts";
import { upsertVisibility } from "../src/modules/suite/index.ts";
import { startServer } from "../src/server.ts";
import { DEMO_APP, DEMO_APP_KEY, DEMO_MODULE } from "./helpers/suite.ts";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
try {
  await upsertVisibility(database.db, DEMO_APP_KEY, "off");
  await upsertVisibility(database.db, "reception", "public");
} finally {
  await database.pool.end();
}

startServer({ extraApps: [DEMO_APP], extraModules: { demo: DEMO_MODULE } });
