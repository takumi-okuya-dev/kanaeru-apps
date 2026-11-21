// 定員・キャンセル待ち・期限つきの繰り上げ・変更と中止の業務（booking-004。PRD FR-B60〜B68・FR-B80・research R2〜R15）。
// 片付け（settleEvent）は、交流会の設定の行を FOR UPDATE で押さえたトランザクションの中で、期限切れ → 打診 → 当日の空きを
// 押さえたあとに読み直した行から決める（申込み・返事・取り消し・主催者の操作・定期の仕事のどれも同じ関数。二重の打診と
// 定員超えを止める。research R5・S2）。知らせは、そのトランザクションが変えた行の分だけ、確定のあとに送る（flushNotices）。
// 交流会の日時・場所は event の getEventSummary から引き、event を直さない（変更は「最後に知らせた日時と場所」と比べる。R10）。
// 名前・メールアドレス・札はログに出さない。
import type {
  BookingSetting,
  CapacityInput,
  EntryStanding,
  NoticeLog,
  PageSeats,
  ScheduleChange,
  WaitlistJobSummary,
} from "@workspace/contracts/booking";
import {
  BOOKING_ERRORS,
  CHANGE_NOTICE_DELAY_MINUTES,
  NOTICE_LOG_MAX,
  usesRoster,
} from "@workspace/contracts/booking";
import { jstDate } from "@workspace/contracts/core";
import type { EventSummary } from "@workspace/contracts/event";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { getEventSummary } from "../event/index.ts";
import { isSameDayWindow, offerDeadline } from "./deadline.ts";
import { eventNotifyHolder, sendNotice } from "./notify.ts";
import type { SendNoticeInput } from "./notify.ts";
import { holderNameOf } from "./notify-settings.ts";
import type { NotifyDeps } from "./notify-settings.ts";
import { applyUrl, calendarLinks, entryTokenUrl, myBookingsUrl } from "./page-links.ts";
import {
  canConfirmNew,
  countSeats,
  isLiveOffer,
  toSeatSummary,
  waitlistPosition,
} from "./seats.ts";
import type { SeatConfig, SeatCount } from "./seats.ts";
import { createToken, hashToken } from "./tokens.ts";
import {
  cancelActiveEntries,
  closePendingOffer,
  createOffer,
  expireDueOffers,
  findLatestOfferStatus,
  findWaitlistSetting,
  listActiveEntries,
  listJobEventIds,
  listNoticesOf,
  listQuotas,
  listSeatEntries,
  replaceCapacity,
  setEntryStatus,
  updateWaitlistSetting,
  withdrawOffersOfEvent,
} from "./waitlist-repository.ts";
import type { SeatEntryRow, WaitlistSetting } from "./waitlist-repository.ts";

/** 定員とキャンセル待ちの処理に使う道具（知らせと同じ）。 */
export type WaitlistDeps = NotifyDeps;

/** 確定のあとに送る知らせ。 */
export type NoticeQueue = SendNoticeInput[];

/** 1分・1日（ミリ秒）。 */
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** 交流会と主催の名前。 */
export type EventContext = { event: EventSummary; hostName: string };

/**
 * 交流会の要約と主催の名前を引く。
 * @param deps 道具
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 交流会と主催（ないときは null）
 */
export async function eventContext(
  deps: Pick<WaitlistDeps, "config">,
  db: Executor,
  eventId: string,
): Promise<EventContext | null> {
  const event = await getEventSummary(db, deps.config, eventId);
  if (!event) return null;
  const holder = await eventNotifyHolder(db, eventId);
  return { event, hostName: holder ? await holderNameOf(db, holder) : "" };
}

/**
 * 知らせを送る（送れなくても処理は成り立つ。例外はログに出す。booking-003 R12）。
 * @param deps 道具
 * @param queue 知らせ
 */
export async function flushNotices(deps: WaitlistDeps, queue: NoticeQueue): Promise<void> {
  for (const notice of queue) {
    try {
      await sendNotice(deps, notice);
    } catch (error) {
      deps.logger.warn(
        {
          entryId: notice.entryId,
          kind: notice.kind,
          errorName: error instanceof Error ? error.name : "unknown",
        },
        "予約の知らせを送れませんでした",
      );
    }
  }
}

