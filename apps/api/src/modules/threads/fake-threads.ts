// 偽の Threads の API（threads-002。めぐるの test/fake-threads/server.ts を、この領域で使う窓口だけに絞って写した）。
// 結合のテストは deps.fetch にこれの fetch を渡し（外へ出ない）、E2E と手元の確かめは fake-threads-serve.ts で口を開けて使う。
// 本番のコードからは読まない（組み立ては読まない。テストと立ち上げの手順だけが読む）。
// - Graph API：/me・debug_token・投稿の上限・フォロワーの数・コンテナーを作る・公開する・状態・投稿・投稿の一覧・反応・トークンの延長・
//   OAuth（認可の画面・code の交換・長期のトークンへの交換。threads-010）
// - 差しかえ（テストは control の関数、E2E は /__control の道）：利用者とトークンを足す・トークンを無効にする・次の答えを失敗にする
import { Hono } from "hono";
import type { Context } from "hono";

/** 偽の利用者（pictureUrl はプロフィールの画像。threads-012）。 */
export type FakeUser = { id: string; username: string; name: string; pictureUrl?: string };

/** 偽のトークン。 */
type FakeToken = {
  userId: string;
  /** 期限（秒。0 は期限なし） */
  expiresAt: number;
  issuedAt: number;
  scopes: string[];
  valid: boolean;
  /** debug_token で調べられない（権限がない）トークン */
  noDebug: boolean;
};

/** 偽のコンテナー。 */
type FakeContainer = {
  id: string;
  userId: string;
  text: string;
  replyToId: string | null;
  status: "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED" | "IN_PROGRESS";
  mediaId: string | null;
};

/** 偽の投稿。 */
export type FakePost = {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
  permalink: string;
  replyToId: string | null;
};

/** 差しかえる答えの窓口の名前。 */
export type FakeEndpoint =
  | "me"
  | "debug"
  | "publishing_limit"
  | "followers"
  | "create"
  | "publish"
  | "status"
  | "media"
  | "list"
  | "insights"
  | "refresh"
  | "oauth";

/** 偽の反応の数。 */
export type FakeInsights = Partial<
  Record<"views" | "likes" | "replies" | "reposts" | "quotes" | "shares", number>
>;

/** すべての権限。 */
export const FAKE_ALL_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_insights",
  "threads_manage_replies",
] as const;

/** 偽の Threads の API と、テストからの差しかえ。 */
export type FakeThreads = {
  /** HTTP の窓口（Hono）。fetch としても使える */
  app: Hono;
  /** deps.fetch に渡す出口（宛先の源は見ない） */
  fetch: typeof fetch;
  /**
   * 利用者を足す（あれば上書き）。
   * @param user 利用者
   */
  addUser(user: FakeUser): void;
  /**
   * トークンを作る。
   * @param options 利用者・期限（long：60日・short：1時間・none：期限なし）・権限・debug_token で調べられないか
   * @returns トークン
   */
  issueToken(options: {
    userId: string;
    lifetime?: "long" | "short" | "none";
    scopes?: readonly string[];
    noDebug?: boolean;
  }): string;
  /**
   * トークンを無効にする。
   * @param token トークン
   */
  invalidate(token: string): void;
  /**
   * 次の n 回の答えを差しかえる。
   * @param endpoint 窓口
   * @param response 返す状態の番号と本文
   * @param times 回数（既定は1）
   */
  failNext(
    endpoint: FakeEndpoint,
    response: { status: number; body: unknown },
    times?: number,
  ): void;
  /**
   * 次の公開は、公開まで済ませてから答えだけを失わせる（500 を返す。結果がわからないときの確かめに使う）。
   */
  dropNextPublishResponse(): void;
  /**
   * 投稿の反応の数を決める。
   * @param mediaId 投稿の ID
   * @param insights 反応の数
   */
  setInsights(mediaId: string, insights: FakeInsights): void;
  /**
   * フォロワーの数を決める。
   * @param userId 利用者の ID
   * @param count 数
   */
  setFollowers(userId: string, count: number): void;
  /**
   * 公開した投稿。
   * @returns 投稿（古い順）
   */
  posts(): FakePost[];
  /**
   * 窓口ごとの呼ばれた回数。
   * @returns 回数
   */
  calls(): Partial<Record<FakeEndpoint, number>>;
  /**
   * OAuth の認可の code を作る（threads-010。交換すると、その利用者の短期のトークンになる）。
   * @param userId 利用者の ID
   * @returns code
   */
  issueCode(userId: string): string;
  /**
   * 偽の認可の画面（GET /oauth/authorize）で許可する利用者を決める（E2E。決めていなければ最初に足した利用者）。
   * @param userId 利用者の ID
   */
  authorizeAs(userId: string): void;
};

