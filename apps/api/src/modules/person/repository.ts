// 人物メモの読み書き（person の表だけを触る。AD-3・AD-31）。持ち主の確かめは access.ts。
// 人を保存するたびに、検索のためにそろえた文（search_text）・そろえ方の版・そろえたタグ（tag_keys）を作る（updated_at は列の決まりで
// 新しくなる）。任意の欄の空の文字は null にして持つ。起こりうる DB のエラーは AppError に読みかえる（guardDbErrors）。
// logger にメモの値を渡さない（ここではログを書かない）。
import {
  PERSON_ERRORS,
  PERSON_LIST_MAX,
  PERSON_NOTE_LIMITS,
  PERSON_RECENT_APPEND_IDS_MAX,
  SEARCH_VERSION,
  appendTalk,
  countChars,
  normalizeForSearch,
  normalizeMeetingName,
  normalizeTag,
  uniqueTags,
} from "@workspace/contracts/person";
import type {
  Meeting,
  MeetingSummary,
  Note,
  NoteAccountsInput,
  NoteCreateInput,
  NoteSummary,
  NoteUpdateInput,
} from "@workspace/contracts/person";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { isDbUnavailable, isForeignKeyViolation } from "../../kernel/pg-errors.ts";
import type { OwnedMeeting, OwnedNote } from "./access.ts";
import { personMeeting, personNote, personNoteMeeting } from "./schema.ts";

/** PostgreSQL の CHECK の違反の code。 */
const CHECK_VIOLATION = "23514";

/**
 * 投げられたもの（か、drizzle が包んだ cause）の SQLSTATE と制約の名前。
 * @param error 投げられたもの
 * @returns SQLSTATE と制約の名前（DB のエラーでなければ undefined）
 */
function sqlStateOf(error: unknown): { code: string; constraint: string } | undefined {
  for (const candidate of [error, (error as { cause?: unknown } | null)?.cause]) {
    const { code, constraint } = (candidate ?? {}) as { code?: unknown; constraint?: unknown };
    if (typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code)) {
      return { code, constraint: typeof constraint === "string" ? constraint : "" };
    }
  }
  return undefined;
}

/**
 * 人物メモの DB の処理を流し、起こりうる DB のエラーを AppError に読みかえる（research R14）。
 * - 外部キーの違反（確かめたあとに人か会った場が消された）は PERSON_NOT_FOUND
 * - CHECK の違反（約束と DB の上限の食い違い）は INVALID_INPUT
 * - ほかの DB のエラーは、SQLSTATE と制約の名前だけを持つ新しいエラーにする（drizzle のエラーは SQL に渡した値〈メモの中身〉を
 *   文に含み、予期しないエラーのログに出てしまうため。AD-31）
 * DB に届かないエラーは、そのまま投げる（土台が 503 DB_UNAVAILABLE にする。AD-10）。
 * @param run 処理
 * @returns 処理の答え
 * @throws {AppError} 読みかえたエラー
 * @throws {Error} 読みかえられない DB のエラー（値を含まない）
 */
export async function guardDbErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError || isDbUnavailable(error)) throw error;
    if (isForeignKeyViolation(error)) throw new AppError(PERSON_ERRORS.NOT_FOUND);
    const state = sqlStateOf(error);
    if (!state) throw error;
    if (state.code === CHECK_VIOLATION) throw new AppError("INVALID_INPUT");
    const safe = new Error(
      `人物メモの DB の命令が失敗しました（SQLSTATE ${state.code}・制約 ${state.constraint || "なし"}）。`,
    );
    safe.name = "PersonDbError";
    throw safe;
  }
}

/** 一覧の1行に読む列。 */
const summaryColumns = {
  id: personNote.id,
  fullName: personNote.fullName,
  reading: personNote.reading,
  lineName: personNote.lineName,
  appearance: personNote.appearance,
  tags: personNote.tags,
  updatedAt: personNote.updatedAt,
};

/** 一覧の1行に読んだ値。 */
type SummaryRow = {
  id: string;
  fullName: string;
  reading: string | null;
  lineName: string | null;
  appearance: string | null;
  tags: string[];
  updatedAt: Date;
};

/**
 * 読んだ行を、一覧の1行の形にする。
 * @param row 行
 * @returns 一覧の1行
 */
