// LINE の始め方：LIFF ID がない（手元・テスト）ときの仮の形と、1度だけ始めること。
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeLiff, getLiff, initLiff, resetLiffForTest } from "./liff.ts";

afterEach(() => {
  resetLiffForTest();
  vi.doUnmock("@line/liff");
});

describe("LINE の始め方", () => {
  it("LIFF ID がなければ、仮の形で始まり、未ログイン・ID トークンなし・LINE の外として振る舞う", async () => {
    const client = await initLiff();
    expect(client.mode).toBe("fake");
    expect(client.isLoggedIn()).toBe(false);
    expect(client.getIDToken()).toBeNull();
    expect(client.isInClient()).toBe(false);
    expect(() => client.login()).not.toThrow();
    expect(await client.requestFriendship()).toBe(false);
    expect(getLiff()).toBe(client);
  });

  it("何度呼んでも、始めるのは1度だけ", async () => {
    const [first, second] = await Promise.all([initLiff(), initLiff()]);
    expect(first).toBe(second);
  });

  it("始める前に getLiff を呼ぶと投げる", () => {
    expect(() => getLiff()).toThrow("initLiff");
  });

  it("仮の形は、テストで状態を変えられる（ログインしていないと ID トークンは null）", () => {
    const loggedIn = createFakeLiff({ loggedIn: true, idToken: "仮のトークン", inClient: true });
    expect(loggedIn.isLoggedIn()).toBe(true);
    expect(loggedIn.getIDToken()).toBe("仮のトークン");
    expect(loggedIn.isInClient()).toBe(true);
    expect(createFakeLiff({ idToken: "仮のトークン" }).getIDToken()).toBeNull();
  });

  it("LIFF ID があれば、SDK で init し、友だち追加は使えるときだけ出す", async () => {
    const sdk = {
      init: vi.fn(() => Promise.resolve()),
      isLoggedIn: vi.fn(() => true),
      login: vi.fn(),
      getIDToken: vi.fn(() => "本物の形のトークン"),
      isInClient: vi.fn(() => true),
      isApiAvailable: vi.fn(() => false),
      requestFriendship: vi.fn(() => Promise.resolve()),
    };
    vi.doMock("@line/liff", () => ({ default: sdk }));
    const client = await initLiff({ liffId: "1234567890-AbCdEfGh" });
    expect(client.mode).toBe("line");
    expect(sdk.init).toHaveBeenCalledWith({
      liffId: "1234567890-AbCdEfGh",
      withLoginOnExternalBrowser: false,
    });
    expect(client.getIDToken()).toBe("本物の形のトークン");
    expect(await client.requestFriendship()).toBe(false);
    expect(sdk.requestFriendship).not.toHaveBeenCalled();
    sdk.isApiAvailable.mockReturnValue(true);
    expect(await client.requestFriendship()).toBe(true);
    sdk.requestFriendship.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect(await client.requestFriendship()).toBe(false);
  });

  it("LIFF の init が失敗したら、initLiff も失敗する（画面は「読みこめない」を出す）", async () => {
    vi.doMock("@line/liff", () => ({
      default: { init: () => Promise.reject(new Error("init に失敗")) },
    }));
    await expect(initLiff({ liffId: "1234567890-AbCdEfGh" })).rejects.toThrow("init に失敗");
  });
});
