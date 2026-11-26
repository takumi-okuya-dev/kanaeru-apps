// 予約の窓口（使い方・名簿・取り込み・列の対応・書き出し・名簿に当てる・飛び入り。booking-001 contracts）。
// 道はすべて createRoute で書き、道の頭は /api/v1/booking/events/{eventId}（AD-23）。どの道もログインが要る（account の
// requireSession）と、event の requireEventRole（主催者・受付係。要求のたびに役目を引く。AD-5）。
// 使い方が「受付だけ」の交流会では、使い方のほかの窓口は 409 BOOKING_ROSTER_OFF（名簿は消さずに隠す。research R1）。
// 自前で申込みを受ける交流会（booking-003）でも名簿の窓口は使える。申込みページの受付と見せる範囲は self-page で変える。
// チェックインは reception の index.ts（listEventAttendees・getCheckin・createManualCheckin）でだけ読み書きする（AD-3・AD-23）。
// 名簿を書く窓口は、交流会の設定の行を押さえたトランザクションの中で決め直す（同時に押しても二重にならない）。名前はログに出さない。
// 定員とキャンセル待ち（booking-004）：設定の答えに定員・枠・席の内訳・中止・変更を足し、状態を変える・手で足す・取り込みのあとは
// 片付け（waitlist.ts の settleEvent）で空いた席をキャンセル待ちに回す。定員・手で打診・中止・変更は routes-waitlist.ts。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/booking";
import { BOOKING_ERRORS, usesRoster } from "@workspace/contracts/booking";
import { EVENT_ERRORS } from "@workspace/contracts/event";
import * as reception from "@workspace/contracts/reception";
import { normalizeCheckinName } from "@workspace/contracts/reception";
import type { Executor } from "../../kernel/db.ts";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { csvAttachment, invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { isUniqueViolation } from "../../kernel/pg-errors.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import {
  eventForbiddenResponse,
  eventNotFoundResponse,
  findEventOrganizationId,
  findEventOwnerAccountId,
  requireEventRole,
} from "../event/index.ts";
import { createManualCheckin, getCheckin, listEventAttendees } from "../reception/index.ts";
import type { CheckinRecord } from "../reception/index.ts";
import { findPageSetting, savePageSetting } from "./apply-repository.ts";
import {
  eventContext,
  flushNotices,
  hasWaitingEntries,
  markNotified,
  queueApplied,
  setStatusByOrganizer,
  settleEvent,
} from "./waitlist.ts";
import type { NoticeQueue } from "./waitlist.ts";
import { closePendingOffer, findWaitlistSetting } from "./waitlist-repository.ts";
import { buildRosterCsv } from "./csv.ts";
import { planImport } from "./importing.ts";
import { resolveMatches } from "./matching.ts";
import {
  findEntry,
  findMode,
  insertDismissal,
  insertEntries,
  insertEntry,
  listDismissals,
  listEntries,
  listEntriesForImport,
  listImportMappings,
  lockMode,
  markEntryMerged,
  saveImportMapping,
  saveMode,
  updateEntry,
} from "./repository.ts";
import type { EntryRecord } from "./repository.ts";
import { readRosterEntryView, readRosterView, readSettingView } from "./setting-view.ts";
import { buildMatchBoard } from "./views.ts";

/** 使い方（文書の名前つき）。 */
const BookingSetting = contract.BookingSetting.openapi("BookingSetting");
/** 使い方を変える入力。 */
const BookingSettingInput = contract.BookingSettingInput.openapi("BookingSettingInput", {
  example: { mode: "roster" },
});
/** 名簿。 */
const Roster = contract.Roster.openapi("BookingRoster");
/** 名簿の行。 */
const RosterEntry = contract.RosterEntry.openapi("BookingRosterEntry");
/** 申込みページの設定を変える入力（booking-003）。 */
const SelfPageInput = contract.SelfPageInput.openapi("BookingSelfPageInput", {
  example: { accepting: true, visibility: "public" },
});
/** 1人足す入力。 */
const RosterEntryInput = contract.RosterEntryInput.openapi("BookingRosterEntryInput", {
  example: { name: "山田 花子", applicationSource: "other", memo: "電話で申込み" },
});
/** 状態を変える入力。 */
const RosterStatusInput = contract.RosterStatusInput.openapi("BookingRosterStatusInput");
/** まとめる入力。 */
const RosterMergeInput = contract.RosterMergeInput.openapi("BookingRosterMergeInput");
/** 取り込みの入力。 */
const RosterImportInput = contract.RosterImportInput.openapi("BookingRosterImportInput", {
  example: {
    applicationSource: "other",
    rows: [
      { line: 2, name: "山田 花子" },
      { line: 3, name: "" },
    ],
    mapping: { headers: ["タイムスタンプ", "お名前"], nameColumn: "お名前" },
  },
});
/** 取り込みの見積もり。 */
const RosterImportPreview = contract.RosterImportPreview.openapi("BookingRosterImportPreview");
/** 取り込んだ結果。 */
const RosterImportResult = contract.RosterImportResult.openapi("BookingRosterImportResult");
/** 列の対応。 */
const ImportMappingList = contract.ImportMappingList.openapi("BookingImportMappingList");
/** 受付係の画面。 */
const MatchBoard = contract.MatchBoard.openapi("BookingMatchBoard");
/** 当てる・ちがう人の入力。 */
const MatchInput = contract.MatchInput.openapi("BookingMatchInput");
/** 手でのチェックインの入力（受付と同じ形）。 */
const CheckinInput = reception.CheckinInput.openapi("BookingCheckinInput");