export function toSummary(row: SummaryRow): NoteSummary {
  return {
    id: row.id,
    fullName: row.fullName,
    reading: row.reading,
    lineName: row.lineName,
    appearance: row.appearance,
    tags: row.tags,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 送られた任意の欄の値を、持つ値にする（送らなかった欄は今の値・空の文字は null）。
 * @param value 送られた値（送らなかったら undefined）
 * @param current 今の値
 * @returns 持つ値
 */
function choose(value: string | null | undefined, current: string | null): string | null {
  if (value === undefined) return current;
  return value === null || value === "" ? null : value;
}

/** 人の欄（DB に持つ形）。 */
type NoteFields = {
  fullName: string;
  reading: string | null;
  lineName: string | null;
  appearance: string | null;
  accountX: string | null;
  accountConnpass: string | null;
  accountGithub: string | null;
  accountLinkedin: string | null;
  accountLine: string | null;
  accountUrl: string | null;
  tags: string[];
  talk: string;
  nextTopic: string;
};

/**
 * アカウントの入力を、列の値にする（送ると6つすべてを置きかえる）。
 * @param accounts アカウントの入力
 * @returns 列の値
 */
function accountColumns(accounts: NoteAccountsInput) {
  return {
    accountX: choose(accounts.x, null),
    accountConnpass: choose(accounts.connpass, null),
    accountGithub: choose(accounts.github, null),
    accountLinkedin: choose(accounts.linkedin, null),
    accountLine: choose(accounts.line, null),
    accountUrl: choose(accounts.url, null),
  };
}

/**
 * 今の欄に、送られた欄だけを重ねる（送らなかった欄は今のまま）。
 * @param current 今の欄
 * @param input 送られた欄
 * @returns 重ねた欄
 */
function mergeFields(
  current: NoteFields,
  input:
    Omit<NoteUpdateInput, "baseVersion"> | Omit<NoteCreateInput, "clientRequestId" | "meetingId">,
): NoteFields {
  // 今の行のほかの列（updated_at など）を持ちこまないよう、人の欄だけを並べる
  return {
    fullName: input.fullName,
    reading: choose(input.reading, current.reading),
    lineName: choose(input.lineName, current.lineName),
    appearance: choose(input.appearance, current.appearance),
    ...(input.accounts
      ? accountColumns(input.accounts)
      : {
          accountX: current.accountX,
          accountConnpass: current.accountConnpass,
          accountGithub: current.accountGithub,
          accountLinkedin: current.accountLinkedin,
          accountLine: current.accountLine,
          accountUrl: current.accountUrl,
        }),
    tags: input.tags ? uniqueTags(input.tags) : current.tags,
    talk: input.talk ?? current.talk,
    nextTopic: input.nextTopic ?? current.nextTopic,
  };
}

/** 新しい人の欄（どれも空）。 */
const EMPTY_FIELDS: NoteFields = {
  fullName: "",
  reading: null,
  lineName: null,
  appearance: null,
  accountX: null,
  accountConnpass: null,
  accountGithub: null,
  accountLinkedin: null,
  accountLine: null,
  accountUrl: null,
  tags: [],
  talk: "",
  nextTopic: "",
};

/**
 * 検索のためにそろえた文・そろえ方の版・そろえたタグを作る（research R6）。
 * フルネーム・よみ・LINE の名前・見た目の特徴・話したこと・次に話したいこと・タグを、そろえて改行でつなぐ。
 * @param fields 人の欄
 * @returns 検索の列の値
 */
export function searchColumns(
  fields: Pick<
    NoteFields,
    "fullName" | "reading" | "lineName" | "appearance" | "talk" | "nextTopic" | "tags"
  >,
) {
  const parts = [
    fields.fullName,
    fields.reading ?? "",
    fields.lineName ?? "",
    fields.appearance ?? "",
    fields.talk,
    fields.nextTopic,
    ...fields.tags,
  ];
  return {
    searchText: parts.map(normalizeForSearch).join("\n"),
    searchVersion: SEARCH_VERSION,
    tagKeys: fields.tags.map(normalizeTag),
  };
}

/**
 * 同じ送りの ID で足した人を探す（送り直しのとき）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @param createRequestId 画面が作った送りの ID
 * @returns 人の ID（なければ undefined）
 */
export async function findNoteIdByRequest(
  db: Executor,
  ownerAccountId: string,
  createRequestId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: personNote.id })
    .from(personNote)
    .where(
      and(
        eq(personNote.ownerAccountId, ownerAccountId),
        eq(personNote.createRequestId, createRequestId),
      ),
    );
  return row?.id;
}

