// 予約の知らせの窓口の入出力の形（LINE 公式アカウントの設定・メールの返信先・確かめのメッセージ・紐づけ・参加者の連絡のメールアドレス。
// booking-002 contracts）。ふつうの zod で書く（OpenAPI の名前は API の側で付ける）。入力の誤りの文は、欄のそばに出せる日本語。
// 公式アカウントの鍵は答えに入れない（末尾4文字だけ。research R9）。参加者のメールアドレスは本人の窓口だけが返す（Constitution II）。
import { z } from "zod";
import { NOTICE_RESULTS, NOTIFY_MODES } from "./notify-options.ts";

/** メールアドレスの文字数の上限。 */
export const EMAIL_MAX = 254;

/** 鍵の末尾として画面に出す文字数（research R9）。 */
export const SECRET_TAIL_LENGTH = 4;

/** 紐づけの札の期限（日。research R3）。 */
export const LINE_LINK_TTL_DAYS = 7;

/** 時差つきの ISO 8601。 */
const isoDateTime = z.iso.datetime({ offset: true });

/** 送り方の形。 */
export const NotifyModeSchema = z.enum(NOTIFY_MODES);

/** 知らせの結果の形。 */
export const NoticeResultSchema = z.enum(NOTICE_RESULTS);

/** チャネル ID（数字だけ）。 */
const LineChannelId = z
  .string({ error: "チャネル ID を入れてください。" })
  .trim()
  .regex(/^\d{1,20}$/, {
    error: "チャネル ID は数字だけで入れてください（Messaging API の画面の「チャネル ID」）。",
  });

/** チャネルシークレット（16進の32文字）。 */
const ChannelSecret = z
  .string({ error: "チャネルシークレットを入れてください。" })
  .trim()
  .regex(/^[0-9a-fA-F]{32}$/, {
    error:
      "チャネルシークレットは英数字の32文字です（チャネル基本設定の「チャネルシークレット」）。",
  });

/** チャネルアクセストークン（空白のない20〜1000文字。LINE の長期のトークンは170文字ほど）。 */
const AccessToken = z
  .string({ error: "チャネルアクセストークンを入れてください。" })
  .trim()
  .regex(/^[\x21-\x7e]{20,1000}$/, {
    error: "チャネルアクセストークン（長期）をそのまま貼ってください（空白を含めず、20文字以上）。",
  });

/** 公式アカウントの設定を入れる・入れ直す入力（初めは3つとも。入れ直しは1つ以上。research R21）。 */
export const LineChannelInput = z
  .strictObject({
    lineChannelId: LineChannelId.optional(),
    channelSecret: ChannelSecret.optional(),
    accessToken: AccessToken.optional(),
  })
  .refine(
    (value) =>
      value.lineChannelId !== undefined ||
      value.channelSecret !== undefined ||
      value.accessToken !== undefined,
    { error: "入れ直す値を1つ以上入れてください。" },
  );

/** 公式アカウントの設定を入れる入力の型。 */
export type LineChannelInput = z.infer<typeof LineChannelInput>;

/** メールアドレスの形（小文字にそろえる）。 */
export const EmailAddress = z
  .email({ error: "メールアドレスの形で入れてください（例：name@example.com）。" })
  .max(EMAIL_MAX, { error: `メールアドレスは${EMAIL_MAX}文字までにしてください。` })
  .transform((value) => value.toLowerCase());

/** メールの返信先を変える入力（空にするときは null）。 */
export const MailSettingInput = z.strictObject({ replyToEmail: EmailAddress.nullable() });

/** メールの返信先を変える入力の型。 */
export type MailSettingInput = z.infer<typeof MailSettingInput>;

/** 設定の持ち主。 */
export const NotifyHolder = z.object({
  /** 個人か組織 */
  kind: z.enum(["personal", "organization"]),
  /** アカウントか組織の ID */
  id: z.string(),
  /** 表示名か組織の名前 */
  name: z.string(),
});

