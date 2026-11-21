// Threads の画面から組織とチームを作る呼び出し（threads-021）。組織とチームは kanaeru 共通（suite）が持つので、
// suite の窓口（/api/v1/suite）をそのまま呼ぶ（型は apps/api/src/client.ts の ModuleRoutes["suite"] から import type で読む）。
// 読み書きはすべて lib/api.ts の request を通す（エラーの読み方と 401 の知らせをそろえる）。
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
 * 組織を作る（作った人が管理者になる）。
 * @param name 組織の名前
 * @returns 作った組織の ID
 */
export function createOrganizationForTeam(name: string) {
  return request(() => suite().organizations.$post({ json: { name } }));
}

/**
 * 組織にチームを作る（管理者だけ）。
 * @param organizationId 組織の ID
 * @param name チームの名前
 * @returns 作ったチームの ID
 */
export function createTeamIn(organizationId: string, name: string) {
  return request(() =>
    suite().organizations[":organizationId"].teams.$post({
      param: { organizationId },
      json: { name },
    }),
  );
}

/**
 * 組織の人をチームに足す（管理者だけ。リーダーにするか）。
 * @param organizationId 組織の ID
 * @param teamId チームの ID
 * @param accountId 足す人
 * @param leader リーダーにするか
 * @returns 終わり
 */
export function addToTeam(
  organizationId: string,
  teamId: string,
  accountId: string,
  leader: boolean,
) {
  return request(() =>
    suite().organizations[":organizationId"].teams[":teamId"].members[":accountId"].$put({
      param: { organizationId, teamId, accountId },
      json: { leader },
    }),
  );
}
