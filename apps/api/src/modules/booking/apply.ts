// 自前の申込みページの業務（booking-003。PRD FR-B40〜B47・research R1〜R19）：申込みページの答え・LINE ログインで申し込む・
// 取り消す・自分の申込み・部の予定・案内の同意・メールで申し込む（確認の待ちと札）・.ics。
// 交流会は event の index.ts（getEventSummary・getEventRole・listOrganizationEvents）、組織は suite、表示名は account から引く（AD-3）。
// 「受付中」は使い方が自前・受付を開いている・始まりの前を読むときに決める（始まりを過ぎたら自動で閉じる。research R1）。
// 部員だけの回は、主催者と部員のほかに中身を返さない（research R8）。書く窓口は設定の行を押さえて受付中かを決め直す（S8・S14）。
// 名前・メールアドレス・札はログに出さない。確定したら sendNotice（確定）を呼び、知らせが送れなくても申込みは成り立つ（R12）。
// 定員とキャンセル待ち（booking-004）：書く窓口は片付け（waitlist.ts の settleEvent）を通してから、確定かキャンセル待ちかを決める。
// 読む窓口は書かずに、席の欄・本人の何番目か・打診の期限を返す（期限を過ぎた打診は期限切れとして見せる。research R9）。
import type {
  ApplyInput,
  ApplyPage,
  ApplyResult,
  ConsentList,
  EmailApplyInput,
  EntryTokenView,
  MyEntry,
  MyEntryItem,
  MySchedule,
  PageState,
} from "@workspace/contracts/booking";
import {
  BOOKING_ERRORS,
  EMAIL_REQUESTS_PER_EVENT_MAX,
  EMAIL_REQUEST_WINDOW_MINUTES,
  EMAIL_REQUEST_RESEND_MINUTES,
  EMAIL_REQUEST_TTL_HOURS,
  googleCalendarUrl,
} from "@workspace/contracts/booking";
import type { EntryStanding } from "@workspace/contracts/booking";
import { endOfJstDate, jstDate } from "@workspace/contracts/core";
import type { EventSummary } from "@workspace/contracts/event";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { SessionAccount } from "../account/index.ts";
import { findDisplayNames } from "../account/index.ts";
import {
  findEventOrganizationId,
  getEventRole,
  getEventSummary,
  listOrganizationEvents,
} from "../event/index.ts";
import { findMembership, listMemberships } from "../suite/index.ts";
import {
  cancelEntryRow,
  consumeRequestsOf,
  countRecentRequests,
  deleteConsent,
  deleteExpiredRequests,
  deleteRequestsOf,
  findAccountEntry,
  findEntryByContactEmail,
  findEntryByTokenHash,
  findLatestAccountEntryName,
  findLatestRequestAt,
  findOwnEntry,
  findSelfEntry,
  findPageSetting,
  findRequestByHash,
  hasConsent,
  insertConsent,
  insertRequest,
  insertSelfEntry,
  listAccountEntries,
  listAccountStatuses,
  listConsents,
  listPageSettings,
  reconfirmEntry,
  replaceEntryToken,
} from "./apply-repository.ts";
import type { PageSetting, SelfEntry } from "./apply-repository.ts";
import { buildIcs } from "./calendar-ics.ts";
import { emailConfirmSubject, emailConfirmText, senderName } from "./notice-templates.ts";
import { eventNotifyHolder } from "./notify.ts";
import { findChannelByHolder, findContactEmail, findLinkedLineUser } from "./notify-repository.ts";
import type { NotifyHolderRef } from "./notify-repository.ts";
import { holderNameOf, notifierOf } from "./notify-settings.ts";
import type { NotifyDeps } from "./notify-settings.ts";
import { applyUrl, calendarLinks, entryTokenUrl } from "./page-links.ts";
import { TOKEN_FORMAT, createToken, hashToken } from "./tokens.ts";
import { isSameDayWindow } from "./deadline.ts";
import {
  eventContext,
  flushNotices,
  loadSeatState,
  pageSeatsOf,
  placementOf,
  queueApplied,
  respondToOffer,
  settleEvent,
  standingOf,
} from "./waitlist.ts";
import type { NoticeQueue, SeatState } from "./waitlist.ts";
import {
  closePendingOffer,
  findEntryIdByOfferToken,
  setEntryStatus,
} from "./waitlist-repository.ts";

/** 自前の申込みの処理に使う道具（知らせと同じ）。 */
export type ApplyDeps = NotifyDeps;

/** 申込みページの読みこみの結果。 */
type PageContext = {
  event: EventSummary;
  setting: PageSetting;
  holder: NotifyHolderRef | null;
  hostName: string;
};

/** 1時間・1分（ミリ秒）。 */
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/**
 * 受付の状態（読むときに決める。research R1）。
 * @param setting 設定
 * @param startsAt 始まり
 * @param now 今の時刻
 * @returns 受付中・閉じている・始まりを過ぎた・中止（booking-004）
 */
export function pageStateOf(setting: PageSetting, startsAt: Date, now: Date): PageState {
  if (setting.mode === "self_page" && setting.cancelledAt) return "cancelled";
  if (startsAt.getTime() <= now.getTime()) return "started";
  return setting.mode === "self_page" && setting.accepting ? "open" : "closed";
}