/** 席の状態（設定・申込み・数えた結果）。 */
export type SeatState = {
  setting: WaitlistSetting | null;
  config: SeatConfig;
  entries: SeatEntryRow[];
  count: SeatCount;
};

/**
 * 席の状態を読む（書かない）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param now 今の時刻
 * @param setting 読んだ設定（なければ読む）
 * @returns 席の状態
 */
export async function loadSeatState(
  db: Executor,
  eventId: string,
  now: Date,
  setting?: WaitlistSetting | null,
): Promise<SeatState> {
  const current = setting === undefined ? await findWaitlistSetting(db, eventId) : setting;
  const config: SeatConfig = {
    capacity: current?.capacity ?? null,
    quotas: await listQuotas(db, eventId),
    quotasReleased: current?.quotaReleasedAt != null,
  };
  const entries = await listSeatEntries(db, eventId);
  return { setting: current, config, entries, count: countSeats(config, entries, now) };
}

/**
 * キャンセル待ち・打診を使う交流会か（自前で申込みを受ける・定員がある）。
 * @param setting 設定
 * @returns 使うなら true
 */
function usesWaitlist(setting: WaitlistSetting | null): setting is WaitlistSetting {
  return setting?.mode === "self_page" && setting.capacity !== null;
}

/**
 * 確定の知らせのリンク。
 * @param deps 道具
 * @param context 交流会と主催
 * @param entry 申込み（アカウントがあれば申込みページ）
 * @param entryLink メールの人の札のページ（手にあるとき）
 * @returns リンク
 */
function confirmedLinks(
  deps: WaitlistDeps,
  context: EventContext,
  entry: { accountId: string | null },
  entryLink: string | null,
): SendNoticeInput["links"] {
  const calendar = calendarLinks(deps, context.event, context.hostName).googleUrl;
  const entryUrl = entry.accountId ? applyUrl(deps, context.event.id) : entryLink;
  return entryUrl ? { entry: entryUrl, calendar } : { calendar };
}

/**
 * キャンセル待ちの先頭に打診する（打診の行と申込みの状態を書き、打診の知らせを積む）。
 * @param deps 道具
 * @param tx トランザクション
 * @param eventId 交流会の ID
 * @param entry 申込み
 * @param deadline 期限
 * @param offeredBy 手で打診した主催者（自動は null）
 * @param queue 知らせ
 */
async function offerTo(
  deps: WaitlistDeps,
  tx: Executor,
  eventId: string,
  entry: SeatEntryRow,
  deadline: Date,
  offeredBy: string | null,
  queue: NoticeQueue,
): Promise<void> {
  // メールの人は打診ごとの返事の札（申込みの札の平文は手にないため。research R8）
  const token = entry.emailOnly ? createToken() : null;
  await createOffer(tx, {
    eventId,
    entryId: entry.id,
    deadline,
    tokenHash: token ? hashToken(token) : null,
    offeredBy,
  });
  const respond = token
    ? entryTokenUrl(deps, eventId, token)
    : entry.accountId
      ? myBookingsUrl(deps)
      : null;
  queue.push({
    entryId: entry.id,
    kind: "offered",
    deadline,
    ...(respond ? { links: { respond } } : {}),
  });
}

/**
 * 自動で打診・当日の空きを知らせる相手か（アカウントかメールがある。手で足したキャンセル待ちなど連絡先のない行は、
 * 主催者の手の打診だけにする。research R14）。
 * @param entry 申込み
 * @returns 連絡先があれば true
 */
export function hasContact(entry: Pick<SeatEntryRow, "accountId" | "emailOnly">): boolean {
  return entry.accountId !== null || entry.emailOnly;
}

/** 片付けの数。 */
export type SettleResult = { expired: string[]; offered: number; sameDay: number };

/**
 * 片付け：一度満員なら枠を押さえるのをやめる → 期限切れ → 空いた席の分だけキャンセル待ちの先頭に打診 → 当日の空きを知らせる。
 * 設定の行を押さえ、押さえたあとに読み直した行から決める（同時に走っても二重にならない）。自前で定員がなければ何もしない。
 * @param deps 道具
 * @param tx トランザクション
 * @param eventId 交流会の ID
 * @param startsAt 交流会の始まり
 * @param now 今の時刻
 * @param queue 知らせ（確定のあとに送る）
 * @returns 期限切れにした申込みと、打診・当日の空きの数
 */
