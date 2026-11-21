// 公式アカウントの設定の読み書き（booking-002。AD-24）：持ち主（組織・個人）の決め方・鍵を包む・末尾・ボット情報での確かめ・
// 設定の画面の答え。鍵の平文は、包む直前と送る直前にだけ持ち、答え・ログに出さない。
import { BOOKING_ERRORS, SECRET_TAIL_LENGTH } from "@workspace/contracts/booking";
import type { LineChannelInput, NotifySettings } from "@workspace/contracts/booking";
import { jstDate } from "@workspace/contracts/core";
import type { SecretBox } from "@workspace/secret-box";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { isUniqueViolation } from "../../kernel/pg-errors.ts";
import type { DomainRouteDeps } from "../../kernel/http.ts";
import type { Notifier } from "../../kernel/notifier.ts";
import { createNotifier } from "../../platform/notify/index.ts";
import { findDisplayNames } from "../account/index.ts";
import { findMembership, findOrganization, listMemberships } from "../suite/index.ts";
import { greetingText, senderName } from "./notice-templates.ts";
import {
  clearLinksOfChannel,
  countLineSentSince,
  countLinks,
  ensureChannel,
  findChannelByHolder,
  findLinkedLineUser,
  writeLineValues,
} from "./notify-repository.ts";
import type { ChannelRecord, NotifyHolderRef, SealedLineValues } from "./notify-repository.ts";

/** 知らせの処理に使う道具。 */
export type NotifyDeps = Pick<
  DomainRouteDeps,
  "db" | "logger" | "config" | "fetch" | "secretBox" | "notifier"
>;

/** Webhook の道の頭（設定の ID を足すと LINE の画面に貼る URL）。 */
export const LINE_WEBHOOK_PATH = "/api/v1/booking/webhooks/line";

/**
 * 日本時間の今月の初め（今月の数を数え始める時刻）。
 * @param now 今の時刻
 * @returns 日本時間の月の1日 0時
 */
export function jstMonthStart(now: Date): Date {
  return new Date(`${jstDate(now).slice(0, 7)}-01T00:00:00+09:00`);
}

/** あいさつの見本のリンク。 */
const SAMPLE_LINK = "（友だち追加した人だけのリンク）";

/**
 * 送る道具（組み立てが渡さないとき〈手で組み立てたテスト〉は、止めている偽の道具）。
 * @param deps 道具
 * @returns 送る道具
 */
export function notifierOf(deps: Pick<NotifyDeps, "notifier" | "fetch" | "logger">): Notifier {
  return (
    deps.notifier ??
    createNotifier({
      policy: { mode: "off", allowlist: [], fakeOnly: true },
      fetch: deps.fetch,
      logger: deps.logger,
    })
  );
}

/**
 * 持ち主の名前（組織の名前か表示名）。
 * @param db DB
 * @param holder 持ち主
 * @returns 名前（見つからなければ空）
 */
export async function holderNameOf(db: Executor, holder: NotifyHolderRef): Promise<string> {
  if (holder.kind === "organization") {
    return (await findOrganization(db, holder.organizationId))?.name ?? "";
  }
  return (await findDisplayNames(db, [holder.accountId])).get(holder.accountId) ?? "";
}

/**
 * 設定の行から持ち主を作る。
 * @param channel 設定の行
 * @returns 持ち主
 */
export function holderOfChannel(channel: ChannelRecord): NotifyHolderRef {
  return channel.holderOrganizationId
    ? { kind: "organization", organizationId: channel.holderOrganizationId }
    : { kind: "personal", accountId: channel.holderAccountId ?? "" };
}

/**
 * 組織の設定を変えてよいか（組織の管理者だけ。要求のたびに引く。research R11）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param accountId 今の利用者
 * @throws {AppError} 管理者でない・組織の人でない・組織がないとき（403 BOOKING_NOTIFY_FORBIDDEN）
 */
export async function assertOrganizationAdmin(
  db: Executor,
  organizationId: string,
  accountId: string,
): Promise<void> {
  const membership = await findMembership(db, organizationId, accountId);
  if (membership?.role !== "admin") throw new AppError(BOOKING_ERRORS.NOTIFY_FORBIDDEN);
}

/** 開けた LINE の値。 */
export type OpenedLine = {
  /** 設定の行 */
  channel: ChannelRecord;
  /** チャネルシークレット（ログに出さない） */
  channelSecret: string;
  /** チャネルアクセストークン（ログに出さない） */
  accessToken: string;
};

/**
 * 設定の LINE の値を開ける。
 * @param box 秘密の箱
 * @param channel 設定の行
 * @returns 開けた値（LINE の値がない・開けられないときは null）
 */