/**
 * 交流会の始まり。
 * @param event 要約
 * @returns 始まり
 */
function startsOf(event: EventSummary): Date {
  return new Date(event.startsAt);
}

/**
 * 申込みページに出す交流会の欄。
 * @param event 要約
 * @returns 欄
 */
function applyEventOf(event: EventSummary): ApplyPage["event"] {
  return {
    id: event.id,
    name: event.name,
    startsAt: event.startsAt,
    venue: event.venue,
    fee: event.fee,
  };
}

/** 打診も並びもないときの答え。 */
const NO_STANDING: EntryStanding = {
  waitlistPosition: null,
  offerDeadline: null,
  offerExpired: false,
  canAccept: false,
};

/**
 * 取り消せるか（確定・キャンセル待ち・打診中で始まりの前。booking-004）。
 * @param status 状態
 * @param startsAt 始まり
 * @param now 今の時刻
 * @returns 取り消せれば true
 */
function isCancellable(status: SelfEntry["status"], startsAt: Date, now: Date): boolean {
  return status !== "cancelled" && now.getTime() < startsAt.getTime();
}

/**
 * 本人の申込みの答え。
 * @param entry 申込み
 * @param startsAt 始まり
 * @param now 今の時刻
 * @param standing 並びと打診
 * @returns 答え
 */
function toMyEntry(
  entry: SelfEntry,
  startsAt: Date,
  now: Date,
  standing: EntryStanding = NO_STANDING,
): MyEntry {
  return {
    id: entry.id,
    name: entry.name,
    status: entry.status,
    appliedAt: entry.appliedAt.toISOString(),
    cancellable: isCancellable(entry.status, startsAt, now),
    ...standing,
  };
}

/**
 * 申込みページを読みこむ（交流会がない・使い方が自前でなければ 404）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @returns 交流会・設定・主催
 * @throws {AppError} ないとき（BOOKING_PAGE_NOT_FOUND）
 */
async function loadPage(deps: ApplyDeps, eventId: string): Promise<PageContext> {
  const event = await getEventSummary(deps.db, deps.config, eventId);
  if (!event) throw new AppError(BOOKING_ERRORS.PAGE_NOT_FOUND);
  const setting = await findPageSetting(deps.db, eventId);
  if (setting.mode !== "self_page") throw new AppError(BOOKING_ERRORS.PAGE_NOT_FOUND);
  const holder = await eventNotifyHolder(deps.db, eventId);
  const hostName = holder ? await holderNameOf(deps.db, holder) : "";
  return { event, setting, holder, hostName };
}

/**
 * 部員だけの回を、主催者と部員のほかに見せない（要求のたびに役目を引く。research R8）。
 * event の役目は主催者 → 受付係 → 部員の順に1つだけ決まるので、受付係のときは組織のメンバーかを確かめ直す
 * （部員で受付係も兼ねる人が、部員だけの回を開けるように）。
 * @param deps 道具
 * @param context 申込みページ（見せる範囲は、呼ぶ側が押さえて読んだ設定を渡してよい）
 * @param viewer 今の利用者（ログインしていなければ null）
 * @param db 読む DB（トランザクションの中なら、そのトランザクション）
 * @throws {AppError} 見られないとき（403 BOOKING_PAGE_MEMBERS_ONLY）
 */
async function assertVisible(
  deps: ApplyDeps,
  context: Pick<PageContext, "event" | "setting">,
  viewer: SessionAccount | null,
  db: Executor = deps.db,
): Promise<void> {
  if (context.setting.visibility !== "members") return;
  if (!viewer) throw new AppError(BOOKING_ERRORS.PAGE_MEMBERS_ONLY);
  const role = await getEventRole(db, deps.config, context.event.id, viewer);
  if (role === "organizer" || role === "member") return;
  if (role === "staff") {
    const organizationId = await findEventOrganizationId(db, context.event.id);
    const membership = organizationId
      ? await findMembership(db, organizationId, viewer.accountId)
      : null;
    if (membership) return;
  }
  throw new AppError(BOOKING_ERRORS.PAGE_MEMBERS_ONLY);
}

/**
 * 申込みページの答えを作る。
 * @param deps 道具
 * @param context 申込みページ
 * @param viewer 今の利用者（ログインしていなければ null）
 * @param now 今の時刻
 * @returns 申込みページ
 */