export async function settleEvent(
  deps: WaitlistDeps,
  tx: Executor,
  eventId: string,
  startsAt: Date,
  now: Date,
  queue: NoticeQueue,
): Promise<SettleResult> {
  const result: SettleResult = { expired: [], offered: 0, sameDay: 0 };
  const setting = await findWaitlistSetting(tx, eventId, true);
  if (setting?.mode !== "self_page") return result;
  let state = await loadSeatState(tx, eventId, now, setting);
  if (!state.config.quotasReleased && state.count.full) {
    await updateWaitlistSetting(tx, eventId, { quotaReleasedAt: now });
    state = { ...state, config: { ...state.config, quotasReleased: true } };
  }
  result.expired = await expireDueOffers(tx, eventId, now);
  for (const entryId of result.expired) queue.push({ entryId, kind: "offer_expired" });
  if (setting.cancelledAt || now.getTime() >= startsAt.getTime()) return result;
  state = await loadSeatState(tx, eventId, now, {
    ...setting,
    quotaReleasedAt: state.config.quotasReleased ? (setting.quotaReleasedAt ?? now) : null,
  });
  const { count } = state;
  if (count.selfRemaining < 1 || count.waitlist.length === 0) return result;
  const deadline = offerDeadline(now, startsAt);
  if (!deadline) {
    // 当日の空き：打診をやめ、キャンセル待ちの人に1回だけ知らせる（research R7）
    if (!setting.sameDayNotifiedAt) {
      await updateWaitlistSetting(tx, eventId, { sameDayNotifiedAt: now });
      for (const entryId of count.waitlist) {
        const entry = state.entries.find((row) => row.id === entryId);
        if (!entry || !hasContact(entry)) continue;
        const respond = entry?.accountId ? myBookingsUrl(deps) : applyUrl(deps, eventId);
        queue.push({ entryId, kind: "same_day", links: { respond } });
        result.sameDay += 1;
      }
    }
    return result;
  }
  let remaining = count.selfRemaining;
  for (const entryId of count.waitlist) {
    if (remaining < 1) break;
    const entry = state.entries.find((row) => row.id === entryId);
    // 連絡先のない行は飛ばす（主催者の手の打診だけ。次の人に回す）
    if (!entry || !hasContact(entry)) continue;
    await offerTo(deps, tx, eventId, entry, deadline, null, queue);
    result.offered += 1;
    remaining -= 1;
  }
  return result;
}

/**
 * 本人の申込みの並びと打診（読むとき。期限を過ぎた打診は「期限切れ」として見せる。research R9）。
 * @param state 席の状態
 * @param entryId 申込みの ID
 * @param startsAt 交流会の始まり
 * @param now 今の時刻
 * @returns 並びと打診
 */
export function standingOf(
  state: SeatState,
  entryId: string,
  startsAt: Date,
  now: Date,
): EntryStanding {
  const entry = state.entries.find((row) => row.id === entryId);
  const before = now.getTime() < startsAt.getTime();
  const open = before && !state.setting?.cancelledAt;
  if (entry?.status === "offered") {
    const live = isLiveOffer(entry, now);
    return {
      waitlistPosition: null,
      offerDeadline: entry.offerDeadline?.toISOString() ?? null,
      offerExpired: !live,
      canAccept: live && open,
    };
  }
  const position = entry ? waitlistPosition(state.count, entry.id) : null;
  return {
    waitlistPosition: position,
    offerDeadline: null,
    offerExpired: false,
    canAccept:
      position !== null &&
      open &&
      isSameDayWindow(now, startsAt) &&
      canConfirmNew(state.count, true),
  };
}

/**
 * 申込みページの席の欄（定員があるとき。参加者に見せてよい数だけ。research R16）。
 * @param state 席の状態
 * @param startsAt 交流会の始まり
 * @param now 今の時刻
 * @returns 席の欄（定員がなければ null）
 */
export function pageSeatsOf(state: SeatState, startsAt: Date, now: Date): PageSeats | null {
  const { count } = state;
  if (count.capacity === null) return null;
  const sameDay = isSameDayWindow(now, startsAt);
  const remaining = canConfirmNew(count, sameDay) ? Math.max(count.selfRemaining, 0) : 0;
  return {
    capacity: count.capacity,
    remaining,
    waitlist: count.waitlist.length,
    sameDay: sameDay && remaining > 0,
  };
}

