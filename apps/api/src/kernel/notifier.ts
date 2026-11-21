// 知らせを送る道具の型（AD-24。booking-002）。中身は共通の platform/notify が作り、組み立て（app.ts）が設定から作って
// 領域に渡す（DomainRouteDeps.notifier）。土台は共通を読めない（境界の決まり）ので、領域に渡す型だけをここに置く
// （秘密の箱の型を DomainRouteDeps が持つのと同じ考え方）。業務（何をいつ誰に送るか・文面）は領域が持つ。
// 許可リスト・トークン・宛先・本文は、この道具の外のログに出さない。

/** 送り方（設定 NOTIFY_MODE。本番の既定は off）。 */
export type NotifyMode = "off" | "allowlist" | "on";

/** 1つの送り先への結果。 */
export type DeliveryStatus =
  /** 送った（偽の送り手では、覚えた） */
  | "sent"
  /** 送り方が off なので送らなかった */
  | "off"
  /** 送り方が allowlist で、宛先が許可リストにないので送らなかった */
  | "not_allowed"
  /** 送ろうとしたが、相手のサービスが受け取らなかった（ブロック・429・5xx・時間切れなど） */
  | "failed"
  /** メールの送り手がない（送信のサービスが決まっていない） */
  | "unavailable";

/** LINE の push（予約の知らせ・確かめのメッセージ）の中身。 */
export type LinePushInput = {
  /** チャネルアクセストークン（ログに出さない） */
  accessToken: string;
  /** 送り先（公式アカウントから見える LINE のユーザー ID。LINE ログインの sub は使わない） */
  to: string;
  /** 本文（5000文字まで） */
  text: string;
};

/** LINE の reply（友だち追加へのあいさつ）の中身。 */
export type LineReplyInput = {
  /** チャネルアクセストークン（ログに出さない） */
  accessToken: string;
  /** Webhook の知らせの replyToken */
  replyToken: string;
  /** 本文（5000文字まで） */
  text: string;
};

/** ボット情報を読んだ結果（userId は公式アカウントそのものの ID。Webhook の destination と同じ）。 */
export type LineBotInfoResult =
  | { ok: true; basicId: string | null; userId: string | null }
  | { ok: false; reason: "unauthorized" | "unreachable" };

/** 友だちのプロフィールを読んだ結果（表示名だけ。読めなければ ok: false）。 */
export type LineProfileResult = { ok: true; displayName: string } | { ok: false };

/** メールの中身（送り主のアドレスは送り手が決める。kanaeru 共通の送り主）。 */
export type EmailMessage = {
  /** 宛先（ログに出さない） */
  to: string;
  /** 送り主の名前（例：<組織の名前>（kanaeru）） */
  fromName: string;
  /** 返信先（任意） */
  replyTo: string | null;
  /** 題 */
  subject: string;
  /** 本文 */
  text: string;
};

/** 偽の送り手が覚えたもの（手元とテストだけ。ログには出さない）。 */
export type FakeMessage = {
  /** 手段 */
  method: "line_push" | "line_reply" | "email";
  /** 宛先（push は LINE のユーザー ID、reply は replyToken、メールはアドレス） */
  to: string;
  /** 本文 */
  text: string;
  /** 題（メールだけ） */
  subject?: string;
  /** 覚えた時刻（ISO 8601） */
  at: string;
};

/** 知らせを送る道具（守り〈送り方・許可リスト〉を通してから送る）。 */
export type Notifier = {
  /** 今の送り方 */
  readonly mode: NotifyMode;
  /** 偽の送り手か（本物の API を呼ばない） */
  readonly fake: boolean;
  /**
   * LINE の push。守り：off なら送らない・allowlist なら許可リストの宛先だけ。
   * @param input 中身
   * @returns 結果
   */
  pushLine(input: LinePushInput): Promise<{ status: DeliveryStatus }>;
  /**
   * LINE の reply（友だち追加した本人への返事）。守り：off なら送らない（許可リストは見ない。booking-002 research R4）。
   * @param input 中身
   * @returns 結果
   */
  replyLine(input: LineReplyInput): Promise<{ status: DeliveryStatus }>;
  /**
   * LINE のボット情報を読む（アクセストークンの確かめ。メッセージを送らないので守りを通さない）。
   * @param accessToken チャネルアクセストークン
   * @returns 結果
   */
  getLineBotInfo(accessToken: string): Promise<LineBotInfoResult>;
  /**
   * 公式アカウントの友だちの表示名を読む（紐づけのページで、その札の LINE がだれかを見せる。メッセージを送らないので守りを通さない）。
   * @param accessToken チャネルアクセストークン
   * @param userId 公式アカウントから見える LINE のユーザー ID
   * @returns 結果（友だちでない・届かないときは ok: false）
   */
  getLineProfile(accessToken: string, userId: string): Promise<LineProfileResult>;
  /**
   * メール。守り：off なら送らない・allowlist なら許可リストの宛先だけ。送り手がなければ unavailable。
   * @param message 中身
   * @returns 結果
   */
  sendEmail(message: EmailMessage): Promise<{ status: DeliveryStatus }>;
  /**
   * 偽の送り手が覚えたもの（新しい順。本物の送り手なら null）。
   * @returns 覚えたもの
   */
  fakeOutbox(): readonly FakeMessage[] | null;
};
