# Contracts: 予約の知らせの仕組み（booking-002）

2026-11-20 作成。形は `packages/contracts/src/booking/`（`notify-options.ts`・`notify.ts`）。受付アプリ（suite の `requireApp`）の道として組み立てが付ける。Webhook は機械の道（`/api/v1/booking/webhooks/…`。アプリが切のときだけ 404・CSRF の確かめの外）。

## 窓口

道の頭は `/api/v1/booking`。`{holder}` は `personal`（今の利用者の個人の設定）か `organizations/{organizationId}`（組織の設定。管理者だけ）。

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `/notify-settings/{holder}` | 本人・組織の管理者 | `NotifySettings`（下の形）。設定がなければ `line: null` |
| PUT | `/notify-settings/{holder}/line` | 同じ | `LineChannelInput` を保存する（ボット情報で確かめる）→ `NotifySettings` |
| DELETE | `/notify-settings/{holder}/line` | 同じ | LINE の値を消す（紐づけと札も消える。返信先は残る）→ `NotifySettings` |
| PUT | `/notify-settings/{holder}/mail` | 同じ | `{ replyToEmail: string \| null }` → `NotifySettings` |
| POST | `/notify-settings/{holder}/test` | 同じ | 自分に確かめのメッセージを送る → `TestMessageResult` |
| POST | `/webhooks/line/{channelId}` | LINE（ログインなし） | 署名を確かめて、友だち追加・ブロックを受ける → 200（本文なし）。署名・形が合わない → 本文のない 400。知らない設定 → 404 |
| GET | `/line-links/{linkToken}` | ログインした人 | `LineLinkPreview` |
| POST | `/line-links/{linkToken}` | ログインした人 | 紐づける → `LineLinkResult`。使えない札 → 404 `BOOKING_LINK_INVALID`・410 `BOOKING_LINK_EXPIRED`・409 `BOOKING_LINK_USED` |
| GET・PUT・DELETE | `/me/contact` | ログインした人（本人） | `{ email: string \| null }`／`{ email }` を入れる／消す |
| GET | `/dev/notify-outbox` | ログインした人 | 試験用のログインが入で偽の送り手のときだけ。`{ messages: FakeMessage[] }`（新しい順）。ほかは 404 |

主なエラー：未ログイン 401、組織の管理者でない・組織の外 403 `BOOKING_NOTIFY_FORBIDDEN`、秘密の箱がない 503 `BOOKING_NOTIFY_UNAVAILABLE`、アクセストークンが合わない 400 `BOOKING_LINE_TOKEN_INVALID`（欄 `accessToken`）、LINE に届かない 502 `BOOKING_LINE_UNREACHABLE`、初めの保存で値が足りない 400 `INVALID_INPUT`。

## 形

```ts
type NotifyMode = "off" | "allowlist" | "on";
type NoticeKind = "confirmed" | "waitlisted" | "offered" | "offer_expired" | "changed" | "cancelled_event" | "test";
type NoticeMethod = "line" | "email" | "none";
type NoticeResult = "sent" | "off" | "not_allowed" | "no_destination" | "failed" | "unavailable";

// NotifySettings
{
  holder: { kind: "personal" | "organization"; id: string; name: string };
  deliveryMode: NotifyMode;              // 今の送り方（運営の設定）
  line: null | {
    channelId: string;                    // 設定の行の ID（Webhook の道）
    lineChannelId: string;                // LINE のチャネル ID（秘密でない）
    channelSecretTail: string;            // 末尾4文字
    accessTokenTail: string;
    basicId: string | null;
    webhookUrl: string;                   // <WEB_URL>/api/v1/booking/webhooks/line/<channelId>
    linkedCount: number;
    sentThisMonth: number;
    updatedAt: string;
  };
  greetingPreview: string;                // あいさつの見本（リンクは見本の URL）
  mail: { senderName: string; replyToEmail: string | null };
  myLink: { linked: boolean };            // 今の利用者が、この公式アカウントと紐づいているか
  adminOrganizations?: { id: string; name: string }[]; // personal のときだけ：自分が管理者の組織
}

// LineChannelInput（初めは3つとも要る。入れ直しは1つ以上。チャネル ID を変えるときは3つとも）
{ lineChannelId?: string; channelSecret?: string; accessToken?: string }

// TestMessageResult
{ result: NoticeResult | "not_linked"; lineUserId?: string /* not_allowed のときだけ。本人の ID */; message: string }

// LineLinkPreview
{ holderName: string; state: "valid" | "used" | "expired"; linkedToMe: boolean; expiresAt: string }

// LineLinkResult
{ holderName: string }

// FakeMessage（開発の窓口だけ）
{ method: "line_push" | "line_reply" | "email"; to: string; text: string; subject?: string; at: string }
```