/**
 * 人を足す。
 * @param db DB（トランザクション）
 * @param ownerAccountId 持ち主
 * @param input 足す入力
 * @returns 人の ID
 * @throws {Error} 行が返らなかったとき
 */
export async function insertNote(
  db: Executor,
  ownerAccountId: string,
  input: NoteCreateInput,
): Promise<string> {
  const { clientRequestId, meetingId: _meetingId, ...rest } = input;
  const fields = mergeFields(EMPTY_FIELDS, rest);
  const [row] = await db
    .insert(personNote)
    .values({
      ownerAccountId,
      ...fields,
      ...searchColumns(fields),
      createRequestId: clientRequestId,
    })
    .returning({ id: personNote.id });
  if (!row) throw new Error("人を足せませんでした。");
  return row.id;
}

/**
 * 人を直す（送られた欄だけを重ね、版を1つ上げる。版の比べは呼ぶ側が行を押さえてから行う）。
 * @param db DB（トランザクション）
 * @param current 今の行（押さえたもの）
 * @param input 直す入力
 */
export async function updateNote(
  db: Executor,
  current: OwnedNote,
  input: NoteUpdateInput,
): Promise<void> {
  const { baseVersion: _baseVersion, ...rest } = input;
  const fields = mergeFields(current, rest);
  await db
    .update(personNote)
    .set({ ...fields, ...searchColumns(fields), version: current.version + 1 })
    .where(eq(personNote.id, current.id));
}

/**
 * 話したことに書き足す（見出しつき。版を1つ上げ、書き足しの ID を持つ）。
 * @param db DB（トランザクション）
 * @param current 今の行（押さえたもの）
 * @param input 書き足しの ID・文・見出しに入れる会った場
 * @param input.appendId 書き足しの ID
 * @param input.text 書き足す文
 * @param input.meeting 見出しに入れる会った場（なければ null）
 * @param now 書き足した時刻（見出しの日付）
 * @throws {AppError} 書き足すと話したことが上限を超える（INVALID_INPUT。fields.talk）
 */
export async function appendToTalk(
  db: Executor,
  current: OwnedNote,
  input: { appendId: string; text: string; meeting: OwnedMeeting | null },
  now: Date = new Date(),
): Promise<void> {
  const talk = appendTalk(current.talk, input.text, now, input.meeting);
  if (countChars(talk) > PERSON_NOTE_LIMITS.talk) {
    throw new AppError("INVALID_INPUT", {
      fields: [
        {
          path: "talk",
          message: `書き足すと、話したことが${PERSON_NOTE_LIMITS.talk.toLocaleString("ja-JP")}字を超えます。短くしてから書き足してください。`,
        },
      ],
    });
  }
  await db
    .update(personNote)
    .set({
      talk,
      ...searchColumns({ ...current, talk }),
      version: current.version + 1,
      // 最近の書き足しの ID は新しい順に最大20個（行ロックの中なので、読んだ値に足してよい。research R7）
      recentAppendIds: [input.appendId, ...current.recentAppendIds].slice(
        0,
        PERSON_RECENT_APPEND_IDS_MAX,
      ),
    })
    .where(eq(personNote.id, current.id));
}

/**
 * 人の updated_at を新しくする（会った場を付けた・外したとき。一覧の並び。research R9）。
 * @param db DB
 * @param noteId 人の ID
 */
async function touchNote(db: Executor, noteId: string): Promise<void> {
  await db
    .update(personNote)
    .set({ updatedAt: sql`now()` })
    .where(eq(personNote.id, noteId));
}

/**
 * 人に会った場を付ける（付いていれば何もしない。付けたら人の updated_at を新しくする）。
 * 持ち主の違う人と会った場は、複合の外部キーが結ばせない（呼ぶ側も access.ts で確かめる）。
 * @param db DB（トランザクション）
 * @param ownerAccountId 持ち主
 * @param noteId 人の ID
 * @param meetingId 会った場の ID
 */