async function buildPage(
  deps: ApplyDeps,
  context: PageContext,
  viewer: SessionAccount | null,
  now: Date,
): Promise<ApplyPage> {
  const { db } = deps;
  const { event, holder } = context;
  const channel = holder ? await findChannelByHolder(db, holder) : null;
  const seats = await loadSeatState(db, event.id, now);
  const base = {
    event: applyEventOf(event),
    hostName: context.hostName,
    state: pageStateOf(context.setting, startsOf(event), now),
    visibility: context.setting.visibility,
    calendar: calendarLinks(deps, event, context.hostName),
    lineFriendUrl: channel?.basicId
      ? `https://line.me/R/ti/p/${encodeURIComponent(channel.basicId)}`
      : null,
    seats: context.setting.mode === "self_page" ? pageSeatsOf(seats, startsOf(event), now) : null,
  };
  if (!viewer) return { ...base, viewer: { signedIn: false } };
  const me = viewer.accountId;
  const entry = await findAccountEntry(db, event.id, me);
  const defaultName =
    entry?.name ??
    (await findLatestAccountEntryName(db, me)) ??
    (await findDisplayNames(db, [me])).get(me) ??
    "";
  const lineLinked =
    channel !== null &&
    channel.lineChannelId !== null &&
    (await findLinkedLineUser(db, channel.id, me)) !== null;
  return {
    ...base,
    viewer: {
      signedIn: true,
      defaultName,
      myEntry: entry
        ? toMyEntry(entry, startsOf(event), now, standingOf(seats, entry.id, startsOf(event), now))
        : null,
      consented: holder ? await hasConsent(db, me, holder) : false,
      lineLinked,
      hasContactEmail: (await findContactEmail(db, me)) !== null,
    },
  };
}

/**
 * 申込みページを読む（ログインなしでも読める。research R3）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param viewer 今の利用者（ログインしていなければ null）
 * @param now 今の時刻
 * @returns 申込みページ
 */
export async function readApplyPage(
  deps: ApplyDeps,
  eventId: string,
  viewer: SessionAccount | null,
  now: Date,
): Promise<ApplyPage> {
  const context = await loadPage(deps, eventId);
  await assertVisible(deps, context, viewer);
  return buildPage(deps, context, viewer, now);
}

/**
 * 受付中か確かめる（中止は 409 BOOKING_EVENT_CANCELLED。booking-004）。
 * @param setting 設定
 * @param startsAt 始まり
 * @param now 今の時刻
 * @throws {AppError} 受付中でないとき（409）
 */
function assertOpen(setting: PageSetting, startsAt: Date, now: Date): void {
  const state = pageStateOf(setting, startsAt, now);
  if (state === "cancelled") throw new AppError(BOOKING_ERRORS.EVENT_CANCELLED);
  if (state !== "open") throw new AppError(BOOKING_ERRORS.PAGE_CLOSED);
}

/**
 * LINE ログインで申し込む（1交流会1人1つ。取り消しなら戻す。満員ならキャンセル待ち。research R4・R5・booking-004 R4）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param viewer 今の利用者
 * @param input 名前と案内の同意
 * @param now 今の時刻
 * @returns 答えと、新しく申し込んだ（状態を変えた）か（201 にする）
 * @throws {AppError} ページがない（404）・見られない（403）・受付中でない（409）とき
 */
export async function applyWithAccount(
  deps: ApplyDeps,
  eventId: string,
  viewer: SessionAccount,
  input: ApplyInput,
  now: Date,
): Promise<{ result: ApplyResult; created: boolean }> {
  const context = await loadPage(deps, eventId);
  await assertVisible(deps, context, viewer);
  const me = viewer.accountId;
  const startsAt = startsOf(context.event);
  const eventInfo = { event: context.event, hostName: context.hostName };
  const queue: NoticeQueue = [];
  const { entry, created } = await deps.db.transaction(async (tx) => {
    // 設定の行を押さえて、受付中かを決め直す（同時の申込み・閉じた直後を順に流す。S8・S14）
    const setting = await findPageSetting(tx, eventId, true);
    if (setting.mode !== "self_page") throw new AppError(BOOKING_ERRORS.PAGE_NOT_FOUND);
    // 見せる範囲も、押さえたあとの設定で決め直す（読んでから押さえるまでに部員だけに変わったとき）
    await assertVisible(deps, { event: context.event, setting }, viewer, tx);
    assertOpen(setting, startsAt, now);
    // 片付け（期限切れ・打診）をしてから、自分の行を読み、確定かキャンセル待ちかを決める（期限の切れた打診中を
    // 「打診中」のまま早く返さない・待ちを飛びこさない。booking-004 R4・R9）
    await settleEvent(deps, tx, eventId, startsAt, now, queue);
    const existing = await findAccountEntry(tx, eventId, me, true);
    if (input.consent && context.holder) await insertConsent(tx, me, context.holder);
    if (existing?.status === "confirmed" || existing?.status === "offered") {
      return { entry: existing, created: false };
    }
    const state = await loadSeatState(tx, eventId, now);
    const placement = placementOf(state, startsAt, now);
    let next: SelfEntry;
    if (existing?.status === "waitlisted") {
      // もうキャンセル待ち：当日の空きで席があるときだけ確定にする（research R7）
      if (placement !== "confirmed" || !isSameDayWindow(now, startsAt)) {
        return { entry: existing, created: false };
      }
      await setEntryStatus(tx, existing.id, "confirmed");
      next = { ...existing, status: "confirmed" };
    } else if (existing) {
      next = await reconfirmEntry(tx, existing.id, { name: input.name, status: placement });
    } else {
      next = await insertSelfEntry(tx, {
        eventId,
        name: input.name,
        accountId: me,
        contactEmail: null,
        entryTokenHash: null,
        status: placement,
      });
    }
    await queueApplied(deps, tx, eventInfo, { ...next, accountId: me }, null, now, queue);
    await settleEvent(deps, tx, eventId, startsAt, now, queue);
    return { entry: next, created: true };
  });
  await flushNotices(deps, queue);
  const page = await buildPage(deps, context, viewer, now);
  const myEntry =
    page.viewer.signedIn && page.viewer.myEntry
      ? page.viewer.myEntry
      : toMyEntry(entry, startsAt, now);
  return { result: { entry: myEntry, page }, created };
}