/**
 * 新しい申込みの置き場所（片付けのあとに決める。research R4）。
 * @param state 席の状態
 * @param startsAt 交流会の始まり
 * @param now 今の時刻
 * @returns 確定かキャンセル待ち
 */
export function placementOf(
  state: SeatState,
  startsAt: Date,
  now: Date,
): "confirmed" | "waitlisted" {
  return canConfirmNew(state.count, isSameDayWindow(now, startsAt)) ? "confirmed" : "waitlisted";
}

/**
 * 申し込んだあとの知らせ（確定かキャンセル待ちの何番目か）を積む。
 * @param deps 道具
 * @param tx トランザクション
 * @param context 交流会と主催
 * @param entry 申込み（ID・状態・アカウント）
 * @param entry.id 申込みの ID
 * @param entry.status 状態
 * @param entry.accountId 本人のアカウント
 * @param entryLink メールの人の札のページ（手にあるとき）
 * @param now 今の時刻
 * @param queue 知らせ
 */
export async function queueApplied(
  deps: WaitlistDeps,
  tx: Executor,
  context: EventContext,
  entry: { id: string; status: string; accountId: string | null },
  entryLink: string | null,
  now: Date,
  queue: NoticeQueue,
): Promise<void> {
  if (entry.status === "confirmed") {
    queue.push({
      entryId: entry.id,
      kind: "confirmed",
      links: confirmedLinks(deps, context, entry, entryLink),
    });
    return;
  }
  if (entry.status !== "waitlisted") return;
  const state = await loadSeatState(tx, context.event.id, now);
  const position = waitlistPosition(state.count, entry.id);
  const link = entry.accountId ? applyUrl(deps, context.event.id) : entryLink;
  queue.push({
    entryId: entry.id,
    kind: "waitlisted",
    ...(position ? { waitlistPosition: position } : {}),
    ...(link ? { links: { entry: link } } : {}),
  });
}

/** 打診への返事の結果。 */
type RespondOutcome = "ok" | "expired" | "not_pending" | "no_seat" | "not_found";

/**
 * 打診への返事（参加・辞退）と、当日の空きの「参加する」（research R7・R8）。期限切れを先に片付けてから決める。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param entryId 申込みの ID（本人の行か札で引いたもの）
 * @param answer 参加する・辞退する
 * @param now 今の時刻
 * @param entryLink メールの人の札のページ（確定の知らせに入れる。LINE の人は null）
 * @throws {AppError} 期限の後（410）・打診中でない（409）・当日の空きが埋まった（409）・ない（404）とき
 */
export async function respondToOffer(
  deps: WaitlistDeps,
  eventId: string,
  entryId: string,
  answer: "accept" | "decline",
  now: Date,
  entryLink: string | null,
): Promise<void> {
  const context = await eventContext(deps, deps.db, eventId);
  if (!context) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
  const startsAt = new Date(context.event.startsAt);
  const queue: NoticeQueue = [];
  const outcome = await deps.db.transaction(async (tx): Promise<RespondOutcome> => {
    const settled = await settleEvent(deps, tx, eventId, startsAt, now, queue);
    if (settled.expired.includes(entryId)) return "expired";
    const state = await loadSeatState(tx, eventId, now);
    const entry = state.entries.find((row) => row.id === entryId);
    if (!entry) return "not_found";
    const before = now.getTime() < startsAt.getTime() && !state.setting?.cancelledAt;
    if (entry.status === "offered") {
      if (!isLiveOffer(entry, now) || !before) return "expired";
      if (answer === "accept") {
        await closePendingOffer(tx, entryId, "accepted", now);
        await setEntryStatus(tx, entryId, "confirmed");
        await queueApplied(
          deps,
          tx,
          context,
          { ...entry, status: "confirmed" },
          entryLink,
          now,
          queue,
        );
      } else {
        await closePendingOffer(tx, entryId, "declined", now);
        await setEntryStatus(tx, entryId, "cancelled");
      }
      await settleEvent(deps, tx, eventId, startsAt, now, queue);
      return "ok";
    }
    if (entry.status === "waitlisted") {
      if (answer === "decline") {
        await setEntryStatus(tx, entryId, "cancelled");
        return "ok";
      }
      if (!before || !isSameDayWindow(now, startsAt)) return "not_pending";
      if (!canConfirmNew(state.count, true)) return "no_seat";
      await setEntryStatus(tx, entryId, "confirmed");
      await queueApplied(
        deps,
        tx,
        context,
        { ...entry, status: "confirmed" },
        entryLink,
        now,
        queue,
      );
      await settleEvent(deps, tx, eventId, startsAt, now, queue);
      return "ok";
    }
    if (entry.status === "cancelled" && (await findLatestOfferStatus(tx, entryId)) === "expired") {
      return "expired";
    }
    return "not_pending";
  });
  await flushNotices(deps, queue);
  if (outcome === "expired") throw new AppError(BOOKING_ERRORS.OFFER_EXPIRED);
  if (outcome === "not_pending") throw new AppError(BOOKING_ERRORS.OFFER_NOT_PENDING);
  if (outcome === "no_seat") throw new AppError(BOOKING_ERRORS.NO_SEAT);
  if (outcome === "not_found") throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
}

