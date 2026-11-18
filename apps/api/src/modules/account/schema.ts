// アカウントの領域の表（docs/apps/account.md）。account と session は account の領域だけが持つ（AD-2・AD-3）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。
// session は札そのものを持たず、札の SHA-256 だけを持つ（specs/account/001-line-login/research.md R4）。
// account を消すと、その人のセッションも消える（ON DELETE CASCADE。AD-7）。
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps, timestamptz } from "../../kernel/columns.ts";

/** アカウント（LINE の利用者1人）。created_at が登録日。 */
export const account = pgTable(
  "account",
  {
    id: primaryId(),
    /** LINE のユーザー ID（プロバイダーごとに決まる。AD-2） */
    lineUserId: text("line_user_id").notNull(),
    /** 表示名（LINE の名前。ログインのたびに上書きする） */
    displayName: text("display_name").notNull().default(""),
    ...timestamps(),
  },
  (table) => [uniqueIndex("account_line_user_id_unique").on(table.lineUserId)],
);

/** セッション（ログインの1回。期限は作ってから30日）。 */
export const session = pgTable(
  "session",
  {
    id: primaryId(),
    /** クッキーの札の SHA-256（16進64文字） */
    tokenHash: text("token_hash").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("session_token_hash_unique").on(table.tokenHash),
    index("session_account_id_idx").on(table.accountId),
  ],
);
