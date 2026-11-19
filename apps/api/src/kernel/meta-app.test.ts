// Meta のアプリの道具（kernel/meta-app.ts）：signed_request の確かめと、トークンの交換の値。
import { describe, expect, it } from "vitest";
import { createMetaApp, signRequestForTest } from "./meta-app.ts";

const SECRET = "s".repeat(32);

describe("Meta のアプリの道具", () => {
  it("設定がなければ undefined", () => {
    expect(createMetaApp(undefined)).toBeUndefined();
  });

  it("正しい署名の signed_request だけを読む", () => {
    const app = createMetaApp({ appId: "123", appSecret: SECRET });
    const signed = signRequestForTest(SECRET, {
      algorithm: "HMAC-SHA256",
      user_id: 9001,
      issued_at: 1_800_000_000,
    });
    expect(app?.verifySignedRequest(signed)).toEqual({
      userId: "9001",
      issuedAt: new Date(1_800_000_000_000),
    });
    expect(
      app?.verifySignedRequest(signRequestForTest("x".repeat(32), { user_id: "1" })),
    ).toBeNull();
    expect(app?.verifySignedRequest("abc")).toBeNull();
    expect(
      app?.verifySignedRequest(signRequestForTest(SECRET, { algorithm: "MD5", user_id: "1" })),
    ).toBeNull();
    expect(app?.verifySignedRequest(signRequestForTest(SECRET, { foo: 1 }))).toBeNull();
    // algorithm のないものは読まない
    expect(app?.verifySignedRequest(signRequestForTest(SECRET, { user_id: "1" }))).toBeNull();
  });

  it("トークンの交換の値に、アプリの ID と秘密の値を足す", () => {
    const app = createMetaApp({ appId: "123", appSecret: SECRET });
    const params = app?.withClientCredentials({ code: "c" });
    expect(params?.get("client_id")).toBe("123");
    expect(params?.get("client_secret")).toBe(SECRET);
    expect(params?.get("code")).toBe("c");
  });
});
