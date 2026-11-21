// テストの手伝い：予約の知らせ（booking-002）。鍵の束と送り方の設定・公式アカウントの設定を入れる・署名つきの Webhook・
// 偽の送り手から紐づけの札を読む。値はどれもテストだけの見本（本物の鍵ではない）。宛先の LINE のユーザー ID も架空のもの。
import { createHmac } from "node:crypto";
import type { Config } from "../../src/kernel/config.ts";
import type { TestApp } from "./app.ts";
import { testConfig } from "./app.ts";
import { call } from "./event.ts";

/** テストの鍵の束（決まったバイトから作る。本物の鍵ではない）。 */
const KEY_RING = JSON.stringify({ "1": Buffer.alloc(32, 9).toString("base64") });

/** 見本のチャネル ID。 */
export const SAMPLE_LINE_CHANNEL_ID = "1234567890";
/** 見本のチャネルシークレット（16進の32文字。決まった並びから作る）。 */
export const SAMPLE_CHANNEL_SECRET = [..."0123456789abcdef", ..."0123456789abcdef"].join("");
/** 見本のチャネルアクセストークン（長い文字）。 */
export const SAMPLE_ACCESS_TOKEN = `${"sampletoken".repeat(6)}wxyz`;
/** 見本の値（初めの保存）。 */
export const SAMPLE_LINE_INPUT = {
  lineChannelId: SAMPLE_LINE_CHANNEL_ID,
  channelSecret: SAMPLE_CHANNEL_SECRET,
  accessToken: SAMPLE_ACCESS_TOKEN,
} as const;

/**
 * 架空の LINE のユーザー ID（公式アカウントから見えるもの）。
 * @param char 16進の1文字
 * @returns U と16進の32文字
 */
export function lineUser(char: string): string {
  return `U${char.repeat(32)}`;
}

/**
 * 知らせのテストの設定（鍵の束あり・送り方は on・偽の送り手）。
 * @param notify 送り方などの差しかえ
 * @param overrides ほかの設定の差しかえ
 * @returns 設定
 */
export function notifyConfig(
  notify: Partial<Config["notify"]> = {},
  overrides: Partial<Config> = {},
): Config {
  return testConfig({
    tokenEncryption: { keyRing: KEY_RING, currentVersion: 1 },
    notify: { mode: "on", allowlist: [], fakeOnly: true, ...notify },
    ...overrides,
  });
}

/**
 * 設定の窓口の道の頭。
 * @param organizationId 組織の ID（なければ個人）
 * @returns 道の頭
 */
export function notifyBase(organizationId?: string): string {
  return organizationId
    ? `/api/v1/booking/notify-settings/organizations/${organizationId}`
    : "/api/v1/booking/notify-settings/personal";
}

/** 設定の画面の答え（テストで読むところ）。 */
export type SettingsBody = {
  holder: { kind: string; id: string; name: string };
  deliveryMode: string;
  line: null | {
    channelId: string;
    lineChannelId: string;
    channelSecretTail: string;
    accessTokenTail: string;
    basicId: string | null;
    webhookUrl: string;
    linkedCount: number;
    sentThisMonth: number;
  };
  greetingPreview: string;
  mail: { senderName: string; replyToEmail: string | null };
  myLink: { linked: boolean };
  adminOrganizations?: { id: string; name: string }[];
};

/**
 * 公式アカウントの設定を入れる。
 * @param app 組み立てた API
 * @param cookie クッキー
 * @param organizationId 組織の ID（なければ個人）
 * @param input 入れる値
 * @returns 設定
 * @throws {Error} 入れられなかったとき
 */
export async function saveLine(
  app: TestApp,
  cookie: string,
  organizationId?: string,
  input: Record<string, string> = SAMPLE_LINE_INPUT,
): Promise<SettingsBody> {
  const response = await call(app, cookie, `${notifyBase(organizationId)}/line`, "PUT", input);
  if (response.status !== 200) {
    throw new Error(`公式アカウントの設定を入れられませんでした（${response.status}）。`);
  }
  return (await response.json()) as SettingsBody;
}

/**
 * LINE の Webhook の本文に署名を付けて送る。
 * @param app 組み立てた API
 * @param channelId 設定の行の ID
 * @param body 本文（そのままの文字）
 * @param secret 署名に使うシークレット（既定は見本）
 * @returns 応答
 */
export async function postWebhook(
  app: TestApp,
  channelId: string,
  body: string,
  secret: string | null = SAMPLE_CHANNEL_SECRET,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) {
    headers["x-line-signature"] = createHmac("sha256", secret).update(body).digest("base64");
  }
  return await app.request(`/api/v1/booking/webhooks/line/${channelId}`, {
    method: "POST",
    headers,
    body,
  });
}

/**
 * 友だち追加・ブロックの Webhook の本文。
 * @param type 種類
 * @param userId LINE のユーザー ID
 * @returns 本文（JSON の文字）
 */
export function lineEvent(type: "follow" | "unfollow" | "message", userId: string): string {
  return JSON.stringify({
    destination: lineUser("f"),
    events: [
      {
        type,
        ...(type === "unfollow" ? {} : { replyToken: `reply-${userId.slice(-4)}` }),
        source: { type: "user", userId },
        timestamp: 0,
        mode: "active",
        webhookEventId: "01H0000000000000000000000",
        deliveryContext: { isRedelivery: false },
      },
    ],
  });
}

/** 偽の送り手が覚えたもの。 */
export type OutboxMessage = { method: string; to: string; text: string; subject?: string };

/**
 * 偽の送り手が覚えたものを、開発の窓口から読む。
 * @param app 組み立てた API
 * @param cookie クッキー
 * @returns 覚えたもの（新しい順）
 * @throws {Error} 読めなかったとき
 */
export async function readOutbox(app: TestApp, cookie: string): Promise<OutboxMessage[]> {
  const response = await call(app, cookie, "/api/v1/booking/dev/notify-outbox");
  if (response.status !== 200)
    throw new Error(`覚えたものを読めませんでした（${response.status}）。`);
  return ((await response.json()) as { messages: OutboxMessage[] }).messages;
}

/**
 * あいさつの本文から紐づけの札を取り出す。
 * @param text あいさつの本文
 * @returns 札
 * @throws {Error} リンクがないとき
 */
export function linkTokenOf(text: string): string {
  const token = /\/line-link\/([A-Za-z0-9_-]+)/.exec(text)?.[1];
  if (!token) throw new Error("あいさつに紐づけのリンクがありません。");
  return token;
}

/**
 * 友だち追加から紐づけまでを済ませる（偽の送り手のあいさつの札を使う）。
 * @param app 組み立てた API
 * @param cookie 紐づける人のクッキー
 * @param channelId 設定の行の ID
 * @param userId 紐づける人の LINE のユーザー ID（公式アカウントから見えるもの）
 * @throws {Error} どこかで失敗したとき
 */
export async function followAndLink(
  app: TestApp,
  cookie: string,
  channelId: string,
  userId: string,
): Promise<void> {
  const followed = await postWebhook(app, channelId, lineEvent("follow", userId));
  if (followed.status !== 200)
    throw new Error(`友だち追加を受けられませんでした（${followed.status}）。`);
  const [greeting] = await readOutbox(app, cookie);
  if (!greeting) throw new Error("あいさつが送られていません。");
  const linked = await call(
    app,
    cookie,
    `/api/v1/booking/line-links/${linkTokenOf(greeting.text)}`,
    "POST",
  );
  if (linked.status !== 200) throw new Error(`紐づけられませんでした（${linked.status}）。`);
}
