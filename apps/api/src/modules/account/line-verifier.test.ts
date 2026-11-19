// LINE の ID トークンの確かめ：aud で client_id を選び、verify を1度だけ呼ぶ。失敗の読みかえと時間の上限。ネットワークには出ない。
import { describe, expect, it } from "vitest";
import { AppError } from "../../kernel/errors.ts";
import { LINE_VERIFY_URL, createLineIdTokenVerifier, readAudiences } from "./line-verifier.ts";

/** テストの LINE のユーザー ID。 */
const LINE_USER_ID = `U${"0123456789abcdef".repeat(2)}`;

/**
 * 仮の ID トークン（署名は確かめない形。中身の aud だけを読む）を作る。
 * @param payload 中身
 * @returns ID トークン
 */
function fakeIdToken(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.signature`;
}

/** 送られた要求。 */
type Sent = { url: string; body: string };

/**
 * 決まった答えを返す仮の出口を作る。
 * @param respond 答えを作る
 * @returns 仮の出口と、送られた要求の一覧
 */
function fakeFetch(respond: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request: Sent = {
      url: input instanceof Request ? input.url : input.toString(),
      body: typeof init?.body === "string" ? init.body : "",
    };
    sent.push(request);
    return respond(request);
  };
  return { fetch, sent };
}

/**
 * 投げたエラーの code を返す。
 * @param promise 確かめ
 * @returns code
 */
async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  return error instanceof AppError ? error.code : undefined;
}

describe("LINE の ID トークンの確かめ", () => {
  it("aud が並びにあれば、その client_id で verify を1度だけ呼び、sub と name を返す", async () => {
    const { fetch, sent } = fakeFetch(() =>
      Response.json({ sub: LINE_USER_ID, aud: "2222222222", name: " 佐藤 ", exp: 1 }),
    );
    const verifier = createLineIdTokenVerifier({ channelIds: ["1111111111", "2222222222"], fetch });
    const token = fakeIdToken({ aud: "2222222222" });
    expect(await verifier.verify(token)).toEqual({ lineUserId: LINE_USER_ID, displayName: "佐藤" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(LINE_VERIFY_URL);
    expect(new URLSearchParams(sent[0]?.body)).toEqual(
      new URLSearchParams({ id_token: token, client_id: "2222222222" }),
    );
  });

  it("name がなければ表示名は undefined", async () => {
    const { fetch } = fakeFetch(() => Response.json({ sub: LINE_USER_ID, aud: "1111111111" }));
    const verifier = createLineIdTokenVerifier({ channelIds: ["1111111111"], fetch });
    expect(await verifier.verify(fakeIdToken({ aud: "1111111111" }))).toEqual({
      lineUserId: LINE_USER_ID,
      displayName: undefined,
    });
  });

  it("aud が並びにない・並びが空・JWT の形でないときは、LINE に問い合わせずに LINE_LOGIN_FAILED", async () => {
    const { fetch, sent } = fakeFetch(() => Response.json({}));
    const verifier = createLineIdTokenVerifier({ channelIds: ["1111111111"], fetch });
    expect(await codeOf(verifier.verify(fakeIdToken({ aud: "9999999999" })))).toBe(
      "LINE_LOGIN_FAILED",
    );
    expect(await codeOf(verifier.verify("not-a-jwt"))).toBe("LINE_LOGIN_FAILED");
    expect(await codeOf(verifier.verify("a.%%%.c"))).toBe("LINE_LOGIN_FAILED");
    const empty = createLineIdTokenVerifier({ channelIds: [], fetch });
    expect(await codeOf(empty.verify(fakeIdToken({ aud: "1111111111" })))).toBe(
      "LINE_LOGIN_FAILED",
    );
    expect(sent).toHaveLength(0);
  });

  it("verify が 400 で断る（期限切れなど）・答えの aud が違うときは LINE_LOGIN_FAILED", async () => {
    const token = fakeIdToken({ aud: "1111111111" });
    const expired = fakeFetch(() =>
      Response.json(
        { error: "invalid_request", error_description: "IdToken expired." },
        { status: 400 },
      ),
    );
    expect(
      await codeOf(
        createLineIdTokenVerifier({ channelIds: ["1111111111"], ...expired }).verify(token),
      ),
    ).toBe("LINE_LOGIN_FAILED");
    const otherAud = fakeFetch(() => Response.json({ sub: LINE_USER_ID, aud: "2222222222" }));
    expect(
      await codeOf(
        createLineIdTokenVerifier({ channelIds: ["1111111111"], ...otherAud }).verify(token),
      ),
    ).toBe("LINE_LOGIN_FAILED");
  });

  it("LINE の障害（5xx）・形の違う答え・通信の誤りは LINE_UNREACHABLE", async () => {
    const token = fakeIdToken({ aud: "1111111111" });
    const cases = [
      () => new Response("down", { status: 503 }),
      () => new Response("not json", { status: 200 }),
      () => Response.json({ aud: "1111111111" }),
      () => Promise.reject(new TypeError("fetch failed")),
    ];
    for (const respond of cases) {
      const { fetch } = fakeFetch(respond);
      expect(
        await codeOf(
          createLineIdTokenVerifier({ channelIds: ["1111111111"], fetch }).verify(token),
        ),
      ).toBe("LINE_UNREACHABLE");
    }
  });

  it("LINE が答えないときは、時間の上限で打ち切って LINE_UNREACHABLE", async () => {
    // 送られた signal が切れるまで答えない出口
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("打ち切った")));
      });
    const verifier = createLineIdTokenVerifier({
      channelIds: ["1111111111"],
      fetch: hanging,
      timeoutMs: 50,
    });
    const startedAt = performance.now();
    expect(await codeOf(verifier.verify(fakeIdToken({ aud: "1111111111" })))).toBe(
      "LINE_UNREACHABLE",
    );
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });

  it("aud の候補は、文字でも並びでも読める", () => {
    expect(readAudiences(fakeIdToken({ aud: ["1", "2"] }))).toEqual(["1", "2"]);
    expect(readAudiences(fakeIdToken({ sub: "x" }))).toEqual([]);
  });
});