export async function attachMeeting(
  db: Executor,
  ownerAccountId: string,
  noteId: string,
  meetingId: string,
): Promise<void> {
  const inserted = await db
    .insert(personNoteMeeting)
    .values({ noteId, meetingId, ownerAccountId })
    .onConflictDoNothing()
    .returning({ noteId: personNoteMeeting.noteId });
  if (inserted.length > 0) await touchNote(db, noteId);
}

/**
 * 人から会った場を外す（外したら人の updated_at を新しくする）。
 * @param db DB（トランザクション）
 * @param noteId 人の ID
 * @param meetingId 会った場の ID
 */
export async function detachMeeting(
  db: Executor,
  noteId: string,
  meetingId: string,
): Promise<void> {
  const deleted = await db
    .delete(personNoteMeeting)
    .where(and(eq(personNoteMeeting.noteId, noteId), eq(personNoteMeeting.meetingId, meetingId)))
    .returning({ noteId: personNoteMeeting.noteId });
  if (deleted.length > 0) await touchNote(db, noteId);
}

/**
 * 人を消す（組も外部キーで消える。会った場は残る）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @param noteId 人の ID
 * @returns 消したら true
 */
export async function deleteNote(
  db: Executor,
  ownerAccountId: string,
  noteId: string,
): Promise<boolean> {
  const rows = await db
    .delete(personNote)
    .where(and(eq(personNote.id, noteId), eq(personNote.ownerAccountId, ownerAccountId)))
    .returning({ id: personNote.id });
  return rows.length > 0;
}

/**
 * 人の一覧（最後に保存した順。最大500人。より多いときは truncated）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @returns 一覧
 */
export async function listNotes(
  db: Executor,
  ownerAccountId: string,
): Promise<{ items: NoteSummary[]; truncated: boolean }> {
  const rows = await db
    .select(summaryColumns)
    .from(personNote)
    .where(eq(personNote.ownerAccountId, ownerAccountId))
    .orderBy(desc(personNote.updatedAt), desc(personNote.id))
    .limit(PERSON_LIST_MAX + 1);
  return {
    items: rows.slice(0, PERSON_LIST_MAX).map(toSummary),
    truncated: rows.length > PERSON_LIST_MAX,
  };
}

/**
 * 会った場の一覧の行（人数つき。日付の新しい順）。
 * @param db DB
 * @param where 絞りこみ（持ち主・ID など）
 * @returns 会った場の並び
 */
async function meetingSummaries(db: Executor, where: SQL | undefined): Promise<MeetingSummary[]> {
  return db
    .select({
      id: personMeeting.id,
      name: personMeeting.name,
      metOn: personMeeting.metOn,
      noteCount: sql<number>`count(${personNoteMeeting.noteId})::int`,
    })
    .from(personMeeting)
    .leftJoin(personNoteMeeting, eq(personNoteMeeting.meetingId, personMeeting.id))
    .where(where)
    .groupBy(personMeeting.id)
    .orderBy(desc(personMeeting.metOn), desc(personMeeting.createdAt));
}

/**
 * 人を読む（全部の欄と、付いている会った場）。
 * @param db DB
 * @param row 持ち主を確かめた人の行
 * @returns 人のメモ
 */
export async function noteOf(db: Executor, row: OwnedNote): Promise<Note> {
  const meetings = await meetingSummaries(
    db,
    inArray(
      personMeeting.id,
      db
        .select({ id: personNoteMeeting.meetingId })
        .from(personNoteMeeting)
        .where(eq(personNoteMeeting.noteId, row.id)),
    ),
  );
  return {
    ...toSummary(row),
    accounts: {
      x: row.accountX,
      connpass: row.accountConnpass,
      github: row.accountGithub,
      linkedin: row.accountLinkedin,
      line: row.accountLine,
      url: row.accountUrl,
    },
    talk: row.talk,
    nextTopic: row.nextTopic,
    version: row.version,
    meetings,
  };
}

/**
 * 会った場の一覧（人数つき。日付の新しい順）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @returns 会った場の並び
 */
export function listMeetings(db: Executor, ownerAccountId: string): Promise<MeetingSummary[]> {
  return meetingSummaries(db, eq(personMeeting.ownerAccountId, ownerAccountId));
}

