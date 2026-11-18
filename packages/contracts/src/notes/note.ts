// メモの入出力の形（API の入力の確かめ・OpenAPI の文書・画面の入力の確かめが、同じ形を使う）。
// 入力の誤りの文は、欄のそばにそのまま出せる日本語にする（EXPERIENCE.md 3「入力の誤り」）。
// ふつうの zod で書く（画面の組み立てに OpenAPI の道具を入れないため）。OpenAPI の名前は API の側（routes.ts）で付ける。
import { z } from "zod";

/** 題の文字数の上限。 */
export const NOTE_TITLE_MAX = 100;

/** 本文の文字数の上限。 */
export const NOTE_BODY_MAX = 2000;

/** メモを作る・直すときの入力。前後の空白は除く。知らない欄は受け取らない。 */
export const NoteInput = z.strictObject({
  title: z
    .string({ error: "題を入れてください。" })
    .trim()
    .min(1, { error: "題を入れてください。" })
    .max(NOTE_TITLE_MAX, { error: `題は${NOTE_TITLE_MAX}文字までにしてください。` }),
  body: z
    .string({ error: "本文は文字にしてください。" })
    .trim()
    .max(NOTE_BODY_MAX, { error: `本文は${NOTE_BODY_MAX}文字までにしてください。` })
    .default(""),
});

/** メモを作る・直すときの入力の型（確かめたあと）。 */
export type NoteInput = z.infer<typeof NoteInput>;

/** メモ。 */
export const Note = z.object({
  id: z.guid(),
  title: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** メモの型。 */
export type Note = z.infer<typeof Note>;

/** メモの一覧（新しく直した順）。 */
export const NoteList = z.object({ items: z.array(Note) });

/** メモの一覧の型。 */
export type NoteList = z.infer<typeof NoteList>;
