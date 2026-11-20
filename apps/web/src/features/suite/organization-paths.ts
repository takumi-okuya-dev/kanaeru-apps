// 組織の画面の道（suite-001）。道の文字は、ここ1か所で持つ（招待の道は @workspace/contracts/core の participantPaths.join）。

/** 道の形（TanStack Router の道の ID）。 */
export const ORGANIZATION_ROUTE_PATTERNS = {
  /** 設定 › 組織（一覧と作る） */
  list: "/settings/organizations",
  /** 設定 › 組織 › 組織の画面 */
  detail: "/settings/organizations/$organizationId",
} as const;

/**
 * 組織の画面の道。
 * @param organizationId 組織の ID
 * @returns 道
 */
export function organizationPath(organizationId: string): string {
  return `/settings/organizations/${organizationId}`;
}