/** 交流会の要約と主催の名前を、同じものは1回だけ引く道具。 */
type EventLookup = (eventId: string) => Promise<{ event: EventSummary; hostName: string } | null>;

/**
 * 交流会の要約と主催の名前を引く道具を作る（一覧の中で同じ交流会・同じ主催を1回だけ引く）。
 * @param deps 道具
 * @returns 引く道具
 */
function eventLookup(deps: ApplyDeps): EventLookup {
  const cache = new Map<string, { event: EventSummary; hostName: string } | null>();
  return async (eventId) => {
    if (cache.has(eventId)) return cache.get(eventId) ?? null;
    const event = await getEventSummary(deps.db, deps.config, eventId);
    const holder = event ? await eventNotifyHolder(deps.db, eventId) : null;
    const found = event
      ? { event, hostName: holder ? await holderNameOf(deps.db, holder) : "" }
      : null;
    cache.set(eventId, found);
    return found;
  };
}

/** 交流会ごとの席の状態を、同じものは1回だけ読む道具。 */
type SeatLookup = (eventId: string) => Promise<SeatState>;

/**
 * 席の状態を読む道具を作る（一覧の中で同じ交流会を1回だけ読む）。
 * @param deps 道具
 * @param now 今の時刻
 * @returns 読む道具
 */
function seatLookup(deps: ApplyDeps, now: Date): SeatLookup {
  const cache = new Map<string, SeatState>();
  return async (eventId) => {
    const cached = cache.get(eventId);
    if (cached) return cached;
    const state = await loadSeatState(deps.db, eventId, now);
    cache.set(eventId, state);
    return state;
  };
}

/**
 * 自分の申込みの一覧の1行。
 * @param entry 申込み
 * @param found 交流会と主催
 * @param found.event 交流会の要約
 * @param found.hostName 主催の名前
 * @param now 今の時刻
 * @param standing 並びと打診
 * @returns 1行
 */
function toMyEntryItem(
  entry: SelfEntry,
  found: { event: EventSummary; hostName: string },
  now: Date,
  standing: EntryStanding,
): MyEntryItem {
  const { event, hostName } = found;
  return {
    entryId: entry.id,
    status: entry.status,
    cancellable: isCancellable(entry.status, startsOf(event), now),
    ...standing,
    event: { id: event.id, name: event.name, startsAt: event.startsAt, venue: event.venue },
    hostName,
    googleCalendarUrl: googleCalendarUrl({
      name: event.name,
      startsAt: event.startsAt,
      venue: event.venue,
    }),
  };
}

/**
 * 自分の申込みの一覧の1行を、今の席の状態で作る。
 * @param deps 道具
 * @param entry 申込み
 * @param found 交流会と主催
 * @param found.event 交流会の要約
 * @param found.hostName 主催の名前
 * @param now 今の時刻
 * @param seats 席の状態を読む道具
 * @returns 1行
 */
async function myEntryItemOf(
  deps: ApplyDeps,
  entry: SelfEntry,
  found: { event: EventSummary; hostName: string },
  now: Date,
  seats: SeatLookup = seatLookup(deps, now),
): Promise<MyEntryItem> {
  const standing = standingOf(await seats(entry.eventId), entry.id, startsOf(found.event), now);
  return toMyEntryItem(entry, found, now, standing);
}

/**
 * 自分の申込みの一覧（始まりの日が終わっていない会だけ・始まりの近い順。research R19）。
 * @param deps 道具
 * @param accountId 本人
 * @param now 今の時刻
 * @returns 一覧
 */
export async function listMyEntries(
  deps: ApplyDeps,
  accountId: string,
  now: Date,
): Promise<MyEntryItem[]> {
  const lookup = eventLookup(deps);
  const seats = seatLookup(deps, now);
  const items: MyEntryItem[] = [];
  for (const entry of await listAccountEntries(deps.db, accountId)) {
    const found = await lookup(entry.eventId);
    if (!found || endOfJstDate(found.event.startsAt).getTime() <= now.getTime()) continue;
    items.push(await myEntryItemOf(deps, entry, found, now, seats));
  }
  return items.sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
}

/**
 * 申込みを取り消す（設定の行を押さえてから行を押さえ直す。打診中なら辞退と同じ。そのあと片付けで次の人へ。booking-004 R8）。
 * @param deps 道具
 * @param tx トランザクション
 * @param entry 申込み（押さえる前に読んだもの）
 * @param startsAt 始まり
 * @param now 今の時刻
 * @param queue 知らせ
 * @returns 取り消したあとの申込み
 * @throws {AppError} 始まりを過ぎたとき（409 BOOKING_CANCEL_CLOSED）
 */