/** エラーの本文。 */
const AUTH_ERROR = {
  error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 },
};

/**
 * 偽の Threads の API を作る。
 * @param options clock：今の時刻（ミリ秒。テストで定期の仕事の時刻に合わせる。既定は本当の時刻）
 * @param options.clock 今の時刻（ミリ秒）
 * @returns 偽の Threads
 */
export function createFakeThreads(options: { clock?: () => number } = {}): FakeThreads {
  const clock = options.clock ?? (() => Date.now());
  const users = new Map<string, FakeUser>();
  const tokens = new Map<string, FakeToken>();
  const containers = new Map<string, FakeContainer>();
  const posts: FakePost[] = [];
  const insights = new Map<string, FakeInsights>();
  const followers = new Map<string, number>();
  const injected = new Map<FakeEndpoint, { status: number; body: unknown }[]>();
  const callCounts: Partial<Record<FakeEndpoint, number>> = {};
  const codes = new Map<string, string>();
  let authorizingUser: string | undefined;
  let sequence = 1_000_000;
  let dropPublishResponse = false;

  const nextId = () => String((sequence += 1));
  const nowSec = () => Math.floor(clock() / 1000);

  /**
   * 呼ばれた回数を数え、差しかえた答えがあれば返す。
   * @param c 文脈
   * @param endpoint 窓口
   * @returns 差しかえた答え（なければ null）
   */
  const intercept = (c: Context, endpoint: FakeEndpoint): Response | null => {
    callCounts[endpoint] = (callCounts[endpoint] ?? 0) + 1;
    const queue = injected.get(endpoint);
    const next = queue?.shift();
    if (!next) return null;
    return c.json(next.body as object, next.status as 400);
  };

  /**
   * 見出しの Bearer のトークンの利用者（無効なら null）。
   * @param c 文脈
   * @param fromQuery 問い合わせの access_token も見るか
   * @returns トークンと利用者
   */
  const authorize = (
    c: Context,
    fromQuery = false,
  ): { token: FakeToken; user: FakeUser } | null => {
    const header = c.req.header("authorization");
    const raw = header?.startsWith("Bearer ")
      ? header.slice(7)
      : fromQuery
        ? c.req.query("access_token")
        : undefined;
    const token = raw ? tokens.get(raw) : undefined;
    if (!token?.valid || (token.expiresAt !== 0 && token.expiresAt < nowSec())) return null;
    const user = users.get(token.userId);
    return user ? { token, user } : null;
  };

  /**
   * 権限がないときのエラー（Graph API のコード10）。
   * @param c 文脈
   * @returns 答え
   */
  const permissionDenied = (c: Context) =>
    c.json({ error: { message: "Permission denied", type: "OAuthException", code: 10 } }, 403);

  /**
   * フォームの本文を読む。
   * @param c 文脈
   * @returns 値
   */
  const form = async (c: Context): Promise<Record<string, string>> => {
    const text = await c.req.text();
    return Object.fromEntries(new URLSearchParams(text));
  };

  const app = new Hono();

  app.get("/v1.0/me", (c) => {
    const hit = intercept(c, "me");
    if (hit) return hit;
    const auth = authorize(c);
    if (!auth) return c.json(AUTH_ERROR, 401);
    return c.json({
      id: auth.user.id,
      username: auth.user.username,
      name: auth.user.name,
      ...(auth.user.pictureUrl ? { threads_profile_picture_url: auth.user.pictureUrl } : {}),
    });
  });

  app.get("/v1.0/debug_token", (c) => {
    const hit = intercept(c, "debug");
    if (hit) return hit;
    const auth = authorize(c);
    if (!auth) return c.json(AUTH_ERROR, 401);
    if (auth.token.noDebug) return permissionDenied(c);
    const input = tokens.get(c.req.query("input_token") ?? "");
    if (!input) return c.json({ data: { is_valid: false } });
    return c.json({
      data: {
        is_valid: input.valid,
        expires_at: input.expiresAt,
        issued_at: input.issuedAt,
        scopes: input.scopes,
      },
    });
  });

  app.get("/v1.0/:userId/threads_publishing_limit", (c) => {
    const hit = intercept(c, "publishing_limit");
    if (hit) return hit;
    const auth = authorize(c);
    if (!auth) return c.json(AUTH_ERROR, 401);
    if (!auth.token.scopes.includes("threads_content_publish")) return permissionDenied(c);
    const since = clock() - 86_400_000;
    const used = posts.filter(
      (post) => post.userId === auth.user.id && Date.parse(post.timestamp) >= since,
    ).length;
    return c.json({ data: [{ quota_usage: used, config: { quota_total: 250 } }] });
  });

  app.get("/v1.0/:userId/threads_insights", (c) => {
    const hit = intercept(c, "followers");
    if (hit) return hit;
    const auth = authorize(c);
    if (!auth) return c.json(AUTH_ERROR, 401);
    if (!auth.token.scopes.includes("threads_manage_insights")) return permissionDenied(c);
    return c.json({
      data: [
        { name: "followers_count", total_value: { value: followers.get(auth.user.id) ?? 100 } },
      ],
    });
  });

  app.post("/v1.0/:userId/threads", async (c) => {
    const hit = intercept(c, "create");
    if (hit) return hit;
    const auth = authorize(c);
    if (!auth) return c.json(AUTH_ERROR, 401);
    if (!auth.token.scopes.includes("threads_content_publish")) return permissionDenied(c);
    const values = await form(c);
    const id = nextId();
    containers.set(id, {
      id,
      userId: auth.user.id,
      text: values.text ?? "",
      replyToId: values.reply_to_id ?? null,
      status: "FINISHED",
      mediaId: null,
    });
    return c.json({ id });
  });

  app.post("/v1.0/:userId/threads_publish", async (c) => {
    const hit = intercept(c, "publish");
    if (hit) return hit;
    const auth = authorize(c);
    if (!auth) return c.json(AUTH_ERROR, 401);
    const values = await form(c);
    const container = containers.get(values.creation_id ?? "");
    if (!container || container.userId !== auth.user.id || container.status !== "FINISHED") {
      return c.json(
        { error: { message: "Invalid container", type: "OAuthException", code: 100 } },
        400,
      );
    }
    const id = nextId();
    container.status = "PUBLISHED";
    container.mediaId = id;
    posts.push({
      id,
      userId: auth.user.id,
      text: container.text,
      timestamp: new Date(clock()).toISOString().replace(/\.\d{3}Z$/, "+0000"),
      permalink: `https://www.threads.com/@${auth.user.username}/post/${id}`,
      replyToId: container.replyToId,
    });
    if (dropPublishResponse) {
      dropPublishResponse = false;
      return c.json({ error: { message: "Service unavailable", code: 2 } }, 500);
    }
    return c.json({ id });
  });

  app.get("/v1.0/:userId/threads", (c) => {
    const hit = intercept(c, "list");
    if (hit) return hit;
    const auth = authorize(c);
    if (!auth) return c.json(AUTH_ERROR, 401);
    const since = Number(c.req.query("since") ?? 0) * 1000;
    const data = posts
      .filter(
        (post) =>
          post.userId === auth.user.id && Date.parse(post.timestamp.replace("+0000", "Z")) >= since,
      )
      .reverse()
      .slice(0, 25)
      .map((post) => ({
        id: post.id,
        text: post.text,
        permalink: post.permalink,
        timestamp: post.timestamp,
      }));
    return c.json({ data });
  });

  app.get("/v1.0/:mediaId/insights", (c) => {
    const hit = intercept(c, "insights");
    if (hit) return hit;
    const auth = authorize(c);
    if (!auth) return c.json(AUTH_ERROR, 401);
    if (!auth.token.scopes.includes("threads_manage_insights")) return permissionDenied(c);
    const mediaId = c.req.param("mediaId");
    if (!posts.some((post) => post.id === mediaId)) {
      return c.json(
        { error: { message: "Not found", type: "OAuthException", code: 100, error_subcode: 33 } },
        400,
      );
    }
    const values = insights.get(mediaId) ?? {};
    const metrics = (c.req.query("metric") ?? "").split(",").filter(Boolean);
    return c.json({
      data: metrics.map((name) => ({
        name,
        values: [{ value: values[name as keyof FakeInsights] ?? 0 }],
      })),
    });
  });

  app.get("/v1.0/:id", (c) => {
    const id = c.req.param("id");
    const container = containers.get(id);
    if (container && c.req.query("fields") === "status") {
      const hit = intercept(c, "status");
      if (hit) return hit;
      if (!authorize(c)) return c.json(AUTH_ERROR, 401);
      return c.json({ status: container.status, id });
    }
    const hit = intercept(c, "media");
    if (hit) return hit;
    if (!authorize(c)) return c.json(AUTH_ERROR, 401);
    const post = posts.find((item) => item.id === id);
    if (!post)
      return c.json(
        { error: { message: "Not found", type: "OAuthException", code: 100, error_subcode: 33 } },
        404,
      );
    return c.json({ id: post.id, permalink: post.permalink, timestamp: post.timestamp });
  });

  app.get("/refresh_access_token", (c) => {
    const hit = intercept(c, "refresh");
    if (hit) return hit;
    const auth = authorize(c, true);
    if (!auth) return c.json(AUTH_ERROR, 401);
    const token = control.issueToken({ userId: auth.user.id, scopes: auth.token.scopes });
    return c.json({ access_token: token, token_type: "bearer", expires_in: 60 * 86_400 });
  });

  // OAuth（threads-010）：認可の画面（すぐに redirect_uri へ code を付けて戻す）・code の交換・長期のトークンへの交換
  app.get("/oauth/authorize", (c) => {
    const redirect = c.req.query("redirect_uri");
    const state = c.req.query("state") ?? "";
    const userId = authorizingUser ?? [...users.keys()][0];
    if (!redirect || !userId || !c.req.query("client_id")) return c.text("bad request", 400);
    const url = new URL(redirect);
    url.searchParams.set("code", control.issueCode(userId));
    url.searchParams.set("state", state);
    return c.redirect(url.toString(), 302);
  });
  app.post("/oauth/access_token", async (c) => {
    const hit = intercept(c, "oauth");
    if (hit) return hit;
    const values = await form(c);
    const userId = values.code ? codes.get(values.code) : undefined;
    if (!userId || !values.client_id || !values.client_secret || !values.redirect_uri)
      return c.json({ error: { message: "Invalid code", type: "OAuthException", code: 100 } }, 400);
    if (values.code) codes.delete(values.code);
    return c.json({
      access_token: control.issueToken({ userId, lifetime: "short" }),
      user_id: Number(userId),
    });
  });
  app.get("/access_token", (c) => {
    const hit = intercept(c, "oauth");
    if (hit) return hit;
    if (c.req.query("grant_type") !== "th_exchange_token" || !c.req.query("client_secret"))
      return c.json(
        { error: { message: "Invalid request", type: "OAuthException", code: 100 } },
        400,
      );
    const auth = authorize(c, true);
    if (!auth) return c.json(AUTH_ERROR, 401);
    const token = control.issueToken({ userId: auth.user.id, scopes: auth.token.scopes });
    return c.json({ access_token: token, token_type: "bearer", expires_in: 60 * 86_400 });
  });

  const control: Omit<FakeThreads, "app" | "fetch"> = {
    addUser(user) {
      users.set(user.id, user);
    },
    issueToken({ userId, lifetime = "long", scopes = FAKE_ALL_SCOPES, noDebug = false }) {
      const token = `FAKE${nextId()}${"x".repeat(36)}`;
      const issuedAt = nowSec();
      const expiresAt =
        lifetime === "none" ? 0 : issuedAt + (lifetime === "long" ? 60 * 86_400 : 3600);
      tokens.set(token, { userId, expiresAt, issuedAt, scopes: [...scopes], valid: true, noDebug });
      return token;
    },
    invalidate(token) {
      const found = tokens.get(token);
      if (found) found.valid = false;
    },
    failNext(endpoint, response, times = 1) {
      const queue = injected.get(endpoint) ?? [];
      for (let index = 0; index < times; index += 1) queue.push(response);
      injected.set(endpoint, queue);
    },
    dropNextPublishResponse() {
      dropPublishResponse = true;
    },
    setInsights(mediaId, values) {
      insights.set(mediaId, values);
    },
    setFollowers(userId, count) {
      followers.set(userId, count);
    },
    posts: () => [...posts],
    calls: () => ({ ...callCounts }),
    issueCode(userId) {
      const code = `CODE${nextId()}`;
      codes.set(code, userId);
      return code;
    },
    authorizeAs(userId) {
      authorizingUser = userId;
    },
  };

  // E2E・手元の確かめのための差しかえの道
  app.post("/__control/users", async (c) => {
    control.addUser(await c.req.json<FakeUser>());
    return c.json({ ok: true });
  });
  app.post("/__control/tokens", async (c) => {
    const input = await c.req.json<Parameters<FakeThreads["issueToken"]>[0]>();
    return c.json({ token: control.issueToken(input) });
  });
  app.get("/__control/posts", (c) => c.json({ posts: control.posts() }));
  app.post("/__control/authorize-as", async (c) => {
    control.authorizeAs((await c.req.json<{ userId: string }>()).userId);
    return c.json({ ok: true });
  });

  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    return Promise.resolve(
      app.fetch(new Request(`http://fake-threads${url.pathname}${url.search}`, init)),
    );
  };

  return { app, fetch: fakeFetch, ...control };
}
