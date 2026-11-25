// 組織の窓口の呼び出し（suite-001・suite-003 のチーム。型は apps/api/src/client.ts の ModuleRoutes["suite"] から import type で読む）。
// 読み書きはすべて lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
import type {
  OrganizationLeaveInput,
  OrganizationMemberRoleInput,
  OrganizationNameInput,
  OrganizationTransferInput,
  TeamMemberInput,
  TeamNameInput,
} from "@workspace/contracts/suite";
import type { ModuleRoutes } from "../../../../api/src/client.ts";
import { createApiClient, request } from "../../lib/api.ts";

let client: ReturnType<typeof createApiClient<ModuleRoutes["suite"]>> | undefined;

/**
 * スイートの窓口の頭（/api/v1/suite）の呼び出しの道具。
 * @returns 呼び出しの道具
 */
function suite() {
  client ??= createApiClient<ModuleRoutes["suite"]>();
  return client.api.v1.suite;
}

/**
 * 1つの組織の道。
 * @param organizationId 組織の ID
 * @returns 道と道の値
 */
function organization(organizationId: string) {
  return { endpoint: suite().organizations[":organizationId"], param: { organizationId } };
}

/**
 * 入っている組織の一覧を読む。
 * @returns 組織の一覧
 */
export function fetchOrganizations() {
  return request(() => suite().organizations.$get());
}

/**
 * 組織を作る（作った人が管理者）。
 * @param input 名前
 * @returns 作った組織の ID
 */
export function createOrganization(input: OrganizationNameInput) {
  return request(() => suite().organizations.$post({ json: input }));
}

/**
 * 組織の画面を読む。
 * @param organizationId 組織の ID
 * @returns 組織
 */
export function fetchOrganization(organizationId: string) {
  const { endpoint, param } = organization(organizationId);
  return request(() => endpoint.$get({ param }));
}

/**
 * 組織の名前を直す（管理者だけ）。
 * @param organizationId 組織の ID
 * @param input 名前
 * @returns 終わり
 */
export function renameOrganization(organizationId: string, input: OrganizationNameInput) {
  const { endpoint, param } = organization(organizationId);
  return request(() => endpoint.$patch({ param, json: input }));
}

/**
 * 組織を消す（管理者だけ）。
 * @param organizationId 組織の ID
 * @returns 終わり
 */
export function deleteOrganization(organizationId: string) {
  const { endpoint, param } = organization(organizationId);
  return request(() => endpoint.$delete({ param }));
}

/**
 * 招待のリンクの札を読む（管理者だけ）。
 * @param organizationId 組織の ID
 * @returns 札（まだない・出し直せないときは null）
 */
export function fetchOrganizationInvite(organizationId: string) {
  const { endpoint, param } = organization(organizationId);
  return request(() => endpoint.invite.$get({ param }));
}

/**
 * 招待のリンクを作る・作り直す（管理者だけ。前のリンクはすぐ使えなくなる）。
 * @param organizationId 組織の ID
 * @returns 新しい札
 */
export function rotateOrganizationInvite(organizationId: string) {
  const { endpoint, param } = organization(organizationId);
  return request(() => endpoint.invite.$post({ param }));
}

/**
 * 自分以外の人の役割を切り替える（管理者だけ）。
 * @param organizationId 組織の ID
 * @param accountId 相手
 * @param input 新しい役割
 * @returns 終わり
 */
export function setMemberRole(
  organizationId: string,
  accountId: string,
  input: OrganizationMemberRoleInput,
) {
  const { endpoint, param } = organization(organizationId);
  return request(() =>
    endpoint.members[":accountId"].$put({ param: { ...param, accountId }, json: input }),
  );
}

/**
 * 自分以外の人を組織から外す（管理者だけ）。
 * @param organizationId 組織の ID
 * @param accountId 外す人
 * @returns 終わり
 */
export function removeMember(organizationId: string, accountId: string) {
  const { endpoint, param } = organization(organizationId);
  return request(() => endpoint.members[":accountId"].$delete({ param: { ...param, accountId } }));
}

/**
 * 管理者を引き継ぐ（管理者だけ。前の管理者は編集者になる）。
 * @param organizationId 組織の ID
 * @param input 新しい管理者
 * @returns 終わり
 */
export function transferOrganizationAdmin(
  organizationId: string,
  input: OrganizationTransferInput,
) {
  const { endpoint, param } = organization(organizationId);
  return request(() => endpoint.transfer.$post({ param, json: input }));
}

/**
 * 組織を抜ける（管理者は引き継ぐ人を選ぶ）。
 * @param organizationId 組織の ID
 * @param input 引き継ぐ人（管理者のときだけ）
 * @returns 終わり
 */
export function leaveOrganization(organizationId: string, input: OrganizationLeaveInput) {
  const { endpoint, param } = organization(organizationId);
  return request(() => endpoint.leave.$post({ param, json: input }));
}

/**
 * 招待の確かめの画面の中身を読む。
 * @param token 招待の札
 * @returns 組織の名前・管理者・人数・すでに入っているか
 */
export function fetchInvitePreview(token: string) {
  return request(() => suite()["organization-invites"][":token"].$get({ param: { token } }));
}

/**
 * 招待から、メンバーとして入る。
 * @param token 招待の札
 * @returns 組織の ID と、前から入っていたか
 */
export function joinOrganization(token: string) {
  return request(() => suite()["organization-invites"][":token"].$post({ param: { token } }));
}

/**
 * 組織の中のチームの道（suite-003）。
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @returns 道と道の値
 */
function team(organizationId: string, teamId: string) {
  const { endpoint, param } = organization(organizationId);
  return { endpoint: endpoint.teams[":teamId"], param: { ...param, teamId } };
}

/**
 * チームを作る（管理者だけ。1つの組織に20まで）。
 * @param organizationId 組織の ID
 * @param input 名前
 * @returns 作ったチームの ID
 */
export function createTeam(organizationId: string, input: TeamNameInput) {
  const { endpoint, param } = organization(organizationId);
  return request(() => endpoint.teams.$post({ param, json: input }));
}

/**
 * チームの名前を直す（管理者だけ）。
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @param input 名前
 * @returns 終わり
 */
export function renameTeam(organizationId: string, teamId: string, input: TeamNameInput) {
  const { endpoint, param } = team(organizationId, teamId);
  return request(() => endpoint.$patch({ param, json: input }));
}

/**
 * チームを消す（管理者だけ）。
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @returns 終わり
 */
export function deleteTeam(organizationId: string, teamId: string) {
  const { endpoint, param } = team(organizationId, teamId);
  return request(() => endpoint.$delete({ param }));
}

/**
 * 組織の人をチームに足す・リーダーを切り替える（管理者だけ）。
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @param accountId 足す人
 * @param input リーダーにするか
 * @returns 終わり
 */
export function setTeamMember(
  organizationId: string,
  teamId: string,
  accountId: string,
  input: TeamMemberInput,
) {
  const { endpoint, param } = team(organizationId, teamId);
  return request(() =>
    endpoint.members[":accountId"].$put({ param: { ...param, accountId }, json: input }),
  );
}

/**
 * チームから人を外す（管理者だけ）。
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @param accountId 外す人
 * @returns 終わり
 */
export function removeTeamMember(organizationId: string, teamId: string, accountId: string) {
  const { endpoint, param } = team(organizationId, teamId);
  return request(() => endpoint.members[":accountId"].$delete({ param: { ...param, accountId } }));
}
