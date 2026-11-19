// 交流会の窓口の呼び出し（型は apps/api/src/client.ts の ModuleRoutes["event"] から import type で読む）。
// 読み書きはすべて lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
import type { EventInput } from "@workspace/contracts/event";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["event"]>> | undefined;

/**
 * 交流会の窓口の呼び出しの道具（今の画面の源の /api を呼ぶ）。
 * @returns 呼び出しの道具
 */
function api() {
  client ??= createApiClient<ModuleRoutes["event"]>();
  return client;
}

/**
 * 交流会の道の呼び出し。
 * @param eventId 交流会の ID
 * @returns 呼び出しの道具の交流会の部分
 */
function eventApi(eventId: string) {
  return { endpoint: api().api.v1.events[":eventId"], param: { eventId } };
}

/**
 * 交流会の一覧（主催者はすべて・受付係は自分の交流会だけ）。
 * @returns 交流会の一覧
 */
export function fetchEvents() {
  return request(() => api().api.v1.events.$get());
}

/**
 * 交流会を作る（主催者だけ）。
 * @param input 入力
 * @returns 作った交流会
 */
export function createEvent(input: EventInput) {
  return request(() => api().api.v1.events.$post({ json: input }));
}

/**
 * 交流会を読む（主催者と受付係。自分の役目つき）。
 * @param eventId 交流会の ID
 * @returns 交流会
 */
export function fetchEvent(eventId: string) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.$get({ param }));
}

/**
 * 交流会を直す（主催者だけ）。
 * @param eventId 交流会の ID
 * @param input 入力
 * @returns 直した交流会
 */
export function updateEvent(eventId: string, input: EventInput) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.$put({ param, json: input }));
}

/**
 * 交流会の要約（ログインしていれば誰でも）。
 * @param eventId 交流会の ID
 * @returns 要約
 */
export function fetchEventSummary(eventId: string) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.summary.$get({ param }));
}

/**
 * アンケートを開く・閉じる（主催者だけ）。
 * @param eventId 交流会の ID
 * @param open 開くなら true
 * @returns 今の開閉
 */
export function setSurveyOpen(eventId: string, open: boolean) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.survey.$put({ param, json: { open } }));
}

/**
 * 今の招待のリンク（主催者だけ）。
 * @param eventId 交流会の ID
 * @returns 招待のリンク（まだなければ invite が null）
 */
export function fetchStaffInvite(eventId: string) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint["staff-invite"].$get({ param }));
}

/**
 * 招待のリンクを作る・作り直す（主催者だけ）。
 * @param eventId 交流会の ID
 * @returns 新しい招待のリンク
 */
export function createStaffInvite(eventId: string) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint["staff-invite"].$post({ param }));
}

/**
 * 受付係の一覧（主催者だけ）。
 * @param eventId 交流会の ID
 * @returns 受付係の一覧
 */
export function fetchStaff(eventId: string) {
  const { endpoint, param } = eventApi(eventId);
  return request(() => endpoint.staff.$get({ param }));
}

/**
 * 受付係を外す（主催者だけ）。
 * @param eventId 交流会の ID
 * @param accountId 受付係の account の ID
 * @returns 終わり
 */
export function removeStaff(eventId: string, accountId: string) {
  return request(() =>
    api().api.v1.events[":eventId"].staff[":accountId"].$delete({ param: { eventId, accountId } }),
  );
}

/**
 * 招待の中身（ログインした人）。
 * @param inviteToken 招待の印
 * @returns 招待の中身
 */
export function fetchInvitePreview(inviteToken: string) {
  return request(() =>
    api().api.v1["staff-invites"][":inviteToken"].$get({ param: { inviteToken } }),
  );
}

/**
 * 招待を受ける（ログインした人）。
 * @param inviteToken 招待の印
 * @returns 受けたあとの役目
 */
export function acceptInvite(inviteToken: string) {
  return request(() =>
    api().api.v1["staff-invites"][":inviteToken"].accept.$post({ param: { inviteToken } }),
  );
}
