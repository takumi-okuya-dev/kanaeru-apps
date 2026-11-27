// 人物メモの人の窓口の入出力の形（specs/person/001-notes/contracts/person.md・research R7・R10）。ふつうの zod で書く
// （OpenAPI の名前は API の側で付ける）。入力の誤りの文は、欄のそばに出せる日本語にする。文に利用者の値を入れない。
// 字はコードポイントで数える（絵文字も1字。DB の char_length と同じ。limits.ts の countChars）。
// 任意の欄の空の文字は、API が null にして持つ（形の上では空の文字も受ける）。タグは、そろえて同じものを1つにまとめる。
import { z } from "zod";
import { isHttpUrl } from "./accounts.ts";
import { PERSON_NOTE_LIMITS, countChars } from "./limits.ts";
import { MeetingSummary } from "./meeting.ts";
import { PERSON_MATCH_FIELDS } from "./options.ts";
import { normalizeTag } from "./search.ts";

/** 人の一覧で1回に返す人数の上限（それより多いときは truncated。research R9）。 */
export const PERSON_LIST_MAX = 500;

/** 検索で1回に返す人数の上限（research R6）。 */
export const PERSON_SEARCH_MAX = 100;

/** 探す言葉の字数の上限。 */
export const PERSON_SEARCH_QUERY_MAX = 100;

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/**
 * 字数に上限のある文の欄（前後の空白を除く）。
 * @param label 欄の名前（誤りの文に使う）
 * @param max 字数の上限
 * @returns zod の形
 */
function limitedText(label: string, max: number) {
  return z
    .string({ error: `${label}を文字で入れてください。` })
    .trim()
    .refine((value) => countChars(value) <= max, {
      error: `${label}は${max.toLocaleString("ja-JP")}字までにしてください。`,
    });
}

/**
 * 任意の短い欄（空の文字か null は、書いていないもの）。
 * @param label 欄の名前
 * @param max 字数の上限
 * @returns zod の形
 */
function optionalText(label: string, max: number) {
  return limitedText(label, max).nullable().optional();
}

/**
 * タグの並びを、そろえて同じものを1つにまとめる（最初に入れた書き方を残す。「AI」「ai」「ＡＩ」は同じ）。
 * @param tags タグの並び
 * @returns まとめた並び
 */
