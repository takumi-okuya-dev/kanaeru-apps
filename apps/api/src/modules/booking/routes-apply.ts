// 自前の申込みページの参加者の窓口（booking-003 contracts）。道の頭は /api/v1/booking（AD-23）。
// ログインなしで読める：申込みページ・.ics・メールで申し込む・札のページ（account の findSessionViewer でクッキーがあれば今の利用者を引く）。
// ログインが要る：申し込む・自分の申込み・取り消す・部の予定・案内の同意（account の requireSession）。
// 状態を変える道は、組み立ての CSRF と Origin の確かめ・IP ごとの回数の制限の中（S10）。GET は何も書かない（S5）。
// 名前・メールアドレス・札はログに出さない（組み立てのログは道の定義の形だけ）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/booking";
import { BOOKING_ERRORS } from "@workspace/contracts/booking";
import { domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import {
  currentAccount,
  findSessionViewer,
  requireSession,
  unauthenticatedResponse,
} from "../account/index.ts";
import {
  applyWithAccount,
  cancelEntryToken,
  cancelMyEntry,
  confirmEntryToken,
  listMyEntries,
  readApplyPage,
  readEntryToken,
  readIcs,
  readMyConsents,
  readMySchedule,
  removeMyConsent,
  requestEmailApply,
} from "./apply.ts";

/** 申込みページ。 */
const ApplyPage = contract.ApplyPage.openapi("BookingApplyPage");
/** 申し込む入力。 */
const ApplyInput = contract.ApplyInput.openapi("BookingApplyInput", {
  example: { name: "中村 さき", consent: false },
});
/** 申し込んだ答え。 */
const ApplyResult = contract.ApplyResult.openapi("BookingApplyResult");
/** メールで申し込む入力。 */
const EmailApplyInput = contract.EmailApplyInput.openapi("BookingEmailApplyInput", {
  example: { name: "小林 はると", email: "guest@example.com" },
});
/** メールで申し込む答え。 */
const EmailApplyAccepted = contract.EmailApplyAccepted.openapi("BookingEmailApplyAccepted");
/** 札のページ。 */
const EntryTokenView = contract.EntryTokenView.openapi("BookingEntryTokenView");
/** 自分の申込みの一覧。 */
const MyEntryList = contract.MyEntryList.openapi("BookingMyEntryList");
/** 自分の申込みの1行。 */
const MyEntryItem = contract.MyEntryItem.openapi("BookingMyEntryItem");
/** 部の予定。 */
const MySchedule = contract.MySchedule.openapi("BookingMySchedule");
/** 案内の同意の一覧。 */
const ConsentList = contract.ConsentList.openapi("BookingConsentList");

/** 道の eventId。 */
const EventParams = z.object({ eventId: uuidParam("eventId", "交流会の ID") });
/** 道の entryId。 */
const EntryParams = z.object({ entryId: uuidParam("entryId", "申込みの ID") });
/** 道の consentId。 */
const ConsentParams = z.object({ consentId: uuidParam("consentId", "案内の同意の ID") });
/** 道の札。 */
const TokenParams = z.object({
  entryToken: z
    .string()
    .max(100)
    .openapi({
      param: { name: "entryToken", in: "path" },
      description: "メールで申し込んだ人の札",
    }),
});

/** ページがない応答。 */
const pageNotFoundResponse = domainErrorResponse(
  BOOKING_ERRORS.PAGE_NOT_FOUND,
  "交流会がない・使い方が自前でない",
);
/** 部員だけの応答。 */
const membersOnlyResponse = domainErrorResponse(
  BOOKING_ERRORS.PAGE_MEMBERS_ONLY,
  "部員だけの回を、主催者・部員でない人が開いた（中身は返さない）",
);
/** 受付中でない応答。 */
const pageClosedResponse = domainErrorResponse(
  BOOKING_ERRORS.PAGE_CLOSED,
  "受付を閉じている・始まりを過ぎた",
);
/** 取り消せない応答。 */
const cancelClosedResponse = domainErrorResponse(
  BOOKING_ERRORS.CANCEL_CLOSED,
  "始まりを過ぎてから取り消そうとした",
);
/** 知らない札の応答。 */
const tokenInvalidResponse = domainErrorResponse(
  BOOKING_ERRORS.ENTRY_TOKEN_INVALID,
  "知らない札・新しい札に替わった・交流会が消えた",
);
/** 期限切れの札の応答。 */
const tokenExpiredResponse = domainErrorResponse(
  BOOKING_ERRORS.ENTRY_TOKEN_EXPIRED,
  "確認の札の期限（24時間）が過ぎた",
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
 * 参加者の窓口の道の定義（middleware に deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const tags = ["booking"];
  const base = "/api/v1/booking/events/{eventId}";
  return {
    getPage: createRoute({
      method: "get",
      path: `${base}/page`,
      tags,
      operationId: "bookingGetApplyPage",
      summary:
        "申込みページ（ログインなしで読める。ログインしていれば自分の申込み・案内の同意・名前の初めの値も）",
      request: { params: EventParams },
      responses: {
        200: json(ApplyPage, "申込みページ"),
        403: membersOnlyResponse,
        404: pageNotFoundResponse,
      },
    }),
    apply: createRoute({
      method: "post",
      path: `${base}/apply`,
      tags,
      operationId: "bookingApply",
      summary:
        "LINE ログインで申し込む（1交流会1人1つ。取り消しなら確定に戻す。もう確定なら同じ答え）",
      middleware: [session] as const,
      request: { params: EventParams, body: body(ApplyInput) },
      responses: {
        200: json(ApplyResult, "もう確定の申込み（何もしない）"),
        201: json(ApplyResult, "申し込んだ・確定に戻した"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        403: membersOnlyResponse,
        404: pageNotFoundResponse,
        409: pageClosedResponse,
      },
    }),
    getCalendar: createRoute({
      method: "get",
      path: `${base}/calendar`,
      tags,
      operationId: "bookingGetCalendar",
      summary: "カレンダーに追加の .ics（ログインなしで読める。ページと同じ見せる範囲）",
      request: { params: EventParams },
      responses: {
        200: {
          description: ".ics（添付）",
          content: { "text/calendar": { schema: z.string().openapi({ format: "binary" }) } },
        },
        403: membersOnlyResponse,
        404: pageNotFoundResponse,
      },
    }),
    requestEmail: createRoute({
      method: "post",
      path: `${base}/email-requests`,
      tags,
      operationId: "bookingRequestEmailApply",
      summary:
        "LINE を使わずに申し込む：確認のメールを送る（ログインなし。答えはそのアドレスの申込みがあるかにかかわらず同じ）",
      request: { params: EventParams, body: body(EmailApplyInput) },
      responses: {
        202: json(
          EmailApplyAccepted,
          "受け付けた（確認のメールを送るか、10分以内の2回目なら送らない）",
        ),
        400: invalidInputResponse,
        403: membersOnlyResponse,
        404: pageNotFoundResponse,
        409: pageClosedResponse,
        429: domainErrorResponse(
          BOOKING_ERRORS.EMAIL_REQUEST_LIMIT,
          "交流会ごとの確認の待ちが上限",
        ),
      },
    }),
    getEntryToken: createRoute({
      method: "get",
      path: "/api/v1/booking/entry-tokens/{entryToken}",
      tags,
      operationId: "bookingGetEntryToken",
      summary: "札のページ（確認の前か申込みがあるか。ログインなし。読むだけで確定しない）",
      request: { params: TokenParams },
      responses: {
        200: json(EntryTokenView, "札のページ"),
        404: tokenInvalidResponse,
        410: tokenExpiredResponse,
      },
    }),
    confirmEntryToken: createRoute({
      method: "post",
      path: "/api/v1/booking/entry-tokens/{entryToken}/confirm",
      tags,
      operationId: "bookingConfirmEntryToken",
      summary: "確認の札で申込みを確定する（2回押しても1行）",
      request: { params: TokenParams },
      responses: {
        200: json(EntryTokenView, "申込みがある"),
        403: membersOnlyResponse,
        404: tokenInvalidResponse,
        409: pageClosedResponse,
        410: tokenExpiredResponse,
      },
    }),
    cancelEntryToken: createRoute({
      method: "post",
      path: "/api/v1/booking/entry-tokens/{entryToken}/cancel",
      tags,
      operationId: "bookingCancelEntryToken",
      summary: "札で申込みを取り消す（始まりまで）",
      request: { params: TokenParams },
      responses: {
        200: json(EntryTokenView, "取り消した"),
        404: tokenInvalidResponse,
        409: cancelClosedResponse,
      },
    }),
    listMyEntries: createRoute({
      method: "get",
      path: "/api/v1/booking/me/entries",
      tags,
      operationId: "bookingListMyEntries",
      summary: "自分の申込み（始まりの日が終わっていない会だけ・始まりの近い順）",
      middleware: [session] as const,
      responses: { 200: json(MyEntryList, "自分の申込み"), 401: unauthenticatedResponse },
    }),
    cancelMyEntry: createRoute({
      method: "post",
      path: "/api/v1/booking/me/entries/{entryId}/cancel",
      tags,
      operationId: "bookingCancelMyEntry",
      summary: "自分の申込みを取り消す（本人の行だけ・始まりまで）",
      middleware: [session] as const,
      request: { params: EntryParams },
      responses: {
        200: json(MyEntryItem, "取り消した"),
        401: unauthenticatedResponse,
        404: domainErrorResponse(BOOKING_ERRORS.ENTRY_NOT_FOUND, "本人の行でない・ない"),
        409: cancelClosedResponse,
      },
    }),
    getMySchedule: createRoute({
      method: "get",
      path: "/api/v1/booking/me/schedule",
      tags,
      operationId: "bookingGetMySchedule",
      summary: "部の予定（自分がメンバーの組織に入れた自前の会。部員だけの回も）",
      middleware: [session] as const,
      responses: { 200: json(MySchedule, "部の予定"), 401: unauthenticatedResponse },
    }),
    listMyConsents: createRoute({
      method: "get",
      path: "/api/v1/booking/me/consents",
      tags,
      operationId: "bookingListMyConsents",
      summary: "案内の同意の一覧（本人だけ）",
      middleware: [session] as const,
      responses: { 200: json(ConsentList, "案内の同意"), 401: unauthenticatedResponse },
    }),
    deleteMyConsent: createRoute({
      method: "delete",
      path: "/api/v1/booking/me/consents/{consentId}",
      tags,
      operationId: "bookingDeleteMyConsent",
      summary: "案内の同意を外す（本人のものだけ）",
      middleware: [session] as const,
      request: { params: ConsentParams },
      responses: {
        204: { description: "外した" },
        401: unauthenticatedResponse,
        404: domainErrorResponse(BOOKING_ERRORS.CONSENT_NOT_FOUND, "本人のものでない・ない"),
      },
    }),
  };
}

/**
 * 自前の申込みページの参加者の窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function bookingApplyRoutes(deps: DomainRouteDeps) {
  const routes = defineRoutes(deps);
  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getPage, async (c) => {
      const viewer = await findSessionViewer(deps, c);
      const page = await readApplyPage(deps, c.req.valid("param").eventId, viewer, new Date());
      return c.json(page, 200);
    })
    .openapi(routes.apply, async (c) => {
      const { eventId } = c.req.valid("param");
      const { result, created } = await applyWithAccount(
        deps,
        eventId,
        currentAccount(c),
        c.req.valid("json"),
        new Date(),
      );
      return created ? c.json(result, 201) : c.json(result, 200);
    })
    .openapi(routes.getCalendar, async (c) => {
      const viewer = await findSessionViewer(deps, c);
      const ics = await readIcs(deps, c.req.valid("param").eventId, viewer, new Date());
      return c.body(ics, 200, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="event.ics"',
      });
    })
    .openapi(routes.requestEmail, async (c) => {
      await requestEmailApply(deps, c.req.valid("param").eventId, c.req.valid("json"), new Date());
      return c.json({ accepted: true as const }, 202);
    })
    .openapi(routes.getEntryToken, async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(await readEntryToken(deps, c.req.valid("param").entryToken, new Date()), 200);
    })
    .openapi(routes.confirmEntryToken, async (c) => {
      const view = await confirmEntryToken(deps, c.req.valid("param").entryToken, new Date());
      return c.json(view, 200);
    })
    .openapi(routes.cancelEntryToken, async (c) => {
      const view = await cancelEntryToken(deps, c.req.valid("param").entryToken, new Date());
      return c.json(view, 200);
    })
    .openapi(routes.listMyEntries, async (c) => {
      const entries = await listMyEntries(deps, currentAccount(c).accountId, new Date());
      return c.json({ entries }, 200);
    })
    .openapi(routes.cancelMyEntry, async (c) => {
      const item = await cancelMyEntry(
        deps,
        currentAccount(c).accountId,
        c.req.valid("param").entryId,
        new Date(),
      );
      return c.json(item, 200);
    })
    .openapi(routes.getMySchedule, async (c) => {
      return c.json(await readMySchedule(deps, currentAccount(c).accountId, new Date()), 200);
    })
    .openapi(routes.listMyConsents, async (c) => {
      return c.json(await readMyConsents(deps, currentAccount(c).accountId), 200);
    })
    .openapi(routes.deleteMyConsent, async (c) => {
      await removeMyConsent(deps, currentAccount(c).accountId, c.req.valid("param").consentId);
      return c.body(null, 204);
    });
}
