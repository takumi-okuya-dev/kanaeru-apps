// テストの手伝い：試合表のアプリを台帳で「公開」にする・試合表を作る・中身を送る（match のテストが使う）。
// 台帳に行がないアプリは「運営者だけ」なので、ふつうの利用者でログインするテストの前に showMatchApp を呼ぶ（truncateAllTables のあと）。
import type { MatchTable, MatchTableContent } from "@workspace/contracts/match";
import type { Database } from "../../src/kernel/db.ts";
import { upsertVisibility } from "../../src/modules/suite/index.ts";
import type { TestApp } from "./app.ts";
import { call } from "./event.ts";

/** 試合表の窓口の道の頭。 */
export const MATCH_TABLES = "/api/v1/match/tables";

/** テストの担当の端末の ID。 */
export const DEVICE_A = "device-a";

/**
 * 試合表のアプリを、だれにでも見えるようにする。
 * @param database DB の接続
 */
export async function showMatchApp(database: Database): Promise<void> {
  await upsertVisibility(database.db, "match", "public");
}

/**
 * 試合表を作る。
 * @param app 組み立てた API
 * @param cookie 作る人のクッキー
 * @param input 名前・試合の日・組織・端末（なければ見本）
 * @returns 作った試合表
 * @throws {Error} 作れなかったとき
 */
export async function createTable(
  app: TestApp,
  cookie: string,
  input: { name?: string; playDate?: string; organizationId?: string; deviceId?: string } = {},
): Promise<MatchTable> {
  const response = await call(app, cookie, MATCH_TABLES, "POST", {
    name: input.name ?? "12/13(日) 練習会",
    playDate: input.playDate ?? "2026-12-13",
    deviceId: input.deviceId ?? DEVICE_A,
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
  });
  if (response.status !== 201) throw new Error(`試合表を作れませんでした（${response.status}）。`);
  return (await response.json()) as MatchTable;
}

/**
 * 試合表の中身を送る。
 * @param app 組み立てた API
 * @param cookie 送る人のクッキー
 * @param table もとにした試合表（版の番号を使う）
 * @param content 直した中身
 * @param options 端末・変更の ID・くじの種（なければ見本）
 * @param options.deviceId 送る端末
 * @param options.changeId 変更の ID
 * @param options.seed くじの種
 * @returns 応答
 */
export function updateTable(
  app: TestApp,
  cookie: string,
  table: Pick<MatchTable, "id" | "version" | "seed">,
  content: MatchTableContent,
  options: { deviceId?: string; changeId?: string; seed?: number } = {},
): Promise<Response> {
  return call(app, cookie, `${MATCH_TABLES}/${table.id}`, "PUT", {
    deviceId: options.deviceId ?? DEVICE_A,
    baseVersion: table.version,
    changeId: options.changeId ?? crypto.randomUUID(),
    seed: options.seed ?? table.seed,
    content,
  });
}