export async function openLine(
  box: SecretBox | undefined,
  channel: ChannelRecord,
): Promise<OpenedLine | null> {
  if (
    !box ||
    !channel.channelSecretCiphertext ||
    !channel.channelSecretIv ||
    channel.channelSecretKeyVersion === null ||
    !channel.accessTokenCiphertext ||
    !channel.accessTokenIv ||
    channel.accessTokenKeyVersion === null
  ) {
    return null;
  }
  try {
    const channelSecret = await box.open(
      {
        ciphertext: channel.channelSecretCiphertext,
        iv: channel.channelSecretIv,
        keyVersion: channel.channelSecretKeyVersion,
      },
      `${channel.id}:secret`,
    );
    const accessToken = await box.open(
      {
        ciphertext: channel.accessTokenCiphertext,
        iv: channel.accessTokenIv,
        keyVersion: channel.accessTokenKeyVersion,
      },
      `${channel.id}:token`,
    );
    return { channel, channelSecret, accessToken };
  } catch {
    return null;
  }
}

/**
 * 値の末尾（画面に出す。research R9）。
 * @param value 値
 * @returns 末尾4文字
 */
function tailOf(value: string): string {
  return value.slice(-SECRET_TAIL_LENGTH);
}

/**
 * 公式アカウントの設定を入れる・入れ直す（research R10・R21）。
 * 初めは3つとも要る。チャネル ID を変えるときはシークレットとアクセストークンも要り、前の紐づけと札を消す。
 * アクセストークンを入れたときは、ボット情報で確かめてから保存する（ボットの userId が替われば、前の紐づけと札を消す）。
 * @param deps 道具
 * @param holder 持ち主
 * @param input 入れた値
 * @throws {AppError} 秘密の箱がない（503）・値が足りない（400）・トークンが合わない（400）・LINE に届かない（502）・
 *   同じチャネル ID がほかの設定にある（409）
 */
export async function saveLineChannel(
  deps: NotifyDeps,
  holder: NotifyHolderRef,
  input: LineChannelInput,
): Promise<void> {
  const box = deps.secretBox;
  if (!box) throw new AppError(BOOKING_ERRORS.NOTIFY_UNAVAILABLE);
  const current = await findChannelByHolder(deps.db, holder);
  const hasLine = current?.lineChannelId !== null && current?.lineChannelId !== undefined;
  const changingChannel =
    input.lineChannelId !== undefined && input.lineChannelId !== current?.lineChannelId;
  if (!hasLine || changingChannel) {
    const missing = (
      [
        ["lineChannelId", "チャネル ID を入れてください。"],
        ["channelSecret", "チャネルシークレットを入れてください。"],
        ["accessToken", "チャネルアクセストークンを入れてください。"],
      ] as const
    ).filter(([key]) => input[key] === undefined);
    if (missing.length > 0) {
      throw new AppError("INVALID_INPUT", {
        fields: missing.map(([path, message]) => ({
          path,
          message: hasLine
            ? `チャネル ID を変えるときは、シークレットとアクセストークンも入れ直してください。${message}`
            : message,
        })),
      });
    }
  }
  // アクセストークンを入れたときだけ、ボット情報を読み直す。入れないときは、書くときに押さえた行の値を残す
  // （ここで読んだ値を使うと、同時に別の管理者がトークンを入れ替えたときに、古いボット情報で上書きしてしまう）
  let bot: { basicId: string | null; botUserId: string | null } | null = null;
  if (input.accessToken !== undefined) {
    const info = await notifierOf(deps).getLineBotInfo(input.accessToken);
    if (!info.ok) {
      if (info.reason === "unauthorized") {
        throw new AppError(BOOKING_ERRORS.LINE_TOKEN_INVALID, {
          fields: [{ path: "accessToken", message: BOOKING_ERRORS.LINE_TOKEN_INVALID.message }],
        });
      }
      throw new AppError(BOOKING_ERRORS.LINE_UNREACHABLE);
    }
    bot = { basicId: info.basicId, botUserId: info.userId };
  }
  try {
    await writeChannel(deps, box, holder, input, bot);
  } catch (error) {
    // 同じチャネル ID がほかの持ち主の設定に入っている（同時に入れても DB の一意の制約で止まる）
    if (isUniqueViolation(error)) throw new AppError(BOOKING_ERRORS.LINE_CHANNEL_TAKEN);
    throw error;
  }
}

/**
 * アクセストークンを入れ直したら、別の公式アカウントに替わったか（ボットの userId が違う。前の版で userId を持っていない行は
 * ベーシック ID が違う。どちらも分からなければ替わっていないとみなす）。
 * @param channel 今の設定の行
 * @param next 新しいボット情報
 * @param next.basicId ベーシック ID
 * @param next.botUserId ボットの userId
 * @returns 替わったら true
 */
function botChanged(
  channel: ChannelRecord,
  next: { basicId: string | null; botUserId: string | null },
): boolean {
  if (channel.botUserId && next.botUserId) return channel.botUserId !== next.botUserId;
  if (channel.basicId && next.basicId) return channel.basicId !== next.basicId;
  return false;
}

/**
 * 設定の行に LINE の値を包んで書く（チャネル ID か公式アカウントが替わったら、前の紐づけと札を消す）。
 * @param deps 道具
 * @param box 秘密の箱
 * @param holder 持ち主
 * @param input 入れた値
 * @param bot 読み直したボット情報（ベーシック ID・userId。アクセストークンを入れないときは null で、押さえた行の値を残す）
 * @throws {AppError} 前の値が開けず、足りないとき（400）
 */
