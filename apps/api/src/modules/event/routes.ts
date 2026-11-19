// 交流会の窓口（交流会の作成・直す・一覧・詳細・要約・アンケートの開閉・招待のリンク・受付係）。
// 道はすべて createRoute で書き、入力は約束（@workspace/contracts/event）で確かめる。名前と例は、ここで .openapi() で付ける。
// どの道もログインが要る（account の requireSession）。交流会ごとの権限は access.ts の requireEventRole（AD-5）。
// 招待の印はログに出さない（要求の1行は道の形 :inviteToken だけを出す。research R11）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { endOfJstDate } from "@workspace/contracts/core";
import * as contract from "@workspace/contracts/event";
import { EVENT_ERRORS } from "@workspace/contracts/event";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, notFoundResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import {
  currentAccount,
  findAccountById,
  forbiddenResponse,
  isOrganizer,
  requireOrganizer,
  requireSession,
  unauthenticatedResponse,
} from "../account/index.ts";
import { requireEventRole } from "./access.ts";
import { generateInviteToken, isInviteToken } from "./ids.ts";
import {
  addStaff,
  findEventById,
  findEventByInviteToken,
  findEventMembership,
  findInviteByEvent,
  insertEvent,
  listAllEvents,
  listStaff,
  listStaffEvents,
  removeStaff,
  replaceInviteToken,
  setSurveyOpen,
  updateEvent,
  upsertInvite,
} from "./repository.ts";
import type { EventRecord, EventValues, StaffInviteRecord } from "./repository.ts";
import { getEventSummary, toEventView } from "./summary.ts";

/** 交流会の入力（文書の名前と例つき）。 */
const EventInput = contract.EventInput.openapi("EventInput", {
  example: {
    name: "11月の交流会",
    startsAt: "2026-11-25T19:00:00+09:00",
    venue: "渋谷の会場",
    fee: 1000,
    googleFormUrl: "https://forms.gle/example",
    lineGroupUrl: null,
  },
});

/** 交流会（文書の名前つき）。 */
const EventView = contract.EventView.openapi("EventView");

/** 交流会の一覧（文書の名前つき）。 */
const EventList = contract.EventList.openapi("EventList");

/** 交流会の要約（文書の名前つき）。 */
const EventSummary = contract.EventSummary.openapi("EventSummary");

/** アンケートの開閉の入力（文書の名前と例つき）。 */
const SurveyStateInput = contract.SurveyStateInput.openapi("SurveyStateInput", {
  example: { open: true },
});

/** アンケートの開閉の状態（文書の名前つき）。 */
const SurveyState = contract.SurveyState.openapi("SurveyState");

/** 招待のリンク（文書の名前つき）。 */
const StaffInviteView = contract.StaffInviteView.openapi("StaffInviteView");

/** 交流会の今の招待のリンク（文書の名前つき）。 */
const StaffInviteState = contract.StaffInviteState.openapi("StaffInviteState");

/** 招待の中身（文書の名前つき）。 */
const InvitePreview = contract.InvitePreview.openapi("InvitePreview");

/** 招待を受けた結果（文書の名前つき）。 */
const InviteAccepted = contract.InviteAccepted.openapi("InviteAccepted");

/** 受付係の一覧（文書の名前つき）。 */
const StaffList = contract.StaffList.openapi("StaffList");

/** 道の eventId。 */
const EventParams = z.object({ eventId: uuidParam("eventId", "交流会の ID") });

/** 道の eventId と accountId。 */
const StaffParams = z.object({
  eventId: uuidParam("eventId", "交流会の ID"),
  accountId: uuidParam("accountId", "受付係の account の ID"),
});

/** 道の inviteToken（形は処理の中で確かめ、違えば STAFF_INVITE_INVALID）。 */
const InviteParams = z.object({
  inviteToken: z
    .string()
    .openapi({ param: { name: "inviteToken", in: "path" }, description: "招待の印" }),
});

/** その交流会で権限がない応答（ほかの領域も index.ts から使う）。 */
export const eventForbiddenResponse = domainErrorResponse(
  EVENT_ERRORS.FORBIDDEN,
  "その交流会の主催者でも受付係でもない（外された受付係を含む）",
);

/** 交流会がない応答（ほかの領域も index.ts から使う）。 */
export const eventNotFoundResponse = domainErrorResponse(
  EVENT_ERRORS.NOT_FOUND,
  "交流会がない（ID の形が違うときも）",
);