/** 道の eventId。 */
const EventParams = z.object({ eventId: uuidParam("eventId", "交流会の ID") });
/** 道の eventId と entryId。 */
const EntryParams = z.object({
  eventId: uuidParam("eventId", "交流会の ID"),
  entryId: uuidParam("entryId", "名簿の行の ID"),
});
/** 道の eventId と checkinId。 */
const CheckinParams = z.object({
  eventId: uuidParam("eventId", "交流会の ID"),
  checkinId: uuidParam("checkinId", "チェックインの ID"),
});

/** 名簿を使っていない応答。 */
const rosterOffResponse = domainErrorResponse(
  BOOKING_ERRORS.ROSTER_OFF,
  "使い方が「受付だけ」の交流会（名簿は消さずに隠している）",
);
/** 行がない応答。 */
const entryNotFoundResponse = domainErrorResponse(
  BOOKING_ERRORS.ENTRY_NOT_FOUND,
  "その交流会に名簿の行がない（まとめられた・別の交流会の ID）か、交流会がない",
);
/** チェックインがない応答。 */
const checkinNotFoundResponse = domainErrorResponse(
  BOOKING_ERRORS.CHECKIN_NOT_FOUND,
  "その交流会にチェックインがない（取り消された・別の交流会の ID）か、名簿の行がない・交流会がない",
);
/** 当てられない応答。 */
const matchConflictResponse = domainErrorResponse(
  BOOKING_ERRORS.ENTRY_NOT_MATCHABLE,
  "当てられない（取り消しの行・もう当たっている行かチェックイン・手で当てたものでない）か、名簿を使っていない",
);

/** まとめられない応答。 */
const mergeConflictResponse = domainErrorResponse(
  BOOKING_ERRORS.MERGE_BOTH_MATCHED,
  "2つの行がどちらもチェックインに当たっている・どちらも本人の申込み（LINE かメール）である（別の人かもしれない）か、名簿を使っていない",
);

/**
 * JSON の応答の書き方。
 * @param schema 本文の形
 * @param description いつ返すか
 * @returns OpenAPI の応答の定義
 */
function json<T>(schema: T, description: string) {
  return { description, content: { "application/json": { schema } } } as const;
}

/**
 * JSON の本文の書き方。
 * @param schema 本文の形
 * @returns OpenAPI の本文の定義
 */
function body<T>(schema: T) {
  return { required: true, content: { "application/json": { schema } } } as const;
}

