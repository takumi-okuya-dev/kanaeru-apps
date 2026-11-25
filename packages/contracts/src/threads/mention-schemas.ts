// 時間差のメンション（threads-007）の窓口の入出力の形（ふつうの zod・日本語の誤りの文）。
// めぐるの packages/shared/src/schemas.ts の「時間差のメンション（specs/023）」を写した。版は「まだ保存していない」を 0 にする。
import { z } from "zod";
import {
  MENTION_DELAY_OPTIONS,
  MENTION_LABEL_MAX,
  MENTION_MESSAGE_MAX,
  MENTION_PER_REPLY_MAX,
} from "./limits.ts";
import { THREADS_TEXT_LIMIT } from "./threads-text.ts";
import { countChars } from "./text.ts";

/** 時間差（選択肢の分）。 */
const DelayMinutes = z
  .number({ error: "時間差を選んでください。" })
  .int()
  .refine((value) => (MENTION_DELAY_OPTIONS as readonly number[]).includes(value), {
    error: "時間差は、選択肢から選んでください。",
  });

/** 呼び名（前後の空白を除いて1〜30文字）。 */
const Label = z
  .string({ error: "呼び名を入れてください。" })
  .trim()
  .refine((value) => countChars(value) >= 1, { error: "呼び名を入れてください。" })
  .refine((value) => countChars(value) <= MENTION_LABEL_MAX, {
    error: `呼び名は${MENTION_LABEL_MAX}文字までにしてください。`,
  });

/** メンションする人。 */
export const MentionPerson = z.object({
  id: z.guid(),
  username: z.string(),
  label: z.string(),
  /** 「いつも付ける」（メンションを付けるとき、はじめから選ぶ） */
  always: z.boolean(),
  /** この人を選んだ、まだ出していない返信の数 */
  pendingCount: z.number().int(),
});

/** 今は選べない人（pending：ほかの投稿で予定・recent：24時間以内に済み）。 */
export const MentionBlocked = z.object({
  username: z.string(),
  draftId: z.guid(),
  reason: z.enum(["pending", "recent"]),
});

/** GET …/mention-settings の応答。 */
export const MentionSettings = z.object({
  message: z.string(),
  delayMinutes: z.number().int(),
  /** 版（まだ保存していなければ 0） */
  version: z.number().int(),
  people: z.array(MentionPerson),
  /** 返信の権限（threads_manage_replies）がない */
  repliesDenied: z.boolean(),
  /** 今は選べない人（画面は、自分の案の分を除く） */
  blocked: z.array(MentionBlocked),
});

/** メンションの設定の型。 */
export type MentionSettings = z.infer<typeof MentionSettings>;

/** PUT …/mention-settings の入力（読んだ版と同じときだけ）。 */
export const MentionSettingsInput = z.object({
  message: z
    .string({ error: "文字で入れてください。" })
    .trim()
    .refine((value) => countChars(value) <= MENTION_MESSAGE_MAX, {
      error: `ひとことは${MENTION_MESSAGE_MAX}文字までにしてください。`,
    }),
  delayMinutes: DelayMinutes,
  version: z.number().int().min(0),
});

/** メンションの設定の入力の型。 */
export type MentionSettingsInput = z.infer<typeof MentionSettingsInput>;

/** POST …/mention-people の入力。 */
export const MentionPersonInput = z.object({
  username: z
    .string({ error: "ユーザー名を入れてください。" })
    .trim()
    .min(1, { error: "ユーザー名を入れてください。" })
    .max(40, { error: "ユーザー名は30文字までです。" }),
  label: Label,
  always: z.boolean().default(false),
});

/** メンションする人の入力の型。 */
export type MentionPersonInput = z.input<typeof MentionPersonInput>;

/** PUT …/mention-people/{personId} の入力（呼び名・いつも付ける）。 */
export const MentionPersonUpdateInput = z.object({ label: Label, always: z.boolean() });

/** メンションする人を直す入力の型。 */
export type MentionPersonUpdateInput = z.infer<typeof MentionPersonUpdateInput>;

/** PUT …/drafts/{draftId}/mention の入力。文があれば、文の中の一覧の人を選んだ人にする。 */
export const MentionAttachInput = z.object({
  /** 案の版 */
  version: z.number().int().min(1),
  usernames: z
    .array(z.string())
    .min(1, { error: "メンションする人を選んでください。" })
    .max(MENTION_PER_REPLY_MAX, {
      error: `1つの返信で選べるのは${MENTION_PER_REPLY_MAX}人までです。`,
    }),
  text: z
    .string()
    .refine((value) => value.trim() !== "", { error: "返信の文を入れてください。" })
    .refine((value) => countChars(value) <= THREADS_TEXT_LIMIT, {
      error: `返信の文は${THREADS_TEXT_LIMIT}文字までにしてください。`,
    })
    .optional(),
});

/** メンションを付ける入力の型。 */
export type MentionAttachInput = z.infer<typeof MentionAttachInput>;
