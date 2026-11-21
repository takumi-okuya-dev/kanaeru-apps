// 交流会の窓口（交流会の作成・直す・一覧・詳細・要約・アンケートの開閉・招待のリンク・受付係）。
// 道はすべて createRoute で書き、入力は約束（@workspace/contracts/event）で確かめる。名前と例は、ここで .openapi() で付ける。
// どの道もログインが要る（account の requireSession）。交流会ごとの権限は access.ts の requireEventRole（AD-5）。
// 交流会はログインした誰でも作れ、作った人が持ち主（event-002。AD-23）。組織に入れる・外すのは持ち主だけ（organization.ts）。
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
  isOrganizer,
  requireSession,
  unauthenticatedResponse,
} from "../account/index.ts";
import { listMemberships } from "../suite/index.ts";
import { currentEventRole, requireEventRole, resolveEventAccess } from "./access.ts";
import { saveDiscounts } from "./discounts.ts";
import { generateInviteToken, isInviteToken } from "./ids.ts";
import { getEventOrganizationState, placeEvent } from "./organization.ts";
import {
  addStaff,
  claimLegacyEvents,
  findEventById,
  findEventByInviteToken,
  findEventOrganizationId,
  findInviteByEvent,
  insertEvent,
  listAccessibleEvents,
  listStaff,
  removeStaff,
  replaceInviteToken,
  setSurveyOpen,
  updateEvent,
  upsertInvite,
} from "./repository.ts";
import type { EventRecord, EventValues, StaffInviteRecord } from "./repository.ts";
import { buildEventViews, getEventSummary } from "./summary.ts";

/** 交流会の入力（文書の名前と例つき）。 */
const EventInput = contract.EventInput.openapi("EventInput", {
  example: {
    name: "11月の交流会",
    startsAt: "2026-11-25T19:00:00+09:00",
    venue: "渋谷の会場",
    fee: 1000,
    googleFormUrl: "https://forms.gle/example",
    lineGroupUrl: null,
    discounts: [{ name: "紹介割", amount: 1000, asksReferrer: true }],
  },
});

/** 交流会（文書の名前つき）。 */
const EventView = contract.EventView.openapi("EventView");

/** 交流会の持ち主と組織の状態（文書の名前つき）。 */
const EventOrganizationState = contract.EventOrganizationState.openapi("EventOrganizationState");

