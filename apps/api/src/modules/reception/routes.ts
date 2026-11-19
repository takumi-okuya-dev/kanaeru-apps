// 受付の窓口（自分のチェックイン・一覧・手でのチェックイン・直す・取り消す・合計・内訳・参加者の CSV）。
// 道はすべて createRoute で書き、道の頭は /api/v1/events/{eventId}/checkins（Consistency Conventions）。
// どの道もログインが要る（account の requireSession）。管理の道は event の requireEventRole で、要求のたびに役目を引く（AD-5）。
// 金額は作るときと、支払い方法か割引を直すときだけ決める（AD-6。amount.ts・discount.ts）。名前と紹介者の名前はログに出さない。
// 紹介者の名前は主催者だけに返す（受付係の一覧・手でのチェックイン・直すの答えでは null。reception-002 research R7）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { jstDate } from "@workspace/contracts/core";
import { EVENT_ERRORS } from "@workspace/contracts/event";
import * as contract from "@workspace/contracts/reception";
import { PAYMENT_METHODS, RECEPTION_ERRORS } from "@workspace/contracts/reception";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { isUniqueViolation } from "../../kernel/pg-errors.ts";
import {
  currentAccount,
  findAccountById,
  requireSession,
  unauthenticatedResponse,
} from "../account/index.ts";
import {
  currentEventRole,
  eventForbiddenResponse,
  eventNotFoundResponse,
  getEventSummary,
  listEventDiscounts,
  requireEventRole,
} from "../event/index.ts";
import { decideAmount } from "./amount.ts";
import { discountForNewCheckin, discountForUpdate } from "./discount.ts";
import { buildParticipantsCsv } from "./csv.ts";
import {
  countBySourceAndReferral,
  deleteCheckin,
  findCheckin,
  findLatestOfAccount,
  getCheckin,
  insertCheckin,
  listCheckins,
  listReferrerNames,
  listSameNameCandidates,
  sumByDiscount,
  sumByPaymentMethod,
  updateCheckin,
} from "./repository.ts";
import type { CheckinRecord } from "./repository.ts";
import { enteredByNames, sameNameIds, toCheckinView, toMyCheckin } from "./views.ts";

/** チェックインの入力（文書の名前と例つき）。 */
const CheckinInput = contract.CheckinInput.openapi("CheckinInput", {
  example: {
    name: "佐藤 太郎",
    applicationSource: "connpass",
    referral: "friend",
    paymentMethod: "paypay",
    discountId: "0193a1b2-0000-7000-8000-000000000001",
    referrerName: "田中 花子",
  },
});

/** 自分のチェックインと初期値（文書の名前つき）。 */
const MyCheckinState = contract.MyCheckinState.openapi("MyCheckinState");

/** 自分でチェックインした結果（文書の名前つき）。 */
const MyCheckinResult = contract.MyCheckinResult.openapi("MyCheckinResult");

/** 一覧画面の行（文書の名前つき）。 */
const CheckinView = contract.CheckinView.openapi("CheckinView");

/** 一覧画面のチェックイン（文書の名前つき）。 */
const CheckinList = contract.CheckinList.openapi("CheckinList");

/** 支払い方法ごとの合計（文書の名前つき）。 */
const CheckinTotals = contract.CheckinTotals.openapi("CheckinTotals");

/** 内訳（文書の名前つき）。 */
const CheckinBreakdown = contract.CheckinBreakdown.openapi("CheckinBreakdown");

/** 道の eventId。 */
const EventParams = z.object({ eventId: uuidParam("eventId", "交流会の ID") });

/** 道の eventId と checkinId。 */
const CheckinParams = z.object({
  eventId: uuidParam("eventId", "交流会の ID"),
  checkinId: uuidParam("checkinId", "チェックインの ID"),
});

/** チェックインがない応答。 */
const checkinNotFoundResponse = domainErrorResponse(
  RECEPTION_ERRORS.CHECKIN_NOT_FOUND,
  "その交流会にチェックインがない（ほかの端末で取り消された・別の交流会の ID・ID の形が違う）",
);