export function uniqueTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const key = normalizeTag(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** タグ1つ（1〜30字。改行なし）。 */
const Tag = z
  .string({ error: "タグを文字で入れてください。" })
  .trim()
  .min(1, { error: "タグを入れてください。" })
  .refine((value) => countChars(value) <= PERSON_NOTE_LIMITS.tag, {
    error: `タグは${PERSON_NOTE_LIMITS.tag}字までにしてください。`,
  })
  .refine((value) => !/[\r\n]/u.test(value), { error: "タグに改行は入れられません。" });

/** タグの並び（数の上限は置かない。PRD FR-P2。そろえて同じものは1つにまとめる）。 */
const Tags = z.array(Tag).overwrite(uniqueTags);

/** アカウントの入力（X・connpass・GitHub・LinkedIn・LINE ID はアカウント名、そのほかは http・https の URL）。 */
export const NoteAccountsInput = z.strictObject({
  /** X のアカウント名 */
  x: optionalText("X のアカウント名", PERSON_NOTE_LIMITS.account),
  /** connpass のアカウント名 */
  connpass: optionalText("connpass のアカウント名", PERSON_NOTE_LIMITS.account),
  /** GitHub のアカウント名 */
  github: optionalText("GitHub のアカウント名", PERSON_NOTE_LIMITS.account),
  /** LinkedIn のアカウント名 */
  linkedin: optionalText("LinkedIn のアカウント名", PERSON_NOTE_LIMITS.account),
  /** LINE ID */
  line: optionalText("LINE ID", PERSON_NOTE_LIMITS.account),
  /** そのほかの URL（http・https だけ） */
  url: limitedText("URL", PERSON_NOTE_LIMITS.account)
    .refine((value) => value === "" || isHttpUrl(value), {
      error: "http か https で始まる URL を入れてください。",
    })
    .nullable()
    .optional(),
});

/** アカウントの入力の型。 */
export type NoteAccountsInput = z.infer<typeof NoteAccountsInput>;

/** 人の欄（足す・直すで同じ）。 */
const noteFields = {
  /** フルネーム（要る） */
  fullName: z
    .string({ error: "フルネームを入れてください。" })
    .trim()
    .min(1, { error: "フルネームを入れてください。" })
    .refine((value) => countChars(value) <= PERSON_NOTE_LIMITS.fullName, {
      error: `フルネームは${PERSON_NOTE_LIMITS.fullName}字までにしてください。`,
    }),
  /** よみ */
  reading: optionalText("よみ", PERSON_NOTE_LIMITS.reading),
  /** LINE の名前 */
  lineName: optionalText("LINE の名前", PERSON_NOTE_LIMITS.lineName),
  /** 見た目の特徴 */
  appearance: optionalText("見た目の特徴", PERSON_NOTE_LIMITS.appearance),
  /** アカウント（送ると6つすべてを置きかえる。送らない種類は空になる） */
  accounts: NoteAccountsInput.optional(),
  /** タグ */
  tags: Tags.optional(),
  /** 話したこと */
  talk: limitedText("話したこと", PERSON_NOTE_LIMITS.talk).optional(),
  /** 次に話したいこと */
  nextTopic: limitedText("次に話したいこと", PERSON_NOTE_LIMITS.nextTopic).optional(),
};

/** 人を足す入力（同じ clientRequestId の送り直しは、二重にせず前の人を返す。research R7）。 */
export const NoteCreateInput = z.strictObject({
  /** 画面が作る送りの ID（送り直しでも同じものを使う） */
  clientRequestId: z.guid({ error: "送りの ID の形が合いません。" }),
  ...noteFields,
  /** 会った場（付けるとき。自分の会った場だけ） */
  meetingId: z.guid({ error: "会った場を選び直してください。" }).optional(),
});

/** 人を足す入力の型。 */
export type NoteCreateInput = z.infer<typeof NoteCreateInput>;

/** 人を直す入力（もとにした版が今の版と違えば 409。送らない欄は変えない）。 */
export const NoteUpdateInput = z.strictObject({
  /** もとにした版 */
  baseVersion: z.number().int().min(1),
  ...noteFields,
});

/** 人を直す入力の型。 */
export type NoteUpdateInput = z.infer<typeof NoteUpdateInput>;

/** 話したことに書き足す入力（同じ appendId の送り直しは、書かずに今の値を返す。research R7）。 */
export const NoteAppendInput = z.strictObject({
  /** 画面が作る書き足しの ID（送り直しでも同じものを使う） */
  appendId: z.guid({ error: "書き足しの ID の形が合いません。" }),
  /** 書き足す文 */
  text: limitedText("書き足すこと", PERSON_NOTE_LIMITS.talk).refine((value) => value.length > 0, {
    error: "書き足すことを入れてください。",
  }),
  /** 会った場（選んだとき。見出しに入り、その人に付く） */
  meetingId: z.guid({ error: "会った場を選び直してください。" }).optional(),
});

/** 話したことに書き足す入力の型。 */
export type NoteAppendInput = z.infer<typeof NoteAppendInput>;

/** 探す入力（言葉かタグのどちらかが要る。両方なら両方に当たる人だけ。AD-31：URL に載せないので POST の本文で送る）。 */
export const NoteSearchInput = z
  .strictObject({
    /** 探す言葉（改行なし） */
    query: limitedText("探す言葉", PERSON_SEARCH_QUERY_MAX)
      .refine((value) => !/[\r\n]/u.test(value), { error: "探す言葉に改行は入れられません。" })
      .optional(),
    /** 絞るタグ */
    tag: limitedText("タグ", PERSON_NOTE_LIMITS.tag).optional(),
  })
  .refine((input) => (input.query ?? "") !== "" || (input.tag ?? "") !== "", {
    error: "探す言葉かタグを入れてください。",
    path: ["query"],
  });

/** 探す入力の型。 */
export type NoteSearchInput = z.infer<typeof NoteSearchInput>;

/** 人の一覧の1行（名前の横に見た目の特徴を出す）。 */
export const NoteSummary = z.object({
  /** 人の ID */
  id: z.uuid(),
  /** フルネーム */
  fullName: z.string(),
  /** よみ */
  reading: z.string().nullable(),
  /** LINE の名前 */
  lineName: z.string().nullable(),
  /** 見た目の特徴 */
  appearance: z.string().nullable(),
  /** タグ */
  tags: z.array(z.string()),
  /** 最後に保存した時刻 */
  updatedAt: isoDateTime,
});

/** 人の一覧の1行の型。 */
export type NoteSummary = z.infer<typeof NoteSummary>;

/** 人のアカウント（入れていない種類は null）。 */
export const NoteAccounts = z.object({
  /** X のアカウント名 */
  x: z.string().nullable(),
  /** connpass のアカウント名 */
  connpass: z.string().nullable(),
  /** GitHub のアカウント名 */
  github: z.string().nullable(),
  /** LinkedIn のアカウント名 */
  linkedin: z.string().nullable(),
  /** LINE ID */
  line: z.string().nullable(),
  /** そのほかの URL */
  url: z.string().nullable(),
});

/** 人のアカウントの型。 */
export type NoteAccounts = z.infer<typeof NoteAccounts>;

/** 人のメモ（全部の欄と、付いている会った場）。 */
export const Note = NoteSummary.extend({
  /** アカウント */
  accounts: NoteAccounts,
  /** 話したこと */
  talk: z.string(),
  /** 次に話したいこと */
  nextTopic: z.string(),
  /** 版の番号（直すときに baseVersion として送る） */
  version: z.number().int(),
  /** 付いている会った場（日付の新しい順） */
  meetings: z.array(MeetingSummary),
});

/** 人のメモの型。 */
export type Note = z.infer<typeof Note>;

/** 人の一覧（最後に保存した順。最大500人。より多いときは truncated）。 */
export const NoteList = z.object({
  /** 人 */
  items: z.array(NoteSummary),
  /** 新しい500人だけを返したか */
  truncated: z.boolean(),
});

/** 人の一覧の型。 */
export type NoteList = z.infer<typeof NoteList>;

/** 会った場（そこで会った人の一覧つき。最後に保存した順）。 */
export const Meeting = MeetingSummary.extend({
  /** そこで会った人 */
  notes: z.array(NoteSummary),
});

/** 会った場の型。 */
export type Meeting = z.infer<typeof Meeting>;

/** 検索で当たった所（hit はもとの文の当たった所、before・after は前後20字ほど）。 */
export const SearchMatch = z.object({
  /** 当たった欄 */
  field: z.enum(PERSON_MATCH_FIELDS),
  /** 前の文 */
  before: z.string(),
  /** 当たった所 */
  hit: z.string(),
  /** 後の文 */
  after: z.string(),
});

/** 検索で当たった所の型。 */
export type SearchMatch = z.infer<typeof SearchMatch>;

/** 検索の結果（最後に保存した順。最大100人。より多いときは truncated）。 */
export const SearchResult = z.object({
  /** 当たった人と、当たった所 */
  items: z.array(z.object({ note: NoteSummary, matches: z.array(SearchMatch) })),
  /** 新しい100人だけを返したか */
  truncated: z.boolean(),
});

/** 検索の結果の型。 */
export type SearchResult = z.infer<typeof SearchResult>;