/** 公式アカウントの設定の LINE の値（鍵は末尾だけ）。 */
export const LineChannelView = z.object({
  /** 設定の行の ID（Webhook の道） */
  channelId: z.string(),
  /** LINE のチャネル ID（秘密でない） */
  lineChannelId: z.string(),
  /** シークレットの末尾4文字 */
  channelSecretTail: z.string(),
  /** アクセストークンの末尾4文字 */
  accessTokenTail: z.string(),
  /** ベーシック ID（@xxxx。読めなければ null） */
  basicId: z.string().nullable(),
  /** LINE の画面に貼る Webhook の URL */
  webhookUrl: z.string(),
  /** 紐づいた人数 */
  linkedCount: z.number().int(),
  /** 今月（日本時間）LINE で送った数（確かめのメッセージを含む） */
  sentThisMonth: z.number().int(),
  /** 直した日時 */
  updatedAt: isoDateTime,
});

/** 設定の画面の答え。 */
export const NotifySettings = z.object({
  holder: NotifyHolder,
  /** 今の送り方（運営の設定 NOTIFY_MODE） */
  deliveryMode: NotifyModeSchema,
  /** LINE の値（まだなければ null） */
  line: LineChannelView.nullable(),
  /** あいさつの文の見本（リンクは見本の URL） */
  greetingPreview: z.string(),
  /** メール */
  mail: z.object({
    /** 送り主の名前（変えられない） */
    senderName: z.string(),
    /** 返信先（なければ null） */
    replyToEmail: z.string().nullable(),
  }),
  /** 今の利用者が、この公式アカウントと紐づいているか */
  myLink: z.object({ linked: z.boolean() }),
  /** 個人の設定のときだけ：自分が管理者の組織 */
  adminOrganizations: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});

/** 設定の画面の答えの型。 */
export type NotifySettings = z.infer<typeof NotifySettings>;

/** 確かめのメッセージの結果。 */
export const TestMessageResult = z.object({
  /** 結果（紐づいていなければ not_linked。送っていない） */
  result: z.union([NoticeResultSchema, z.literal("not_linked")]),
  /** 許可リストにないときだけ：本人の、公式アカウントから見える LINE のユーザー ID（運営に許可リストへ足してもらうため） */
  lineUserId: z.string().optional(),
  /** 画面に出す文 */
  message: z.string(),
});

/** 確かめのメッセージの結果の型。 */
export type TestMessageResult = z.infer<typeof TestMessageResult>;

/** 紐づけの札の中身。 */
export const LineLinkPreview = z.object({
  /** 公式アカウントの持ち主の名前（組織の名前か表示名） */
  holderName: z.string(),
  /** 使える・使った・期限切れ */
  state: z.enum(["valid", "used", "expired"]),
  /** 今の利用者が、この公式アカウントとすでに紐づいているか */
  linkedToMe: z.boolean(),
  /** 期限 */
  expiresAt: isoDateTime,
});

/** 紐づけの札の中身の型。 */
export type LineLinkPreview = z.infer<typeof LineLinkPreview>;

/** 紐づけた結果。 */
export const LineLinkResult = z.object({ holderName: z.string() });

/** 紐づけた結果の型。 */
export type LineLinkResult = z.infer<typeof LineLinkResult>;

/** 参加者の連絡のメールアドレスを入れる入力。 */
export const ContactInput = z.strictObject({ email: EmailAddress });

/** 参加者の連絡のメールアドレスを入れる入力の型。 */
export type ContactInput = z.infer<typeof ContactInput>;

/** 参加者の連絡のメールアドレス（本人だけが読む）。 */
export const ContactView = z.object({ email: z.string().nullable() });

/** 参加者の連絡のメールアドレスの型。 */
export type ContactView = z.infer<typeof ContactView>;

/** 偽の送り手が覚えたもの（手元とテストの開発の窓口だけ）。 */
export const FakeOutbox = z.object({
  messages: z.array(
    z.object({
      method: z.enum(["line_push", "line_reply", "email"]),
      to: z.string(),
      text: z.string(),
      subject: z.string().optional(),
      at: isoDateTime,
    }),
  ),
});

/** 偽の送り手が覚えたものの型。 */
export type FakeOutbox = z.infer<typeof FakeOutbox>;
