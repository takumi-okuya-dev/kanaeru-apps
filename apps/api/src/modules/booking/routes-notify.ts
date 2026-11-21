// 予約の知らせの窓口（booking-002 contracts）：公式アカウントとメールの設定（個人・組織）・確かめのメッセージ・紐づけ・
// 参加者の連絡のメールアドレス・開発の窓口。道の頭は /api/v1/booking（AD-23）。どれもログインが要る（account の requireSession）。
// 組織の設定は、要求のたびに組織の管理者かを引く（research R11）。個人の設定は今の利用者のものだけを扱う（道に人の ID を持たない）。
// 鍵は答えに返さず（末尾だけ）、鍵・札・宛先・本文はログに出さない。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/booking";
import { BOOKING_ERRORS } from "@workspace/contracts/booking";
import { AppError, domainErrorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, notFoundResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { currentAccount, requireSession, unauthenticatedResponse } from "../account/index.ts";
import { consumeLinkToken, previewLinkToken } from "./line-link.ts";
import { sendTestMessage } from "./notify.ts";
import {
  deleteContactEmail,
  ensureChannel,
  findContactEmail,
  upsertContactEmail,
  writeReplyTo,
} from "./notify-repository.ts";
import type { NotifyHolderRef } from "./notify-repository.ts";
import {
  assertOrganizationAdmin,
  buildNotifySettings,
  notifierOf,
  removeLineChannel,
  saveLineChannel,
} from "./notify-settings.ts";

/** 設定の画面の答え。 */
const NotifySettings = contract.NotifySettings.openapi("BookingNotifySettings");
/** 公式アカウントの設定の入力。 */
const LineChannelInput = contract.LineChannelInput.openapi("BookingLineChannelInput", {
  example: {
    lineChannelId: "1234567890",
    channelSecret: "（32文字）",
    accessToken: "（長期のトークン）",
  },
});
/** メールの返信先の入力。 */
const MailSettingInput = contract.MailSettingInput.openapi("BookingMailSettingInput", {
  example: { replyToEmail: "reply@example.com" },
});
/** 確かめのメッセージの結果。 */
const TestMessageResult = contract.TestMessageResult.openapi("BookingTestMessageResult");
/** 紐づけの札の中身。 */
const LineLinkPreview = contract.LineLinkPreview.openapi("BookingLineLinkPreview");
/** 紐づけた結果。 */
const LineLinkResult = contract.LineLinkResult.openapi("BookingLineLinkResult");
/** 連絡のメールアドレスの入力。 */
const ContactInput = contract.ContactInput.openapi("BookingContactInput", {
  example: { email: "hanako@example.com" },
});
/** 連絡のメールアドレス。 */
const ContactView = contract.ContactView.openapi("BookingContactView");
/** 偽の送り手が覚えたもの。 */
const FakeOutbox = contract.FakeOutbox.openapi("BookingFakeOutbox");

/** 道の組織の ID。 */
const OrganizationParams = z.object({ organizationId: uuidParam("organizationId", "組織の ID") });
/** 道の紐づけの札。 */
const LinkParams = z.object({
  linkToken: z
    .string()
    .max(100)
    .openapi({ param: { name: "linkToken", in: "path" }, description: "紐づけの札" }),
});

/** 組織の管理者でない応答。 */
const notifyForbiddenResponse = domainErrorResponse(
  BOOKING_ERRORS.NOTIFY_FORBIDDEN,
  "組織の管理者でない・組織の人でない・組織がない",
);
/** 秘密の箱がない応答。 */
const notifyUnavailableResponse = domainErrorResponse(
  BOOKING_ERRORS.NOTIFY_UNAVAILABLE,
  "鍵の束（TOKEN_ENCRYPTION_KEYS）の設定がない",
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
 * 知らせの窓口の道の定義。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function defineRoutes(deps: DomainRouteDeps) {
  const session = requireSession(deps);
  const tags = ["booking"];
  const personal = "/api/v1/booking/notify-settings/personal";
  const organization = "/api/v1/booking/notify-settings/organizations/{organizationId}";
  const orgRequest = { params: OrganizationParams };
  const base = { 401: unauthenticatedResponse } as const;
  const orgErrors = { ...base, 403: notifyForbiddenResponse, 404: notFoundResponse } as const;
  const saveErrors = {
    400: invalidInputResponse,
    409: domainErrorResponse(
      BOOKING_ERRORS.LINE_CHANNEL_TAKEN,
      "同じチャネル ID が、ほかの持ち主の設定に入っている",
    ),
    502: domainErrorResponse(BOOKING_ERRORS.LINE_UNREACHABLE, "LINE に確かめられない"),
    503: notifyUnavailableResponse,
  } as const;
  const testErrors = {
    409: domainErrorResponse(BOOKING_ERRORS.LINE_NOT_SET, "公式アカウントの LINE の値がない"),
    503: notifyUnavailableResponse,
  } as const;
  const mailRequest = { body: body(MailSettingInput) };
  const lineRequest = { body: body(LineChannelInput) };
  return {
    getPersonal: createRoute({
      method: "get",
      path: personal,
      tags,
      operationId: "bookingGetPersonalNotifySettings",
      summary:
        "個人の公式アカウントとメールの設定（本人だけ。鍵は末尾だけ。自分が管理者の組織の一覧つき）",
      middleware: [session] as const,
      responses: { 200: json(NotifySettings, "設定"), ...base },
    }),
    putPersonalLine: createRoute({
      method: "put",
      path: `${personal}/line`,
      tags,
      operationId: "bookingPutPersonalLineChannel",
      summary: "個人の公式アカウントの値を入れる・入れ直す（ボット情報で確かめる）",
      middleware: [session] as const,
      request: lineRequest,
      responses: { 200: json(NotifySettings, "設定"), ...base, ...saveErrors },
    }),
    deletePersonalLine: createRoute({
      method: "delete",
      path: `${personal}/line`,
      tags,
      operationId: "bookingDeletePersonalLineChannel",
      summary: "個人の公式アカウントの値を消す（紐づけと札も消える）",
      middleware: [session] as const,
      responses: { 200: json(NotifySettings, "設定"), ...base },
    }),
    putPersonalMail: createRoute({
      method: "put",
      path: `${personal}/mail`,
      tags,
      operationId: "bookingPutPersonalMailSetting",
      summary: "個人のメールの返信先を変える（null で消す）",
      middleware: [session] as const,
      request: mailRequest,
      responses: { 200: json(NotifySettings, "設定"), 400: invalidInputResponse, ...base },
    }),
    testPersonal: createRoute({
      method: "post",
      path: `${personal}/test`,
      tags,
      operationId: "bookingTestPersonalLine",
      summary: "自分に確かめのメッセージを送る（紐づいていれば、守りを通して本人にだけ）",
      middleware: [session] as const,
      responses: { 200: json(TestMessageResult, "結果"), ...base, ...testErrors },
    }),
    getOrganization: createRoute({
      method: "get",
      path: organization,
      tags,
      operationId: "bookingGetOrganizationNotifySettings",
      summary: "組織の公式アカウントとメールの設定（組織の管理者だけ）",
      middleware: [session] as const,
      request: orgRequest,
      responses: { 200: json(NotifySettings, "設定"), ...orgErrors },
    }),
    putOrganizationLine: createRoute({
      method: "put",
      path: `${organization}/line`,
      tags,
      operationId: "bookingPutOrganizationLineChannel",
      summary: "組織の公式アカウントの値を入れる・入れ直す（組織の管理者だけ）",
      middleware: [session] as const,
      request: { ...orgRequest, ...lineRequest },
      responses: { 200: json(NotifySettings, "設定"), ...orgErrors, ...saveErrors },
    }),
    deleteOrganizationLine: createRoute({
      method: "delete",
      path: `${organization}/line`,
      tags,
      operationId: "bookingDeleteOrganizationLineChannel",
      summary: "組織の公式アカウントの値を消す（組織の管理者だけ）",
      middleware: [session] as const,
      request: orgRequest,
      responses: { 200: json(NotifySettings, "設定"), ...orgErrors },
    }),
    putOrganizationMail: createRoute({
      method: "put",
      path: `${organization}/mail`,
      tags,
      operationId: "bookingPutOrganizationMailSetting",
      summary: "組織のメールの返信先を変える（組織の管理者だけ）",
      middleware: [session] as const,
      request: { ...orgRequest, ...mailRequest },
      responses: { 200: json(NotifySettings, "設定"), 400: invalidInputResponse, ...orgErrors },
    }),
    testOrganization: createRoute({
      method: "post",
      path: `${organization}/test`,
      tags,
      operationId: "bookingTestOrganizationLine",
      summary: "組織の公式アカウントから、自分に確かめのメッセージを送る（組織の管理者だけ）",
      middleware: [session] as const,
      request: orgRequest,
      responses: { 200: json(TestMessageResult, "結果"), ...orgErrors, ...testErrors },
    }),
    getLineLink: createRoute({
      method: "get",
      path: "/api/v1/booking/line-links/{linkToken}",
      tags,
      operationId: "bookingGetLineLink",
      summary: "紐づけの札の中身（使える・使った・期限切れ。公式アカウントの持ち主の名前）",
      middleware: [session] as const,
      request: { params: LinkParams },
      responses: {
        200: json(LineLinkPreview, "札の中身"),
        ...base,
        404: domainErrorResponse(BOOKING_ERRORS.LINK_INVALID, "知らない札・設定が消えた"),
      },
    }),
    postLineLink: createRoute({
      method: "post",
      path: "/api/v1/booking/line-links/{linkToken}",
      tags,
      operationId: "bookingPostLineLink",
      summary: "札を使って、今の利用者と公式アカウントの友だちを紐づける（1回だけ）",
      middleware: [session] as const,
      request: { params: LinkParams },
      responses: {
        200: json(LineLinkResult, "紐づけた"),
        ...base,
        404: domainErrorResponse(BOOKING_ERRORS.LINK_INVALID, "知らない札"),
        409: domainErrorResponse(BOOKING_ERRORS.LINK_USED, "使った札"),
        410: domainErrorResponse(BOOKING_ERRORS.LINK_EXPIRED, "期限切れの札"),
      },
    }),
    getContact: createRoute({
      method: "get",
      path: "/api/v1/booking/me/contact",
      tags,
      operationId: "bookingGetContact",
      summary: "自分の連絡のメールアドレス（本人だけ。予約の知らせのためだけ）",
      middleware: [session] as const,
      responses: { 200: json(ContactView, "メールアドレス"), ...base },
    }),
    putContact: createRoute({
      method: "put",
      path: "/api/v1/booking/me/contact",
      tags,
      operationId: "bookingPutContact",
      summary: "自分の連絡のメールアドレスを入れる（あれば置きかえる）",
      middleware: [session] as const,
      request: { body: body(ContactInput) },
      responses: { 200: json(ContactView, "メールアドレス"), 400: invalidInputResponse, ...base },
    }),
    deleteContact: createRoute({
      method: "delete",
      path: "/api/v1/booking/me/contact",
      tags,
      operationId: "bookingDeleteContact",
      summary: "自分の連絡のメールアドレスを消す",
      middleware: [session] as const,
      responses: { 200: json(ContactView, "消した"), ...base },
    }),
    devOutbox: createRoute({
      method: "get",
      path: "/api/v1/booking/dev/notify-outbox",
      tags,
      operationId: "bookingDevNotifyOutbox",
      summary:
        "偽の送り手が覚えたもの（試験用のログインが入で、偽の送り手のときだけ。手元とテストで紐づけを試すため。ほかは 404）",
      middleware: [session] as const,
      responses: {
        200: json(FakeOutbox, "覚えたもの（新しい順）"),
        ...base,
        404: notFoundResponse,
      },
    }),
  };
}

/**
 * 予約の知らせの窓口を作る。戻り値の型は書かない（画面の型を残す）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function bookingNotifyRoutes(deps: DomainRouteDeps) {
  const { db } = deps;
  const routes = defineRoutes(deps);
  /**
   * 組織の持ち主（管理者でなければ 403）。
   * @param organizationId 組織の ID
   * @param accountId 今の利用者
   * @returns 持ち主
   */
  const organizationHolder = async (
    organizationId: string,
    accountId: string,
  ): Promise<NotifyHolderRef> => {
    await assertOrganizationAdmin(db, organizationId, accountId);
    return { kind: "organization", organizationId };
  };
  /**
   * 返信先を書く（設定の行がなければ作る）。
   * @param holder 持ち主
   * @param replyToEmail 返信先
   */
  const saveMail = async (holder: NotifyHolderRef, replyToEmail: string | null) => {
    await db.transaction(async (tx) => {
      const channel = await ensureChannel(tx, holder);
      await writeReplyTo(tx, channel.id, replyToEmail);
    });
  };
  const personalOf = (accountId: string): NotifyHolderRef => ({ kind: "personal", accountId });

  return new OpenAPIHono<ApiEnv>()
    .openapi(routes.getPersonal, async (c) => {
      const me = currentAccount(c).accountId;
      return c.json(await buildNotifySettings(deps, personalOf(me), me), 200);
    })
    .openapi(routes.putPersonalLine, async (c) => {
      const me = currentAccount(c).accountId;
      await saveLineChannel(deps, personalOf(me), c.req.valid("json"));
      return c.json(await buildNotifySettings(deps, personalOf(me), me), 200);
    })
    .openapi(routes.deletePersonalLine, async (c) => {
      const me = currentAccount(c).accountId;
      await removeLineChannel(db, personalOf(me));
      return c.json(await buildNotifySettings(deps, personalOf(me), me), 200);
    })
    .openapi(routes.putPersonalMail, async (c) => {
      const me = currentAccount(c).accountId;
      await saveMail(personalOf(me), c.req.valid("json").replyToEmail);
      return c.json(await buildNotifySettings(deps, personalOf(me), me), 200);
    })
    .openapi(routes.testPersonal, async (c) => {
      const me = currentAccount(c).accountId;
      return c.json(await sendTestMessage(deps, personalOf(me), me), 200);
    })
    .openapi(routes.getOrganization, async (c) => {
      const me = currentAccount(c).accountId;
      const holder = await organizationHolder(c.req.valid("param").organizationId, me);
      return c.json(await buildNotifySettings(deps, holder, me), 200);
    })
    .openapi(routes.putOrganizationLine, async (c) => {
      const me = currentAccount(c).accountId;
      const holder = await organizationHolder(c.req.valid("param").organizationId, me);
      await saveLineChannel(deps, holder, c.req.valid("json"));
      return c.json(await buildNotifySettings(deps, holder, me), 200);
    })
    .openapi(routes.deleteOrganizationLine, async (c) => {
      const me = currentAccount(c).accountId;
      const holder = await organizationHolder(c.req.valid("param").organizationId, me);
      await removeLineChannel(db, holder);
      return c.json(await buildNotifySettings(deps, holder, me), 200);
    })
    .openapi(routes.putOrganizationMail, async (c) => {
      const me = currentAccount(c).accountId;
      const holder = await organizationHolder(c.req.valid("param").organizationId, me);
      await saveMail(holder, c.req.valid("json").replyToEmail);
      return c.json(await buildNotifySettings(deps, holder, me), 200);
    })
    .openapi(routes.testOrganization, async (c) => {
      const me = currentAccount(c).accountId;
      const holder = await organizationHolder(c.req.valid("param").organizationId, me);
      return c.json(await sendTestMessage(deps, holder, me), 200);
    })
    .openapi(routes.getLineLink, async (c) => {
      const me = currentAccount(c).accountId;
      c.header("Cache-Control", "no-store");
      return c.json(
        await previewLinkToken(deps, c.req.valid("param").linkToken, me, new Date()),
        200,
      );
    })
    .openapi(routes.postLineLink, async (c) => {
      const me = currentAccount(c).accountId;
      const holderName = await consumeLinkToken(
        deps,
        c.req.valid("param").linkToken,
        me,
        new Date(),
      );
      return c.json({ holderName }, 200);
    })
    .openapi(routes.getContact, async (c) => {
      const me = currentAccount(c).accountId;
      return c.json({ email: await findContactEmail(db, me) }, 200);
    })
    .openapi(routes.putContact, async (c) => {
      const me = currentAccount(c).accountId;
      const { email } = c.req.valid("json");
      await upsertContactEmail(db, me, email);
      return c.json({ email }, 200);
    })
    .openapi(routes.deleteContact, async (c) => {
      await deleteContactEmail(db, currentAccount(c).accountId);
      return c.json({ email: null }, 200);
    })
    .openapi(routes.devOutbox, (c) => {
      // 試験用のログイン（staging・production では起動のときに止まる）と偽の送り手がそろうときだけ（research R18）
      const outbox = deps.config.testLoginEnabled ? notifierOf(deps).fakeOutbox() : null;
      if (!outbox) throw new AppError("NOT_FOUND");
      return c.json({ messages: [...outbox] }, 200);
    });
}
