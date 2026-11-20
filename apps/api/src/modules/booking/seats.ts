// 席の数え方（booking-004 research R2・R3・R4・data-model）。読む窓口と書く処理で同じ関数を使う（DB を読まない純粋な関数）。
// 埋まった席＝確定＋打診中（期限を過ぎた打診中は数えない）。自前の残り＝定員 − 埋まった席 − 枠のまだ埋まっていない席
// （一度満員になったら枠を押さえない）。キャンセル待ちの並びは申し込んだ日時の古い順・同じ時刻は ID の順。
import type { EntryStatus, QuotaSource, SeatSummary } from "@workspace/contracts/booking";
import { QUOTA_SOURCES } from "@workspace/contracts/booking";
import type { ApplicationSource } from "@workspace/contracts/reception";

/** 席を数える申込み（読むのは状態・媒体・申し込んだ日時・待っている打診の期限だけ）。 */
export type SeatEntry = {
  id: string;
  status: EntryStatus;
  applicationSource: ApplicationSource;
  appliedAt: Date;
  /** 待っている打診の期限（打診中のとき） */
  offerDeadline: Date | null;
};

/** 媒体の枠。 */
export type QuotaRow = { applicationSource: QuotaSource; seats: number; manageUrl: string | null };

/** 席の設定。 */
export type SeatConfig = {
  /** 定員（空＝定員なし） */
  capacity: number | null;
  quotas: readonly QuotaRow[];
  /** 枠を押さえるのをやめたか */
  quotasReleased: boolean;
};

/** 数えた結果。 */
export type SeatCount = {
  capacity: number | null;
  filled: number;
  confirmed: number;
  offered: number;
  /** 自前の残り（定員なしは Infinity。負もありうる） */
  selfRemaining: number;
  /** キャンセル待ちの並び（ID） */
  waitlist: string[];
  full: boolean;
  over: number;
  quotas: SeatSummary["quotas"];
  stopSources: SeatSummary["stopSources"];
};

/**
 * 打診中で、期限がまだ来ていないか（席を押さえているか）。
 * @param entry 申込み
 * @param now 今の時刻
 * @returns 押さえていれば true
 */
export function isLiveOffer(entry: SeatEntry, now: Date): boolean {
  return (
    entry.status === "offered" &&
    entry.offerDeadline !== null &&
    entry.offerDeadline.getTime() > now.getTime()
  );
}

/**
 * キャンセル待ちの並び（申し込んだ日時の古い順・同じ時刻は ID の順）。
 * @param entries 申込み
 * @returns 並んだ申込み
 */
export function waitlistOf<T extends Pick<SeatEntry, "id" | "status" | "appliedAt">>(
  entries: readonly T[],
): T[] {
  return entries
    .filter((entry) => entry.status === "waitlisted")
    .sort(
      (a, b) =>
        a.appliedAt.getTime() - b.appliedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * 席を数える。
 * @param config 定員と枠
 * @param entries 交流会の申込み（取り消しを含んでよい）
 * @param now 今の時刻
 * @returns 数えた結果
 */
export function countSeats(
  config: SeatConfig,
  entries: readonly SeatEntry[],
  now: Date,
): SeatCount {
  const holding = entries.filter(
    (entry) => entry.status === "confirmed" || isLiveOffer(entry, now),
  );
  const confirmed = holding.filter((entry) => entry.status === "confirmed").length;
  const filled = holding.length;
  const quotas = config.quotas.map((quota) => {
    const used = holding.filter(
      (entry) => entry.applicationSource === quota.applicationSource,
    ).length;
    return {
      applicationSource: quota.applicationSource,
      seats: quota.seats,
      filled: used,
      remaining: Math.max(quota.seats - used, 0),
      manageUrl: quota.manageUrl,
    };
  });
  const unfilled = config.quotasReleased
    ? 0
    : quotas.reduce((sum, quota) => sum + quota.remaining, 0);
  const { capacity } = config;
  const full = capacity !== null && filled >= capacity;
  const active = new Set(
    entries.filter((entry) => entry.status !== "cancelled").map((entry) => entry.applicationSource),
  );
  const stopSources = full
    ? QUOTA_SOURCES.filter(
        (source) =>
          active.has(source) || config.quotas.some((quota) => quota.applicationSource === source),
      ).map((source) => ({
        applicationSource: source,
        manageUrl:
          config.quotas.find((quota) => quota.applicationSource === source)?.manageUrl ?? null,
      }))
    : [];
  return {
    capacity,
    filled,
    confirmed,
    offered: filled - confirmed,
    selfRemaining: capacity === null ? Number.POSITIVE_INFINITY : capacity - filled - unfilled,
    waitlist: waitlistOf(entries).map((entry) => entry.id),
    full,
    over: capacity === null ? 0 : Math.max(filled - capacity, 0),
    quotas,
    stopSources,
  };
}

/**
 * 新しい申込み（か、キャンセル待ちからの当日の空きの「参加する」）を確定にできるか。
 * @param count 数えた結果
 * @param sameDay 当日の空きの時間か（打診の期限が1時間取れない）
 * @returns 確定にできれば true（ほかはキャンセル待ち）
 */
export function canConfirmNew(count: SeatCount, sameDay: boolean): boolean {
  return count.selfRemaining >= 1 && (count.waitlist.length === 0 || sameDay);
}

/**
 * キャンセル待ちの何番目か（1から。並んでいなければ null）。
 * @param count 数えた結果
 * @param entryId 申込みの ID
 * @returns 何番目か
 */
export function waitlistPosition(count: SeatCount, entryId: string): number | null {
  const index = count.waitlist.indexOf(entryId);
  return index === -1 ? null : index + 1;
}

/**
 * 主催者に見せる席の内訳（定員があるとき）。
 * @param count 数えた結果
 * @param quotasReleased 枠を押さえるのをやめたか
 * @param sameDay 当日の空きの時間か
 * @returns 内訳（定員がなければ null）
 */
export function toSeatSummary(
  count: SeatCount,
  quotasReleased: boolean,
  sameDay: boolean,
): SeatSummary | null {
  if (count.capacity === null) return null;
  const selfRemaining = Math.max(count.selfRemaining, 0);
  return {
    capacity: count.capacity,
    filled: count.filled,
    confirmed: count.confirmed,
    offered: count.offered,
    waitlisted: count.waitlist.length,
    selfRemaining,
    over: count.over,
    full: count.full,
    quotasReleased,
    sameDay: sameDay && selfRemaining > 0,
    quotas: count.quotas,
    stopSources: count.stopSources,
  };
}