/** 招待のリンクが使えない応答。 */
const inviteInvalidResponse = domainErrorResponse(
  EVENT_ERRORS.STAFF_INVITE_INVALID,
  "招待の印の形が違う・知らない・作り直された",
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
 * 交流会の窓口の道の定義（middleware に deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const organizerOrStaff = requireEventRole(deps, ["organizer", "staff"]);
  const organizerOfEvent = requireEventRole(deps, ["organizer"]);
  const tags = ["event"];
  return {
    list: createRoute({
      method: "get",
      path: "/api/v1/events",
      tags,
      operationId: "eventList",
      summary: "交流会の一覧（主催者はすべて・受付係は自分の交流会だけ・ほかは空。日時の新しい順）",
      middleware: [session] as const,
      responses: { 200: json(EventList, "交流会の一覧"), 401: unauthenticatedResponse },
    }),
    create: createRoute({
      method: "post",
      path: "/api/v1/events",
      tags,
      operationId: "eventCreate",
      summary: "交流会を作る（主催者だけ）",
      middleware: [session, requireOrganizer(deps)] as const,
      request: {
        body: { required: true, content: { "application/json": { schema: EventInput } } },
      },
      responses: {
        201: json(EventView, "作った交流会"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        403: forbiddenResponse,
      },
    }),
    get: createRoute({
      method: "get",
      path: "/api/v1/events/{eventId}",
      tags,
      operationId: "eventGet",
      summary: "交流会（主催者と、その交流会の受付係だけ。自分の役目つき）",
      middleware: [session, organizerOrStaff] as const,
      request: { params: EventParams },
      responses: {
        200: json(EventView, "交流会"),
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventNotFoundResponse,
      },
    }),
    update: createRoute({
      method: "put",
      path: "/api/v1/events/{eventId}",
      tags,
      operationId: "eventUpdate",
      summary: "交流会を直す（主催者だけ。すでにあるチェックインの金額は変わらない。AD-6）",
      middleware: [session, organizerOfEvent] as const,
      request: {
        params: EventParams,
        body: { required: true, content: { "application/json": { schema: EventInput } } },
      },
      responses: {
        200: json(EventView, "直した交流会"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventNotFoundResponse,
      },
    }),
    summary: createRoute({
      method: "get",
      path: "/api/v1/events/{eventId}/summary",
      tags,
      operationId: "eventGetSummary",
      summary: "交流会の要約（ログインしていれば誰でも。参加者の画面が読む。AD-5）",
      middleware: [session] as const,
      request: { params: EventParams },
      responses: {
        200: json(EventSummary, "交流会の要約"),
        401: unauthenticatedResponse,
        404: eventNotFoundResponse,
      },
    }),
    survey: createRoute({
      method: "put",
      path: "/api/v1/events/{eventId}/survey",
      tags,
      operationId: "eventSetSurveyOpen",
      summary: "アンケートを開く・閉じる（主催者だけ。何度送っても同じ）",
      middleware: [session, organizerOfEvent] as const,
      request: {
        params: EventParams,
        body: { required: true, content: { "application/json": { schema: SurveyStateInput } } },
      },
      responses: {
        200: json(SurveyState, "今の開閉"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventNotFoundResponse,
      },
    }),
    getInvite: createRoute({
      method: "get",
      path: "/api/v1/events/{eventId}/staff-invite",
      tags,
      operationId: "eventGetStaffInvite",
      summary: "今の招待のリンク（主催者だけ。まだなければ null）",
      middleware: [session, organizerOfEvent] as const,
      request: { params: EventParams },
      responses: {
        200: json(StaffInviteState, "今の招待のリンク"),
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventNotFoundResponse,
      },
    }),
    createInvite: createRoute({
      method: "post",
      path: "/api/v1/events/{eventId}/staff-invite",
      tags,
      operationId: "eventCreateStaffInvite",
      summary: "招待のリンクを作る・作り直す（主催者だけ。作り直すと前のリンクは使えない）",
      middleware: [session, organizerOfEvent] as const,
      request: { params: EventParams },
      responses: {
        200: json(StaffInviteView, "新しい招待のリンク"),
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventNotFoundResponse,
      },
    }),
    listStaff: createRoute({
      method: "get",
      path: "/api/v1/events/{eventId}/staff",
      tags,
      operationId: "eventListStaff",
      summary: "受付係の一覧（主催者だけ。受付係になった順）",
      middleware: [session, organizerOfEvent] as const,
      request: { params: EventParams },
      responses: {
        200: json(StaffList, "受付係の一覧"),
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventNotFoundResponse,
      },
    }),
    removeStaff: createRoute({
      method: "delete",
      path: "/api/v1/events/{eventId}/staff/{accountId}",
      tags,
      operationId: "eventRemoveStaff",
      summary:
        "受付係を外す（主催者だけ。外された人は次の要求から使えない。招待のリンクがあれば作り直し、前のリンクでは受け直せない）",
      middleware: [session, organizerOfEvent] as const,
      request: { params: StaffParams },
      responses: {
        204: { description: "外した" },
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: notFoundResponse,
      },
    }),
    previewInvite: createRoute({
      method: "get",
      path: "/api/v1/staff-invites/{inviteToken}",
      tags,
      operationId: "eventPreviewStaffInvite",
      summary: "招待の中身（ログインした人。受ける前に交流会の名前と期限を出す）",
      middleware: [session] as const,
      request: { params: InviteParams },
      responses: {
        200: json(InvitePreview, "招待の中身"),
        401: unauthenticatedResponse,
        404: inviteInvalidResponse,
      },
    }),
    acceptInvite: createRoute({
      method: "post",
      path: "/api/v1/staff-invites/{inviteToken}/accept",
      tags,
      operationId: "eventAcceptStaffInvite",
      summary: "招待を受けて受付係になる（すでに主催者・受付係なら何もしない）",
      description:
        "期限は「交流会の日時の、日本時間の日付が終わるまで」で、受けるときに交流会の今の日時から決める（AD-5）。",
      middleware: [session] as const,
      request: { params: InviteParams },
      responses: {
        200: json(InviteAccepted, "受けたあとの役目"),
        401: unauthenticatedResponse,
        404: inviteInvalidResponse,
        410: domainErrorResponse(EVENT_ERRORS.STAFF_INVITE_EXPIRED, "交流会の日が終わった"),
      },
    }),
  };
}

/**
 * 約束の入力を、表に入れる値にする（任意の URL の空は null にそろえる）。
 * @param input 確かめた入力
 * @returns 表に入れる値
 */
function toValues(input: contract.EventInput): EventValues {
  return {
    name: input.name,
    startsAt: new Date(input.startsAt),
    venue: input.venue,
    fee: input.fee,
    googleFormUrl: input.googleFormUrl || null,
    lineGroupUrl: input.lineGroupUrl || null,
  };
}

/**
 * 招待のリンクを答えの形にする（期限は今の交流会の日時から決める）。
 * @param record 交流会
 * @param invite 招待のリンク
 * @returns 招待のリンク
 */
function toInviteView(record: EventRecord, invite: StaffInviteRecord): contract.StaffInviteView {
  return {
    token: invite.token,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: endOfJstDate(record.startsAt).toISOString(),
  };
}

/**
 * 交流会を読む（requireEventRole のあとで、あることが分かっているとき）。
 * @param deps 土台が渡す道具
 * @param eventId 交流会の ID
 * @returns 交流会
 * @throws {AppError} 確かめたあとに消えたとき（この版は消さないので、ふつうは起きない）
 */
async function mustFindEvent(deps: DomainRouteDeps, eventId: string): Promise<EventRecord> {
  const record = await findEventById(deps.db, eventId);
  if (!record) throw new AppError(EVENT_ERRORS.NOT_FOUND);
  return record;
}

/**
 * 招待の印から交流会を読む。
 * @param deps 土台が渡す道具
 * @param token 招待の印
 * @returns 交流会
 * @throws {AppError} 形が違う・知らない印のとき（STAFF_INVITE_INVALID）
 */
async function findInvitedEvent(deps: DomainRouteDeps, token: string): Promise<EventRecord> {
  const record = isInviteToken(token) ? await findEventByInviteToken(deps.db, token) : null;
  if (!record) throw new AppError(EVENT_ERRORS.STAFF_INVITE_INVALID);
  return record;
}

/**
 * 交流会の窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function eventRoutes(deps: DomainRouteDeps) {
  const { db, config } = deps;
  const routes = defineRoutes(deps);

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.list, async (c) => {
      const me = currentAccount(c);
      const organizer = isOrganizer(config, me);
      const records = organizer ? await listAllEvents(db) : await listStaffEvents(db, me.accountId);
      const role = organizer ? "organizer" : "staff";
      return c.json({ events: records.map((record) => toEventView(record, role)) }, 200);
    })
    .openapi(routes.create, async (c) => {
      const record = await insertEvent(db, toValues(c.req.valid("json")));
      return c.json(toEventView(record, "organizer"), 201);
    })
    .openapi(routes.get, async (c) => {
      const me = currentAccount(c);
      const record = await mustFindEvent(deps, c.req.valid("param").eventId);
      return c.json(toEventView(record, isOrganizer(config, me) ? "organizer" : "staff"), 200);
    })
    .openapi(routes.update, async (c) => {
      const record = await updateEvent(
        db,
        c.req.valid("param").eventId,
        toValues(c.req.valid("json")),
      );
      if (!record) throw new AppError(EVENT_ERRORS.NOT_FOUND);
      return c.json(toEventView(record, "organizer"), 200);
    })
    .openapi(routes.summary, async (c) => {
      const summary = await getEventSummary(db, config, c.req.valid("param").eventId);
      if (!summary) throw new AppError(EVENT_ERRORS.NOT_FOUND);
      return c.json(summary, 200);
    })
    .openapi(routes.survey, async (c) => {
      const record = await setSurveyOpen(
        db,
        c.req.valid("param").eventId,
        c.req.valid("json").open,
      );
      if (!record) throw new AppError(EVENT_ERRORS.NOT_FOUND);
      return c.json({ surveyOpen: record.surveyOpen }, 200);
    })
    .openapi(routes.getInvite, async (c) => {
      const record = await mustFindEvent(deps, c.req.valid("param").eventId);
      const invite = await findInviteByEvent(db, record.id);
      return c.json({ invite: invite ? toInviteView(record, invite) : null }, 200);
    })
    .openapi(routes.createInvite, async (c) => {
      const record = await mustFindEvent(deps, c.req.valid("param").eventId);
      const invite = await upsertInvite(db, record.id, generateInviteToken());
      return c.json(toInviteView(record, invite), 200);
    })
    .openapi(routes.listStaff, async (c) => {
      const rows = await listStaff(db, c.req.valid("param").eventId);
      // 表示名は account の findAccountById で1人ずつ（同時に）引く。account の表とは結ばない（AD-3）。
      // 受付係は1つの交流会に数人なので足りる。まとめて引く関数が account に増えたら、それに替える（research R7）
      const staff = await Promise.all(
        rows.map(async (row) => ({
          accountId: row.accountId,
          displayName: (await findAccountById(db, row.accountId))?.displayName ?? "",
          addedAt: row.addedAt.toISOString(),
        })),
      );
      return c.json({ staff }, 200);
    })
    .openapi(routes.removeStaff, async (c) => {
      const { eventId, accountId } = c.req.valid("param");
      // 外した人が、まだ期限の切れていない前のリンクで受け直せないよう、同じ取引で招待の印も替える（SC-004・research R3）
      const removed = await db.transaction(async (tx) => {
        if (!(await removeStaff(tx, eventId, accountId))) return false;
        await replaceInviteToken(tx, eventId, generateInviteToken());
        return true;
      });
      if (!removed) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    })
    .openapi(routes.previewInvite, async (c) => {
      const record = await findInvitedEvent(deps, c.req.valid("param").inviteToken);
      const me = currentAccount(c);
      const myRole = isOrganizer(config, me)
        ? "organizer"
        : (await findEventMembership(db, record.id, me.accountId))?.isStaff
          ? "staff"
          : null;
      const expiresAt = endOfJstDate(record.startsAt);
      const preview: contract.InvitePreview = {
        eventId: record.id,
        eventName: record.name,
        startsAt: record.startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        expired: Date.now() >= expiresAt.getTime(),
        myRole,
      };
      return c.json(preview, 200);
    })
    .openapi(routes.acceptInvite, async (c) => {
      const record = await findInvitedEvent(deps, c.req.valid("param").inviteToken);
      const me = currentAccount(c);
      if (isOrganizer(config, me)) {
        const accepted: contract.InviteAccepted = { eventId: record.id, role: "organizer" };
        return c.json(accepted, 200);
      }
      const membership = await findEventMembership(db, record.id, me.accountId);
      // すでに受付係なら、期限にかかわらずそのまま通す（EXPERIENCE「すでに受付係なら、そのまま A3 へ」）
      if (!membership?.isStaff) {
        if (Date.now() >= endOfJstDate(record.startsAt).getTime()) {
          throw new AppError(EVENT_ERRORS.STAFF_INVITE_EXPIRED);
        }
        await addStaff(db, record.id, me.accountId);
      }
      const accepted: contract.InviteAccepted = { eventId: record.id, role: "staff" };
      return c.json(accepted, 200);
    });
}
