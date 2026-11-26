// 同意の画面の要求の読み取りの試験：数字だけの値を文字列のまま読む・LINE の項目を捨てる・重なったらしまった要求を使う。
import { describe, expect, it } from "vitest";
import { readConsentRequest } from "./oauth-consent-request.ts";

const FIELDS = {
  response_type: "code",
  client_id: "dcr_test",
  redirect_uri: "http://127.0.0.1:1455/callback",
  state: "1732600000000",
  code_challenge: "a".repeat(43),
  code_challenge_method: "S256",
  resource: "http://localhost:3000/api/mcp",
};

/**
 * 試験用のしまう場所（Map で持つ）。
 * @returns しまう場所
 */
function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("同意の画面の要求の読み取り", () => {
  it("数字だけの state も文字列のまま読み、LINE が付けた項目は捨てる", () => {
    const search = `?${new URLSearchParams({ ...FIELDS, liffClientId: "123", liffRedirectUri: "x" }).toString()}`;
    expect(readConsentRequest(search, memoryStorage())).toEqual(FIELDS);
  });

  it("同じ項目が重なったら、ログインの前にしまった要求を使う", () => {
    const storage = memoryStorage();
    readConsentRequest(`?${new URLSearchParams(FIELDS).toString()}`, storage);
    const afterLogin = `?${new URLSearchParams(FIELDS).toString()}&code=line-code&state=line-state`;
    expect(readConsentRequest(afterLogin, storage)).toEqual(FIELDS);
  });

  it("URL もしまった要求も読めなければ undefined", () => {
    expect(readConsentRequest("?response_type=token", memoryStorage())).toBeUndefined();
  });
});
