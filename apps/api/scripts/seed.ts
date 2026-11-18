// 見本のデータを入れる（pnpm db:seed。何度流しても増えない。SAMPLE_DATA_ENABLED=true のときだけ）。
// 中身はすべて仮のもの（本物の利用者のデータを入れない。docs/rules/coding.md 2）。
import { loadConfig } from "../src/kernel/config.ts";
import { createDatabase } from "../src/kernel/db.ts";
import { seedSampleData } from "./lib/seed.ts";

const config = loadConfig();
if (!config.sampleDataEnabled) {
  console.error(
    "見本のデータは SAMPLE_DATA_ENABLED=true のときだけ入れられます（手元とテストだけの設定です）。",
  );
  process.exit(1);
}

const { db, pool } = createDatabase(config.databaseUrl, config.databaseTimeouts);
try {
  const added = await seedSampleData(db);
  console.log(`見本のメモを ${added} 件足しました（同じ題のものは足しません）。`);
} finally {
  await pool.end();
}