/**
 * 交流会の要約を読む（主催者の窓口。なければ 404）。
 * @param deps 道具
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 交流会と主催
 * @throws {AppError} 交流会がないとき（BOOKING_PAGE_NOT_FOUND）
 */
async function requireContext(
  deps: WaitlistDeps,
  db: Executor,
  eventId: string,
): Promise<EventContext> {
  const context = await eventContext(deps, db, eventId);
  if (!context) throw new AppError(BOOKING_ERRORS.PAGE_NOT_FOUND);
  return context;
}

/**
 * 主催者が定員と枠を変える（丸ごと置きかえ。増えた席は片付けで打診する。research R1・R15）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param input 定員と枠
 * @param now 今の時刻
 * @throws {AppError} 受付だけ（409 BOOKING_ROSTER_OFF）のとき
 */
export async function saveCapacity(
  deps: WaitlistDeps,
  eventId: string,
  input: CapacityInput,
  now: Date,
): Promise<void> {
  const context = await requireContext(deps, deps.db, eventId);
  const queue: NoticeQueue = [];
  await deps.db.transaction(async (tx) => {
    const setting = await findWaitlistSetting(tx, eventId, true);
    if (!setting || !usesRoster(setting.mode)) throw new AppError(BOOKING_ERRORS.ROSTER_OFF);
    await replaceCapacity(tx, eventId, input.capacity, input.quotas);
    // 定員・枠を保存したら「一度満員なら枠を押さえるのをやめる」印を消してから片付けを通す（保存のあとも満員なら、片付けが
    // すぐ付け直す。定員を下げた保存の一瞬で付いた印を、定員を戻したときに戻せるように。research R3【仮決め】）
    await updateWaitlistSetting(tx, eventId, { quotaReleasedAt: null });
    await settleEvent(deps, tx, eventId, new Date(context.event.startsAt), now, queue);
  });
  await flushNotices(deps, queue);
}

/**
 * 主催者が名簿の行を確定・取り消しにする（キャンセル待ち・打診中を確定にしたら確定の知らせ。取り消したら次の人へ。R14）。
 * @param deps 道具
 * @param tx トランザクション（設定の行を押さえたもの）
 * @param context 交流会と主催
 * @param entry 行（ID・状態・アカウント）
 * @param entry.id 行の ID
 * @param entry.status 今の状態
 * @param entry.accountId 本人のアカウント
 * @param status 新しい状態
 * @param now 今の時刻
 * @param queue 知らせ
 */
export async function setStatusByOrganizer(
  deps: WaitlistDeps,
  tx: Executor,
  context: EventContext,
  entry: { id: string; status: string; accountId: string | null },
  status: "confirmed" | "cancelled",
  now: Date,
  queue: NoticeQueue,
): Promise<void> {
  if (entry.status === "offered" || entry.status === "waitlisted") {
    await closePendingOffer(tx, entry.id, "withdrawn", now);
  }
  await setEntryStatus(tx, entry.id, status);
  if (status === "confirmed" && (entry.status === "waitlisted" || entry.status === "offered")) {
    queue.push({
      entryId: entry.id,
      kind: "confirmed",
      links: confirmedLinks(deps, context, entry, null),
    });
  }
  await settleEvent(deps, tx, context.event.id, new Date(context.event.startsAt), now, queue);
}

/**
 * 主催者が手で打診する（席がなくても押さえる。期限が1時間取れなければ 409。research R14）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 * @param organizerId 主催者
 * @param now 今の時刻
 * @throws {AppError} キャンセル待ちを使わない（409）・行がない（404）・キャンセル待ちでない（409）・期限が取れない（409）とき
 */
