// 定員・キャンセル待ち・打診の窓口（booking-004 contracts）。道の頭は /api/v1/booking（AD-23）。
// 主催者の窓口（定員と枠・手で打診・送った知らせ・変更を知らせる・予約を中止する）はログインと event の requireEventRole
// （主催者だけ。要求のたびに役目を引く。AD-5・S9）。参加者の返事は、LINE の人は本人の行だけ（requireSession）、メールの人は札。
// 定期の窓口（POST /api/v1/booking/jobs/tick）は、共通の窓口（POST /api/v1/jobs/tick。core-017）が動かす scheduledJob と同じ
// 関数を呼ぶ。本番の Cloud Scheduler は共通の窓口だけを呼び、この窓口はテストと手元の確かめに使う（booking-007【仮決め】）。
// 合言葉（Authorization: Bearer）がない・違うときは、窓口があることを知らせないよう 404（threads-002 と同じ形。S1）。
// 名前・メールアドレス・札はログに出さない。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/booking";
import { BOOKING_ERRORS } from "@workspace/contracts/booking";
import { createMiddleware } from "hono/factory";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, notFoundResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import { eventForbiddenResponse, eventNotFoundResponse, requireEventRole } from "../event/index.ts";
import { respondEntryToken, respondMyEntry } from "./apply.ts";
import { findEntry } from "./repository.ts";
import { readSettingView, readRosterEntryView } from "./setting-view.ts";
import {
  cancelBooking,
  offerByOrganizer,
  readNoticeLog,
  resolveScheduleChange,
  saveCapacity,
} from "./waitlist.ts";
import { bookingScheduledJob } from "./scheduled-job.ts";

/** 使い方（文書の名前つき。routes.ts と同じ形）。 */
const BookingSetting = contract.BookingSetting.openapi("BookingSettingWithSeats");
/** 名簿の行。 */
const RosterEntry = contract.RosterEntry.openapi("BookingRosterEntryWithOffer");
/** 定員と枠の入力。 */
const CapacityInput = contract.CapacityInput.openapi("BookingCapacityInput", {
  example: {
    capacity: 16,
    quotas: [{ applicationSource: "peatix", seats: 4, manageUrl: "https://example.com/manage" }],
  },
});
/** 変更を知らせるか。 */
const ChangeNoticeInput = contract.ChangeNoticeInput.openapi("BookingChangeNoticeInput");
/** 打診への返事。 */
const OfferAnswerInput = contract.OfferAnswerInput.openapi("BookingOfferAnswerInput", {
  example: { answer: "accept" },
});
/** 送った知らせ。 */
const NoticeLog = contract.NoticeLog.openapi("BookingNoticeLog");
/** 定期の仕事の答え。 */
const WaitlistJobSummary = contract.WaitlistJobSummary.openapi("BookingWaitlistJobSummary");
/** 自分の申込みの1行。 */
const MyEntryItem = contract.MyEntryItem.openapi("BookingMyEntryItemWithOffer");
/** 札のページ。 */
const EntryTokenView = contract.EntryTokenView.openapi("BookingEntryTokenViewWithOffer");

/** 道の eventId。 */
const EventParams = z.object({ eventId: uuidParam("eventId", "交流会の ID") });
/** 道の eventId と entryId。 */
const EventEntryParams = z.object({
  eventId: uuidParam("eventId", "交流会の ID"),
  entryId: uuidParam("entryId", "名簿の行の ID"),
});
/** 道の entryId。 */
const EntryParams = z.object({ entryId: uuidParam("entryId", "申込みの ID") });
/** 道の札。 */
const TokenParams = z.object({
  entryToken: z
    .string()
    .max(100)
    .openapi({
      param: { name: "entryToken", in: "path" },
      description: "メールで申し込んだ人の札（申込みの札か打診の返事の札）",
    }),
});

