// テストの手伝い：Threads のチーム運用の場面を作る（threads-013。組織・運用アカウント・組織に入れる・担当・承認を任せる）。
// 偽の Threads と鍵の束を入れた API を組み立て、関わりごとの人をログインさせる。
import { randomUUID } from "node:crypto";
import type { DraftBatchResult, ThreadsAccount } from "@workspace/contracts/threads";
import { createDomainFeatures } from "../../src/kernel/features.ts";
import { createFakeThreads } from "../../src/modules/threads/fake-threads.ts";
import type { FakeThreads } from "../../src/modules/threads/fake-threads.ts";
import { buildApp, testConfig } from "./app.ts";
import type { TestApp } from "./app.ts";
import { loginAs } from "./account.ts";
import type { TestDatabase } from "./db.ts";
import { call } from "./event.ts";
import { createOrganization, setUpOrganization } from "./organization.ts";

/** 運用アカウントの道の頭。 */
export const THREADS_BASE = "/api/v1/threads/accounts";

/** 組織の道の頭（Threads）。 */
export const THREADS_ORG_BASE = "/api/v1/threads/organizations";

/** テストの鍵の束。 */
const KEY_RING = JSON.stringify({ "1": btoa(String.fromCharCode(...new Uint8Array(32).fill(5))) });

/** 偽の Threads の宛先（偽の fetch は源を見ない）。 */
const FAKE_BASE = "http://fake-threads.test";

/** ログインした人。 */
export type TeamPerson = { cookie: string; id: string; name: string };

/** チーム運用の場面。 */
export type TeamScene = {
  app: TestApp;
  fake: FakeThreads;
  /** 持ち主（組織のメンバー） */
  owner: TeamPerson;
  /** 組織の管理者（担当なし） */
  admin: TeamPerson;
  /** 担当の編集者（承認を任されていない） */
  assignee: TeamPerson;
  /** 担当の編集者（承認を任されている） */
  delegatee: TeamPerson;
  /** 担当のない編集者 */
  editor: TeamPerson;
  /** メンバー */
  member: TeamPerson;
  /** 関わりのない人 */
  outsider: TeamPerson;
  /** 別の組織の管理者 */
  stranger: TeamPerson;
  organizationId: string;
  otherOrganizationId: string;
  /** 組織に入れた運用アカウント */
  account: ThreadsAccount;
};

/**
 * チーム運用の API を組み立てる（偽の Threads・鍵の束つき）。
 * @param database テストの DB
 * @returns API と偽の Threads
 */
export function buildTeamApp(database: TestDatabase): { app: TestApp; fake: FakeThreads } {
  const fake = createFakeThreads();
  const app = buildApp(
    database,
    testConfig({
      tokenEncryption: { keyRing: KEY_RING, currentVersion: 1 },
      threadsApiBaseUrl: FAKE_BASE,
    }),
    { features: createDomainFeatures([]), fetch: fake.fetch },
  );
  return { app, fake };
}

/**
 * ログインする。
 * @param app 組み立てた API
 * @param name 表示名
 * @returns クッキー・account の ID・表示名
 */
export async function teamPerson(app: TestApp, name: string): Promise<TeamPerson> {
  const { cookie, account } = await loginAs(app, { displayName: name });
  return { cookie, id: account.id, name };
}

/**
 * 運用アカウントを作る。
 * @param app 組み立てた API
 * @param cookie 持ち主のクッキー
 * @param name 名前
 * @returns 運用アカウント
 * @throws {Error} 作れなかったとき
 */
export async function createThreadsAccount(
  app: TestApp,
  cookie: string,
  name: string,
): Promise<ThreadsAccount> {
  const response = await call(app, cookie, THREADS_BASE, "POST", { name });
  if (response.status !== 201)
    throw new Error(`運用アカウントを作れませんでした（${response.status}）。`);
  return (await response.json()) as ThreadsAccount;
}

/**
 * 案をためる。
 * @param app 組み立てた API
 * @param cookie ためる人のクッキー
 * @param accountId 運用アカウントの ID
 * @param text 貼る文（区切りは @@@）
 * @returns ためた結果
 * @throws {Error} ためられなかったとき
 */