export async function offerByOrganizer(
  deps: WaitlistDeps,
  eventId: string,
  entryId: string,
  organizerId: string,
  now: Date,
): Promise<void> {
  const context = await requireContext(deps, deps.db, eventId);
  const startsAt = new Date(context.event.startsAt);
  const queue: NoticeQueue = [];
  await deps.db.transaction(async (tx) => {
    const setting = await findWaitlistSetting(tx, eventId, true);
    if (!usesWaitlist(setting) || setting.cancelledAt) {
      throw new AppError(BOOKING_ERRORS.WAITLIST_OFF);
    }
    await settleEvent(deps, tx, eventId, startsAt, now, queue);
    const state = await loadSeatState(tx, eventId, now);
    const entry = state.entries.find((row) => row.id === entryId);
    if (!entry) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
    if (entry.status !== "waitlisted") throw new AppError(BOOKING_ERRORS.ENTRY_NOT_WAITLISTED);
    const deadline = offerDeadline(now, startsAt);
    if (!deadline) throw new AppError(BOOKING_ERRORS.OFFER_WINDOW_SHORT);
    await offerTo(deps, tx, eventId, entry, deadline, organizerId, queue);
    // 手の打診で席が埋まれば、枠を押さえるのをやめる印を付ける（片付けを通す。R3）
    await settleEvent(deps, tx, eventId, startsAt, now, queue);
  });
  await flushNotices(deps, queue);
}

/**
 * 主催者が予約を中止する（取り消しでない申込みを取り消しにし、中止の知らせを送る。戻せない。research R11）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param now 今の時刻
 * @throws {AppError} 使い方が自前でないとき（409 BOOKING_SELF_PAGE_OFF）
 */
export async function cancelBooking(deps: WaitlistDeps, eventId: string, now: Date): Promise<void> {
  await requireContext(deps, deps.db, eventId);
  const queue: NoticeQueue = [];
  await deps.db.transaction(async (tx) => {
    const setting = await findWaitlistSetting(tx, eventId, true);
    if (setting?.mode !== "self_page") throw new AppError(BOOKING_ERRORS.SELF_PAGE_OFF);
    if (setting.cancelledAt) return;
    await updateWaitlistSetting(tx, eventId, { cancelledAt: now });
    await withdrawOffersOfEvent(tx, eventId, now);
    for (const entryId of await cancelActiveEntries(tx, eventId)) {
      queue.push({ entryId, kind: "cancelled_event" });
    }
  });
  await flushNotices(deps, queue);
}

/**
 * 交流会が始まったか（最後に知らせた始まりと今の始まりの早いほうを過ぎた。始まったあとの直しは知らせない。research R10）。
 * @param setting 設定（最後に知らせた始まり）
 * @param event 要約
 * @param now 今の時刻
 * @returns 始まっていれば true
 */
export function startedForChange(
  setting: Pick<WaitlistSetting, "notifiedStartsAt">,
  event: EventSummary,
  now: Date,
): boolean {
  const current = new Date(event.startsAt).getTime();
  const notified = setting.notifiedStartsAt?.getTime() ?? current;
  return now.getTime() >= Math.min(notified, current);
}

/**
 * 最後に知らせた日時と場所と、今の要約の違い（自前で中止していない・始まっていないとき。research R10）。
 * @param setting 設定
 * @param event 要約
 * @param now 今の時刻（始まったあとは違いを出さない）
 * @returns 違い（なければ null）
 */
export function scheduleChangeOf(
  setting: WaitlistSetting | null,
  event: EventSummary,
  now: Date,
): ScheduleChange | null {
  if (setting?.mode !== "self_page" || setting.cancelledAt || !setting.notifiedStartsAt) {
    return null;
  }
  if (startedForChange(setting, event, now)) return null;
  const startsChanged = setting.notifiedStartsAt.getTime() !== new Date(event.startsAt).getTime();
  const venueChanged = (setting.notifiedVenue ?? null) !== (event.venue ?? null);
  if (!startsChanged && !venueChanged) return null;
  return {
    previousStartsAt: setting.notifiedStartsAt.toISOString(),
    previousVenue: setting.notifiedVenue,
    startsAt: event.startsAt,
    venue: event.venue,
    autoNoticeAt: setting.changeDetectedAt
      ? new Date(
          setting.changeDetectedAt.getTime() + CHANGE_NOTICE_DELAY_MINUTES * MINUTE_MS,
        ).toISOString()
      : null,
  };
}