/**
 * 交流会がないか、その交流会にチェックインがない応答（直す・取り消す）。requireEventRole と参加費の読みこみは
 * event の NOT_FOUND を、チェックインを探す処理は CHECKIN_NOT_FOUND を返すので、文書には両方を例として書く（本文の形は同じ）。
 */
const eventOrCheckinNotFoundResponse = {
  description:
    "交流会がない（event の NOT_FOUND。ID の形が違うときも）か、その交流会にチェックインがない（CHECKIN_NOT_FOUND。ほかの端末で取り消された・別の交流会の ID・ID の形が違う）",
  content: {
    "application/json": {
      schema: checkinNotFoundResponse.content["application/json"].schema,
      examples: {
        eventNotFound: {
          summary: "交流会がない",
          value: eventNotFoundResponse.content["application/json"].example,
        },
        checkinNotFound: {
          summary: "その交流会にチェックインがない",
          value: checkinNotFoundResponse.content["application/json"].example,
        },
      },
    },
  },
} as const;

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
 * 受付の窓口の道の定義（middleware に deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const organizerOrStaff = requireEventRole(deps, ["organizer", "staff"]);
  const organizerOnly = requireEventRole(deps, ["organizer"]);
  const tags = ["reception"];
  const base = "/api/v1/events/{eventId}/checkins";
  const manageErrors = {
    401: unauthenticatedResponse,
    403: eventForbiddenResponse,
    404: eventNotFoundResponse,
  } as const;
  return {
    getMine: createRoute({
      method: "get",
      path: `${base}/me`,
      tags,
      operationId: "receptionGetMyCheckin",
      summary: "その交流会の自分のチェックインと、名前・知ったきっかけの初期値（ログインした人）",
      middleware: [session] as const,
      request: { params: EventParams },
      responses: {
        200: json(MyCheckinState, "自分のチェックイン（まだなら null）と初期値"),
        401: unauthenticatedResponse,
        404: eventNotFoundResponse,
      },
    }),
    checkInMine: createRoute({
      method: "post",
      path: `${base}/me`,
      tags,
      operationId: "receptionCheckInMine",
      summary: "自分でチェックインする（ログインした人。すでにあれば記録を増やさず、それを返す）",
      description:
        "金額は、無料なら0円、ほかはその時の交流会の参加費から選んだ割引の額を引いたもの（0円より下にしない。AD-6・reception-002）。選べない割引は 400 DISCOUNT_UNAVAILABLE。",
      middleware: [session] as const,
      request: {
        params: EventParams,
        body: { required: true, content: { "application/json": { schema: CheckinInput } } },
      },
      responses: {
        200: json(
          MyCheckinResult,
          "すでにチェックイン済み（alreadyCheckedIn: true。記録は増えない）",
        ),
        201: json(MyCheckinResult, "チェックインした"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        404: eventNotFoundResponse,
      },
    }),
    list: createRoute({
      method: "get",
      path: base,
      tags,
      operationId: "receptionListCheckins",
      summary:
        "交流会のチェックイン（主催者・受付係。新しい順。同じ名前の印・手の印・入れた人つき）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EventParams },
      responses: { 200: json(CheckinList, "チェックインの一覧"), ...manageErrors },
    }),
    createManual: createRoute({
      method: "post",
      path: base,
      tags,
      operationId: "receptionCreateManualCheckin",
      summary: "手でチェックインする（主催者・受付係。入れた人を記録する）",
      middleware: [session, organizerOrStaff] as const,
      request: {
        params: EventParams,
        body: { required: true, content: { "application/json": { schema: CheckinInput } } },
      },
      responses: {
        201: json(CheckinView, "手でのチェックイン"),
        400: invalidInputResponse,
        ...manageErrors,
      },
    }),
    update: createRoute({
      method: "put",
      path: `${base}/{checkinId}`,
      tags,
      operationId: "receptionUpdateCheckin",
      summary:
        "チェックインを直す（主催者・受付係。支払い方法か割引が変わったときだけ金額を決め直す）",
      description:
        "割引を変えると、その割引の今の名前と額を写す。referrerName を送らなければ、割引が同じなら紹介者の名前を残し、割引が変われば空にする（reception-002）。",
      middleware: [session, organizerOrStaff] as const,
      request: {
        params: CheckinParams,
        body: { required: true, content: { "application/json": { schema: CheckinInput } } },
      },
      responses: {
        200: json(CheckinView, "直したチェックイン"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventOrCheckinNotFoundResponse,
      },
    }),
    remove: createRoute({
      method: "delete",
      path: `${base}/{checkinId}`,
      tags,
      operationId: "receptionDeleteCheckin",
      summary: "チェックインを取り消す（主催者・受付係。行を消し、アンケートの回答も一緒に消える）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: CheckinParams },
      responses: {
        204: { description: "取り消した" },
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventOrCheckinNotFoundResponse,
      },
    }),
    totals: createRoute({
      method: "get",
      path: `${base}/totals`,
      tags,
      operationId: "receptionGetTotals",
      summary:
        "支払い方法ごとの人数と金額・全体の合計（主催者・受付係。金額はチェックインの金額の和）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EventParams },
      responses: { 200: json(CheckinTotals, "支払い方法ごとの合計"), ...manageErrors },
    }),
    breakdown: createRoute({
      method: "get",
      path: `${base}/breakdown`,
      tags,
      operationId: "receptionGetBreakdown",
      summary: "申し込みの媒体・知ったきっかけ・割引の人数の内訳と、紹介者ごとの人数（主催者だけ）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams },
      responses: { 200: json(CheckinBreakdown, "内訳"), ...manageErrors },
    }),
    exportCsv: createRoute({
      method: "get",
      path: `${base}/export`,
      tags,
      operationId: "receptionExportParticipants",
      summary: "参加者の CSV（主催者だけ。UTF-8 の BOM つき・チェックインの古い順）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams },
      responses: {
        200: {
          description: "参加者の CSV",
          content: { "text/csv": { schema: z.string().openapi({ format: "binary" }) } },
        },
        ...manageErrors,
      },
    }),
  };
}

/**
 * 交流会の今の参加費を読む（ない交流会は 404）。
 * @param deps 土台が渡す道具
 * @param eventId 交流会の ID
 * @returns 参加費（円の整数）
 * @throws {AppError} 交流会がないとき（event の NOT_FOUND）
 */
async function currentFee(deps: DomainRouteDeps, eventId: string): Promise<number> {
  const summary = await getEventSummary(deps.db, deps.config, eventId);
  if (!summary) throw new AppError(EVENT_ERRORS.NOT_FOUND);
  return summary.fee;
}

/**
 * チェックインの並びを、一覧画面の行にする（入れた人の名前と、同じ名前の印つき）。
 * @param deps 土台が渡す道具
 * @param records その交流会のチェックイン（印は、この並びの中で比べる）
 * @param showReferrer 紹介者の名前を入れるか（主催者のときだけ true）
 * @returns 一覧画面の行
 */
async function toViews(
  deps: DomainRouteDeps,
  records: readonly CheckinRecord[],
  showReferrer: boolean,
): Promise<contract.CheckinView[]> {
  const names = await enteredByNames(deps.db, records);
  const flagged = sameNameIds(records);
  return records.map((record) => toCheckinView(record, names, flagged, showReferrer));
}

/**
 * 1つのチェックインを、同じ交流会のほかの行と比べた一覧画面の行にする（手でのチェックイン・直したあと）。
 * 交流会の全部を読まず、そろえた名前が同じ行だけを DB で探して印を決める。
 * @param deps 土台が渡す道具
 * @param record チェックイン
 * @param showReferrer 紹介者の名前を入れるか（主催者のときだけ true）
 * @returns 一覧画面の行
 */
async function toViewInEvent(
  deps: DomainRouteDeps,
  record: CheckinRecord,
  showReferrer: boolean,
): Promise<contract.CheckinView> {
  const key = contract.normalizeCheckinName(record.name);
  const [names, candidates] = await Promise.all([
    enteredByNames(deps.db, [record]),
    listSameNameCandidates(deps.db, record.eventId, key),
  ]);
  // DB と JavaScript の NFKC がずれても、一覧（sameNameIds）と同じ答えになるよう、ここでもう一度そろえて比べる
  const group = [
    record,
    ...candidates.filter(
      (item) => item.id !== record.id && contract.normalizeCheckinName(item.name) === key,
    ),
  ];
  return toCheckinView(record, names, sameNameIds(group), showReferrer);
}

/**
 * 入力から、チェックインの名前と3つの選択肢だけを取り出す（割引と紹介者は discount.ts が決める）。
 * @param input 入力
 * @returns 名前と3つの選択肢
 */
function checkinFields(input: contract.CheckinInput) {
  return {
    name: input.name,
    applicationSource: input.applicationSource,
    referral: input.referral,
    paymentMethod: input.paymentMethod,
  };
}

/**
 * 割引の内訳（使っている割引と、使われた割引を作った順に。最後に割引なし。research R8）。
 * @param discounts その交流会の割引のすべて（event の listEventDiscounts）
 * @param rows 割引ごとの人数と割引の額の合計（sumByDiscount）
 * @returns 割引の内訳
 */
function discountBreakdown(
  discounts: readonly { id: string; name: string; active: boolean }[],
  rows: readonly { discountId: string | null; count: number; discountTotal: number }[],
): contract.CheckinBreakdown["discounts"] {
  const byId = new Map(rows.map((row) => [row.discountId, row]));
  const listed = discounts.flatMap((discount) => {
    const row = byId.get(discount.id);
    if (!discount.active && !row) return [];
    return [
      {
        discountId: discount.id,
        name: discount.name,
        active: discount.active,
        count: row?.count ?? 0,
        discountTotal: row?.discountTotal ?? 0,
      },
    ];
  });
  return [
    ...listed,
    {
      discountId: null,
      name: null,
      active: true,
      count: byId.get(null)?.count ?? 0,
      discountTotal: 0,
    },
  ];
}

/**
 * 紹介者ごとの人数（そろえた名前〈normalizeCheckinName〉で数え、最初に入った書き方で出す。多い順・同じ数は最初に入った順）。
 * @param names 紹介者の名前（古い順）
 * @returns 紹介者ごとの人数
 */
function referrerBreakdown(names: readonly string[]): contract.CheckinBreakdown["referrers"] {
  const groups = new Map<string, { name: string; count: number }>();
  for (const name of names) {
    const key = contract.normalizeCheckinName(name);
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { name, count: 1 });
  }
  // Map は入れた順を保ち、sort は同じ数の並びを変えない
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/**
 * 受付の窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function receptionRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getMine, async (c) => {
      const { eventId } = c.req.valid("param");
      await currentFee(deps, eventId);
      const me = currentAccount(c);
      const record = await findCheckin(db, eventId, me.accountId);
      const latest = await findLatestOfAccount(db, me.accountId);
      const name = latest?.name ?? (await findAccountById(db, me.accountId))?.displayName ?? "";
      const state: contract.MyCheckinState = {
        checkin: record ? toMyCheckin(record) : null,
        prefill: { name, referral: latest?.referral ?? null },
      };
      return c.json(state, 200);
    })
    .openapi(routes.checkInMine, async (c) => {
      const { eventId } = c.req.valid("param");
      const input = c.req.valid("json");
      const fee = await currentFee(deps, eventId);
      const me = currentAccount(c);
      const existing = await findCheckin(db, eventId, me.accountId);
      if (existing) return c.json({ checkin: toMyCheckin(existing), alreadyCheckedIn: true }, 200);
      const discount = await discountForNewCheckin(db, eventId, input);
      try {
        const record = await insertCheckin(db, {
          eventId,
          accountId: me.accountId,
          ...checkinFields(input),
          ...discount,
          amount: decideAmount(input.paymentMethod, fee, discount.discountAmount),
        });
        return c.json({ checkin: toMyCheckin(record), alreadyCheckedIn: false }, 201);
      } catch (error) {
        // 同時の2回目：一意の制約に当たったら、先にできたほうを返す（research R3）
        if (!isUniqueViolation(error)) throw error;
        const raced = await findCheckin(db, eventId, me.accountId);
        if (!raced) throw error;
        return c.json({ checkin: toMyCheckin(raced), alreadyCheckedIn: true }, 200);
      }
    })
    .openapi(routes.list, async (c) => {
      const records = await listCheckins(db, c.req.valid("param").eventId);
      const showReferrer = currentEventRole(c) === "organizer";
      return c.json({ checkins: await toViews(deps, records, showReferrer) }, 200);
    })
    .openapi(routes.createManual, async (c) => {
      const { eventId } = c.req.valid("param");
      const input = c.req.valid("json");
      const fee = await currentFee(deps, eventId);
      const discount = await discountForNewCheckin(db, eventId, input);
      const record = await insertCheckin(db, {
        eventId,
        enteredBy: currentAccount(c).accountId,
        ...checkinFields(input),
        ...discount,
        amount: decideAmount(input.paymentMethod, fee, discount.discountAmount),
      });
      const showReferrer = currentEventRole(c) === "organizer";
      return c.json(await toViewInEvent(deps, record, showReferrer), 201);
    })
    .openapi(routes.update, async (c) => {
      const { eventId, checkinId } = c.req.valid("param");
      const input = c.req.valid("json");
      const current = await getCheckin(db, checkinId);
      if (!current || current.eventId !== eventId) {
        throw new AppError(RECEPTION_ERRORS.CHECKIN_NOT_FOUND);
      }
      const discount = await discountForUpdate(db, current, input);
      // 金額は支払い方法か割引が変わったときだけ、その時の参加費と写した割引の額で決め直す（AD-6・research R5）
      const amount =
        input.paymentMethod === current.paymentMethod && !discount.changed
          ? current.amount
          : decideAmount(
              input.paymentMethod,
              await currentFee(deps, eventId),
              discount.snapshot.discountAmount,
            );
      const record = await updateCheckin(db, eventId, checkinId, {
        ...checkinFields(input),
        ...discount.snapshot,
        amount,
      });
      if (!record) throw new AppError(RECEPTION_ERRORS.CHECKIN_NOT_FOUND);
      const showReferrer = currentEventRole(c) === "organizer";
      return c.json(await toViewInEvent(deps, record, showReferrer), 200);
    })
    .openapi(routes.remove, async (c) => {
      const { eventId, checkinId } = c.req.valid("param");
      if (!(await deleteCheckin(db, eventId, checkinId))) {
        throw new AppError(RECEPTION_ERRORS.CHECKIN_NOT_FOUND);
      }
      return c.body(null, 204);
    })
    .openapi(routes.totals, async (c) => {
      const rows = await sumByPaymentMethod(db, c.req.valid("param").eventId);
      const byPaymentMethod = PAYMENT_METHODS.map((paymentMethod) => {
        const row = rows.find((item) => item.paymentMethod === paymentMethod);
        return { paymentMethod, count: row?.count ?? 0, amount: row?.amount ?? 0 };
      });
      const total = byPaymentMethod.reduce(
        (sum, row) => ({ count: sum.count + row.count, amount: sum.amount + row.amount }),
        { count: 0, amount: 0 },
      );
      return c.json({ byPaymentMethod, total }, 200);
    })
    .openapi(routes.breakdown, async (c) => {
      const { eventId } = c.req.valid("param");
      const [rows, discountRows, discounts, referrerNames] = await Promise.all([
        countBySourceAndReferral(db, eventId),
        sumByDiscount(db, eventId),
        listEventDiscounts(db, eventId),
        listReferrerNames(db, eventId),
      ]);
      const sum = (match: (row: (typeof rows)[number]) => boolean) =>
        rows.filter(match).reduce((total, row) => total + row.count, 0);
      const breakdown: contract.CheckinBreakdown = {
        applicationSource: contract.APPLICATION_SOURCES.map((value) => ({
          value,
          count: sum((row) => row.applicationSource === value),
        })),
        referral: contract.REFERRALS.map((value) => ({
          value,
          count: sum((row) => row.referral === value),
        })),
        total: sum(() => true),
        discounts: discountBreakdown(discounts, discountRows),
        referrers: referrerBreakdown(referrerNames),
      };
      return c.json(breakdown, 200);
    })
    .openapi(routes.exportCsv, async (c) => {
      const records = await listCheckins(db, c.req.valid("param").eventId, "oldest");
      const names = await enteredByNames(db, records);
      const csv = buildParticipantsCsv(
        records.map((record) => ({
          record,
          enteredByName: record.enteredBy ? (names.get(record.enteredBy) ?? null) : null,
        })),
      );
      const filename = `participants-${jstDate(new Date())}.csv`;
      return c.body(csv, 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
    });
}
