// 受付の領域の表（docs/apps/reception.md）。checkin は reception の領域だけが持つ（AD-3）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。金額は円の整数。
// 名前と金額は、チェックインのときに写して持つ（AD-6）。外部キー：交流会は RESTRICT・本人の account は CASCADE・
// 手で入れた人は SET NULL（AD-7）。選択肢は text と CHECK（Consistency Conventions「選択肢」）。
// CHECK の code は約束（@workspace/contracts/reception の options.ts）と同じ並びを文字で書く（DB の変更の SQL に値を埋めるため。
// sql.raw は使わない）。食い違いは reception.test.ts の「選択肢の code はどれも DB に入る」が見張る。
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "../../kernel/columns.ts";
import { accountTable } from "../account/index.ts";
import { eventTable } from "../event/index.ts";

/** チェックイン（参加者がその交流会に来た記録。1つの交流会で参加者1人につき1回）。 */
export const checkin = pgTable(
  "checkin",
  {
    id: primaryId(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventTable.id, { onDelete: "restrict" }),
    /** LINE のチェックインの本人（手なら null） */
    accountId: uuid("account_id").references(() => accountTable.id, { onDelete: "cascade" }),
    /** 手でのチェックインを入れた人（LINE なら null。そのアカウントが消えたら null） */
    enteredBy: uuid("entered_by").references(() => accountTable.id, { onDelete: "set null" }),
    /** 名前（チェックインのときに写したもの） */
    name: text("name").notNull(),
    /** 申し込みの媒体 */
    applicationSource: text("application_source").notNull(),
    /** 知ったきっかけ */
    referral: text("referral").notNull(),
    /** 支払い方法 */
    paymentMethod: text("payment_method").notNull(),
    /** 金額（円の整数。作るときと支払い方法を直すときだけ決める） */
    amount: integer("amount").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("checkin_event_id_account_id_unique")
      .on(table.eventId, table.accountId)
      .where(sql`${table.accountId} is not null`),
    index("checkin_event_id_created_at_idx").on(table.eventId, table.createdAt),
    index("checkin_account_id_created_at_idx").on(table.accountId, table.createdAt),
    index("checkin_entered_by_idx").on(table.enteredBy),
    check("checkin_amount_check", sql`${table.amount} >= 0`),
    check(
      "checkin_application_source_check",
      sql`${table.applicationSource} in ('connpass', 'peatix', 'direct', 'other')`,
    ),
    check(
      "checkin_referral_check",
      sql`${table.referral} in ('friend', 'sns', 'announcement', 'other')`,
    ),
    check(
      "checkin_payment_method_check",
      sql`${table.paymentMethod} in ('paypay', 'cash', 'free')`,
    ),
  ],
);