/**
 * キャンセル待ち・打診中の申込みがあるか（使い方を自前から外す前の確かめ。research R21）。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns あれば true
 */
export async function hasWaitingEntries(db: Executor, eventId: string): Promise<boolean> {
  const entries = await listActiveEntries(db, eventId);
  return entries.some((entry) => entry.status === "waitlisted" || entry.status === "offered");
}

/**
 * 最後に知らせた日時と場所を、今の要約に合わせる（使い始め・知らせたあと・済ませたあと）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param event 要約
 */
export async function markNotified(
  db: Executor,
  eventId: string,
  event: EventSummary,
): Promise<void> {
  const setting = await findWaitlistSetting(db, eventId);
  const startsAt = new Date(event.startsAt);
  // 交流会の日にち（日本時間）が変わったら、当日の空きの知らせと「枠を押さえるのをやめる」印を戻す（新しい日にちで決め直す）
  const dayChanged =
    setting?.notifiedStartsAt != null && jstDate(setting.notifiedStartsAt) !== jstDate(startsAt);
  await updateWaitlistSetting(db, eventId, {
    notifiedStartsAt: startsAt,
    notifiedVenue: event.venue,
    changeDetectedAt: null,
    ...(dayChanged ? { sameDayNotifiedAt: null, quotaReleasedAt: null } : {}),
  });
}

/**
 * 変更の知らせを積み、知らせた日時と場所を今に合わせる。
 * @param deps 道具
 * @param tx トランザクション
 * @param context 交流会と主催
 * @param change 違い
 * @param queue 知らせ
 * @returns 知らせた申込みの数
 */
async function queueChange(
  deps: WaitlistDeps,
  tx: Executor,
  context: EventContext,
  change: ScheduleChange,
  queue: NoticeQueue,
): Promise<number> {
  const previous: NonNullable<SendNoticeInput["previous"]> = {};
  if (change.previousStartsAt !== change.startsAt) {
    previous.startsAt = new Date(change.previousStartsAt);
  }
  if (change.previousVenue !== change.venue) previous.venue = change.previousVenue;
  const entries = await listActiveEntries(tx, context.event.id);
  const seats = await listSeatEntries(tx, context.event.id);
  for (const entry of entries) {
    const row = seats.find((item) => item.id === entry.id);
    queue.push({
      entryId: entry.id,
      kind: "changed",
      previous,
      ...(row?.accountId ? { links: { entry: applyUrl(deps, context.event.id) } } : {}),
    });
  }
  await markNotified(tx, context.event.id, context.event);
  return entries.length;
}

/**
 * 主催者が変更を知らせる・知らせずに済ませる（research R10）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param notify 知らせるか
 * @param now 今の時刻（始まったあとは変更として扱わない）
 * @throws {AppError} 自前でない（409 BOOKING_SELF_PAGE_OFF）・変更がない（409 BOOKING_NO_CHANGE）とき
 */
export async function resolveScheduleChange(
  deps: WaitlistDeps,
  eventId: string,
  notify: boolean,
  now: Date = new Date(),
): Promise<void> {
  const queue: NoticeQueue = [];
  await deps.db.transaction(async (tx) => {
    const setting = await findWaitlistSetting(tx, eventId, true);
    if (setting?.mode !== "self_page") throw new AppError(BOOKING_ERRORS.SELF_PAGE_OFF);
    const context = await requireContext(deps, tx, eventId);
    const change = scheduleChangeOf(setting, context.event, now);
    if (!change) throw new AppError(BOOKING_ERRORS.NO_CHANGE);
    if (notify) await queueChange(deps, tx, context, change, queue);
    else await markNotified(tx, eventId, context.event);
  });
  await flushNotices(deps, queue);
}

/**
 * 定期の仕事（Cloud Scheduler が10分おき・9時〜23時台に呼ぶ。research R9・R10）：対象の交流会ごとに片付けと変更の知らせ。
 * @param deps 道具
 * @param now 今の時刻
 * @returns 数だけ
 */
