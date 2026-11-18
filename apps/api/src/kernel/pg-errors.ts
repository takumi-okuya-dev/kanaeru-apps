// PostgreSQL の違反の見分け（領域の読み書きが使う）。

/** PostgreSQL の一意の制約の違反の code。 */
const UNIQUE_VIOLATION = "23505";

/**
 * 一意の制約の違反か（drizzle が包んだ違反は cause に入る）。
 * @param error 投げられたもの
 * @returns 違反なら true
 */
export function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (
    (error as { code?: string } | null)?.code === UNIQUE_VIOLATION ||
    cause?.code === UNIQUE_VIOLATION
  );
}
