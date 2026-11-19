// アンケートの領域の表（docs/apps/survey.md）。survey_answer は survey の領域だけが持つ（AD-3）。
// 主キーは uuid（uuidv7()）、時刻は timestamptz（docs/rules/coding.md 6-4）。
// 回答はチェックインだけを指す（checkin_id は一意。交流会の ID と名前は写さない。research R1）。チェックインを取り消す・
// 本人のアカウントを消すと一緒に消える（ON DELETE CASCADE。AD-7）。選択肢は text と CHECK（Consistency Conventions「選択肢」）。
// 答えていない・「答えない」は null。CHECK の code は約束（@workspace/contracts/survey の options.ts）と同じ並びを文字で書く
// （DB の変更の SQL に値を埋めるため。sql.raw は使わない）。食い違いは survey.test.ts の「選択肢の code はどれも DB に入る」が見張る。
import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { JOB_ROLES, JOB_TYPES, MONTHLY_PRICES, TESTER_ANSWERS } from "@workspace/contracts/survey";
import { primaryId, timestamps } from "../../kernel/columns.ts";
import { checkinTable } from "../reception/index.ts";

/** アンケートの回答（チェックイン1つにつき1つ）。 */
export const surveyAnswer = pgTable(
  "survey_answer",
  {
    id: primaryId(),
    checkinId: uuid("checkin_id")
      .notNull()
      .references(() => checkinTable.id, { onDelete: "cascade" }),
    /** 困りごと（なければ null。ログに出さない） */
    concern: text("concern"),
    /** 実現したら月いくらなら使うか */
    monthlyPrice: text("monthly_price", { enum: MONTHLY_PRICES }),
    /** テスターになるか */
    tester: text("tester", { enum: TESTER_ANSWERS }),
    /** 仕事の立場 */
    jobRole: text("job_role", { enum: JOB_ROLES }),
    /** 職種 */
    jobType: text("job_type", { enum: JOB_TYPES }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("survey_answer_checkin_id_unique").on(table.checkinId),
    check(
      "survey_answer_monthly_price_check",
      sql`${table.monthlyPrice} in ('jpy0', 'jpy500', 'jpy1000', 'jpy3000plus', 'unknown')`,
    ),
    check("survey_answer_tester_check", sql`${table.tester} in ('yes', 'no')`),
    check(
      "survey_answer_job_role_check",
      sql`${table.jobRole} in ('executive', 'manager', 'employee', 'freelance', 'student', 'other')`,
    ),
    check(
      "survey_answer_job_type_check",
      sql`${table.jobType} in ('engineer', 'designer', 'sales', 'marketing', 'planning', 'backoffice', 'management', 'other')`,
    ),
  ],
);
