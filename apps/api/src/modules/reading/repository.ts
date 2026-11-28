// 読書記録の読み書き（specs/reading/001-bookshelf-import/data-model.md・research.md R3・R4）。窓口（routes.ts）だけが呼ぶ。
// マーカーの鍵は、受けた中身から markerKey で作り直す（画面の鍵を信じない）。取りこみは INSERT … ON CONFLICT で、
// 読書記録で直したコメント・付け外した ? の印・消したマーカーを上書きしない（R4）。本文（書名・マーカー・コメント）はログに渡さない。
import { READING_ERRORS, markerKey } from "@workspace/contracts/reading";
import type {
  Book,
  BookCreateInput,
  BookSummary,
  BookUpdateInput,
  Marker,
  MarkerImportItem,
  MarkerImportResult,
  MarkerUpdateInput,
  ReadingBookStatus,
  ReadingMarkerSource,
  ReadingSource,
} from "@workspace/contracts/reading";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { isDbUnavailable, isForeignKeyViolation } from "../../kernel/pg-errors.ts";
import type { OwnedBook, OwnedMarker } from "./access.ts";
import { readingBook, readingMarker } from "./schema.ts";

/** CHECK の違反の SQLSTATE。 */
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
 * 読書記録の DB の処理を流し、起こりうる DB のエラーを AppError に読みかえる。
 * - 外部キーの違反（確かめたあとに本が消された）は READING_NOT_FOUND
 * - CHECK の違反（約束と DB の上限の食い違い）は INVALID_INPUT
 * - ほかの DB のエラーは、SQLSTATE と制約の名前だけを持つ新しいエラーにする（drizzle のエラーは SQL に渡した値〈マーカーの文〉を
 *   文に含み、予期しないエラーのログに出てしまうため。PRD 5章）
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
    if (isForeignKeyViolation(error)) throw new AppError(READING_ERRORS.NOT_FOUND);
    const state = sqlStateOf(error);
    if (!state) throw error;
    if (state.code === CHECK_VIOLATION) throw new AppError("INVALID_INPUT");
    const safe = new Error(
      `読書記録の DB の命令が失敗しました（SQLSTATE ${state.code}・制約 ${state.constraint || "なし"}）。`,
    );
    safe.name = "ReadingDbError";
    throw safe;
  }
}

/**
 * 本の行を、本棚の1冊の形にする。
 * @param row 本の行
 * @param markerCount 消していないマーカーの数
 * @returns 本棚の1冊
 */
function toSummary(row: OwnedBook, markerCount: number): BookSummary {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    coverUrl: row.coverUrl,
    status: row.status as ReadingBookStatus,
    sources: row.sources as ReadingSource[],
    markerCount,
    lastImportedAt: row.lastImportedAt ? row.lastImportedAt.toISOString() : null,
  };
}

/**
 * 本棚（読んでいる本が上・最後に取りこんだ順・作った順。FR-007）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @returns 本棚の本
 */
export async function listBooks(db: Executor, ownerAccountId: string): Promise<BookSummary[]> {
  const rows = await db
    .select()
    .from(readingBook)
    .where(eq(readingBook.ownerAccountId, ownerAccountId))
    .orderBy(
      sql`case when ${readingBook.status} = 'reading' then 0 else 1 end`,
      sql`${readingBook.lastImportedAt} desc nulls last`,
      desc(readingBook.createdAt),
    );
  const counts = await db
    .select({ bookId: readingMarker.bookId, n: count() })
    .from(readingMarker)
    .where(and(eq(readingMarker.ownerAccountId, ownerAccountId), isNull(readingMarker.deletedAt)))
    .groupBy(readingMarker.bookId);
  const countOf = new Map(counts.map((row) => [row.bookId, row.n]));
  return rows.map((row) => toSummary(row, countOf.get(row.id) ?? 0));
}

/**
 * 本を足す。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @param input 本の欄
 * @returns 足した本の ID
 */
export async function insertBook(
  db: Executor,
  ownerAccountId: string,
  input: BookCreateInput,
): Promise<string> {
  const [row] = await db
    .insert(readingBook)
    .values({
      ownerAccountId,
      title: input.title,
      author: input.author ?? null,
      isbn: input.isbn ?? null,
      coverUrl: input.coverUrl ?? null,
      catalogSource: input.catalogSource,
      want: input.want ?? null,
      sources: input.sources ?? [],
    })
    .returning({ id: readingBook.id });
  if (!row) throw new Error("本を足せませんでした。");
  return row.id;
}

