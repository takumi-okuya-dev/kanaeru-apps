// アカウントの窓口（LINE のログイン・試験用のログイン・ログアウト・今の利用者・アカウントを消す）。
// 道はすべて createRoute で書き、入力は約束（@workspace/contracts/account）で確かめる。名前と例は、ここで .openapi() で付ける。
// 本人は、LINE が確かめた ID トークンの sub だけで決める（画面から名前や ID を受け取らない。AD-4・Constitution II）。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import * as contract from "@workspace/contracts/account";
import { ACCOUNT_ERRORS } from "@workspace/contracts/account";
import type { Context } from "hono";
import { AppError, domainErrorResponse, errorResponse } from "../../kernel/errors.ts";
import { invalidInputResponse, notFoundResponse, uuidParam } from "../../kernel/http.ts";
import type { ApiEnv, DomainRouteDeps } from "../../kernel/http.ts";
import { createLineIdTokenVerifier } from "./line-verifier.ts";
import type { LineIdTokenVerifier } from "./line-verifier.ts";
import { deleteAccount, deleteSessionByTokenHash, upsertAccount } from "./repository.ts";
import type { AccountRecord } from "./repository.ts";
import {
  clearSessionCookie,
  currentAccountRecord,
  hashSessionToken,
  isOrganizer,
  issueSession,
  readSessionToken,
  requireOrganizer,
  requireSession,
  sessionCookie,
} from "./session.ts";

/** 今の利用者（文書の名前つき）。 */
const CurrentAccountView = contract.CurrentAccountView.openapi("CurrentAccountView");

/** LINE のログインの入力（文書の名前と例つき）。 */
const LineLoginInput = contract.LineLoginInput.openapi("LineLoginInput", {
  example: { idToken: "（liff.getIDToken() の生の値）" },
});

/** 試験用のログインの入力（文書の名前と例つき）。 */
const TestLoginInput = contract.TestLoginInput.openapi("TestLoginInput", {
  example: { lineUserId: `U${"0".repeat(32)}`, displayName: "試験の利用者" },
});

/** 道の accountId。 */
const AccountParams = z.object({ accountId: uuidParam("accountId", "account の ID") });

/** 未ログインの応答（ほかの領域も index.ts から使う）。 */
export const unauthenticatedResponse = domainErrorResponse(
  ACCOUNT_ERRORS.UNAUTHENTICATED,
  "ログインしていない・セッションが切れた",
);

/** 権限がない応答（ほかの領域も index.ts から使う）。 */
export const forbiddenResponse = errorResponse("FORBIDDEN", "権限がない（主催者でないなど）");

/** ログインの成功の応答。 */
const loggedIn = {
  description: "ログインした（Set-Cookie でセッションのクッキーを出す）",
  content: { "application/json": { schema: CurrentAccountView } },
} as const;

const lineLoginRoute = createRoute({
  method: "post",
  path: "/api/v1/auth/line",
  tags: ["account"],
  operationId: "accountLoginWithLine",
  summary: "LINE の ID トークンでログインする（初めてならアカウントを作る）",
  request: {
    body: { required: true, content: { "application/json": { schema: LineLoginInput } } },
  },
  responses: {
    200: loggedIn,
    400: invalidInputResponse,
    401: domainErrorResponse(ACCOUNT_ERRORS.LINE_LOGIN_FAILED, "ID トークンを確かめられない"),
    502: domainErrorResponse(ACCOUNT_ERRORS.LINE_UNREACHABLE, "LINE に届かない"),
  },
});

const testLoginRoute = createRoute({
  method: "post",
  path: "/api/v1/auth/test-login",
  tags: ["account"],
  operationId: "accountTestLogin",
  summary: "試験用のログイン（設定 TEST_LOGIN_ENABLED のときだけ。手元とテスト）",
  description:
    "設定 TEST_LOGIN_ENABLED が false なら道を登録しない（404）。staging・production では使えない（起動で止める）。",
  request: {
    body: { required: true, content: { "application/json": { schema: TestLoginInput } } },
  },
  responses: { 200: loggedIn, 400: invalidInputResponse },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/api/v1/auth/logout",
  tags: ["account"],
  operationId: "accountLogout",
  summary: "ログアウトする（セッションを消し、クッキーを消す。ログインしていなくても 204）",
  responses: { 204: { description: "ログアウトした" } },
});