async function cancelIfOpen(
  deps: ApplyDeps,
  tx: Executor,
  entry: SelfEntry,
  startsAt: Date,
  now: Date,
  queue: NoticeQueue,
): Promise<SelfEntry> {
  await findPageSetting(tx, entry.eventId, true);
  const current = (await findSelfEntry(tx, entry.id, true)) ?? entry;
  if (current.status === "cancelled") return current;
  if (startsAt.getTime() <= now.getTime()) throw new AppError(BOOKING_ERRORS.CANCEL_CLOSED);
  if (current.status === "offered") await closePendingOffer(tx, current.id, "declined", now);
  const cancelled = await cancelEntryRow(tx, current.id);
  await settleEvent(deps, tx, current.eventId, startsAt, now, queue);
  return cancelled;
}

/**
 * 自分の申込みを取り消す（本人の行だけ・始まりまで。research R7）。
 * @param deps 道具
 * @param accountId 本人
 * @param entryId 行の ID
 * @param now 今の時刻
 * @returns 取り消したあとの1行
 * @throws {AppError} 本人の行でない・ない（404）・始まりを過ぎた（409）とき
 */
export async function cancelMyEntry(
  deps: ApplyDeps,
  accountId: string,
  entryId: string,
  now: Date,
): Promise<MyEntryItem> {
  const lookup = eventLookup(deps);
  const own = await findOwnEntry(deps.db, accountId, entryId);
  const found = own ? await lookup(own.eventId) : null;
  if (!own || !found) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
  const queue: NoticeQueue = [];
  const entry = await deps.db.transaction((tx) =>
    cancelIfOpen(deps, tx, own, startsOf(found.event), now, queue),
  );
  await flushNotices(deps, queue);
  return myEntryItemOf(deps, entry, found, now);
}

/**
 * 自分の申込みの打診に答える（参加・辞退。当日の空きの「参加する」も。booking-004 R8）。
 * @param deps 道具
 * @param accountId 本人
 * @param entryId 行の ID
 * @param answer 参加する・辞退する
 * @param now 今の時刻
 * @returns 答えたあとの1行
 * @throws {AppError} 本人の行でない（404）・期限の後（410）・打診中でない（409）・埋まった（409）とき
 */
export async function respondMyEntry(
  deps: ApplyDeps,
  accountId: string,
  entryId: string,
  answer: "accept" | "decline",
  now: Date,
): Promise<MyEntryItem> {
  const lookup = eventLookup(deps);
  const own = await findOwnEntry(deps.db, accountId, entryId);
  const found = own ? await lookup(own.eventId) : null;
  if (!own || !found) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
  await respondToOffer(deps, own.eventId, own.id, answer, now, null);
  const after = await findOwnEntry(deps.db, accountId, entryId);
  if (!after) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
  return myEntryItemOf(deps, after, found, now);
}

/**
 * 日本時間の今日の初め。
 * @param now 今の時刻
 * @returns 日本時間の 0時
 */
function startOfJstDay(now: Date): Date {
  return new Date(`${jstDate(now)}T00:00:00+09:00`);
}

/**
 * 部の予定（自分がメンバーの組織に入れた自前の会。部員だけの回も。research R9）。
 * @param deps 道具
 * @param accountId 本人
 * @param now 今の時刻
 * @returns 部の予定
 */
export async function readMySchedule(
  deps: ApplyDeps,
  accountId: string,
  now: Date,
): Promise<MySchedule> {
  const { db } = deps;
  const memberships = await listMemberships(db, accountId);
  const names = new Map(memberships.map((m) => [m.organizationId, m.organizationName]));
  const rows = await listOrganizationEvents(db, [...names.keys()], startOfJstDay(now));
  const ids = rows.map((row) => row.eventId);
  const settings = await listPageSettings(db, ids);
  const statuses = await listAccountStatuses(db, accountId, ids);
  const events: MySchedule["events"] = [];
  for (const row of rows) {
    const setting = settings.get(row.eventId);
    if (setting?.mode !== "self_page") continue;
    const event = await getEventSummary(db, deps.config, row.eventId);
    if (!event) continue;
    events.push({
      event: { id: event.id, name: event.name, startsAt: event.startsAt, venue: event.venue },
      hostName: names.get(row.organizationId) ?? "",
      state: pageStateOf(setting, startsOf(event), now),
      visibility: setting.visibility,
      myStatus: statuses.get(row.eventId) ?? null,
    });
  }
  return { events };
}

/**
 * 案内の同意の一覧（本人だけ）。
 * @param deps 道具
 * @param accountId 本人
 * @returns 一覧
 */
export async function readMyConsents(deps: ApplyDeps, accountId: string): Promise<ConsentList> {
  const consents: ConsentList["consents"] = [];
  for (const row of await listConsents(deps.db, accountId)) {
    const holder: NotifyHolderRef = row.organizationId
      ? { kind: "organization", organizationId: row.organizationId }
      : { kind: "personal", accountId: row.ownerAccountId ?? "" };
    consents.push({
      id: row.id,
      holderName: await holderNameOf(deps.db, holder),
      holderKind: holder.kind,
    });
  }
  return { consents };
}