/**
 * 予約の窓口の道の定義（middleware に deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const organizerOrStaff = requireEventRole(deps, ["organizer", "staff"]);
  const organizerOnly = requireEventRole(deps, ["organizer"]);
  const tags = ["booking"];
  const base = "/api/v1/booking/events/{eventId}";
  const errors = {
    401: unauthenticatedResponse,
    403: eventForbiddenResponse,
    404: eventNotFoundResponse,
  } as const;
  const rosterErrors = { ...errors, 409: rosterOffResponse } as const;
  return {
    getSetting: createRoute({
      method: "get",
      path: `${base}/setting`,
      tags,
      operationId: "bookingGetSetting",
      summary: "交流会の使い方と名簿の行の数（主催者・受付係。行がなければ受付だけ）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EventParams },
      responses: { 200: json(BookingSetting, "使い方"), ...errors },
    }),
    putSetting: createRoute({
      method: "put",
      path: `${base}/setting`,
      tags,
      operationId: "bookingPutSetting",
      summary: "交流会の使い方を変える（主催者だけ。受付だけに戻しても名簿は消さずに隠す）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams, body: body(BookingSettingInput) },
      responses: {
        200: json(BookingSetting, "変えた使い方"),
        400: invalidInputResponse,
        ...errors,
        409: domainErrorResponse(
          BOOKING_ERRORS.WAITLIST_ACTIVE,
          "キャンセル待ち・打診中の人がいるのに、自前でない使い方にしようとした",
        ),
      },
    }),
    putSelfPage: createRoute({
      method: "put",
      path: `${base}/self-page`,
      tags,
      operationId: "bookingPutSelfPage",
      summary:
        "申込みページの受付を開く・閉じると見せる範囲を変える（主催者だけ。使い方が自前のときだけ。booking-003）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams, body: body(SelfPageInput) },
      responses: {
        200: json(BookingSetting, "変えた設定"),
        400: {
          description:
            "入力の誤り・組織に入れていないのに部員だけ（BOOKING_VISIBILITY_NEEDS_ORGANIZATION）",
          content: invalidInputResponse.content,
        },
        ...errors,
        409: domainErrorResponse(BOOKING_ERRORS.SELF_PAGE_OFF, "使い方が自前でない"),
      },
    }),
    getRoster: createRoute({
      method: "get",
      path: `${base}/entries`,
      tags,
      operationId: "bookingGetRoster",
      summary: "名簿（主催者・受付係。申し込んだ日時の古い順・人数・来たか・同じ名前の印つき）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EventParams },
      responses: { 200: json(Roster, "名簿"), ...rosterErrors },
    }),
    addEntry: createRoute({
      method: "post",
      path: `${base}/entries`,
      tags,
      operationId: "bookingAddEntry",
      summary: "名簿に1人足す（主催者・受付係。入口は手で足す。入れた人を記録する）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EventParams, body: body(RosterEntryInput) },
      responses: {
        201: json(RosterEntry, "足した行"),
        400: invalidInputResponse,
        ...rosterErrors,
      },
    }),
    setStatus: createRoute({
      method: "put",
      path: `${base}/entries/{entryId}/status`,
      tags,
      operationId: "bookingSetEntryStatus",
      summary: "名簿の行を取り消す・戻す（主催者だけ）",
      middleware: [session, organizerOnly] as const,
      request: { params: EntryParams, body: body(RosterStatusInput) },
      responses: {
        200: json(RosterEntry, "直した行"),
        400: invalidInputResponse,
        ...rosterErrors,
        404: entryNotFoundResponse,
      },
    }),
    merge: createRoute({
      method: "post",
      path: `${base}/entries/merge`,
      tags,
      operationId: "bookingMergeEntries",
      summary:
        "同じ名前の2つの行をまとめる（主催者だけ。まとめる行の当て・アカウント・メモを残す行へ移し、まとめる行は名簿から隠す）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams, body: body(RosterMergeInput) },
      responses: {
        200: json(RosterEntry, "残した行"),
        400: invalidInputResponse,
        ...rosterErrors,
        404: entryNotFoundResponse,
        409: mergeConflictResponse,
      },
    }),
    previewImport: createRoute({
      method: "post",
      path: `${base}/entries/import/preview`,
      tags,
      operationId: "bookingPreviewImport",
      summary: "取り込む前の見積もり（主催者だけ。書かない。ファイルは送らず、名前の列だけを送る）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams, body: body(RosterImportInput) },
      responses: {
        200: json(RosterImportPreview, "行ごとの結果と人数"),
        400: invalidInputResponse,
        ...rosterErrors,
      },
    }),
    runImport: createRoute({
      method: "post",
      path: `${base}/entries/import`,
      tags,
      operationId: "bookingImport",
      summary:
        "名簿に取り込む（主催者だけ。同じものをもう一度取り込んでも増えない。mapping があれば持ち主の列の対応を覚える）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams, body: body(RosterImportInput) },
      responses: {
        200: json(RosterImportResult, "入った・すでにある・名前が空の数"),
        400: invalidInputResponse,
        ...rosterErrors,
      },
    }),
    listMappings: createRoute({
      method: "get",
      path: `${base}/import-mappings`,
      tags,
      operationId: "bookingListImportMappings",
      summary: "交流会の持ち主が覚えた CSV の列の対応（主催者だけ。新しく覚えた順）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams },
      responses: { 200: json(ImportMappingList, "列の対応"), ...rosterErrors },
    }),
    exportCsv: createRoute({
      method: "get",
      path: `${base}/entries/export`,
      tags,
      operationId: "bookingExportRoster",
      summary: "名簿の CSV（主催者だけ。UTF-8 の BOM つき・申し込んだ日時の古い順）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams },
      responses: {
        200: {
          description: "名簿の CSV",
          content: { "text/csv": { schema: z.string().openapi({ format: "binary" }) } },
        },
        ...rosterErrors,
      },
    }),
    getMatches: createRoute({
      method: "get",
      path: `${base}/matches`,
      tags,
      operationId: "bookingGetMatches",
      summary: "名簿に当てる画面（主催者・受付係。チェックインごとの当て・名簿から選べる行・人数）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EventParams },
      responses: { 200: json(MatchBoard, "受付係の画面"), ...rosterErrors },
    }),
    match: createRoute({
      method: "post",
      path: `${base}/checkins/{checkinId}/match`,
      tags,
      operationId: "bookingMatch",
      summary: "チェックインを名簿の行に当てる（主催者・受付係。候補を当てる・名簿から選ぶ）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: CheckinParams, body: body(MatchInput) },
      responses: {
        200: json(MatchBoard, "当てたあとの画面"),
        400: invalidInputResponse,
        ...errors,
        404: checkinNotFoundResponse,
        409: matchConflictResponse,
      },
    }),
    dismiss: createRoute({
      method: "post",
      path: `${base}/checkins/{checkinId}/dismiss`,
      tags,
      operationId: "bookingDismiss",
      summary: "候補を「ちがう人」にする（主催者・受付係。その組を候補に出さない）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: CheckinParams, body: body(MatchInput) },
      responses: {
        200: json(MatchBoard, "ちがう人にしたあとの画面"),
        400: invalidInputResponse,
        ...errors,
        404: checkinNotFoundResponse,
        409: rosterOffResponse,
      },
    }),
    walkInFromCheckin: createRoute({
      method: "post",
      path: `${base}/checkins/{checkinId}/walk-in`,
      tags,
      operationId: "bookingWalkInFromCheckin",
      summary:
        "当たらないチェックインを飛び入りの行にして当てる（主催者・受付係。名前と媒体を写す）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: CheckinParams },
      responses: {
        201: json(MatchBoard, "飛び入りにしたあとの画面"),
        ...errors,
        404: checkinNotFoundResponse,
        409: matchConflictResponse,
      },
    }),
    unmatch: createRoute({
      method: "delete",
      path: `${base}/entries/{entryId}/match`,
      tags,
      operationId: "bookingUnmatch",
      summary: "手で当てたものを外す（主催者・受付係。同じアカウントの自動の当ては外せない）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EntryParams },
      responses: {
        200: json(MatchBoard, "外したあとの画面"),
        ...errors,
        404: entryNotFoundResponse,
        409: matchConflictResponse,
      },
    }),
    checkInEntry: createRoute({
      method: "post",
      path: `${base}/entries/{entryId}/checkin`,
      tags,
      operationId: "bookingCheckInEntry",
      summary: "名簿から選んで手でチェックインし、その行に当てる（主催者・受付係）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EntryParams, body: body(CheckinInput) },
      responses: {
        201: json(MatchBoard, "チェックインしたあとの画面"),
        400: invalidInputResponse,
        ...errors,
        404: entryNotFoundResponse,
        409: matchConflictResponse,
      },
    }),
    walkIn: createRoute({
      method: "post",
      path: `${base}/walk-ins`,
      tags,
      operationId: "bookingWalkIn",
      summary: "名簿にいない人を手でチェックインし、飛び入りの行を足す（主催者・受付係）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EventParams, body: body(CheckinInput) },
      responses: {
        201: json(MatchBoard, "チェックインしたあとの画面"),
        400: invalidInputResponse,
        ...rosterErrors,
      },
    }),
  };
}

/**
 * 名簿を使う交流会か確かめる（受付だけなら 409）。
 * @param db DB（トランザクションなら押さえて読む）
 * @param eventId 交流会の ID
 * @param lock 設定の行を押さえるか
 * @throws {AppError} 名簿を使っていないとき（BOOKING_ROSTER_OFF）
 */
