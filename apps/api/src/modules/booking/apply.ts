// 自前の申込みページの業務（booking-003。PRD FR-B40〜B47・research R1〜R19）：申込みページの答え・LINE ログインで申し込む・
// 取り消す・自分の申込み・部の予定・案内の同意・メールで申し込む（確認の待ちと札）・.ics。
// 交流会は event の index.ts（getEventSummary・getEventRole・listOrganizationEvents）、組織は suite、表示名は account から引く（AD-3）。
// 「受付中」は使い方が自前・受付を開いている・始まりの前を読むときに決める（始まりを過ぎたら自動で閉じる。research R1）。
// 部員だけの回は、主催者と部員のほかに中身を返さない（research R8）。書く窓口は設定の行を押さえて受付中かを決め直す（S8・S14）。
// 名前・メールアドレス・札はログに出さない。確定したら sendNotice（確定）を呼び、知らせが送れなくても申込みは成り立つ（R12）。
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
  EMAIL_REQUEST_RESEND_MINUTES,
  EMAIL_REQUEST_TTL_HOURS,
  googleCalendarUrl,
} from "@workspace/contracts/booking";
import { endOfJstDate, jstDate, participantPaths } from "@workspace/contracts/core";
import type { EventSummary } from "@workspace/contracts/event";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { SessionAccount } from "../account/index.ts";
import { findDisplayNames } from "../account/index.ts";
import { getEventRole, getEventSummary, listOrganizationEvents } from "../event/index.ts";
import { listMemberships } from "../suite/index.ts";
import {
  cancelEntryRow,
  countActiveRequests,
  deleteConsent,
  deleteExpiredRequests,
  deleteRequestsOf,
  findAccountEntry,
  findEntryByContactEmail,
  findEntryByTokenHash,
  findLatestAccountEntryName,
  findLatestRequestAt,
  findOwnEntry,
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
import { eventNotifyHolder, sendNotice } from "./notify.ts";
import { findChannelByHolder, findContactEmail, findLinkedLineUser } from "./notify-repository.ts";
import type { NotifyHolderRef } from "./notify-repository.ts";
import { holderNameOf, notifierOf } from "./notify-settings.ts";
import type { NotifyDeps } from "./notify-settings.ts";
import { TOKEN_FORMAT, createToken, hashToken } from "./tokens.ts";

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
 * @returns 受付中・閉じている・始まりを過ぎた
 */
export function pageStateOf(setting: PageSetting, startsAt: Date, now: Date): PageState {
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
 * 申込みページの URL（知らせ・カレンダーの説明に入れる。API は LIFF ID を知らないので画面の源＋道）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @returns URL
 */
function applyUrl(deps: Pick<ApplyDeps, "config">, eventId: string): string {
  return `${deps.config.webUrl}${participantPaths.apply(eventId)}`;
}

/**
 * カレンダーに追加のリンク。
 * @param deps 道具
 * @param event 要約
 * @param hostName 主催の名前
 * @returns Google のリンクと .ics の道
 */
function calendarLinks(deps: Pick<ApplyDeps, "config">, event: EventSummary, hostName: string) {
  const details = [hostName ? `主催：${hostName}` : "", applyUrl(deps, event.id)]
    .filter(Boolean)
    .join("\n");
  return {
    googleUrl: googleCalendarUrl({
      name: event.name,
      startsAt: event.startsAt,
      venue: event.venue,
      details,
    }),
    icsPath: `/api/v1/booking/events/${event.id}/calendar`,
  };
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

/**
 * 本人の申込みの答え。
 * @param entry 申込み
 * @param startsAt 始まり
 * @param now 今の時刻
 * @returns 答え
 */
function toMyEntry(entry: SelfEntry, startsAt: Date, now: Date): MyEntry {
  return {
    id: entry.id,
    name: entry.name,
    status: entry.status,
    appliedAt: entry.appliedAt.toISOString(),
    cancellable: entry.status === "confirmed" && now.getTime() < startsAt.getTime(),
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
 * @param deps 道具
 * @param context 申込みページ
 * @param viewer 今の利用者（ログインしていなければ null）
 * @throws {AppError} 見られないとき（403 BOOKING_PAGE_MEMBERS_ONLY）
 */
async function assertVisible(
  deps: ApplyDeps,
  context: PageContext,
  viewer: SessionAccount | null,
): Promise<void> {
  if (context.setting.visibility !== "members") return;
  if (!viewer) throw new AppError(BOOKING_ERRORS.PAGE_MEMBERS_ONLY);
  const role = await getEventRole(deps.db, deps.config, context.event.id, viewer);
  if (role !== "organizer" && role !== "member") {
    throw new AppError(BOOKING_ERRORS.PAGE_MEMBERS_ONLY);
  }
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
  const base = {
    event: applyEventOf(event),
    hostName: context.hostName,
    state: pageStateOf(context.setting, startsOf(event), now),
    visibility: context.setting.visibility,
    calendar: calendarLinks(deps, event, context.hostName),
    lineFriendUrl: channel?.basicId
      ? `https://line.me/R/ti/p/${encodeURIComponent(channel.basicId)}`
      : null,
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
      myEntry: entry ? toMyEntry(entry, startsOf(event), now) : null,
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
 * 確定の知らせを送る（送れなくても申込みは成り立つ。例外はログに出す。research R12）。
 * @param deps 道具
 * @param entryId 申込みの ID
 * @param links 申込みを見る・取り消すリンクと、カレンダーのリンク
 * @param links.entry 申込みを見る・取り消すリンク
 * @param links.calendar Google カレンダーのリンク
 */
async function notifyConfirmed(
  deps: ApplyDeps,
  entryId: string,
  links: { entry: string; calendar: string },
): Promise<void> {
  try {
    await sendNotice(deps, { entryId, kind: "confirmed", links });
  } catch (error) {
    deps.logger.warn(
      { entryId, errorName: error instanceof Error ? error.name : "unknown" },
      "確定の知らせを送れませんでした",
    );
  }
}

/**
 * LINE ログインで申し込む（1交流会1人1つ。取り消しなら確定に戻す。research R4・R5）。
 * @param deps 道具
 * @param eventId 交流会の ID
 * @param viewer 今の利用者
 * @param input 名前と案内の同意
 * @param now 今の時刻
 * @returns 答えと、新しく確定にしたか（201 にする）
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
  const { entry, created } = await deps.db.transaction(async (tx) => {
    // 設定の行を押さえて、受付中かを決め直す（同時の申込み・閉じた直後を順に流す。S8・S14）
    const setting = await findPageSetting(tx, eventId, true);
    if (setting.mode !== "self_page") throw new AppError(BOOKING_ERRORS.PAGE_NOT_FOUND);
    if (pageStateOf(setting, startsOf(context.event), now) !== "open") {
      throw new AppError(BOOKING_ERRORS.PAGE_CLOSED);
    }
    const existing = await findAccountEntry(tx, eventId, me, true);
    if (input.consent && context.holder) await insertConsent(tx, me, context.holder);
    if (existing?.status === "confirmed") return { entry: existing, created: false };
    const next = existing
      ? await reconfirmEntry(tx, existing.id, { name: input.name })
      : await insertSelfEntry(tx, {
          eventId,
          name: input.name,
          accountId: me,
          contactEmail: null,
          entryTokenHash: null,
        });
    return { entry: next, created: true };
  });
  if (created) {
    await notifyConfirmed(deps, entry.id, {
      entry: applyUrl(deps, eventId),
      calendar: calendarLinks(deps, context.event, context.hostName).googleUrl,
    });
  }
  return {
    result: {
      entry: toMyEntry(entry, startsOf(context.event), now),
      page: await buildPage(deps, context, viewer, now),
    },
    created,
  };
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

/**
 * 自分の申込みの一覧の1行。
 * @param entry 申込み
 * @param found 交流会と主催
 * @param found.event 交流会の要約
 * @param found.hostName 主催の名前
 * @param now 今の時刻
 * @returns 1行
 */
function toMyEntryItem(
  entry: SelfEntry,
  found: { event: EventSummary; hostName: string },
  now: Date,
): MyEntryItem {
  const { event, hostName } = found;
  return {
    entryId: entry.id,
    status: entry.status,
    cancellable: toMyEntry(entry, startsOf(event), now).cancellable,
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
  const items: MyEntryItem[] = [];
  for (const entry of await listAccountEntries(deps.db, accountId)) {
    const found = await lookup(entry.eventId);
    if (!found || endOfJstDate(found.event.startsAt).getTime() <= now.getTime()) continue;
    items.push(toMyEntryItem(entry, found, now));
  }
  return items.sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
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
  const entry = await deps.db.transaction(async (tx) => {
    const own = await findOwnEntry(tx, accountId, entryId, true);
    const found = own ? await lookup(own.eventId) : null;
    if (!own || !found) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
    return cancelIfOpen(tx, own, startsOf(found.event), now);
  });
  const found = await lookup(entry.eventId);
  if (!found) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
  return toMyEntryItem(entry, found, now);
}

/**
 * 始まりの前なら取り消しにする（もう取り消しなら、そのまま）。
 * @param tx トランザクション
 * @param entry 押さえた申込み
 * @param startsAt 始まり
 * @param now 今の時刻
 * @returns 取り消したあとの申込み
 * @throws {AppError} 始まりを過ぎたとき（409 BOOKING_CANCEL_CLOSED）
 */
async function cancelIfOpen(
  tx: Executor,
  entry: SelfEntry,
  startsAt: Date,
  now: Date,
): Promise<SelfEntry> {
  if (entry.status === "cancelled") return entry;
  if (startsAt.getTime() <= now.getTime()) throw new AppError(BOOKING_ERRORS.CANCEL_CLOSED);
  return cancelEntryRow(tx, entry.id);
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
  if (pageStateOf(setting, startsOf(event), now) !== "open") {
    throw new AppError(BOOKING_ERRORS.PAGE_CLOSED);
  }
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
    await deleteExpiredRequests(tx, eventId, now);
    const latest = await findLatestRequestAt(tx, eventId, input.email);
    // 同じアドレスは10分に1通（送らずに同じ答え。S6・S7）
    if (latest && now.getTime() - latest.getTime() < EMAIL_REQUEST_RESEND_MINUTES * MINUTE_MS) {
      return null;
    }
    if ((await countActiveRequests(tx, eventId, now)) >= EMAIL_REQUESTS_PER_EVENT_MAX) {
      throw new AppError(BOOKING_ERRORS.EMAIL_REQUEST_LIMIT);
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
      url: `${deps.config.webUrl}${participantPaths.entry(eventId, token)}`,
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
 * 札のページの答え（申込みがあるとき）。
 * @param deps 道具
 * @param entry 申込み
 * @param now 今の時刻
 * @returns 札のページ
 * @throws {AppError} 交流会が消えたとき（404 BOOKING_ENTRY_TOKEN_INVALID）
 */
async function entryView(deps: ApplyDeps, entry: SelfEntry, now: Date): Promise<EntryTokenView> {
  const found = await eventLookup(deps)(entry.eventId);
  if (!found) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  const { event, hostName } = found;
  return {
    state: "entry",
    event: applyEventOf(event),
    hostName,
    name: entry.name,
    entry: {
      status: entry.status,
      cancellable: toMyEntry(entry, startsOf(event), now).cancellable,
    },
    confirmable: false,
    calendar: calendarLinks(deps, event, hostName),
  };
}

/**
 * 札のページを読む（確認の前・申込みがある。GET では何も書かない。S5）。
 * @param deps 道具
 * @param token 札
 * @param now 今の時刻
 * @returns 札のページ
 * @throws {AppError} 知らない札（404）・期限切れの確認の札（410）のとき
 */
export async function readEntryToken(
  deps: ApplyDeps,
  token: string,
  now: Date,
): Promise<EntryTokenView> {
  const hash = tokenHashOf(token);
  const entry = await findEntryByTokenHash(deps.db, hash);
  if (entry) return entryView(deps, entry, now);
  const request = await findRequestByHash(deps.db, hash);
  if (!request) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  if (request.expiresAt.getTime() <= now.getTime()) {
    throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_EXPIRED);
  }
  const found = await eventLookup(deps)(request.eventId);
  if (!found) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
  const setting = await findPageSetting(deps.db, request.eventId);
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
    calendar: calendarLinks(deps, found.event, found.hostName),
  };
}

/**
 * 確認の札で申込みを確定する（2回押しても1行。すでにそのアドレスの申込みがあれば札を替える。research R10）。
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
  const outcome = await deps.db.transaction(async (tx) => {
    const request = await findRequestByHash(tx, hash, true);
    if (!request) {
      // 同時に押された2回目：先に確定したほうの申込みを返す
      const entry = await findEntryByTokenHash(tx, hash);
      if (!entry) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
      return { entry, changed: false };
    }
    if (request.expiresAt.getTime() <= now.getTime()) {
      throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_EXPIRED);
    }
    const event = await getEventSummary(tx, deps.config, request.eventId);
    if (!event) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
    assertEmailOpen(await findPageSetting(tx, request.eventId, true), event, now);
    const existing = await findEntryByContactEmail(tx, request.eventId, request.email, true);
    let entry: SelfEntry;
    let changed = true;
    if (!existing) {
      entry = await insertSelfEntry(tx, {
        eventId: request.eventId,
        name: request.name,
        accountId: null,
        contactEmail: request.email,
        entryTokenHash: hash,
      });
    } else if (existing.status === "cancelled") {
      entry = await reconfirmEntry(tx, existing.id, { name: request.name, entryTokenHash: hash });
    } else {
      // もう確定：札を新しいものに替える（前のリンクは使えなくなる）
      entry = await replaceEntryToken(tx, existing.id, {
        name: request.name,
        entryTokenHash: hash,
      });
      changed = false;
    }
    await deleteRequestsOf(tx, request.eventId, request.email);
    return { entry, changed };
  });
  const view = await entryView(deps, outcome.entry, now);
  if (outcome.changed) {
    await notifyConfirmed(deps, outcome.entry.id, {
      entry: `${deps.config.webUrl}${participantPaths.entry(outcome.entry.eventId, token)}`,
      calendar: view.calendar.googleUrl,
    });
  }
  return view;
}

/**
 * 札で申込みを取り消す（始まりまで）。
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
  const entry = await deps.db.transaction(async (tx) => {
    const own = await findEntryByTokenHash(tx, hash, true);
    const event = own ? await getEventSummary(tx, deps.config, own.eventId) : null;
    if (!own || !event) throw new AppError(BOOKING_ERRORS.ENTRY_TOKEN_INVALID);
    return cancelIfOpen(tx, own, startsOf(event), now);
  });
  return entryView(deps, entry, now);
}
