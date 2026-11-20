// 予約の知らせの窓口の呼び出し（booking-002。型は apps/api/src/client.ts の ModuleRoutes["booking"] から import type で読む）。
// 設定の持ち主は、個人（今の利用者）か組織（管理者だけ）。読み書きは lib/api.ts の request を通す。
import type { LineChannelInput } from "@workspace/contracts/booking";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["booking"]>> | undefined;

/**
 * 呼び出しの道具（初めて使うときに作る）。
 * @returns 道具の予約の部分
 */
function booking() {
  client ??= createApiClient<ModuleRoutes["booking"]>();
  return client.api.v1.booking;
}

/** 設定の持ち主（組織の ID がなければ個人）。 */
export type NotifyHolderKey = { organizationId?: string | undefined };

/**
 * 設定の画面の答えを読む。
 * @param holder 持ち主
 * @returns 設定
 */
export function fetchNotifySettings(holder: NotifyHolderKey) {
  const settings = booking()["notify-settings"];
  if (holder.organizationId) {
    const param = { organizationId: holder.organizationId };
    return request(() => settings.organizations[":organizationId"].$get({ param }));
  }
  return request(() => settings.personal.$get());
}

/**
 * 公式アカウントの値を入れる・入れ直す。
 * @param holder 持ち主
 * @param input 入れる値
 * @returns 設定
 */
export function saveLineChannel(holder: NotifyHolderKey, input: LineChannelInput) {
  const settings = booking()["notify-settings"];
  if (holder.organizationId) {
    const param = { organizationId: holder.organizationId };
    return request(() =>
      settings.organizations[":organizationId"].line.$put({ param, json: input }),
    );
  }
  return request(() => settings.personal.line.$put({ json: input }));
}

/**
 * 公式アカウントの値を消す。
 * @param holder 持ち主
 * @returns 設定
 */
export function removeLineChannel(holder: NotifyHolderKey) {
  const settings = booking()["notify-settings"];
  if (holder.organizationId) {
    const param = { organizationId: holder.organizationId };
    return request(() => settings.organizations[":organizationId"].line.$delete({ param }));
  }
  return request(() => settings.personal.line.$delete());
}

/**
 * メールの返信先を変える。
 * @param holder 持ち主
 * @param replyToEmail 返信先（null で消す）
 * @returns 設定
 */
export function saveReplyTo(holder: NotifyHolderKey, replyToEmail: string | null) {
  const settings = booking()["notify-settings"];
  const json = { replyToEmail };
  if (holder.organizationId) {
    const param = { organizationId: holder.organizationId };
    return request(() => settings.organizations[":organizationId"].mail.$put({ param, json }));
  }
  return request(() => settings.personal.mail.$put({ json }));
}

/**
 * 自分に確かめのメッセージを送る。
 * @param holder 持ち主
 * @returns 結果
 */
export function sendTestMessage(holder: NotifyHolderKey) {
  const settings = booking()["notify-settings"];
  if (holder.organizationId) {
    const param = { organizationId: holder.organizationId };
    return request(() => settings.organizations[":organizationId"].test.$post({ param }));
  }
  return request(() => settings.personal.test.$post());
}

/**
 * 紐づけの札の中身を読む。
 * @param linkToken 札
 * @returns 中身
 */
export function fetchLineLink(linkToken: string) {
  return request(() => booking()["line-links"][":linkToken"].$get({ param: { linkToken } }));
}

/**
 * 札を使って紐づける。
 * @param linkToken 札
 * @returns 公式アカウントの持ち主の名前
 */
export function acceptLineLink(linkToken: string) {
  return request(() => booking()["line-links"][":linkToken"].$post({ param: { linkToken } }));
}
