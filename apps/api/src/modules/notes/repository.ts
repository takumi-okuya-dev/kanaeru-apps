// メモの読み書き。DB の行を、窓口の答えの形（日時は ISO 8601 の文字）にして返す。
// 同じ題があれば NOTE_TITLE_TAKEN（題の欄の理由つき）を投げる（一意の索引の違反を読みかえる）。
import { NOTES_ERRORS } from "@workspace/contracts/notes";
import type { Note, NoteInput } from "@workspace/contracts/notes";
import { desc, eq } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { isUniqueViolation } from "../../kernel/pg-errors.ts";
import { note } from "./schema.ts";

/** 読み出す列。 */
const columns = {
  id: note.id,
  title: note.title,
  body: note.body,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
};

/**
 * DB の行を、窓口の答えの形にする。
 * @param row DB の行
 * @returns メモ
 */
function present(row: {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 同じ題の違反を、題の欄の理由つきのエラーに読みかえる。
 * @param error 投げられたもの
 * @returns 読みかえたエラー（同じ題の違反でなければ、そのまま）
 */
function translate(error: unknown): unknown {
  if (!isUniqueViolation(error)) return error;
  const spec = NOTES_ERRORS.NOTE_TITLE_TAKEN;
  return new AppError(spec, { fields: [{ path: "title", message: spec.message }] });
}

/**
 * メモの一覧（新しく直した順）。
 * @param db DB
 * @returns メモの一覧
 */
export async function listNotes(db: Executor): Promise<Note[]> {
  const rows = await db.select(columns).from(note).orderBy(desc(note.updatedAt), desc(note.id));
  return rows.map(present);
}

/**
 * メモを1つ読む。
 * @param db DB
 * @param id メモの ID（uuid の形を確かめたもの）
 * @returns メモ。なければ null
 */
export async function findNote(db: Executor, id: string): Promise<Note | null> {
  const [row] = await db.select(columns).from(note).where(eq(note.id, id)).limit(1);
  return row ? present(row) : null;
}

/**
 * メモを作る。
 * @param db DB
 * @param input 確かめた入力
 * @returns 作ったメモ
 * @throws {AppError} 同じ題のメモがあるとき（NOTE_TITLE_TAKEN）
 */
export async function createNote(db: Executor, input: NoteInput): Promise<Note> {
  try {
    const [row] = await db.insert(note).values(input).returning(columns);
    if (!row) throw new Error("作ったメモが返りませんでした。");
    return present(row);
  } catch (error) {
    throw translate(error);
  }
}

/**
 * メモを直す（題と本文をまるごと置きかえる）。
 * @param db DB
 * @param id メモの ID（uuid の形を確かめたもの）
 * @param input 確かめた入力
 * @returns 直したメモ。なければ null
 * @throws {AppError} 同じ題のほかのメモがあるとき（NOTE_TITLE_TAKEN）
 */
export async function updateNote(db: Executor, id: string, input: NoteInput): Promise<Note | null> {
  try {
    const [row] = await db.update(note).set(input).where(eq(note.id, id)).returning(columns);
    return row ? present(row) : null;
  } catch (error) {
    throw translate(error);
  }
}

/**
 * メモを消す。
 * @param db DB
 * @param id メモの ID（uuid の形を確かめたもの）
 * @returns 消したら true、なければ false
 */
export async function deleteNote(db: Executor, id: string): Promise<boolean> {
  const rows = await db.delete(note).where(eq(note.id, id)).returning({ id: note.id });
  return rows.length > 0;
}
