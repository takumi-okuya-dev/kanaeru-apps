// スイートの領域の入口（docs/apps/suite.md・docs/rules/coding.md 6-6）。土台（app.ts）は routes・requireApp・withdrawal を読む。
// アプリが見えるかを決めるのは、ここが出す isAppVisible と requireApp だけ（AD-16）。アプリは app_setting を読まない。
// 組織（suite-001。AD-22）：ほかの領域は、組織をここからだけ読む（役割・入っている組織・組織の人・外部キーのための表）。
// suite の表に書かない。契約があるかは hasEntitlement だけで決める（売り始める前は、いつも使える）。
import type { DomainRouteDeps } from "../../kernel/http.ts";
import { suiteRoutes } from "./routes.ts";
import { organizationRoutes } from "./routes-organization.ts";
import { feedbackRoutes } from "./routes-feedback.ts";

export { INITIAL_APP_SETTINGS, restoreInitialAppSettings, upsertVisibility } from "./repository.ts";
export { appVisibility, isAppVisible, requireApp, requireAppNotOff } from "./visibility.ts";

// ほかの領域が読むもの（組織。AD-22）
// - 表は外部キーのためだけ（.references() と foreignKey() にだけ使う。読み書きに使わない。AD-3）
export {
  organization as organizationTable,
  organizationMember as organizationMemberTable,
  team as teamTable,
  teamMember as teamMemberTable,
} from "./schema.ts";
export {
  findMembership,
  findOrganization,
  findOrganizationAdmin,
  listMembers,
  listMemberships,
} from "./organizations.ts";
export type {
  NamedMembership,
  OrganizationMembership,
  OrganizationRecord,
} from "./organizations.ts";
export {
  addTeamMember,
  findTeam,
  findTeamMembership,
  listTeamMemberships,
  listTeams,
} from "./teams.ts";
export type { NamedTeamMember, TeamMembership, TeamRecord, TeamWithMembers } from "./teams.ts";
export { adminAfterWithdrawal, suiteWithdrawal as withdrawal } from "./withdrawal.ts";
export { ENTITLEMENTS_ENFORCED, hasEntitlement } from "./entitlement.ts";
export type { EntitlementSubject } from "./entitlement.ts";

/**
 * スイートの領域の道。戻り値の型は書かない（書くと画面に渡す型が消える）。
 * @param deps 土台が渡す道具
 * @returns 道
 */
export function routes(deps: DomainRouteDeps) {
  return suiteRoutes(deps).route("/", organizationRoutes(deps)).route("/", feedbackRoutes(deps));
}
