// drizzle-kit の設定。
// 表の定義は、持ち主のフォルダの schema.ts を glob で読む（領域を足しても、ここは直さない）。
// 接続先はルートの .env の DATABASE_URL（環境の変数があれば、そちらを使う）。
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "drizzle-kit";

const envFile = new URL("../../.env", import.meta.url);
const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const databaseUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL を .env に入れてください（見本は .env.example）。");
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/platform/*/schema.ts", "./src/modules/*/schema.ts"],
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: false,
});
