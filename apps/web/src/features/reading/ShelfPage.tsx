// 本棚の画面（/reading。US1・US6・FR-007。見本の1）。読んでいる本を上に、最後に取りこんだ順。読み終えた本・やめた本は閉じておく。
// 主の操作は「取りこむ」（まとまりの終わりの ButtonRow。DESIGN.md のボタンの並べ方）。探す欄は reading-002 で足す。
import { READING_SOURCE_LABELS } from "@workspace/contracts/reading";
import type { BookSummary } from "@workspace/contracts/reading";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ButtonRow } from "@workspace/ui/components/button-row";
import { Disclosure } from "@workspace/ui/components/disclosure";
import { Page } from "../../lib/page.tsx";
import { SessionGate } from "../account/index.ts";
import { Cover } from "./Cover.tsx";
import { useBooks } from "./queries.ts";
import { LoadError, Loading } from "./states.tsx";

/**
 * 本棚の1冊の1行。
 * @param props 本（book）
 * @param props.book 本
 * @returns 行の要素
 */
function BookRow({ book }: { book: BookSummary }) {
  const titleId = `reading-book-${book.id}`;
  const sources = book.sources.map((source) => READING_SOURCE_LABELS[source]).join("・");
  return (
    <li
      aria-labelledby={titleId}
      className="flex items-center gap-xs border-t border-border p-xs first:border-t-0"
    >
      <Cover title={book.title} coverUrl={book.coverUrl} />
      <div className="flex min-w-0 flex-col gap-x3s">
        <Link
          id={titleId}
          to="/reading/books/$bookId"
          params={{ bookId: book.id }}
          className="text-m font-bold break-words text-text-link underline"
        >
          {book.title}
        </Link>
        <span className="text-s text-text-sub">
          {sources ? `${sources}・` : ""}マーカー {book.markerCount}
        </span>
      </div>
    </li>
  );
}

/**
 * 本の一覧（白い面のまとまり）。
 * @param props 本の並び（books）
 * @param props.books 本の並び
 * @returns 一覧の要素
 */
function BookItems({ books }: { books: readonly BookSummary[] }) {
  return (
    <ul className="flex flex-col rounded-md border border-border bg-surface">
      {books.map((book) => (
        <BookRow key={book.id} book={book} />
      ))}
    </ul>
  );
}

/**
 * 本棚の中身（ログインしているとき）。
 * @returns 画面の要素
 */
function Shelf() {
  const query = useBooks();
  const books = query.data?.items ?? [];
  const reading = books.filter((book) => book.status === "reading");
  const finished = books.filter((book) => book.status === "finished");
  const dropped = books.filter((book) => book.status === "dropped");
  return (
    <Page title="本棚">
      {query.isPending ? <Loading /> : null}
      {query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isSuccess ? (
        <section aria-labelledby="reading-now" className="flex flex-col gap-xxs">
          <h2 id="reading-now" className="text-m font-bold">
            読んでいる本（{reading.length}冊）
          </h2>
          {reading.length === 0 ? (
            <p className="text-m text-text-sub">
              {books.length === 0
                ? "まだ本がありません。GoodNotes で書き出した PDF を取りこむか、本を足してください。"
                : "読んでいる本はありません。"}
            </p>
          ) : (
            <BookItems books={reading} />
          )}
          {finished.length > 0 ? (
            <Disclosure summary={`読み終えた本（${finished.length}冊）`}>
              <BookItems books={finished} />
            </Disclosure>
          ) : null}
          {dropped.length > 0 ? (
            <Disclosure summary={`やめた本（${dropped.length}冊）`}>
              <BookItems books={dropped} />
            </Disclosure>
          ) : null}
        </section>
      ) : null}
      <ButtonRow>
        <Link to="/reading/books/new" className={buttonVariants({ variant: "secondary" })}>
          本を足す
        </Link>
        <Link to="/reading/import" className={buttonVariants({ variant: "primary" })}>
          取りこむ
        </Link>
      </ButtonRow>
    </Page>
  );
}

/**
 * 本棚の画面。
 * @returns 画面の要素
 */
export function ShelfPage() {
  return (
    <SessionGate>
      <Shelf />
    </SessionGate>
  );
}