## 送る道具（`apps/api/src/platform/notify/index.ts`。型は `apps/api/src/kernel/notifier.ts`）

```ts
type NotifyPolicy = { mode: NotifyMode; allowlist: readonly string[]; fakeOnly: boolean };
type DeliveryStatus = "sent" | "off" | "not_allowed" | "failed" | "unavailable";

createNotifier({ policy, fetch, logger, emailSender? }): Notifier;

type Notifier = {
  readonly mode: NotifyMode;
  readonly fake: boolean;
  /** push（予約の知らせ・確かめ）。守り：off・許可リスト */
  pushLine(input: { accessToken: string; to: string; text: string }): Promise<{ status: DeliveryStatus }>;
  /** reply（友だち追加へのあいさつ）。守り：off だけ（research R4） */
  replyLine(input: { accessToken: string; replyToken: string; text: string }): Promise<{ status: DeliveryStatus }>;
  /** ボット情報（確かめ。メッセージを送らないので守りを通さない） */
  getLineBotInfo(accessToken: string): Promise<{ ok: true; basicId: string | null } | { ok: false; reason: "unauthorized" | "unreachable" }>;
  /** メール。守り：off・許可リスト。送り手がなければ unavailable */
  sendEmail(message: { to: string; fromName: string; replyTo: string | null; subject: string; text: string }): Promise<{ status: DeliveryStatus }>;
  /** 偽の送り手が覚えたもの（本物なら null） */
  fakeOutbox(): readonly FakeMessage[] | null;
};

verifyLineSignature(channelSecret: string, rawBody: string, signature: string | undefined): boolean;
decideDelivery(policy, destination: string): "send" | "off" | "not_allowed";
```

## 業務の関数（`apps/api/src/modules/booking/notify.ts`。この版では booking の中だけで使い、次の仕様が呼ぶ）

```ts
sendNotice(db, deps: { notifier; secretBox; config: { webUrl }; logger }, input: {
  entryId: string;
  kind: Exclude<NoticeKind, "test">;
  deadline?: Date;                    // 打診の返事の期限
  waitlistPosition?: number;          // キャンセル待ちの何番目か
  links?: { entry?: string; respond?: string; calendar?: string }; // 取り消し・返事・カレンダー
}): Promise<{ method: NoticeMethod; result: NoticeResult }>;
```

送り先の決め方は research R5・R6。文面は `notice-templates.ts`（交流会の名前・日時〈日本時間〉・場所・自分の状態・渡されたリンク）。

## 画面

| 道 | 画面 | だれ |
|---|---|---|
| `/settings/reception/notify` | 予約の知らせ（個人の設定と、管理者の組織の一覧） | ログインした人（受付アプリが見えるとき。`feature.settings`） |
| `/settings/reception/notify/organizations/$organizationId` | 予約の知らせ（組織の設定） | 組織の管理者（ほかは「組織の管理者だけが変えられます」）。組織の画面から入る（`feature.organization.links`） |
| `/line-link/$linkToken` | 紐づけ（参加者が外から開く。外枠のナビなし） | ログインした人 |
