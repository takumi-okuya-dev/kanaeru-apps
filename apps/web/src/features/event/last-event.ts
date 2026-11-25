// 直前に開いた交流会の記録（core-022）。外枠のナビは、交流会の外（一覧など）でも、参加者・合計／困りごと／準備を出し、
// 押すとこの記録の交流会へ進む。端末の localStorage に置く（ナビのために問い合わせを始めない）。
// 共有の端末で前の人の交流会へ進む項目を出さないよう、今の利用者が替わったら消す（試合表の写しの片付けと同じ形。
// 知らせは画面を開くたびに同じ人で届くので、写しを置いた人〈owner〉を比べて、違うときだけ消す）。
import { EVENT_ROLES } from "@workspace/contracts/event";
import type { EventRole } from "@workspace/contracts/event";
import { onAccountChange } from "../../lib/account-events.ts";

/** 直前に開いた交流会を置く localStorage の鍵。 */
export const LAST_EVENT_KEY = "kanaeru.event.last";

/** 記録を置いた人の ID を置く localStorage の鍵。 */
export const LAST_EVENT_OWNER_KEY = "kanaeru.event.owner";

/** 直前に開いた交流会。 */
export type LastEvent = {
  /** 交流会の ID */
  eventId: string;
  /** そのときの今の利用者の役目（外のナビで、今と同じ規則で項目を出すため） */
  role: EventRole;
};

/**
 * 値が役目か。
 * @param value 確かめる値
 * @returns 役目なら true
 */
function isRole(value: unknown): value is EventRole {
  return EVENT_ROLES.some((role) => role === value);
}

/**
 * 直前に開いた交流会を読む（壊れた値・知らない役目は、記録がないものとして扱う）。
 * @returns 記録（なければ undefined）
 */
export function readLastEvent(): LastEvent | undefined {
  try {
    const raw = window.localStorage.getItem(LAST_EVENT_KEY);
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return undefined;
    const { eventId, role } = value as { eventId?: unknown; role?: unknown };
    if (typeof eventId !== "string" || eventId.length === 0 || !isRole(role)) return undefined;
    return { eventId, role };
  } catch {
    return undefined;
  }
}

/**
 * 直前に開いた交流会を書く（書けなければ、記録がないのと同じ）。
 * @param last 記録
 */
export function writeLastEvent(last: LastEvent): void {
  try {
    window.localStorage.setItem(LAST_EVENT_KEY, JSON.stringify(last));
  } catch {
    // localStorage が使えない（プライベートの画面など）なら、置かない
  }
}

/**
 * 今の利用者に合わせて、記録を片付ける。ログアウト・退会（null）と、記録を置いた人と違う人のログインでは消す。
 * 記録を置いた人がわからないとき（この仕組みの前・持ち主を書けなかった）も、違う人かもしれないので消す。
 * @param accountId 今の利用者の ID（ログアウト・退会は null）
 */
export function resetLastEventForAccount(accountId: string | null): void {
  try {
    const owner = window.localStorage.getItem(LAST_EVENT_OWNER_KEY);
    if (accountId === null || owner !== accountId) window.localStorage.removeItem(LAST_EVENT_KEY);
    if (accountId === null) window.localStorage.removeItem(LAST_EVENT_OWNER_KEY);
    else window.localStorage.setItem(LAST_EVENT_OWNER_KEY, accountId);
  } catch {
    // 使えなければ、記録も置けていない
  }
}

/**
 * 今の利用者が替わったときの片付けを足す（交流会の領域の入口が1度だけ呼ぶ）。
 * @returns 外す関数
 */
export function registerLastEventReset(): () => void {
  return onAccountChange(resetLastEventForAccount);
}