/**
 * 会った場を、なければ作り、あれば返す（そろえて同じ名前と日付の、手で書いた会った場。AD-31）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @param input 名前と日付
 * @param input.name 名前（前後の空白を除いたもの）
 * @param input.metOn 会った日
 * @returns 会った場の ID と、新しく作ったか
 * @throws {Error} 作れず、前のものも見つからないとき
 */
export async function findOrCreateMeeting(
  db: Executor,
  ownerAccountId: string,
  input: { name: string; metOn: string },
): Promise<{ id: string; created: boolean }> {
  const nameKey = normalizeMeetingName(input.name);
  const [inserted] = await db
    .insert(personMeeting)
    .values({ ownerAccountId, source: "manual", name: input.name, nameKey, metOn: input.metOn })
    .onConflictDoNothing({
      target: [personMeeting.ownerAccountId, personMeeting.nameKey, personMeeting.metOn],
      where: sql`${personMeeting.source} = 'manual'`,
    })
    .returning({ id: personMeeting.id });
  if (inserted) return { id: inserted.id, created: true };
  const [existing] = await db
    .select({ id: personMeeting.id })
    .from(personMeeting)
    .where(
      and(
        eq(personMeeting.ownerAccountId, ownerAccountId),
        eq(personMeeting.source, "manual"),
        eq(personMeeting.nameKey, nameKey),
        eq(personMeeting.metOn, input.metOn),
      ),
    );
  if (!existing) throw new Error("会った場を作れませんでした。");
  return { id: existing.id, created: false };
}

/**
 * 会った場を読む（そこで会った人の一覧つき。最後に保存した順）。
 * @param db DB
 * @param meeting 持ち主を確かめた会った場
 * @returns 会った場
 */
export async function meetingOf(db: Executor, meeting: OwnedMeeting): Promise<Meeting> {
  const [summary] = await meetingSummaries(db, eq(personMeeting.id, meeting.id));
  const notes = await db
    .select(summaryColumns)
    .from(personNote)
    .innerJoin(personNoteMeeting, eq(personNoteMeeting.noteId, personNote.id))
    .where(eq(personNoteMeeting.meetingId, meeting.id))
    .orderBy(desc(personNote.updatedAt), desc(personNote.id));
  return {
    ...(summary ?? { ...meeting, noteCount: 0 }),
    notes: notes.map(toSummary),
  };
}

/**
 * 会った場を消す（組も外部キーで消える。人は残る）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @param meetingId 会った場の ID
 * @returns 消したら true
 */
export async function deleteMeeting(
  db: Executor,
  ownerAccountId: string,
  meetingId: string,
): Promise<boolean> {
  const rows = await db
    .delete(personMeeting)
    .where(and(eq(personMeeting.id, meetingId), eq(personMeeting.ownerAccountId, ownerAccountId)))
    .returning({ id: personMeeting.id });
  return rows.length > 0;
}

/** 書き出しの1人（全部の欄と、付いている会った場の名前と日付）。 */
export type ExportRow = OwnedNote & {
  /** 付いている会った場（日付の古い順） */
  meetings: { name: string; metOn: string }[];
};

/**
 * 書き出す人（持ち主のすべての人。最後に保存した順）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @returns 書き出しの行
 */
export async function listExportRows(db: Executor, ownerAccountId: string): Promise<ExportRow[]> {
  const notes = await db
    .select()
    .from(personNote)
    .where(eq(personNote.ownerAccountId, ownerAccountId))
    .orderBy(desc(personNote.updatedAt), desc(personNote.id));
  const links = await db
    .select({
      noteId: personNoteMeeting.noteId,
      name: personMeeting.name,
      metOn: personMeeting.metOn,
    })
    .from(personNoteMeeting)
    .innerJoin(personMeeting, eq(personMeeting.id, personNoteMeeting.meetingId))
    .where(eq(personNoteMeeting.ownerAccountId, ownerAccountId))
    .orderBy(personMeeting.metOn, personMeeting.createdAt);
  const byNote = new Map<string, { name: string; metOn: string }[]>();
  for (const link of links) {
    const list = byNote.get(link.noteId) ?? [];
    list.push({ name: link.name, metOn: link.metOn });
    byNote.set(link.noteId, list);
  }
  return notes.map((note) => ({ ...note, meetings: byNote.get(note.id) ?? [] }));
}