async function requireRoster(db: Executor, eventId: string, lock = false): Promise<void> {
  const mode = lock ? await lockMode(db, eventId) : await findMode(db, eventId);
  // 名簿を使う・自前で申込みを受けるのどちらでも名簿を使う（booking-003 research R1）
  if (!usesRoster(mode)) throw new AppError(BOOKING_ERRORS.ROSTER_OFF);
}

/**
 * その交流会のチェックインを読む（ほかの交流会のものは無いのと同じ）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param checkinId チェックインの ID
 * @returns チェックイン
 * @throws {AppError} ないとき（BOOKING_CHECKIN_NOT_FOUND）
 */
async function checkinOfEvent(
  db: Executor,
  eventId: string,
  checkinId: string,
): Promise<CheckinRecord> {
  const record = await getCheckin(db, checkinId);
  if (!record || record.eventId !== eventId) throw new AppError(BOOKING_ERRORS.CHECKIN_NOT_FOUND);
  return record;
}

/**
 * その交流会の名簿の行を読む。
 * @param db DB
 * @param eventId 交流会の ID
 * @param entryId 行の ID
 * @returns 行
 * @throws {AppError} ないとき（BOOKING_ENTRY_NOT_FOUND）
 */
async function entryOfEvent(db: Executor, eventId: string, entryId: string): Promise<EntryRecord> {
  const entry = await findEntry(db, eventId, entryId);
  if (!entry) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
  return entry;
}

/**
 * その交流会の今の当てを読む。
 * @param db DB
 * @param eventId 交流会の ID
 * @returns 名簿・チェックイン・ちがう人の組と当て
 */