/** 返事の誤りの応答。 */
const respondErrors = {
  409: domainErrorResponse(
    BOOKING_ERRORS.OFFER_NOT_PENDING,
    "打診中でもキャンセル待ちでもない（BOOKING_OFFER_NOT_PENDING）・当日の空きが埋まった（BOOKING_NO_SEAT）",
  ),
  410: domainErrorResponse(BOOKING_ERRORS.OFFER_EXPIRED, "返事の期限が過ぎた"),
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
 * JSON の本文の書き方。
 * @param schema 本文の形
 * @returns OpenAPI の本文の定義
 */
function body<T>(schema: T) {
  return { required: true, content: { "application/json": { schema } } } as const;
}

/**
 * 定員・キャンセル待ちの窓口の道の定義。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const organizerOnly = requireEventRole(deps, ["organizer"]);
  const tags = ["booking"];
  const base = "/api/v1/booking/events/{eventId}";
  const errors = {
    401: unauthenticatedResponse,
    403: eventForbiddenResponse,
    404: eventNotFoundResponse,
  } as const;
  // 定期の仕事：合言葉（違えば 404。S1）
  const jobAuth = createMiddleware<ApiEnv>(async (c, next) => {
    if (!deps.isJobRequest(c.req.header("authorization"))) {
      deps.logger.warn({}, "予約の定期の仕事の窓口に、合言葉の合わない要求が来ました");
      throw new AppError("NOT_FOUND");
    }
    await next();
  });
  return {
    putCapacity: createRoute({
      method: "put",
      path: `${base}/capacity`,
      tags,
      operationId: "bookingPutCapacity",
      summary:
        "定員と媒体の枠を変える（主催者だけ。丸ごと置きかえ。増えた席はキャンセル待ちに打診する。booking-004）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams, body: body(CapacityInput) },
      responses: {
        200: json(BookingSetting, "変えた設定"),
        400: {
          description: "入力の誤り（枠の合計が定員を超える・定員なしで枠・同じ媒体・URL の形）",
          content: invalidInputResponse.content,
        },
        ...errors,
        409: domainErrorResponse(BOOKING_ERRORS.ROSTER_OFF, "使い方が受付だけ"),
      },
    }),
    offer: createRoute({
      method: "post",
      path: `${base}/entries/{entryId}/offer`,
      tags,
      operationId: "bookingOfferEntry",
      summary: "キャンセル待ちの人に手で打診する（主催者だけ。席がなくても押さえる）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventEntryParams },
      responses: {
        200: json(RosterEntry, "打診した行"),
        ...errors,
        409: domainErrorResponse(
          BOOKING_ERRORS.ENTRY_NOT_WAITLISTED,
          "キャンセル待ちでない・キャンセル待ちを使っていない（BOOKING_WAITLIST_OFF）・期限が1時間取れない（BOOKING_OFFER_WINDOW_SHORT）",
        ),
      },
    }),
    notices: createRoute({
      method: "get",
      path: `${base}/entries/{entryId}/notices`,
      tags,
      operationId: "bookingListEntryNotices",
      summary: "申込みに送った知らせ（主催者だけ。種類・手段・結果・時刻だけ。新しい順）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventEntryParams },
      responses: { 200: json(NoticeLog, "送った知らせ"), ...errors },
    }),
    changeNotice: createRoute({
      method: "post",
      path: `${base}/change-notice`,
      tags,
      operationId: "bookingChangeNotice",
      summary:
        "日時や場所の変更を知らせる・知らせずに済ませる（主催者だけ。最後に知らせた日時と場所を今に合わせる）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams, body: body(ChangeNoticeInput) },
      responses: {
        200: json(BookingSetting, "済ませたあとの設定"),
        400: invalidInputResponse,
        ...errors,
        409: domainErrorResponse(
          BOOKING_ERRORS.NO_CHANGE,
          "変更がない（BOOKING_NO_CHANGE）・自前でない（BOOKING_SELF_PAGE_OFF）",
        ),
      },
    }),
    cancelBooking: createRoute({
      method: "post",
      path: `${base}/cancel-booking`,
      tags,
      operationId: "bookingCancelBooking",
      summary:
        "予約を中止する（主催者だけ。取り消しでない申込みを取り消しにして中止を知らせる。戻せない。もう中止なら同じ答え）",
      middleware: [session, organizerOnly] as const,
      request: { params: EventParams },
      responses: {
        200: json(BookingSetting, "中止したあとの設定"),
        ...errors,
        409: domainErrorResponse(BOOKING_ERRORS.SELF_PAGE_OFF, "使い方が自前でない"),
      },
    }),
    respondMine: createRoute({
      method: "post",
      path: "/api/v1/booking/me/entries/{entryId}/respond",
      tags,
      operationId: "bookingRespondMyEntry",
      summary: "打診に答える（参加する・辞退する。当日の空きの参加も。本人の行だけ）",
      middleware: [session] as const,
      request: { params: EntryParams, body: body(OfferAnswerInput) },
      responses: {
        200: json(MyEntryItem, "答えたあとの1行"),
        400: invalidInputResponse,
        401: unauthenticatedResponse,
        404: domainErrorResponse(BOOKING_ERRORS.ENTRY_NOT_FOUND, "本人の行でない・ない"),
        ...respondErrors,
      },
    }),
    respondToken: createRoute({
      method: "post",
      path: "/api/v1/booking/entry-tokens/{entryToken}/respond",
      tags,
      operationId: "bookingRespondEntryToken",
      summary: "札で打診に答える（参加する・辞退する。申込みの札か返事の札）",
      request: { params: TokenParams, body: body(OfferAnswerInput) },
      responses: {
        200: json(EntryTokenView, "答えたあとの札のページ"),
        400: invalidInputResponse,
        404: domainErrorResponse(BOOKING_ERRORS.ENTRY_TOKEN_INVALID, "知らない札"),
        ...respondErrors,
      },
    }),
    tick: createRoute({
      method: "post",
      path: "/api/v1/booking/jobs/tick",
      tags,
      operationId: "bookingJobTick",
      summary:
        "予約の定期の仕事を1回行う（期限切れ・打診・当日の空き・変更の知らせ。テストと手元の確かめ用。本番は共通の窓口 /api/v1/jobs/tick が10分ごと・9時〜23時台に動かす）",
      description:
        "見出し Authorization: Bearer <JOB_TRIGGER_SECRET> が要る。合わなければ 404。時間帯は見ずに、呼べばいつでも1回動かす。",
      middleware: [jobAuth],
      responses: {
        200: json(WaitlistJobSummary, "この回の結果（数だけ）"),
        404: notFoundResponse,
      },
    }),
  };
}

/**
 * 定員・キャンセル待ちの窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function bookingWaitlistRoutes(deps: DomainRouteDeps) {
  const routes = defineRoutes(deps);
  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.putCapacity, async (c) => {
      const { eventId } = c.req.valid("param");
      await saveCapacity(deps, eventId, c.req.valid("json"), new Date());
      return c.json(await readSettingView(deps, eventId), 200);
    })
    .openapi(routes.offer, async (c) => {
      const { eventId, entryId } = c.req.valid("param");
      await offerByOrganizer(deps, eventId, entryId, currentAccount(c).accountId, new Date());
      return c.json(await readRosterEntryView(deps, eventId, entryId), 200);
    })
    .openapi(routes.notices, async (c) => {
      const { eventId, entryId } = c.req.valid("param");
      if (!(await findEntry(deps.db, eventId, entryId))) {
        throw new AppError(BOOKING_ERRORS.ENTRY_NOT_FOUND);
      }
      return c.json(await readNoticeLog(deps.db, entryId), 200);
    })
    .openapi(routes.changeNotice, async (c) => {
      const { eventId } = c.req.valid("param");
      await resolveScheduleChange(deps, eventId, c.req.valid("json").notify);
      return c.json(await readSettingView(deps, eventId), 200);
    })
    .openapi(routes.cancelBooking, async (c) => {
      const { eventId } = c.req.valid("param");
      await cancelBooking(deps, eventId, new Date());
      return c.json(await readSettingView(deps, eventId), 200);
    })
    .openapi(routes.respondMine, async (c) => {
      const item = await respondMyEntry(
        deps,
        currentAccount(c).accountId,
        c.req.valid("param").entryId,
        c.req.valid("json").answer,
        new Date(),
      );
      return c.json(item, 200);
    })
    .openapi(routes.respondToken, async (c) => {
      const view = await respondEntryToken(
        deps,
        c.req.valid("param").entryToken,
        c.req.valid("json").answer,
        new Date(),
      );
      return c.json(view, 200);
    })
    .openapi(routes.tick, async (c) => {
      return c.json(await bookingScheduledJob.run(deps), 200);
    });
}
