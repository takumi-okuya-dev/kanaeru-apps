// 定期の仕事（Cloud Scheduler）からの要求の確かめ。見出し Authorization: Bearer <JOB_TRIGGER_SECRET> を、時間の差が出ない比べ方で比べる。
// 合言葉の値は領域に渡さず、確かめる関数だけを渡す（kernel/http.ts の DomainRouteDeps.isJobRequest）。
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 値の SHA-256（長さをそろえて比べるため）。
 * @param value 値
 * @returns ハッシュ
 */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * 定期の仕事からの要求かを確かめる関数を作る。
 * @param secret 合言葉（JOB_TRIGGER_SECRET。なければ、いつも false を返す関数）
 * @returns Authorization の見出しを受け取り、合言葉が合えば true を返す関数
 */
export function createJobRequestCheck(
  secret: string | undefined,
): (authorization: string | undefined) => boolean {
  if (!secret) return () => false;
  const expected = digest(`Bearer ${secret}`);
  return (authorization) =>
    authorization !== undefined && timingSafeEqual(digest(authorization), expected);
}