export async function pasteDrafts(
  app: TestApp,
  cookie: string,
  accountId: string,
  text: string,
): Promise<DraftBatchResult> {
  const response = await call(app, cookie, `${THREADS_BASE}/${accountId}/draft-batches`, "POST", {
    clientRequestId: randomUUID(),
    text,
  });
  if (response.status !== 201) throw new Error(`案をためられませんでした（${response.status}）。`);
  return (await response.json()) as DraftBatchResult;
}

/**
 * 運用アカウントを組織に入れる・外す（持ち主）。
 * @param app 組み立てた API
 * @param cookie 持ち主のクッキー
 * @param accountId 運用アカウントの ID
 * @param organizationId 組織の ID（null で外す）
 * @returns 応答
 */
export function placeThreadsAccount(
  app: TestApp,
  cookie: string,
  accountId: string,
  organizationId: string | null,
): Promise<Response> {
  return call(app, cookie, `${THREADS_BASE}/${accountId}/team/placement`, "PUT", {
    organizationId,
  });
}

/**
 * 担当を付け外しする（管理者）。
 * @param app 組み立てた API
 * @param cookie 管理者のクッキー
 * @param organizationId 組織の ID
 * @param threadsAccountId 運用アカウントの ID
 * @param accountId 担当の人
 * @param assigned 付けるか
 * @returns 応答
 */
export function assignThreadsAccount(
  app: TestApp,
  cookie: string,
  organizationId: string,
  threadsAccountId: string,
  accountId: string,
  assigned = true,
): Promise<Response> {
  return call(app, cookie, `${THREADS_ORG_BASE}/${organizationId}/assignments`, "PUT", {
    threadsAccountId,
    accountId,
    assigned,
  });
}

/**
 * チーム運用の場面を作る：管理者の組織に、持ち主（メンバー）・担当の編集者2人（1人は承認を任されている）・担当のない編集者・
 * メンバーが入り、持ち主の運用アカウントを組織に入れる。別の組織と、関わりのない人も作る。
 * @param database テストの DB
 * @returns 場面
 * @throws {Error} 作れなかったとき
 */
export async function setUpTeamScene(database: TestDatabase): Promise<TeamScene> {
  const { app, fake } = buildTeamApp(database);
  const owner = await teamPerson(app, "鈴木");
  const admin = await teamPerson(app, "田中");
  const assignee = await teamPerson(app, "佐藤");
  const delegatee = await teamPerson(app, "山田");
  const editor = await teamPerson(app, "高橋");
  const member = await teamPerson(app, "山口");
  const outsider = await teamPerson(app, "部外者");
  const stranger = await teamPerson(app, "別の組織の人");
  const organizationId = await setUpOrganization(app, admin.cookie, [
    { cookie: owner.cookie, accountId: owner.id, role: "member" },
    { cookie: assignee.cookie, accountId: assignee.id, role: "editor" },
    { cookie: delegatee.cookie, accountId: delegatee.id, role: "editor" },
    { cookie: editor.cookie, accountId: editor.id, role: "editor" },
    { cookie: member.cookie, accountId: member.id, role: "member" },
  ]);
  const otherOrganizationId = await createOrganization(app, stranger.cookie, "別の組織");
  const account = await createThreadsAccount(app, owner.cookie, "カフェB店");
  const placed = await placeThreadsAccount(app, owner.cookie, account.id, organizationId);
  if (placed.status !== 200) throw new Error(`組織に入れられませんでした（${placed.status}）。`);
  for (const person of [assignee, delegatee]) {
    const assigned = await assignThreadsAccount(
      app,
      admin.cookie,
      organizationId,
      account.id,
      person.id,
    );
    if (assigned.status !== 200) throw new Error(`担当にできませんでした（${assigned.status}）。`);
  }
  const delegated = await call(
    app,
    owner.cookie,
    `${THREADS_BASE}/${account.id}/team/delegations/${delegatee.id}`,
    "PUT",
    { delegated: true },
  );
  if (delegated.status !== 200)
    throw new Error(`承認を任せられませんでした（${delegated.status}）。`);
  return {
    app,
    fake,
    owner,
    admin,
    assignee,
    delegatee,
    editor,
    member,
    outsider,
    stranger,
    organizationId,
    otherOrganizationId,
    account,
  };
}
