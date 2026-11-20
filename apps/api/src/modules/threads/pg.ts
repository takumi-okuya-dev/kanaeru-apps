// threads の中で使う PostgreSQL のエラーの見分け（土台の kernel/pg-errors.ts にない外部キーの違反だけ。共通を直さないため領域に置く）。

/** PostgreSQL の外部キーの違反の code。 */
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * 外部キーの違反か（drizzle が包んだ違反は cause に入る）。途中で親の記録が消されたときに起きる。
 * @param error 投げられたもの
 * @returns 違反なら true
 */
export function isForeignKeyViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (
    (error as { code?: string } | null)?.code === FOREIGN_KEY_VIOLATION ||
    cause?.code === FOREIGN_KEY_VIOLATION
  );
}