/**
 * 案内の同意を外す（本人のものだけ）。
 * @param deps 道具
 * @param accountId 本人
 * @param consentId 同意の ID
 * @throws {AppError} 本人のものでない・ないとき（404 BOOKING_CONSENT_NOT_FOUND）
 */
export async function removeMyConsent(
  deps: ApplyDeps,
  accountId: string,
  consentId: string,
): Promise<void> {
  if (!(await deleteConsent(deps.db, accountId, consentId))) {
    throw new AppError(BOOKING_ERRORS.CONSENT_NOT_FOUND);
  }
}

/**
 * .ics を作る（ページと同じ見せる範囲の決まり。research R16）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param viewer 今の利用者（ログインしていなければ null）
 * @param now 今の時刻
 * @returns .ics の本文
 */
export async function readIcs(
  deps: ApplyDeps,
  eventId: string,
  viewer: SessionAccount | null,
  now: Date,
): Promise<string> {
  const context = await loadPage(deps, eventId);
  await assertVisible(deps, context, viewer);
  const { event, hostName } = context;
  return buildIcs(
    {
      eventId: event.id,
      name: event.name,
      startsAt: startsOf(event),
      venue: event.venue,
      description: hostName ? `主催：${hostName}` : "",
      url: applyUrl(deps, event.id),
    },
    now,
  );
}

/**
 * 誰でもの会で、受付中か確かめる（メールで申し込む・確定する）。
 * @param setting 設定
 * @param event 要約
 * @param now 今の時刻
 * @throws {AppError} ページがない（404）・部員だけ（403）・受付中でない（409）とき
 */
function assertEmailOpen(setting: PageSetting, event: EventSummary, now: Date): void {
  if (setting.mode !== "self_page") throw new AppError(BOOKING_ERRORS.PAGE_NOT_FOUND);
  if (setting.visibility !== "public") throw new AppError(BOOKING_ERRORS.PAGE_MEMBERS_ONLY);
  assertOpen(setting, startsOf(event), now);
}

/**
 * メールで申し込む：確認の待ちを作り、確認のメールを送る（答えはいつも同じ。research R10・R11）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param input 名前とメールアドレス
 * @param now 今の時刻
 * @throws {AppError} ページがない（404）・部員だけ（403）・受付中でない（409）・待ちが多すぎる（429）とき
 */
export async function requestEmailApply(
  deps: ApplyDeps,
  eventId: string,
  input: EmailApplyInput,
  now: Date,
): Promise<void> {
  const context = await loadPage(deps, eventId);
  assertEmailOpen(context.setting, context.event, now);
  const token = await deps.db.transaction(async (tx) => {
    // 設定の行を押さえて、待ちの数を順に数える
    assertEmailOpen(await findPageSetting(tx, eventId, true), context.event, now);
    await deleteExpiredRequests(tx, now);
    // 上限は10分の確かめより先に（先に10分を見ると、上限のときに「そのアドレスの待ちがあるか」が答えの違いで分かるため）。
    // 数えるのは直近1時間に作った待ちだけ（上限まで送られても、1時間たてばまた受け付ける。research R11）
    const since = new Date(now.getTime() - EMAIL_REQUEST_WINDOW_MINUTES * MINUTE_MS);
    if ((await countRecentRequests(tx, eventId, since, now)) >= EMAIL_REQUESTS_PER_EVENT_MAX) {
      throw new AppError(BOOKING_ERRORS.EMAIL_REQUEST_LIMIT);
    }
    const latest = await findLatestRequestAt(tx, eventId, input.email);
    // 同じアドレスは10分に1通（送らずに同じ答え。S6・S7）。確定した待ちも残っているので、確定の直後でも縛りは効く
    if (latest && now.getTime() - latest.getTime() < EMAIL_REQUEST_RESEND_MINUTES * MINUTE_MS) {
      return null;
    }
    await deleteRequestsOf(tx, eventId, input.email);
    const created = createToken();
    await insertRequest(tx, {
      eventId,
      name: input.name,
      email: input.email,
      tokenHash: hashToken(created),
      expiresAt: new Date(now.getTime() + EMAIL_REQUEST_TTL_HOURS * HOUR_MS),
      createdAt: now,
    });
    return created;
  });
  if (!token) {
    deps.logger.info({ eventId }, "確認のメールは送り直しの間隔の中なので送りませんでした");
    return;
  }
  const channel = context.holder ? await findChannelByHolder(deps.db, context.holder) : null;
  const { status } = await notifierOf(deps).sendEmail({
    to: input.email,
    fromName: senderName(context.hostName),
    replyTo: channel?.replyToEmail ?? null,
    subject: emailConfirmSubject(context.event.name),
    text: emailConfirmText({
      holderName: context.hostName,
      eventName: context.event.name,
      startsAt: startsOf(context.event),
      venue: context.event.venue,
      url: entryTokenUrl(deps, eventId, token),
      ttlHours: EMAIL_REQUEST_TTL_HOURS,
    }),
  });
  deps.logger.info({ eventId, result: status }, "確認のメール");
}

