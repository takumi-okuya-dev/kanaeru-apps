// アプリの台帳の読み書き（表は suite の領域だけが読み書きする。AD-3）。
import type { AppVisibility } from "@workspace/contracts/suite";
import { eq, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { appSetting } from "./schema.ts";

/**
 * DB の変更が入れる初めの行（受付アプリは公開。本番のふるまいを変えないため。AD-16）。
 * 結合のテストが表を空にしたあと、この行を戻す（test/helpers/db.ts）。DB の変更の SQL と同じ値にする（suite.test.ts が比べる）。
 */
export const INITIAL_APP_SETTINGS: readonly { appKey: string; visibility: AppVisibility }[] = [
  { appKey: "reception", visibility: "public" },
];

/**
 * 1つのアプリの公開の状態を読む（行がなければ null）。
 * @param db DB
 * @param appKey アプリの key
 * @returns 公開の状態。行がなければ null
 */
export async function findVisibility(db: Executor, appKey: string): Promise<AppVisibility | null> {
  const [row] = await db
    .select({ visibility: appSetting.visibility })
    .from(appSetting)
    .where(eq(appSetting.appKey, appKey))
    .limit(1);
  return (row?.visibility as AppVisibility | undefined) ?? null;
}

/**
 * 台帳の行をすべて読む（アプリの key → 公開の状態）。
 * @param db DB
 * @returns アプリの key ごとの公開の状態（行があるものだけ）
 */
export async function listVisibilities(db: Executor): Promise<Map<string, AppVisibility>> {
  const rows = await db
    .select({ appKey: appSetting.appKey, visibility: appSetting.visibility })
    .from(appSetting);
  return new Map(rows.map((row) => [row.appKey, row.visibility as AppVisibility]));
}

/**
 * 1つのアプリの公開の状態を書く（行がなければ作る。同時に来ても一意の制約で1行）。
 * @param db DB
 * @param appKey アプリの key（登録されたもの）
 * @param visibility 公開の状態
 */
export async function upsertVisibility(
  db: Executor,
  appKey: string,
  visibility: AppVisibility,
): Promise<void> {
  await db
    .insert(appSetting)
    .values({ appKey, visibility })
    .onConflictDoUpdate({
      target: appSetting.appKey,
      set: { visibility, updatedAt: sql`now()` },
    });
}

/**
 * 初めの行（INITIAL_APP_SETTINGS）を入れ直す（結合のテストが表を空にしたあとに使う）。
 * @param db DB
 */
export async function restoreInitialAppSettings(db: Executor): Promise<void> {
  for (const row of INITIAL_APP_SETTINGS) await upsertVisibility(db, row.appKey, row.visibility);
}
