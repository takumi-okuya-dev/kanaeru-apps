// 読書記録の問い合わせ（TanStack Query）の鍵と読みこみ。鍵はどれも "reading" で始める。
import { useQuery } from "@tanstack/react-query";
import { fetchBook, fetchBooks } from "./api.ts";

/** 読書記録の問い合わせの鍵。 */
export const READING_QUERY_KEYS = {
  /** 読書記録のすべての問い合わせ（書いたら、まとめて読み直す） */
  all: ["reading"] as const,
  /** 本棚 */
  books: ["reading", "books"] as const,
  /**
   * 本。
   * @param bookId 本の ID
   * @returns 鍵
   */
  book: (bookId: string) => ["reading", "book", bookId] as const,
};

/**
 * 本棚を読む。
 * @returns 問い合わせ
 */
export function useBooks() {
  return useQuery({ queryKey: READING_QUERY_KEYS.books, queryFn: fetchBooks });
}

/**
 * 本を読む（コメントを直している間に上書きしないよう、窓に戻っても読み直さない）。
 * @param bookId 本の ID
 * @returns 問い合わせ
 */
export function useBook(bookId: string) {
  return useQuery({
    queryKey: READING_QUERY_KEYS.book(bookId),
    queryFn: () => fetchBook(bookId),
    refetchOnWindowFocus: false,
  });
}