/**
 * 札の形を確かめて SHA-256 にする。
 * @param token 札
 * @returns SHA-256
 * @throws {AppError} 形が違うとき（404 BOOKING_ENTRY_TOKEN_INVALID）
 */
function tokenHashOf(token: string): string {
  if (!TOKEN_FORMAT.test(token)) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  return hashToken(token);
}

/**
 * 札の SHA-256 から申込みを引く（申込みの札か、待っている打診の返事の札。閉じた打診の札は引かない。booking-004 R8）。
 * @param db DB
 * @param hash 札の SHA-256
 * @param lock 押さえて読むか
 * @returns 申込み（なければ null）
 */
async function entryOfToken(db: Executor, hash: string, lock = false): Promise<SelfEntry | null> {
  return (await tokenOwner(db, hash, lock))?.entry ?? null;
}

/**
 * 札の SHA-256 から申込みと、返事の札で引いたかを読む。
 * @param db DB
 * @param hash 札の SHA-256
 * @param lock 押さえて読むか
 * @returns 申込みと、返事の札か（なければ null）
 */
async function tokenOwner(
  db: Executor,
  hash: string,
  lock = false,
): Promise<{ entry: SelfEntry; viaOffer: boolean } | null> {
  const entry = await findEntryByTokenHash(db, hash, lock);
  if (entry) return { entry, viaOffer: false };
  const entryId = await findEntryIdByOfferToken(db, hash);
  const offered = entryId ? await findSelfEntry(db, entryId, lock) : null;
  return offered ? { entry: offered, viaOffer: true } : null;
}

/**
 * 札のページの答え（申込みがあるとき）。
 * @param deps 道具
 * @param entry 申込み
 * @param now 今の時刻
 * @param linkSpent このリンクを使い終わったか（返事の札で答えた）
 * @returns 札のページ
 * @throws {AppError} 交流会が消えたとき（404 BOOKING_ENTRY_TOKEN_INVALID）
 */
async function entryView(
  deps: ApplyDeps,
  entry: SelfEntry,
  now: Date,
  linkSpent = false,
): Promise<EntryTokenView> {
  const found = await eventLookup(deps)(entry.eventId);
  if (!found) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  const { event, hostName } = found;
  const seats = await loadSeatState(deps.db, entry.eventId, now);
  return {
    state: "entry",
    event: applyEventOf(event),
    hostName,
    name: entry.name,
    entry: {
      status: entry.status,
      // 使い終わった返事の札では取り消せないので、取り消す入口を出さない
      cancellable: !linkSpent && isCancellable(entry.status, startsOf(event), now),
      ...standingOf(seats, entry.id, startsOf(event), now),
    },
    confirmable: false,
    linkSpent,
    calendar: calendarLinks(deps, event, hostName),
  };
}

/**
 * 札のページを読む（確認の前・申込みがある。GET では何も書かない。S5）。
 * @param deps 道具
 * @param token 札
 * @param now 今の時刻
 * @returns 札のページ
 * @throws {AppError} 知らない札（404）・期限切れの確認の札（410）・確認の前の札で部員だけの会（403）のとき
 */
export async function readEntryToken(
  deps: ApplyDeps,
  token: string,
  now: Date,
): Promise<EntryTokenView> {
  const hash = tokenHashOf(token);
  const entry = await entryOfToken(deps.db, hash);
  if (entry) return entryView(deps, entry, now);
  const request = await findRequestByHash(deps.db, hash);
  if (!request) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  if (request.expiresAt.getTime() <= now.getTime()) {
    throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_EXPIRED);
  }
  const found = await eventLookup(deps)(request.eventId);
  if (!found) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  const setting = await findPageSetting(deps.db, request.eventId);
  // 確認の前の札は、まだ申込みではない。誰でもの会のときに頼んだ札でも、主催者が部員だけにしたあとは、
  // 会の中身（日時・場所・会費・カレンダー）を返さない（部員だけの決まりの抜け道にしない。research R8）
  if (setting.visibility !== "public") throw new AppError(BOOKING_ERRORS.PAGE_MEMBERS_ONLY);
  return {
    state: "pending",
    event: applyEventOf(found.event),
    hostName: found.hostName,
    name: request.name,
    entry: null,
    confirmable:
      setting.mode === "self_page" &&
      setting.visibility === "public" &&
      pageStateOf(setting, startsOf(found.event), now) === "open",
    linkSpent: false,
    calendar: calendarLinks(deps, found.event, found.hostName),
  };
}

/**
 * 確認の札で申込みを確定する（2回押しても1行。すでにそのアドレスの申込みがあれば札を替える。満員ならキャンセル待ち。
 * research R10・booking-004 R4）。
 * @param deps 道具
 * @param token 札
 * @param now 今の時刻
 * @returns 札のページ（申込みがある）
 * @throws {AppError} 知らない札（404）・期限切れ（410）・受付中でない（409）・部員だけ（403）のとき
 */
