// 人の入力の欄の値と、送る形への読みかえ（人を足す・直す・会った場で続けて足す画面が同じものを使う）。
// 欄の値は文字のまま持ち、送るときに約束（zod）の形にする。タグは「、」か「,」か改行で区切って入れる。
import { NoteCreateInput, NoteUpdateInput } from "@workspace/contracts/person";
import type { Note, NoteAccountsInput } from "@workspace/contracts/person";
import { fieldErrorsFromIssues } from "../../lib/form.ts";

/** 自分だけが見られることを伝える文（FR-007。どの画面にも出す）。 */
export const PRIVACY_TEXT = "このメモを見られるのはあなただけです。";

/** 知られたくないことを書かない注意（FR-007。入力の欄に出す）。 */
export const SENSITIVE_HINT = "病気・信条など、相手が知られたくないことは書かないでください。";

/** 人の入力の欄の値（文字のまま）。 */
export type NoteFormValues = {
  fullName: string;
  reading: string;
  lineName: string;
  appearance: string;
  x: string;
  connpass: string;
  github: string;
  linkedin: string;
  line: string;
  url: string;
  tags: string;
  talk: string;
  nextTopic: string;
};

/** 空の欄。 */
export const EMPTY_NOTE_VALUES: NoteFormValues = {
  fullName: "",
  reading: "",
  lineName: "",
  appearance: "",
  x: "",
  connpass: "",
  github: "",
  linkedin: "",
  line: "",
  url: "",
  tags: "",
  talk: "",
  nextTopic: "",
};

/**
 * タグの欄の文字を、タグの並びにする（「、」「,」「，」と改行で区切り、空は捨てる）。
 * @param text 欄の文字
 * @returns タグの並び
 */
export function parseTags(text: string): string[] {
  return text
    .split(/[、,，\n]/u)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

/**
 * 人のメモを、欄の値にする（直すときの初期値）。
 * @param note 人のメモ
 * @returns 欄の値
 */
export function noteToValues(note: Note): NoteFormValues {
  return {
    fullName: note.fullName,
    reading: note.reading ?? "",
    lineName: note.lineName ?? "",
    appearance: note.appearance ?? "",
    x: note.accounts.x ?? "",
    connpass: note.accounts.connpass ?? "",
    github: note.accounts.github ?? "",
    linkedin: note.accounts.linkedin ?? "",
    line: note.accounts.line ?? "",
    url: note.accounts.url ?? "",
    tags: note.tags.join("、"),
    talk: note.talk,
    nextTopic: note.nextTopic,
  };
}

/**
 * 欄の値を、送る欄の形にする（足す・直すで同じ。空の欄は空の文字で送り、API が null にする）。
 * @param values 欄の値
 * @returns 送る欄
 */
export function valuesToFields(values: NoteFormValues) {
  const accounts: NoteAccountsInput = {
    x: values.x,
    connpass: values.connpass,
    github: values.github,
    linkedin: values.linkedin,
    line: values.line,
    url: values.url,
  };
  return {
    fullName: values.fullName,
    reading: values.reading,
    lineName: values.lineName,
    appearance: values.appearance,
    accounts,
    tags: parseTags(values.tags),
    talk: values.talk,
    nextTopic: values.nextTopic,
  };
}

/**
 * 約束の誤りの欄の名前を、入力の欄の名前にする（accounts.url → url・tags.0 → tags）。
 * @param errors 約束の欄の名前ごとの誤り
 * @returns 入力の欄の名前ごとの誤り
 */
export function toFormErrors(errors: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, message] of Object.entries(errors)) {
    const key = path.startsWith("accounts.")
      ? path.slice("accounts.".length)
      : path.startsWith("tags")
        ? "tags"
        : path;
    result[key] ??= message;
  }
  return result;
}

/** 確かめた結果（送る形か、欄の名前ごとの誤り）。 */
export type Checked<T> = { ok: true; input: T } | { ok: false; errors: Record<string, string> };

/**
 * 人を足す欄の値を確かめ、送る形にする。
 * @param values 欄の値
 * @param clientRequestId 画面が作った送りの ID（送り直しでも同じもの）
 * @param meetingId 付ける会った場（なければ undefined）
 * @returns 送る形か、欄の名前ごとの誤り
 */
export function checkCreate(
  values: NoteFormValues,
  clientRequestId: string,
  meetingId?: string,
): Checked<NoteCreateInput> {
  const parsed = NoteCreateInput.safeParse({
    clientRequestId,
    ...valuesToFields(values),
    ...(meetingId ? { meetingId } : {}),
  });
  return parsed.success
    ? { ok: true, input: parsed.data }
    : { ok: false, errors: toFormErrors(fieldErrorsFromIssues(parsed.error.issues)) };
}

/**
 * 人を直す欄の値を確かめ、送る形にする。
 * @param values 欄の値
 * @param baseVersion もとにした版
 * @returns 送る形か、欄の名前ごとの誤り
 */
export function checkUpdate(values: NoteFormValues, baseVersion: number): Checked<NoteUpdateInput> {
  const parsed = NoteUpdateInput.safeParse({ baseVersion, ...valuesToFields(values) });
  return parsed.success
    ? { ok: true, input: parsed.data }
    : { ok: false, errors: toFormErrors(fieldErrorsFromIssues(parsed.error.issues)) };
}