/**
 * 今の利用者の道（作るときに deps が要るので関数にする）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function meRoute(deps: DomainRouteDeps) {
  return createRoute({
    method: "get",
    path: "/api/v1/accounts/me",
    tags: ["account"],
    operationId: "accountGetMe",
    summary: "今の利用者",
    middleware: [requireSession(deps)] as const,
    responses: {
      200: {
        description: "今の利用者",
        content: { "application/json": { schema: CurrentAccountView } },
      },
      401: unauthenticatedResponse,
    },
  });
}

/**
 * アカウントを消す道（主催者だけ）。
 * @param deps 土台が渡す道具
 * @returns 道の定義
 */
function deleteRoute(deps: DomainRouteDeps) {
  return createRoute({
    method: "delete",
    path: "/api/v1/accounts/{accountId}",
    tags: ["account"],
    operationId: "accountDelete",
    summary: "アカウントを消す（主催者だけ。セッションも消える。元に戻せない）",
    middleware: [requireSession(deps), requireOrganizer(deps)] as const,
    request: { params: AccountParams },
    responses: {
      204: { description: "消した" },
      401: unauthenticatedResponse,
      403: forbiddenResponse,
      404: notFoundResponse,
    },
  });
}

/**
 * アカウントの行を、今の利用者の答えの形にする。
 * @param config 領域の設定（主催者）
 * @param record アカウント
 * @returns 今の利用者
 */
function present(
  config: DomainRouteDeps["config"],
  record: AccountRecord,
): contract.CurrentAccountView {
  return {
    id: record.id,
    displayName: record.displayName,
    isOrganizer: isOrganizer(config, record),
    registeredAt: record.registeredAt.toISOString(),
  };
}

/**
 * アカウントの窓口を作る。戻り値の型は書かない（.openapi() のつながりのまま返し、画面の型を残す）。
 * @param deps 土台が渡す道具
 * @param verifier LINE の ID トークンの確かめ（既定は deps.fetch で LINE の verify を呼ぶもの）
 * @returns 道
 */
export function accountRoutes(
  deps: DomainRouteDeps,
  verifier: LineIdTokenVerifier = createLineIdTokenVerifier({
    channelIds: deps.config.lineChannelIds,
    fetch: deps.fetch,
    logger: deps.logger,
  }),
) {
  const { db, config } = deps;
  const cookie = sessionCookie(config);

  /**
   * アカウントを作るか探し、セッションを出して（ブラウザの前のセッションは消して）、今の利用者を返す。
   * @param c 要求の文脈
   * @param input LINE のユーザー ID と表示名
   * @param input.lineUserId LINE のユーザー ID
   * @param input.displayName 表示名
   * @returns 今の利用者
   */
  const login = async (
    c: Context,
    input: { lineUserId: string; displayName: string | undefined },
  ) => {
    const record = await upsertAccount(db, input);
    await issueSession(c, db, cookie, record.id);
    return present(config, record);
  };

  const routes = new OpenAPIHono<ApiEnv>().openapi(lineLoginRoute, async (c) => {
    const user = await verifier.verify(c.req.valid("json").idToken);
    return c.json(await login(c, user), 200);
  });

  /**
   * 試験用のログインの道を足す（設定 TEST_LOGIN_ENABLED のときだけ呼ぶ）。
   * @param app 道を足す先
   * @returns 道を足したもの
   */
  const withTestLogin = (app: typeof routes) =>
    app.openapi(testLoginRoute, async (c) => c.json(await login(c, c.req.valid("json")), 200));

  // 切のときは道を登録しない（窓口の文書に出さず、入力も確かめずに 404）。画面の型のため、型だけは足した形にそろえる
  const withTest = config.testLoginEnabled
    ? withTestLogin(routes)
    : (routes as unknown as ReturnType<typeof withTestLogin>);

  return withTest
    .openapi(logoutRoute, async (c) => {
      const token = readSessionToken(c, cookie);
      if (token) await deleteSessionByTokenHash(db, hashSessionToken(token));
      clearSessionCookie(c, cookie);
      return c.body(null, 204);
    })
    .openapi(meRoute(deps), (c) => c.json(present(config, currentAccountRecord(c)), 200))
    .openapi(deleteRoute(deps), async (c) => {
      const deleted = await deleteAccount(db, c.req.valid("param").accountId);
      if (!deleted) throw new AppError("NOT_FOUND");
      return c.body(null, 204);
    });
}