export async function confirmEntryToken(
  deps: ApplyDeps,
  token: string,
  now: Date,
): Promise<EntryTokenView> {
  const hash = tokenHashOf(token);
  const already = await findEntryByTokenHash(deps.db, hash);
  if (already) return entryView(deps, already, now);
  const queue: NoticeQueue = [];
  const outcome = await deps.db.transaction(async (tx) => {
    // 押さえる順は「設定の行 → 待ちの行」（メールで申し込む側と同じ順。逆にするとデッドロックになる）
    const peeked = await findRequestByHash(tx, hash);
    if (peeked) await findPageSetting(tx, peeked.eventId, true);
    const request = await findRequestByHash(tx, hash, true);
    if (!request) {
      // 同時に押された2回目：先に確定したほうの申込みを返す
      const entry = await findEntryByTokenHash(tx, hash);
      if (!entry) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
      return entry;
    }
    if (request.expiresAt.getTime() <= now.getTime()) {
      throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_EXPIRED);
    }
    const context = await eventContext(deps, tx, request.eventId);
    if (!context) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
    const startsAt = startsOf(context.event);
    assertEmailOpen(await findPageSetting(tx, request.eventId, true), context.event, now);
    // 片付け（期限切れ・打診）のあとに、そのアドレスの申込みを読む（期限の切れた打診中を見ないように。booking-004 R9）
    await settleEvent(deps, tx, request.eventId, startsAt, now, queue);
    const existing = await findEntryByContactEmail(tx, request.eventId, request.email, true);
    const placement = placementOf(await loadSeatState(tx, request.eventId, now), startsAt, now);
    let entry: SelfEntry;
    let changed = true;
    if (!existing) {
      entry = await insertSelfEntry(tx, {
        eventId: request.eventId,
        name: request.name,
        accountId: null,
        contactEmail: request.email,
        entryTokenHash: hash,
        status: placement,
      });
    } else if (existing.status === "cancelled") {
      entry = await reconfirmEntry(tx, existing.id, {
        name: request.name,
        entryTokenHash: hash,
        status: placement,
      });
    } else {
      // もう申込みがある：札を新しいものに替える（前のリンクは使えなくなる）。キャンセル待ちで当日の空きなら確定にする
      entry = await replaceEntryToken(tx, existing.id, {
        name: request.name,
        entryTokenHash: hash,
      });
      changed = false;
      if (
        existing.status === "waitlisted" &&
        placement === "confirmed" &&
        isSameDayWindow(now, startsAt)
      ) {
        await setEntryStatus(tx, existing.id, "confirmed");
        entry = { ...entry, status: "confirmed" };
        changed = true;
      }
    }
    // 待ちは消さずに札で引けない形にする（回数の縛りの記録を残す。research R11）
    await consumeRequestsOf(tx, request.eventId, request.email);
    if (changed) {
      const link = entryTokenUrl(deps, request.eventId, token);
      await queueApplied(deps, tx, context, { ...entry, accountId: null }, link, now, queue);
      await settleEvent(deps, tx, request.eventId, startsAt, now, queue);
    }
    return entry;
  });
  await flushNotices(deps, queue);
  return entryView(deps, outcome, now);
}

/**
 * 札で申込みを取り消す（始まりまで。申込みの札か返事の札）。
 * @param deps 道具
 * @param token 札
 * @param now 今の時刻
 * @returns 札のページ
 * @throws {AppError} 知らない札・確認の前の札（404）・始まりを過ぎた（409）とき
 */
export async function cancelEntryToken(
  deps: ApplyDeps,
  token: string,
  now: Date,
): Promise<EntryTokenView> {
  const hash = tokenHashOf(token);
  const own = await entryOfToken(deps.db, hash);
  const event = own ? await getEventSummary(deps.db, deps.config, own.eventId) : null;
  if (!own || !event) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  const queue: NoticeQueue = [];
  const entry = await deps.db.transaction((tx) =>
    cancelIfOpen(deps, tx, own, startsOf(event), now, queue),
  );
  await flushNotices(deps, queue);
  return entryView(deps, entry, now);
}

/**
 * 札で打診に答える（参加・辞退。当日の空きの「参加する」も。申込みの札か返事の札。booking-004 R8）。
 * @param deps 道具
 * @param token 札
 * @param answer 参加する・辞退する
 * @param now 今の時刻
 * @returns 札のページ
 * @throws {AppError} 知らない札（404）・期限の後（410）・打診中でない（409）・埋まった（409）とき
 */
export async function respondEntryToken(
  deps: ApplyDeps,
  token: string,
  answer: "accept" | "decline",
  now: Date,
): Promise<EntryTokenView> {
  const hash = tokenHashOf(token);
  const found = await tokenOwner(deps.db, hash);
  if (!found) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  const own = found.entry;
  // 返事の札は打診を閉じると使えなくなるので、確定の知らせには入れない（申込みのときのメールのリンクがそのまま使える）
  await respondToOffer(
    deps,
    own.eventId,
    own.id,
    answer,
    now,
    found.viaOffer ? null : entryTokenUrl(deps, own.eventId, token),
  );
  const after = await findSelfEntry(deps.db, own.id);
  if (!after) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  // 返事の札で答えたら、打診が閉じて札は使えなくなる（この答えが、その札で読める最後の答え）
  return entryView(deps, after, now, found.viaOffer && after.status !== "offered");
}
