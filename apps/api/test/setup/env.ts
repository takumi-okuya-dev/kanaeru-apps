// テストの手伝い：ルートの .env と環境の変数を合わせて読む（環境の変数が勝つ）。
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/**
 * ルートの .env と環境の変数を合わせた値を返す。
 * @returns 設定の値
 */
export function readRootEnv(): Record<string, string | undefined> {
  const envFile = new URL("../../../../.env", import.meta.url);
  const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  return { ...fileEnv, ...process.env };
}
