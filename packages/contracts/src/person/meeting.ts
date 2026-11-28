// 人物メモの会った場の窓口の入出力の形（specs/person/001-notes/contracts/person.md）。ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。
// 会った場の名前は1〜100字（コードポイントで数える）、日付は日本時間の日付。そこで会った人の一覧つきの形（Meeting）は、
// 人の形を使うので note.ts に置く（ファイルどうしが互いに読み合わないように）。
// PaletKit の交流会から作る会った場（specs/person/002-event-meetings/contracts/person.md）は、交流会を選ぶだけで、
// 名前と日付は API が交流会から写す（入力に名前と日付を持たない）。
import { z } from "zod";
import { PERSON_MEETING_LIMITS, countChars } from "./limits.ts";
import { normalizeMeetingName } from "./search.ts";

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
    })
    // そろえた名前（name_key）の DB の上限。NFKC で字が増える字（㍿ など）が多いと、100字でも超えうる
    .refine((value) => countChars(normalizeMeetingName(value)) <= PERSON_MEETING_LIMITS.nameKey, {
      error: "会った場の名前に、そろえると長くなる字が多すぎます。短くしてください。",
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

/** 会った場に選べる PaletKit の交流会（チェックインした会・持ち主の会・受付係の会。ほかの参加者のことは持たない）。 */
export const EventCandidate = z.object({
  /** 交流会の ID */
  eventId: z.uuid(),
  /** 交流会の今の名前 */
  name: z.string(),
  /** 始まりの日本時間の日付（YYYY-MM-DD） */
  metOn: z.iso.date(),
  /** その交流会から作った会った場（なければ null） */
  meetingId: z.uuid().nullable(),
});

/** 会った場に選べる交流会の型。 */
export type EventCandidate = z.infer<typeof EventCandidate>;

/** 会った場に選べる交流会の一覧（始まりの新しい順。受付アプリが見えなければ available は false で、items は空）。 */
export const EventCandidateList = z.object({
  /** 受付アプリが使う人に見えるか（見えなければ、画面は交流会の欄を出さない） */
  available: z.boolean(),
  /** 選べる交流会 */
  items: z.array(EventCandidate),
});

/** 会った場に選べる交流会の一覧の型。 */
export type EventCandidateList = z.infer<typeof EventCandidateList>;

/** 交流会から会った場を作る入力（その交流会の会った場がもうあれば、作らずに前のものを返す）。 */
export const MeetingFromEventInput = z.strictObject({
  /** 選んだ交流会の ID */
  eventId: z.guid({ error: "交流会を選び直してください。" }),
});

/** 交流会から会った場を作る入力の型。 */
export type MeetingFromEventInput = z.infer<typeof MeetingFromEventInput>;