async function currentMatches(db: Executor, eventId: string) {
  // トランザクションの中でも呼ぶので、1つの接続に命令を重ねないよう順に読む
  const entries = await listEntries(db, eventId);
  const attendees = await listEventAttendees(db, eventId);
  const dismissals = await listDismissals(db, eventId);
  return { entries, attendees, dismissals, ...resolveMatches(entries, attendees, dismissals) };
}

/**
 * 本人の申込みの行か（自前のページで LINE ログインして申し込んだアカウント、またはメールで申し込んだ人の連絡と札を持つ）。
 * @param entry 名簿の行
 * @returns 本人の申込みなら true
 */
function isSelfApplied(
  entry: Pick<EntryRecord, "accountId" | "contactEmail" | "entryTokenHash">,
): boolean {
  return entry.accountId !== null || entry.contactEmail !== null || entry.entryTokenHash !== null;
}

/**
 * 行に新しく当てられるか確かめる（確定で、手でも自動でも当たっていない）。
 * @param state 今の当て
 * @param state.byEntry 行ごとの当て
 * @param entry 行
 * @throws {AppError} 当てられないとき（BOOKING_ENTRY_NOT_MATCHABLE）
 */
function assertEntryOpen(
  state: { byEntry: ReadonlyMap<string, unknown> },
  entry: EntryRecord,
): void {
  if (entry.status !== "confirmed" || entry.checkinId || state.byEntry.has(entry.id)) {
    throw new AppError(BOOKING_ERRORS.ENTRY_NOT_MATCHABLE);
  }
}

/**
 * チェックインが、まだどの行にも当たっていないか確かめる。
 * @param state 今の当て
 * @param state.byCheckin チェックインごとの当て
 * @param checkinId チェックインの ID
 * @throws {AppError} もう当たっているとき（BOOKING_CHECKIN_ALREADY_MATCHED）
 */
function assertCheckinOpen(
  state: { byCheckin: ReadonlyMap<string, { state: contract.MatchState }> },
  checkinId: string,
): void {
  const current = state.byCheckin.get(checkinId)?.state;
  if (current && current !== "candidate" && current !== "unmatched") {
    throw new AppError(BOOKING_ERRORS.CHECKIN_ALREADY_MATCHED);
  }
}

/**
 * 一意の制約の違反（同じチェックインがほかの行に当たった）を、領域のエラーに読みかえる。
 * @param error 投げられたもの
 * @returns 読みかえたもの（ほかの誤りはそのまま）
 */
function asMatchConflict(error: unknown): unknown {
  return isUniqueViolation(error) ? new AppError(BOOKING_ERRORS.CHECKIN_ALREADY_MATCHED) : error;
}