async function writeChannel(
  deps: NotifyDeps,
  box: SecretBox,
  holder: NotifyHolderRef,
  input: LineChannelInput,
  bot: { basicId: string | null; botUserId: string | null } | null,
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    const channel = await ensureChannel(tx, holder);
    const basicId = bot ? bot.basicId : channel.basicId;
    const botUserId = bot ? bot.botUserId : channel.botUserId;
    const previous = channel.lineChannelId !== null ? await openLine(box, channel) : null;
    const channelSecret = input.channelSecret ?? previous?.channelSecret;
    const accessToken = input.accessToken ?? previous?.accessToken;
    const lineChannelId = input.lineChannelId ?? channel.lineChannelId;
    if (!channelSecret || !accessToken || !lineChannelId) {
      // 前の値が開けない（鍵の版がない）ときは、3つとも入れ直してもらう
      throw new AppError("INVALID_INPUT", {
        fields: [
          {
            path: "channelSecret",
            message:
              "前の値を読めませんでした。チャネル ID・シークレット・アクセストークンを入れ直してください。",
          },
        ],
      });
    }
    const secretSealed = await box.seal(channelSecret, `${channel.id}:secret`);
    const tokenSealed = await box.seal(accessToken, `${channel.id}:token`);
    const values: SealedLineValues = {
      lineChannelId,
      channelSecretCiphertext: secretSealed.ciphertext,
      channelSecretIv: secretSealed.iv,
      channelSecretKeyVersion: secretSealed.keyVersion,
      channelSecretTail: tailOf(channelSecret),
      accessTokenCiphertext: tokenSealed.ciphertext,
      accessTokenIv: tokenSealed.iv,
      accessTokenKeyVersion: tokenSealed.keyVersion,
      accessTokenTail: tailOf(accessToken),
      basicId,
      botUserId,
    };
    if (
      channel.lineChannelId !== null &&
      (channel.lineChannelId !== lineChannelId ||
        (bot !== null && botChanged(channel, bot)))
    ) {
      // 公式アカウントが替わると LINE のユーザー ID も替わるので、前の紐づけと札は使えない
      // （チャネル ID が同じでも、アクセストークンだけを別の公式アカウントのものに入れ直したときも）
      await clearLinksOfChannel(tx, channel.id);
    }
    await writeLineValues(tx, channel.id, values);
  });
}

/**
 * 公式アカウントの LINE の値を消す（紐づけと札も消える。返信先は残る）。
 * @param db DB
 * @param holder 持ち主
 */
export async function removeLineChannel(
  db: DomainRouteDeps["db"],
  holder: NotifyHolderRef,
): Promise<void> {
  await db.transaction(async (tx) => {
    const channel = await findChannelByHolder(tx, holder, true);
    if (!channel) return;
    await clearLinksOfChannel(tx, channel.id);
    await writeLineValues(tx, channel.id, null);
  });
}

/**
 * 設定の画面の答えを作る。
 * @param deps 道具
 * @param holder 持ち主
 * @param viewerAccountId 今の利用者
 * @param now 今の時刻（今月の数）
 * @returns 答え
 */
export async function buildNotifySettings(
  deps: NotifyDeps,
  holder: NotifyHolderRef,
  viewerAccountId: string,
  now: Date = new Date(),
): Promise<NotifySettings> {
  const { db } = deps;
  const name = await holderNameOf(db, holder);
  const channel = await findChannelByHolder(db, holder);
  const hasLine = channel !== null && channel.lineChannelId !== null;
  const line =
    hasLine && channel
      ? {
          channelId: channel.id,
          lineChannelId: channel.lineChannelId ?? "",
          channelSecretTail: channel.channelSecretTail ?? "",
          accessTokenTail: channel.accessTokenTail ?? "",
          basicId: channel.basicId,
          webhookUrl: `${deps.config.webUrl}${LINE_WEBHOOK_PATH}/${channel.id}`,
          linkedCount: await countLinks(db, channel.id),
          sentThisMonth: await countLineSentSince(db, channel.id, jstMonthStart(now)),
          updatedAt: channel.updatedAt.toISOString(),
        }
      : null;
  const linked =
    hasLine && channel
      ? (await findLinkedLineUser(db, channel.id, viewerAccountId)) !== null
      : false;
  const settings: NotifySettings = {
    holder: {
      kind: holder.kind,
      id: holder.kind === "personal" ? holder.accountId : holder.organizationId,
      name,
    },
    deliveryMode: notifierOf(deps).mode,
    line,
    greetingPreview: greetingText(name, SAMPLE_LINK),
    mail: { senderName: senderName(name), replyToEmail: channel?.replyToEmail ?? null },
    myLink: { linked },
  };
  if (holder.kind === "personal") {
    const memberships = await listMemberships(db, holder.accountId);
    settings.adminOrganizations = memberships
      .filter((membership) => membership.role === "admin")
      .map((membership) => ({ id: membership.organizationId, name: membership.organizationName }));
  }
  return settings;
}