/**
 * マーカーの行を、返す形にする。
 * @param row マーカーの行
 * @returns マーカー
 */
function toMarker(row: OwnedMarker): Marker {
  return {
    id: row.id,
    source: row.source as ReadingMarkerSource,
    chapter: row.chapter,
    page: row.page,
    location: row.location,
    position: row.position,
    text: row.text,
    comment: row.comment,
    question: row.question,
  };
}

/**
 * 本を返す形にする（消していないマーカーを本の中の順に）。
 * @param db DB
 * @param book 持ち主を確かめた本
 * @returns 本
 */
export async function bookOf(db: Executor, book: OwnedBook): Promise<Book> {
  const markers = await db
    .select()
    .from(readingMarker)
    .where(and(eq(readingMarker.bookId, book.id), isNull(readingMarker.deletedAt)))
    .orderBy(asc(readingMarker.position), asc(readingMarker.createdAt));
  return {
    ...toSummary(book, markers.length),
    isbn: book.isbn,
    want: book.want,
    catalogSource: book.catalogSource,
    markers: markers.map(toMarker),
  };
}

/**
 * 本を直す（送った欄だけ）。
 * @param db DB
 * @param book 持ち主を確かめた本
 * @param input 直す欄
 */
export async function updateBook(
  db: Executor,
  book: OwnedBook,
  input: BookUpdateInput,
): Promise<void> {
  const values: Partial<typeof readingBook.$inferInsert> = {};
  if (input.title !== undefined) values.title = input.title;
  if (input.author !== undefined) values.author = input.author;
  if (input.want !== undefined) values.want = input.want;
  if (input.status !== undefined) values.status = input.status;
  if (input.sources !== undefined) values.sources = input.sources;
  if (Object.keys(values).length === 0) return;
  await db.update(readingBook).set(values).where(eq(readingBook.id, book.id));
}

/**
 * 本を消す（マーカーも CASCADE で消える）。
 * @param db DB
 * @param book 持ち主を確かめた本
 */
export async function deleteBook(db: Executor, book: OwnedBook): Promise<void> {
  await db.delete(readingBook).where(eq(readingBook.id, book.id));
}

/**
 * 本のマーカーの鍵の一覧（消したものも含む。research R7）。
 * @param db DB
 * @param book 持ち主を確かめた本
 * @returns 鍵
 */
export async function markerKeysOf(db: Executor, book: OwnedBook): Promise<string[]> {
  const rows = await db
    .select({ key: readingMarker.dedupeKey })
    .from(readingMarker)
    .where(eq(readingMarker.bookId, book.id));
  return rows.map((row) => row.key);
}

/**
 * 本の読む場所に、取りこんだ読む場所を足す（貼り付けは other）。
 * @param source どこから取りこんだか
 * @returns 本の読む場所
 */
function bookSourceOf(source: ReadingMarkerSource): ReadingSource {
  return source === "paste" ? "other" : source;
}

/**
 * マーカーの束を取りこむ（research R4）。
 * - 鍵の重なる行は、読書記録で直していなければコメントと ? の印を新しくし、章は空のときだけ埋める。
 * - 消したマーカーは変えない。束の中で同じ鍵が2つあれば、先のものだけを使う。
 * - 本の最後に取りこんだ時刻と、読む場所を新しくする。
 * @param db DB（トランザクション）
 * @param book 持ち主を確かめた本（行を押さえたもの）
 * @param source どこから取りこんだか
 * @param items 取りこむマーカー
 * @returns 入った・新しくなった・変わらなかった数
 */
