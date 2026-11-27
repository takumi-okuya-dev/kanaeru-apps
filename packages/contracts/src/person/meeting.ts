// 人物メモの会った場の窓口の入出力の形（specs/person/001-notes/contracts/person.md）。ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。
// 会った場の名前は1〜100字（コードポイントで数える）、日付は日本時間の日付。そこで会った人の一覧つきの形（Meeting）は、
// 人の形を使うので note.ts に置く（ファイルどうしが互いに読み合わないように）。
import { z } from "zod";
import { PERSON_MEETING_LIMITS, countChars } from "./limits.ts";

/** 会った日（日本時間の日付）。 */
export const MeetingDate = z.iso.date({ error: "日付を選んでください。" });

/** 会った場を作る入力（そろえて同じ名前と日付の会った場があれば、作らずに前のものを返す）。 */
export const MeetingCreateInput = z.strictObject({
  /** 会った場の名前（例：11月の AI 勉強会） */
  name: z
    .string({ error: "会った場の名前を入れてください。" })
    .trim()
    .min(1, { error: "会った場の名前を入れてください。" })
    .refine((value) => countChars(value) <= PERSON_MEETING_LIMITS.name, {
      error: `会った場の名前は${PERSON_MEETING_LIMITS.name}字までにしてください。`,
    }),
  /** 会った日 */
  metOn: MeetingDate,
});

/** 会った場を作る入力の型。 */
export type MeetingCreateInput = z.infer<typeof MeetingCreateInput>;

/** 会った場の一覧の1行（人数つき）。 */
export const MeetingSummary = z.object({
  /** 会った場の ID */
  id: z.uuid(),
  /** 名前 */
  name: z.string(),
  /** 会った日（YYYY-MM-DD） */
  metOn: z.string(),
  /** そこで会った人の数 */
  noteCount: z.number().int(),
});

/** 会った場の一覧の1行の型。 */
export type MeetingSummary = z.infer<typeof MeetingSummary>;

/** 会った場の一覧（日付の新しい順）。 */
export const MeetingList = z.object({ items: z.array(MeetingSummary) });

/** 会った場の一覧の型。 */
export type MeetingList = z.infer<typeof MeetingList>;