/**
 * 予約の窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function bookingRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);

  /**
   * 交流会の使い方と申込みページ・定員の設定の答え（setting-view.ts）。
   * @param eventId 交流会の ID
   * @returns 設定
   */
  const readSetting = (eventId: string): Promise<contract.BookingSetting> =>
    readSettingView(deps, eventId);

  /**
   * 交流会と主催の名前を読む（片付けと知らせに使う）。
   * @param executor DB
   * @param eventId 交流会の ID
   * @returns 交流会と主催
   * @throws {AppError} 交流会がないとき（event の NOT_FOUND）
   */
  const contextOf = async (executor: Executor, eventId: string) => {
    const context = await eventContext(deps, executor, eventId);
    if (!context) throw new AppError(EVENT_ERRORS.NOT_FOUND);
    return context;
  };

  /**
   * 席が埋まる操作（飛び入り）のあとに片付けを通す（一度満員になったら枠を押さえるのをやめる印を付けるため。booking-004 R3）。
   * @param tx トランザクション（設定の行を押さえたもの）
   * @param eventId 交流会の ID
   * @param queue 知らせ（確定のあとに送る）
   */
  const settleAfterSeatTaken = async (tx: Executor, eventId: string, queue: NoticeQueue) => {
    const context = await contextOf(tx, eventId);
    await settleEvent(deps, tx, eventId, new Date(context.event.startsAt), new Date(), queue);
  };

  /**
   * 名簿の答えを読む（setting-view.ts）。
   * @param eventId 交流会の ID
   * @returns 名簿
   */
  const readRoster = (eventId: string): Promise<contract.Roster> => readRosterView(deps, eventId);

  /**
   * 名簿の1行の答えを読む（setting-view.ts）。
   * @param eventId 交流会の ID
   * @param entryId 行の ID
   * @returns 名簿の行
   */
  const readEntry = (eventId: string, entryId: string): Promise<contract.RosterEntry> =>
    readRosterEntryView(deps, eventId, entryId);

  /**
   * 受付係の画面の答えを読む。
   * @param eventId 交流会の ID
   * @returns 受付係の画面
   */
  const readBoard = async (eventId: string): Promise<contract.MatchBoard> => {
    const state = await currentMatches(db, eventId);
    return buildMatchBoard(state.entries, state.attendees, state.dismissals);
  };

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getSetting, async (c) => {
      return c.json(await readSetting(c.req.valid("param").eventId), 200);
    })
    .openapi(routes.putSetting, async (c) => {
      const { eventId } = c.req.valid("param");
      const { mode } = c.req.valid("json");
      await db.transaction(async (tx) => {
        const current = await findWaitlistSetting(tx, eventId, true);
        const wasSelfPage = current?.mode === "self_page";
        if (wasSelfPage && mode !== "self_page" && (await hasWaitingEntries(tx, eventId))) {
          // 自前を外すと打診・キャンセル待ちが止まったまま残るので、先に名簿で片付けてもらう（booking-004 R21）
          throw new AppError(BOOKING_ERRORS.WAITLIST_ACTIVE);
        }
        await saveMode(tx, eventId, mode);
        if (mode === "self_page" && !wasSelfPage) {
          // 最後に知らせた日時と場所を、使い始め・使い直しの今にそろえる（外していた間の変更を知らせない。booking-004 R10・R21）
          await markNotified(tx, eventId, (await contextOf(tx, eventId)).event);
        }
      });
      return c.json(await readSetting(eventId), 200);
    })
    .openapi(routes.putSelfPage, async (c) => {
      const { eventId } = c.req.valid("param");
      const input = c.req.valid("json");
      const current = await findPageSetting(db, eventId);
      if (current.mode !== "self_page") throw new AppError(BOOKING_ERRORS.SELF_PAGE_OFF);
      if (current.cancelledAt) throw new AppError(BOOKING_ERRORS.EVENT_CANCELLED);
      if (input.visibility === "members" && !(await findEventOrganizationId(db, eventId))) {
        throw new AppError(BOOKING_ERRORS.VISIBILITY_NEEDS_ORGANIZATION);
      }
      await savePageSetting(db, eventId, input);
      return c.json(await readSetting(eventId), 200);
    })
    .openapi(routes.getRoster, async (c) => {
      const { eventId } = c.req.valid("param");
      await requireRoster(db, eventId);
      return c.json(await readRoster(eventId), 200);
    })
    .openapi(routes.addEntry, async (c) => {
      const { eventId } = c.req.valid("param");
      const input = c.req.valid("json");
      const context = await contextOf(db, eventId);
      const now = new Date();
      const queue: NoticeQueue = [];
      const entry = await db.transaction(async (tx) => {
        await requireRoster(tx, eventId, true);
        const setting = await findWaitlistSetting(tx, eventId);
        // キャンセル待ちに入れるのは、自前で定員があるときだけ（booking-004 R4）
        if (input.waitlist && (setting?.mode !== "self_page" || setting.capacity === null)) {
          throw new AppError(BOOKING_ERRORS.WAITLIST_OFF);
        }
        const added = await insertEntry(tx, {
          eventId,
          name: input.name,
          applicationSource: input.applicationSource,
          entryKind: "manual",
          enteredBy: currentAccount(c).accountId,
          memo: input.memo?.trim() ? input.memo : null,
          status: input.waitlist ? "waitlisted" : "confirmed",
        });
        if (added.status === "waitlisted") {
          await queueApplied(deps, tx, context, added, null, now, queue);
        }
        await settleEvent(deps, tx, eventId, new Date(context.event.startsAt), now, queue);
        return added;
      });
      await flushNotices(deps, queue);
      return c.json(await readEntry(eventId, entry.id), 201);
    })
    .openapi(routes.setStatus, async (c) => {
      const { eventId, entryId } = c.req.valid("param");
      const { status } = c.req.valid("json");
      const context = await contextOf(db, eventId);
      const queue: NoticeQueue = [];
      await db.transaction(async (tx) => {
        await requireRoster(tx, eventId, true);
        const entry = await findEntry(tx, eventId, entryId, true);
        if (!entry) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
        await setStatusByOrganizer(deps, tx, context, entry, status, new Date(), queue);
      });
      await flushNotices(deps, queue);
      return c.json(await readEntry(eventId, entryId), 200);
    })
    .openapi(routes.merge, async (c) => {
      const { eventId } = c.req.valid("param");
      const { keepEntryId, removeEntryId } = c.req.valid("json");
      const queue: NoticeQueue = [];
      await db.transaction(async (tx) => {
        await requireRoster(tx, eventId, true);
        const keep = await findEntry(tx, eventId, keepEntryId, true);
        const remove = await findEntry(tx, eventId, removeEntryId, true);
        if (!keep || !remove) throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
        if (
          keep.id === remove.id ||
          normalizeCheckinName(keep.name) !== normalizeCheckinName(remove.name)
        ) {
          throw new AppError(BOOKING_ERRORS.MERGE_NAME_MISMATCH);
        }
        // 2つとも本人の申込み（LINE のアカウントか、メールの連絡と札）なら止める。まとめると、片方の人の札が
        // もう片方の人の行に移り、その札で相手の申込みを見たり取り消したりできてしまう（2回目のセキュリティ点検 F1）
        if (isSelfApplied(keep) && isSelfApplied(remove)) {
          throw new AppError(BOOKING_ERRORS.MERGE_BOTH_SELF_APPLIED);
        }
        // 2つともチェックインに当たっている（手でも自動でも）なら、別の人なので止める（当てを1つ失わないように）
        const { byEntry } = await currentMatches(tx, eventId);
        if (byEntry.has(keep.id) && byEntry.has(remove.id)) {
          throw new AppError(BOOKING_ERRORS.MERGE_BOTH_MATCHED);
        }
        // まとめる行は消さずに残す（取り消しにし、当て・アカウント・連絡のメールと札を外して、まとめた先を入れる。同じ CSV を
        // 取り込み直しても増やさないため。research R7）。先に外してから移す（一意の制約に当たらないように。
        // メールの申込みの連絡と札は、残す行になければ移す。booking-003 research R14）
        const moveContact = !keep.contactEmail && !keep.entryTokenHash;
        // 状態は確定を優先し、なければ残す行の状態（取り消しなら、まとめる行の状態）。まとめる行の打診は閉じる（行は残すが
        // 取り消しになるので、打診を待たせたままにしない）ので、残す行が打診中でないのに打診中にはしない（キャンセル待ちにする。booking-004）
        const merged =
          keep.status === "confirmed" || remove.status === "confirmed"
            ? "confirmed"
            : keep.status !== "cancelled"
              ? keep.status
              : remove.status === "offered"
                ? "waitlisted"
                : remove.status;
        const now = new Date();
        if (remove.status === "offered") await closePendingOffer(tx, remove.id, "withdrawn", now);
        if (keep.status === "offered" && merged === "confirmed") {
          await closePendingOffer(tx, keep.id, "withdrawn", now);
        }
        await markEntryMerged(tx, eventId, remove.id, keep.id);
        await updateEntry(tx, eventId, keep.id, {
          status: merged,
          checkinId: keep.checkinId ?? remove.checkinId,
          accountId: keep.accountId ?? remove.accountId,
          memo: keep.memo ?? remove.memo,
          ...(moveContact
            ? { contactEmail: remove.contactEmail, entryTokenHash: remove.entryTokenHash }
            : {}),
        });
        const context = await contextOf(tx, eventId);
        await settleEvent(deps, tx, eventId, new Date(context.event.startsAt), now, queue);
      });
      await flushNotices(deps, queue);
      return c.json(await readEntry(eventId, keepEntryId), 200);
    })
    .openapi(routes.previewImport, async (c) => {
      const { eventId } = c.req.valid("param");
      const input = c.req.valid("json");
      await requireRoster(db, eventId);
      const entries = await listEntriesForImport(db, eventId);
      return c.json(planImport(input.rows, input.applicationSource, entries), 200);
    })
    .openapi(routes.runImport, async (c) => {
      const { eventId } = c.req.valid("param");
      const input = c.req.valid("json");
      const me = currentAccount(c).accountId;
      const queue: NoticeQueue = [];
      const counts = await db.transaction(async (tx) => {
        await requireRoster(tx, eventId, true);
        const plan = planImport(
          input.rows,
          input.applicationSource,
          await listEntriesForImport(tx, eventId),
        );
        await insertEntries(
          tx,
          plan.rows
            .filter((row) => row.outcome === "insert")
            .map((row) => ({
              eventId,
              name: row.name,
              applicationSource: input.applicationSource,
              entryKind: "import" as const,
              enteredBy: me,
            })),
        );
        const owner = input.mapping ? await findEventOwnerAccountId(tx, eventId) : null;
        if (input.mapping && owner) {
          await saveImportMapping(tx, {
            ownerAccountId: owner,
            headerKey: JSON.stringify(input.mapping.headers),
            nameColumn: input.mapping.nameColumn,
            applicationSource: input.applicationSource,
          });
        }
        // 取り込みで満員になったら枠を押さえるのをやめる（片付け。超えても取り消さない。booking-004 R2・FR-B63）
        const context = await contextOf(tx, eventId);
        await settleEvent(deps, tx, eventId, new Date(context.event.startsAt), new Date(), queue);
        return plan.counts;
      });
      await flushNotices(deps, queue);
      return c.json({ counts }, 200);
    })
    .openapi(routes.listMappings, async (c) => {
      const { eventId } = c.req.valid("param");
      await requireRoster(db, eventId);
      const owner = await findEventOwnerAccountId(db, eventId);
      const rows = owner ? await listImportMappings(db, owner) : [];
      const mappings = rows.flatMap((row) => {
        const headers = parseHeaders(row.headerKey);
        return headers
          ? [{ headers, nameColumn: row.nameColumn, applicationSource: row.applicationSource }]
          : [];
      });
      return c.json({ mappings }, 200);
    })
    .openapi(routes.exportCsv, async (c) => {
      const { eventId } = c.req.valid("param");
      await requireRoster(db, eventId);
      const roster = await readRoster(eventId);
      return c.body(buildRosterCsv(roster.entries), 200, csvAttachment("roster"));
    })
    .openapi(routes.getMatches, async (c) => {
      const { eventId } = c.req.valid("param");
      await requireRoster(db, eventId);
      return c.json(await readBoard(eventId), 200);
    })
    .openapi(routes.match, async (c) => {
      const { eventId, checkinId } = c.req.valid("param");
      const { entryId } = c.req.valid("json");
      await db
        .transaction(async (tx) => {
          await requireRoster(tx, eventId, true);
          await checkinOfEvent(tx, eventId, checkinId);
          const entry = await entryOfEvent(tx, eventId, entryId);
          const state = await currentMatches(tx, eventId);
          assertEntryOpen(state, entry);
          assertCheckinOpen(state, checkinId);
          await updateEntry(tx, eventId, entry.id, { checkinId });
        })
        .catch((error: unknown) => {
          throw asMatchConflict(error);
        });
      return c.json(await readBoard(eventId), 200);
    })
    .openapi(routes.dismiss, async (c) => {
      const { eventId, checkinId } = c.req.valid("param");
      const { entryId } = c.req.valid("json");
      await requireRoster(db, eventId);
      await checkinOfEvent(db, eventId, checkinId);
      await entryOfEvent(db, eventId, entryId);
      await insertDismissal(db, {
        eventId,
        checkinId,
        entryId,
        dismissedBy: currentAccount(c).accountId,
      });
      return c.json(await readBoard(eventId), 200);
    })
    .openapi(routes.walkInFromCheckin, async (c) => {
      const { eventId, checkinId } = c.req.valid("param");
      const me = currentAccount(c).accountId;
      const queue: NoticeQueue = [];
      await db
        .transaction(async (tx) => {
          await requireRoster(tx, eventId, true);
          const checkin = await checkinOfEvent(tx, eventId, checkinId);
          assertCheckinOpen(await currentMatches(tx, eventId), checkinId);
          await insertEntry(tx, {
            eventId,
            name: checkin.name,
            applicationSource: checkin.applicationSource,
            entryKind: "walk_in",
            enteredBy: me,
            checkinId,
          });
          await settleAfterSeatTaken(tx, eventId, queue);
        })
        .catch((error: unknown) => {
          throw asMatchConflict(error);
        });
      await flushNotices(deps, queue);
      return c.json(await readBoard(eventId), 201);
    })
    .openapi(routes.unmatch, async (c) => {
      const { eventId, entryId } = c.req.valid("param");
      await requireRoster(db, eventId);
      const entry = await entryOfEvent(db, eventId, entryId);
      if (!entry.checkinId) throw new AppError(BOOKING_ERRORS.MATCH_NOT_MANUAL);
      await updateEntry(db, eventId, entryId, { checkinId: null });
      return c.json(await readBoard(eventId), 200);
    })
    .openapi(routes.checkInEntry, async (c) => {
      const { eventId, entryId } = c.req.valid("param");
      const input = c.req.valid("json");
      const me = currentAccount(c).accountId;
      await db
        .transaction(async (tx) => {
          await requireRoster(tx, eventId, true);
          const entry = await entryOfEvent(tx, eventId, entryId);
          assertEntryOpen(await currentMatches(tx, eventId), entry);
          const checkin = await createManualCheckin(tx, deps.config, {
            eventId,
            enteredBy: me,
            input,
          });
          await updateEntry(tx, eventId, entry.id, { checkinId: checkin.id });
        })
        .catch((error: unknown) => {
          throw asMatchConflict(error);
        });
      return c.json(await readBoard(eventId), 201);
    })
    .openapi(routes.walkIn, async (c) => {
      const { eventId } = c.req.valid("param");
      const input = c.req.valid("json");
      const me = currentAccount(c).accountId;
      const queue: NoticeQueue = [];
      await db.transaction(async (tx) => {
        await requireRoster(tx, eventId, true);
        const checkin = await createManualCheckin(tx, deps.config, {
          eventId,
          enteredBy: me,
          input,
        });
        await insertEntry(tx, {
          eventId,
          name: checkin.name,
          applicationSource: checkin.applicationSource,
          entryKind: "walk_in",
          enteredBy: me,
          checkinId: checkin.id,
        });
        await settleAfterSeatTaken(tx, eventId, queue);
      });
      await flushNotices(deps, queue);
      return c.json(await readBoard(eventId), 201);
    });
}

/**
 * 覚えた見出しの並び（JSON の文字）を読む。
 * @param headerKey 見出しの並び
 * @returns 見出しの並び（形が違えば null）
 */
function parseHeaders(headerKey: string): string[] | null {
  try {
    const value: unknown = JSON.parse(headerKey);
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
  } catch {
    return null;
  }
}
