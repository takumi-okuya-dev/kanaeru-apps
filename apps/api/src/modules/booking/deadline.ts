// 打診の返事の期限（booking-004 research R6・PRD FR-B65・FR-B67）。日本時間は UTC+9 の固定（夏時間なし）で計算し、
// サーバーの時刻帯に頼らない。DB が0時〜8時に止まり、定期の仕事が9時から動く（AD-10・AD-24）ので、期限を夜に置かない。
// 1. 打診から24時間 2. 日本時間の0時より後・9時より前（0時ちょうど・9時ちょうどは含まない）ならその朝の9時
// 3. 始まりの2時間前より後なら始まりの2時間前 4. 3 の結果が夜（同じ範囲）ならその日の0時（前の夜の24時）
// 5. 打診から1時間に足りなければ打診しない（null。当日の空き。ちょうど1時間は打診する）。
import {
  OFFER_MIN_HOURS,
  OFFER_MORNING_HOUR,
  OFFER_START_MARGIN_HOURS,
  OFFER_TTL_HOURS,
} from "@workspace/contracts/booking";

/** 1時間・1日（ミリ秒）。 */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 日本時間の時差（ミリ秒）。 */
const JST_OFFSET_MS = 9 * HOUR_MS;

/**
 * 日本時間のその日の0時（ミリ秒）と、0時からの経過（ミリ秒）。
 * @param instant 時刻（ミリ秒）
 * @returns その日の0時と経過
 */
function jstDay(instant: number): { start: number; elapsed: number } {
  const elapsed = (((instant + JST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return { start: instant - elapsed, elapsed };
}

/**
 * 夜（日本時間の0時より後・9時より前）か。
 * @param instant 時刻（ミリ秒）
 * @returns 夜なら true
 */
function isNight(instant: number): boolean {
  const { elapsed } = jstDay(instant);
  return elapsed > 0 && elapsed < OFFER_MORNING_HOUR * HOUR_MS;
}

/**
 * 打診の返事の期限を決める。
 * @param now 打診する時刻
 * @param startsAt 交流会の始まり
 * @returns 期限（1時間取れなければ null）
 */
export function offerDeadline(now: Date, startsAt: Date): Date | null {
  const offeredAt = now.getTime();
  let deadline = offeredAt + OFFER_TTL_HOURS * HOUR_MS;
  if (isNight(deadline)) deadline = jstDay(deadline).start + OFFER_MORNING_HOUR * HOUR_MS;
  const latest = startsAt.getTime() - OFFER_START_MARGIN_HOURS * HOUR_MS;
  if (deadline > latest) {
    deadline = latest;
    if (isNight(deadline)) deadline = jstDay(deadline).start;
  }
  if (deadline - offeredAt < OFFER_MIN_HOURS * HOUR_MS) return null;
  return new Date(deadline);
}

/**
 * 当日の空きの時間か（始まりの前で、打診の期限が1時間取れない。research R7）。
 * @param now 今の時刻
 * @param startsAt 交流会の始まり
 * @returns 当日の空きの時間なら true
 */
export function isSameDayWindow(now: Date, startsAt: Date): boolean {
  return now.getTime() < startsAt.getTime() && offerDeadline(now, startsAt) === null;
}
