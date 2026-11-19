// スイートの領域の表（docs/apps/suite.md）。app_setting は suite の領域だけが持ち、書く（AD-3・AD-16）。
// アプリごとに1行で、公開の状態（off・operator_only・public）を持つ。行がないアプリは operator_only。
// 売り方の列は、売り始めるときに足す（core-005 の仮決め）。主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。
import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "../../kernel/columns.ts";

/** アプリの台帳の行（アプリの key ごとに1つ）。 */
export const appSetting = pgTable(
  "app_setting",
  {
    id: primaryId(),
    /** アプリの key（packages/contracts/src/core/apps.list.ts の key） */
    appKey: text("app_key").notNull(),
    /** 公開の状態（off・operator_only・public） */
    visibility: text("visibility").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("app_setting_app_key_unique").on(table.appKey),
    check(
      "app_setting_visibility_check",
      sql`${table.visibility} in ('off', 'operator_only', 'public')`,
    ),
  ],
);