export async function importMarkers(
  db: Executor,
  book: OwnedBook,
  source: ReadingMarkerSource,
  items: MarkerImportItem[],
): Promise<MarkerImportResult> {
  const byKey = new Map<string, typeof readingMarker.$inferInsert>();
  for (const item of items) {
    const key = await markerKey(item);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      bookId: book.id,
      ownerAccountId: book.ownerAccountId,
      source,
      chapter: item.chapter ?? null,
      page: item.page ?? null,
      location: item.location ?? null,
      position: item.position,
      text: item.text.trim(),
      comment: item.comment ?? null,
      question: item.question,
      dedupeKey: key,
    });
  }
  const rows = [...byKey.values()];
  const changed = await db
    .insert(readingMarker)
    .values(rows)
    .onConflictDoUpdate({
      target: [readingMarker.bookId, readingMarker.dedupeKey],
      set: {
        comment: sql`case when ${readingMarker.commentEdited} then ${readingMarker.comment} else excluded.comment end`,
        question: sql`case when ${readingMarker.questionEdited} then ${readingMarker.question} else excluded.question end`,
        chapter: sql`coalesce(${readingMarker.chapter}, excluded.chapter)`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${readingMarker.deletedAt} is null and (
        (not ${readingMarker.commentEdited} and ${readingMarker.comment} is distinct from excluded.comment)
        or (not ${readingMarker.questionEdited} and ${readingMarker.question} <> excluded.question)
        or (${readingMarker.chapter} is null and excluded.chapter is not null)
      )`,
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  const inserted = changed.filter((row) => row.inserted).length;
  const updated = changed.length - inserted;
  const nextSources = [...new Set([...(book.sources as ReadingSource[]), bookSourceOf(source)])];
  await db
    .update(readingBook)
    .set({ lastImportedAt: sql`now()`, sources: nextSources })
    .where(eq(readingBook.id, book.id));
  return { inserted, updated, unchanged: items.length - inserted - updated };
}

/**
 * マーカーを直す（コメントを変えたら comment_edited、印を変えたら question_edited を立てる。R4）。
 * @param db DB
 * @param marker 持ち主を確かめたマーカー
 * @param input 直す欄
 * @returns 直したマーカー
 */
export async function updateMarker(
  db: Executor,
  marker: OwnedMarker,
  input: MarkerUpdateInput,
): Promise<Marker> {
  const values: Partial<typeof readingMarker.$inferInsert> = {};
  if (input.comment !== undefined) {
    if (input.comment === null && marker.text === "") throw new AppError("INVALID_INPUT");
    values.comment = input.comment;
    values.commentEdited = true;
  }
  if (input.question !== undefined) {
    values.question = input.question;
    values.questionEdited = true;
  }
  if (input.chapter !== undefined) values.chapter = input.chapter;
  if (Object.keys(values).length === 0) return toMarker(marker);
  const [row] = await db
    .update(readingMarker)
    .set(values)
    .where(eq(readingMarker.id, marker.id))
    .returning();
  if (!row) throw new AppError(READING_ERRORS.NOT_FOUND);
  return toMarker(row);
}

/**
 * マーカーを消す（行を残して deleted_at を入れる。取りこみ直しで戻さない。R4）。
 * @param db DB
 * @param marker 持ち主を確かめたマーカー
 */
export async function deleteMarker(db: Executor, marker: OwnedMarker): Promise<void> {
  await db
    .update(readingMarker)
    .set({ deletedAt: sql`now()` })
    .where(eq(readingMarker.id, marker.id));
}

/**
 * 本をまとめる（data-model「本をまとめる」）。元のマーカーを（消したものも含めて）まとめ先に写し、同じ鍵のものは写さない。
 * 元の本を消し（CASCADE で元のマーカーも消える）、まとめ先の読む場所に元の読む場所を足す。
 * @param db DB（トランザクション）
 * @param from まとめる元（行を押さえたもの）
 * @param into まとめ先（行を押さえたもの）
 * @returns 写した数と、同じマーカーがあって写さなかった数（どちらも消していないものだけ数える）
 */
export async function mergeBooks(
  db: Executor,
  from: OwnedBook,
  into: OwnedBook,
): Promise<{ movedCount: number; duplicateCount: number }> {
  const [live] = await db
    .select({ n: count() })
    .from(readingMarker)
    .where(and(eq(readingMarker.bookId, from.id), isNull(readingMarker.deletedAt)));
  const moved = await db.execute<{ deleted_at: Date | null }>(sql`
    insert into ${readingMarker} (
      book_id, owner_account_id, source, chapter, page, location, position, text, comment,
      comment_edited, question, question_edited, dedupe_key, deleted_at, created_at
    )
    select ${into.id}, owner_account_id, source, chapter, page, location, position, text, comment,
      comment_edited, question, question_edited, dedupe_key, deleted_at, created_at
    from ${readingMarker}
    where book_id = ${from.id}
    on conflict (book_id, dedupe_key) do nothing
    returning deleted_at
  `);
  const movedCount = moved.rows.filter((row) => row.deleted_at === null).length;
  await db.delete(readingBook).where(eq(readingBook.id, from.id));
  const nextSources = [
    ...new Set([...(into.sources as ReadingSource[]), ...(from.sources as ReadingSource[])]),
  ];
  await db.update(readingBook).set({ sources: nextSources }).where(eq(readingBook.id, into.id));
  return { movedCount, duplicateCount: (live?.n ?? 0) - movedCount };
}