export async function runWaitlistJob(deps: WaitlistDeps, now: Date): Promise<WaitlistJobSummary> {
  const summary: WaitlistJobSummary = { events: 0, expired: 0, offered: 0, sameDay: 0, changed: 0 };
  const ids = await listJobEventIds(deps.db, new Date(now.getTime() - DAY_MS));
  for (const eventId of ids) {
    // 交流会ごとに分ける（1つの交流会の誤りで、ほかの交流会の片付けと知らせを止めない。ログには ID と誤りの種類だけ）
    try {
      await runJobForEvent(deps, eventId, now, summary);
    } catch (error) {
      deps.logger.error(
        { eventId, errorName: error instanceof Error ? error.name : "unknown" },
        "予約の定期の仕事で、交流会の処理に失敗しました",
      );
    }
  }
  deps.logger.info({ ...summary }, "予約の定期の仕事");
  return summary;
}

/**
 * 定期の仕事の、1つの交流会の分（片付けと変更の知らせ）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param now 今の時刻
 * @param summary 数（足していく）
 */
async function runJobForEvent(
  deps: WaitlistDeps,
  eventId: string,
  now: Date,
  summary: WaitlistJobSummary,
): Promise<void> {
  const context = await eventContext(deps, deps.db, eventId);
  if (!context) return;
  summary.events += 1;
  const queue: NoticeQueue = [];
  await deps.db.transaction(async (tx) => {
    const settled = await settleEvent(
      deps,
      tx,
      eventId,
      new Date(context.event.startsAt),
      now,
      queue,
    );
    summary.expired += settled.expired.length;
    summary.offered += settled.offered;
    summary.sameDay += settled.sameDay;
    const setting = await findWaitlistSetting(tx, eventId, true);
    if (setting?.mode !== "self_page" || setting.cancelledAt) return;
    if (!setting.notifiedStartsAt) {
      await markNotified(tx, eventId, context.event);
      return;
    }
    if (startedForChange(setting, context.event, now)) {
      // 始まったあとの直し（日時・場所）は知らせない。知らせた日時と場所を今にそろえるだけ（research R10）
      const startsChanged =
        setting.notifiedStartsAt.getTime() !== new Date(context.event.startsAt).getTime();
      const venueChanged = (setting.notifiedVenue ?? null) !== (context.event.venue ?? null);
      if (startsChanged || venueChanged || setting.changeDetectedAt) {
        await markNotified(tx, eventId, context.event);
      }
      return;
    }
    const change = scheduleChangeOf(setting, context.event, now);
    if (!change) {
      if (setting.changeDetectedAt) {
        await updateWaitlistSetting(tx, eventId, { changeDetectedAt: null });
      }
      return;
    }
    if (!setting.changeDetectedAt) {
      await updateWaitlistSetting(tx, eventId, { changeDetectedAt: now });
      return;
    }
    if (
      now.getTime() - setting.changeDetectedAt.getTime() >=
      CHANGE_NOTICE_DELAY_MINUTES * MINUTE_MS
    ) {
      await queueChange(deps, tx, context, change, queue);
      summary.changed += 1;
    }
  });
  await flushNotices(deps, queue);
}

/**
 * 申込みに送った知らせ（主催者だけ。種類・手段・結果・時刻だけ。research R13）。
 * @param db DB
 * @param entryId 申込みの ID
 * @returns 一覧
 */
export async function readNoticeLog(db: Executor, entryId: string): Promise<NoticeLog> {
  const rows = await listNoticesOf(db, entryId, NOTICE_LOG_MAX);
  return { notices: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
}

/**
 * 主催者の設定の答えに足す欄（定員・枠・席の内訳・中止・変更）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param event 要約
 * @param now 今の時刻
 * @returns 足す欄
 */
export async function waitlistSettingFields(
  db: Executor,
  eventId: string,
  event: EventSummary,
  now: Date,
): Promise<Pick<BookingSetting, "capacity" | "quotas" | "seats" | "cancelled" | "change">> {
  const state = await loadSeatState(db, eventId, now);
  const startsAt = new Date(event.startsAt);
  return {
    capacity: state.config.capacity,
    quotas: [...state.config.quotas],
    seats: toSeatSummary(
      state.count,
      state.config.quotasReleased,
      state.setting?.mode === "self_page" && isSameDayWindow(now, startsAt),
    ),
    cancelled: state.setting?.cancelledAt != null,
    change: scheduleChangeOf(state.setting, event, now),
  };
}
