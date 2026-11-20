// テストの手伝い：組織を作る・招待のリンクで入る・役割を変える（suite-001。suite と threads のテストが使う）。
import type { TestApp } from "./app.ts";
import { call } from "./event.ts";

/**
 * 組織を作る（作った人が管理者）。
 * @param app 組み立てた API
 * @param cookie 作る人のクッキー
 * @param name 名前
 * @returns 組織の ID
 * @throws {Error} 作れなかったとき
 */
export async function createOrganization(
  app: TestApp,
  cookie: string,
  name = "飲食チーム",
): Promise<string> {
  const response = await call(app, cookie, "/api/v1/suite/organizations", "POST", { name });
  if (response.status !== 201) throw new Error(`組織を作れませんでした（${response.status}）。`);
  return ((await response.json()) as { id: string }).id;
}

/**
 * 招待のリンクを作り直して、札を返す（管理者だけ）。
 * @param app 組み立てた API
 * @param adminCookie 管理者のクッキー
 * @param organizationId 組織の ID
 * @returns 札
 * @throws {Error} 作れなかったとき
 */
export async function rotateInviteToken(
  app: TestApp,
  adminCookie: string,
  organizationId: string,
): Promise<string> {
  const response = await call(
    app,
    adminCookie,
    `/api/v1/suite/organizations/${organizationId}/invite`,
    "POST",
  );
  if (response.status !== 200) throw new Error(`招待を作れませんでした（${response.status}）。`);
  return ((await response.json()) as { token: string }).token;
}

/**
 * 招待のリンクから入る。
 * @param app 組み立てた API
 * @param cookie 入る人のクッキー
 * @param token 札
 * @returns 応答
 */
export function joinOrganization(app: TestApp, cookie: string, token: string): Promise<Response> {
  return call(app, cookie, `/api/v1/suite/organization-invites/${token}`, "POST");
}

/**
 * 役割を切り替える（管理者だけ）。
 * @param app 組み立てた API
 * @param adminCookie 管理者のクッキー
 * @param organizationId 組織の ID
 * @param accountId 相手の account の ID
 * @param role 新しい役割
 * @returns 応答
 */
export function setOrganizationRole(
  app: TestApp,
  adminCookie: string,
  organizationId: string,
  accountId: string,
  role: "editor" | "member",
): Promise<Response> {
  return call(
    app,
    adminCookie,
    `/api/v1/suite/organizations/${organizationId}/members/${accountId}`,
    "PUT",
    { role },
  );
}

/**
 * 組織を作り、人を招いて役割を付ける（管理者のクッキーで作り、ほかの人は招待のリンクで入る）。
 * @param app 組み立てた API
 * @param adminCookie 管理者のクッキー
 * @param people 入る人（クッキーと account の ID と役割）
 * @param name 組織の名前
 * @returns 組織の ID
 * @throws {Error} 入れなかったとき
 */
export async function setUpOrganization(
  app: TestApp,
  adminCookie: string,
  people: readonly { cookie: string; accountId: string; role: "editor" | "member" }[],
  name = "飲食チーム",
): Promise<string> {
  const organizationId = await createOrganization(app, adminCookie, name);
  const token = await rotateInviteToken(app, adminCookie, organizationId);
  for (const person of people) {
    const joined = await joinOrganization(app, person.cookie, token);
    if (joined.status !== 200) throw new Error(`組織に入れませんでした（${joined.status}）。`);
    if (person.role === "editor") {
      const changed = await setOrganizationRole(
        app,
        adminCookie,
        organizationId,
        person.accountId,
        "editor",
      );
      if (changed.status !== 204)
        throw new Error(`役割を変えられませんでした（${changed.status}）。`);
    }
  }
  return organizationId;
}
