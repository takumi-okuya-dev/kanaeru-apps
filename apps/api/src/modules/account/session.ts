// セッションの札・クッキー・今の利用者の受け取り（構成の決めごと AD-4・AD-5・AD-12。research R4・R7）。
// - 札は 32 バイトの乱数（base64url）。クッキーに札、DB に札の SHA-256 だけを持つ。期限は作ってから30日（延ばさない）。
// - クッキーは HttpOnly・SameSite=Lax・Path=/。画面の源（設定 WEB_URL）が https なら Secure と __Host- の名前
//   （環境の名前で分けない。HSTS と同じ形）。
// - requireSession は要求のたびに DB を1度引き（session と account を結んで）、今の利用者を文脈に置く。ほかの領域は currentAccount(c) だけで読む。
// - 主催者は設定 ORGANIZER_LINE_USER_ID と LINE のユーザー ID が同じ人（表に印を持たない。AD-5）。
// 札・クッキーはログに出さない。
import { createHash, randomBytes } from "node:crypto";
import { ACCOUNT_ERRORS } from "@workspace/contracts/account";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { createMiddleware } from "hono/factory";
import type { Db } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { ApiEnv, DomainConfig } from "../../kernel/http.ts";
import { createSession, deleteSessionByTokenHash, findSessionAccount } from "./repository.ts";
import type { AccountRecord } from "./repository.ts";

/** セッションの期限（ミリ秒。30日。AD-4）。 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** セッションのクッキーの名前（https では __Host- を頭に付ける）。 */
export const SESSION_COOKIE_NAME = "kanaeru_session";

/** 札の形（32 バイトの base64url。形の違う札は DB を引かずに未ログインとする）。 */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** 今の利用者（requireSession が置き、currentAccount が返す）。 */
export type SessionAccount = {
  /** account の ID（ほかの領域の表の account_id に入れる） */
  accountId: string;
  /** LINE のユーザー ID（主催者かを決めるときに使う） */
  lineUserId: string;
};

/** 文脈に今の利用者を置く名前（account の中だけで使う。ほかの領域は currentAccount で読む）。 */
const CONTEXT_KEY = "account.session";

/** 文脈の値の型（account の中だけ。GET /me が2度目の命令なしに答えられるよう、アカウントの行ごと置く）。 */
type SessionEnv = { Variables: { [CONTEXT_KEY]: AccountRecord } };

/**
 * 札の SHA-256（16進）を作る。
 * @param token 札
 * @returns SHA-256（16進64文字）
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 新しい札と、その SHA-256 を作る。
 * @returns 札（クッキーに入れる）と SHA-256（DB に入れる）
 */
export function generateSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSessionToken(token) };
}

/** セッションのクッキーの決め方（画面の源で決まるので、道を作るときに1度だけ作る）。 */
export type SessionCookie = {
  /** https の源か（Secure と __Host- の名前を使う） */
  secure: boolean;
  /** クッキーの属性 */
  options: CookieOptions;
};

/**
 * クッキーの決め方を作る（画面の源が https なら Secure と __Host-）。要求のたびに作らない。
 * @param config 領域の設定（webUrl）
 * @returns クッキーの決め方
 */
export function sessionCookie(config: Pick<DomainConfig, "webUrl">): SessionCookie {
  const secure = new URL(config.webUrl).protocol === "https:";
  return {
    secure,
    options: {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      secure,
      ...(secure ? { prefix: "host" as const } : {}),
    },
  };
}

/**
 * クッキーから札を読む（形が違えば undefined）。
 * @param c 要求の文脈
 * @param cookie クッキーの決め方
 * @returns 札
 */
export function readSessionToken(c: Context, cookie: SessionCookie): string | undefined {
  const token = cookie.secure
    ? getCookie(c, SESSION_COOKIE_NAME, "host")
    : getCookie(c, SESSION_COOKIE_NAME);
  return token && TOKEN_FORMAT.test(token) ? token : undefined;
}