/** 交流会を組織に入れる・外すの入力（文書の名前と例つき）。 */
const EventOrganizationInput = contract.EventOrganizationInput.openapi("EventOrganizationInput", {
  example: { organizationId: "0193a1b2-0000-7000-8000-000000000001" },
});

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
      summary:
        "交流会の一覧（自分が主催者の交流会〈持ち主・入れた組織の管理者と編集者〉と受付係の交流会。日時の新しい順）",
      description:
        "行ごとに持ち主・入れた組織・自分が持ち主かを返す（画面が組織ごとに絞る）。運営者もほかの人の交流会は見ない。運営者が開くと、持ち主のない今の交流会を運営者のものにする（event-002 research R1）。",
      middleware: [session] as const,
      responses: { 200: json(EventList, "交流会の一覧"), 401: unauthenticatedResponse },
    }),
    create: createRoute({
      method: "post",
      path: "/api/v1/events",
      tags,
      operationId: "eventCreate",
      summary: "交流会を作る（ログインした誰でも。作った人が持ち主）",
      middleware: [session] as const,
      request: {
        body: { required: true, content: { "application/json": { schema: EventInput } } },
      },
      responses: {
        201: json(EventView, "作った交流会"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
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
      description:
        "discounts を送ると、それがその交流会で使う割引のすべてになる（id のある行は直す・ない行は足す・並びにない割引は使うのをやめる。消さない）。送らなければ割引は変えない。割引を直しても、すでにあるチェックインの割引と金額は変わらない（reception-002）。",
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
    getOrganization: createRoute({
      method: "get",
      path: "/api/v1/events/{eventId}/organization",
      tags,
      operationId: "eventGetOrganization",
      summary: "持ち主と組織（主催者だけ。選べる組織は持ち主のときだけ）",
      middleware: [session, organizerOfEvent] as const,
      request: { params: EventParams },
      responses: {
        200: json(EventOrganizationState, "持ち主と組織"),
        401: unauthenticatedResponse,
        403: eventForbiddenResponse,
        404: eventNotFoundResponse,
      },
    }),
    putOrganization: createRoute({
      method: "put",
      path: "/api/v1/events/{eventId}/organization",
      tags,
      operationId: "eventPutOrganization",
      summary:
        "交流会を組織に入れる・入れ替える・外す（持ち主だけ。null で外す。今と同じなら何もしない）",
      description:
        "選べるのは持ち主が入っている組織だけ。入れると、その組織の管理者・編集者も主催者になり、メンバーは部員になる（AD-23）。",
      middleware: [session, organizerOfEvent] as const,
      request: {
        params: EventParams,
        body: {
          required: true,
          content: { "application/json": { schema: EventOrganizationInput } },
        },
      },
      responses: {
        200: json(EventOrganizationState, "入れたあとの持ち主と組織"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        403: domainErrorResponse(
          EVENT_ERRORS.EVENT_OWNER_ONLY,
          "主催者でない（FORBIDDEN）・主催者だが持ち主でない（EVENT_OWNER_ONLY）",
        ),
        404: domainErrorResponse(
          EVENT_ERRORS.EVENT_ORGANIZATION_NOT_FOUND,
          "交流会がない（NOT_FOUND）・持ち主が入っていない組織（EVENT_ORGANIZATION_NOT_FOUND）",
        ),
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
      summary: "招待を受けて受付係になる（すでにその交流会の主催者・受付係なら何もしない）",
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
 * 交流会の行を答えの形にする（持ち主と組織・使っている割引つき）。
 * @param deps 土台が渡す道具
 * @param record 交流会
 * @param viewerAccountId 今の利用者
 * @param myRole 今の利用者の役目
 * @returns 交流会
 */
async function viewOf(
  deps: DomainRouteDeps,
  record: EventRecord,
  viewerAccountId: string,
  myRole: contract.EventRole,
): Promise<contract.EventView> {
  const organizationId = await findEventOrganizationId(deps.db, record.id);
  const [view] = await buildEventViews(deps.db, viewerAccountId, [
    { record, organizationId, myRole },
  ]);
  if (!view) throw new Error("交流会の答えを作れませんでした。");
  return view;
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
      // 持ち主のない今の交流会を、運営者が開いたときに運営者のものにする（research R1。権限には使わない）
      if (isOrganizer(config, me)) await claimLegacyEvents(db, me.accountId);
      // 主催者の条件は判定の1か所（access.ts の resolveEventAccess）と同じ：持ち主か、管理者・編集者の組織に入れたもの
      const managed = (await listMemberships(db, me.accountId))
        .filter((membership) => membership.role !== "member")
        .map((membership) => membership.organizationId);
      const rows = await listAccessibleEvents(db, me.accountId, managed);
      const events = await buildEventViews(
        db,
        me.accountId,
        rows.map((row) => ({
          record: row.event,
          organizationId: row.organizationId,
          myRole:
            row.event.ownerAccountId === me.accountId ||
            (row.organizationId !== null && managed.includes(row.organizationId))
              ? "organizer"
              : "staff",
        })),
      );
      return c.json({ events }, 200);
    })
    .openapi(routes.create, async (c) => {
      const input = c.req.valid("json");
      const me = currentAccount(c);
      // 交流会と割引は同じ取引で作る（割引だけ残る・交流会だけ残るにしない）。作った人が持ち主（event-002）
      const record = await db.transaction(async (tx) => {
        const created = await insertEvent(tx, toValues(input), me.accountId);
        if (input.discounts) await saveDiscounts(tx, created.id, input.discounts);
        return created;
      });
      return c.json(await viewOf(deps, record, me.accountId, "organizer"), 201);
    })
    .openapi(routes.get, async (c) => {
      const me = currentAccount(c);
      const record = await mustFindEvent(deps, c.req.valid("param").eventId);
      const role = currentEventRole(c) === "organizer" ? "organizer" : "staff";
      return c.json(await viewOf(deps, record, me.accountId, role), 200);
    })
    .openapi(routes.update, async (c) => {
      const { eventId } = c.req.valid("param");
      const input = c.req.valid("json");
      const record = await db.transaction(async (tx) => {
        const updated = await updateEvent(tx, eventId, toValues(input));
        if (!updated) throw new AppError(EVENT_ERRORS.NOT_FOUND);
        if (input.discounts) await saveDiscounts(tx, eventId, input.discounts);
        return updated;
      });
      return c.json(await viewOf(deps, record, currentAccount(c).accountId, "organizer"), 200);
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
    .openapi(routes.getOrganization, async (c) => {
      const state = await getEventOrganizationState(
        db,
        c.req.valid("param").eventId,
        currentAccount(c).accountId,
      );
      return c.json(state, 200);
    })
    .openapi(routes.putOrganization, async (c) => {
      const { eventId } = c.req.valid("param");
      const me = currentAccount(c);
      await placeEvent(db, eventId, me.accountId, c.req.valid("json").organizationId);
      return c.json(await getEventOrganizationState(db, eventId, me.accountId), 200);
    })
    .openapi(routes.previewInvite, async (c) => {
      const record = await findInvitedEvent(deps, c.req.valid("param").inviteToken);
      const me = currentAccount(c);
      const role = (await resolveEventAccess(db, config, record.id, me))?.role ?? null;
      // 部員は受付係ではない（受ければ受付係になる）ので、受ける前の役目は「どれでもない」
      const myRole = role === "organizer" || role === "staff" ? role : null;
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
      const role = (await resolveEventAccess(db, config, record.id, me))?.role ?? null;
      if (role === "organizer") {
        const accepted: contract.InviteAccepted = { eventId: record.id, role: "organizer" };
        return c.json(accepted, 200);
      }
      // すでに受付係なら、期限にかかわらずそのまま通す（EXPERIENCE「すでに受付係なら、そのまま A3 へ」）
      if (role !== "staff") {
        if (Date.now() >= endOfJstDate(record.startsAt).getTime()) {
          throw new AppError(EVENT_ERRORS.STAFF_INVITE_EXPIRED);
        }
        await addStaff(db, record.id, me.accountId);
      }
      const accepted: contract.InviteAccepted = { eventId: record.id, role: "staff" };
      return c.json(accepted, 200);
    });
}