/**
 * セッションを作り、クッキーを出す（ログインの窓口が呼ぶ）。
 * ブラウザがすでにセッションのクッキーを持っていれば、そのセッションを先に消す（上書きしたクッキーの札を残さない）。
 * @param c 要求の文脈
 * @param db DB
 * @param cookie クッキーの決め方
 * @param accountId account の ID
 */
export async function issueSession(
  c: Context,
  db: Db,
  cookie: SessionCookie,
  accountId: string,
): Promise<void> {
  const previous = readSessionToken(c, cookie);
  if (previous) await deleteSessionByTokenHash(db, hashSessionToken(previous));
  const { token, tokenHash } = generateSessionToken();
  await createSession(db, {
    accountId,
    tokenHash,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  setCookie(c, SESSION_COOKIE_NAME, token, {
    ...cookie.options,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/**
 * セッションのクッキーを消す（ログアウト）。
 * @param c 要求の文脈
 * @param cookie クッキーの決め方
 */
export function clearSessionCookie(c: Context, cookie: SessionCookie): void {
  deleteCookie(c, SESSION_COOKIE_NAME, cookie.options);
}

/**
 * ログインしているときだけ先へ進める middleware を作る（AD-12）。
 * 道の createRoute({ …, middleware: [requireSession(deps)] as const }) に付ける。
 * 未ログイン・知らない札・期限切れ・消したアカウントは 401 UNAUTHENTICATED。
 * @param deps 道の deps（db と config を使う）
 * @param deps.db DB
 * @param deps.config 領域の設定（webUrl。クッキーの名前を決める）
 * @returns middleware
 */
export function requireSession(deps: { db: Db; config: Pick<DomainConfig, "webUrl"> }) {
  const cookie = sessionCookie(deps.config);
  return createMiddleware<ApiEnv>(async (c, next) => {
    const token = readSessionToken(c, cookie);
    const found = token ? await findSessionAccount(deps.db, hashSessionToken(token)) : null;
    if (!found) throw new AppError(ACCOUNT_ERRORS.UNAUTHENTICATED);
    (c as unknown as Context<SessionEnv>).set(CONTEXT_KEY, found);
    await next();
  });
}

/**
 * 今の利用者を返す（requireSession を付けた道の処理で読む。AD-12）。
 * @param c 要求の文脈
 * @returns 今の利用者
 * @throws {Error} requireSession を付けていない道で呼んだとき（作りの誤り）
 */
export function currentAccount(c: Context): SessionAccount {
  const { id, lineUserId } = currentAccountRecord(c);
  return { accountId: id, lineUserId };
}

/**
 * 今の利用者のアカウントの行を返す（account の中だけ。GET /me が使う）。
 * @param c 要求の文脈
 * @returns アカウントの行
 * @throws {Error} requireSession を付けていない道で呼んだとき（作りの誤り）
 */
export function currentAccountRecord(c: Context): AccountRecord {
  const value = (c as unknown as Context<SessionEnv>).get(CONTEXT_KEY) as AccountRecord | undefined;
  if (!value) {
    throw new Error("currentAccount は requireSession を付けた道の中で呼んでください。");
  }
  return value;
}

/**
 * 主催者か（設定の主催者の LINE のユーザー ID と同じか。設定がなければ誰も主催者でない。AD-5）。
 * @param config 領域の設定（organizerLineUserId。道の deps.config を渡す）
 * @param account 今の利用者（lineUserId を持つもの）
 * @returns 主催者なら true
 */
export function isOrganizer(
  config: Pick<DomainConfig, "organizerLineUserId">,
  account: Pick<SessionAccount, "lineUserId">,
): boolean {
  return (
    config.organizerLineUserId !== undefined && config.organizerLineUserId === account.lineUserId
  );
}

/**
 * 主催者のときだけ先へ進める middleware を作る（requireSession のあとに付ける）。主催者でなければ 403 FORBIDDEN。
 * @param deps 道の deps（config を使う）
 * @param deps.config 領域の設定（organizerLineUserId）
 * @returns middleware
 */
export function requireOrganizer(deps: { config: Pick<DomainConfig, "organizerLineUserId"> }) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    if (!isOrganizer(deps.config, currentAccount(c))) throw new AppError("FORBIDDEN");
    await next();
  });
}
