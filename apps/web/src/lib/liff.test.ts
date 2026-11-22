// LINE の始め方：LIFF ID がない（手元・テスト）ときの仮の形と、1度だけ始めること。
// 開いた道で始めるかの決め方（AD-4 の例外：試合表の道は始めない。core-013）。
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFakeLiff,
  getLiff,
  initLiff,
  mustReloadForLiff,
  needsLiff,
  resetLiffForTest,
  startLiffFor,
} from "./liff.ts";

/** 本物の LIFF の ID の形（テストだけの値）。 */
const LIFF_ID = "1234567890-AbCdEfGh";

/**
 * init が失敗する SDK に差しかえる（本物の LIFF を始められないとき）。
 * @returns init の呼ばれ方を見る関数
 */
function mockFailingSdk() {
  const init = vi.fn(() => Promise.reject(new Error("init に失敗")));
  vi.doMock("@line/liff", () => ({ default: { init } }));
  return init;
}

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

describe("開いた道で LIFF を始めるか（AD-4 の例外）", () => {
  it("試合表の道（見るだけ・受付・運営）は始めない", () => {
    for (const path of [
      "/match",
      "/match/",
      "/match/view/abc_DEF-123",
      "/match/join/abc_DEF-123",
      "/match/tables/0192f5c0-0000-7000-8000-000000000000",
    ]) {
      expect(needsLiff(path), path).toBe(false);
    }
  });

  it("ほかの道は今までどおり始める（頭が似ているだけの道・大文字の道も始める側）", () => {
    for (const path of [
      "/",
      "/admin/events",
      "/e/0192f5c0-0000-7000-8000-000000000000/checkin",
      "/invite/abc",
      "/dev/login",
      "/apps",
      "/matches",
      "/matching/view/abc",
      "/Match/view/abc",
      "/admin/match",
    ]) {
      expect(needsLiff(path), path).toBe(true);
    }
  });

  it("ほかの道で LIFF を始められなければ「failed」（画面は「読みこめない」を出し、ルーターを作らない）", async () => {
    const init = mockFailingSdk();
    expect(await startLiffFor("/admin/events", { liffId: LIFF_ID })).toBe("failed");
    expect(init).toHaveBeenCalledTimes(1);
    expect(mustReloadForLiff("/admin/events")).toBe(false);
  });

  it("ほかの道で始められれば「started」で、getLiff が使える。読み直しは要らない", async () => {
    expect(await startLiffFor("/admin/events")).toBe("started");
    expect(getLiff().mode).toBe("fake");
    expect(mustReloadForLiff("/admin/events")).toBe(false);
  });

  it("試合表の道は、LIFF を始められない状態でも SDK を読まずに「skipped」で開く（電波がなくても開ける）", async () => {
    const init = mockFailingSdk();
    expect(await startLiffFor("/match/view/abc", { liffId: LIFF_ID })).toBe("skipped");
    expect(init).not.toHaveBeenCalled();
    expect(() => getLiff()).toThrow("LIFF を始めずに開いた");
  });

  it("始めずに開いたあと、LIFF の要る道へ移るときだけ読み直す（試合表の中の行き来は読み直さない）", async () => {
    await startLiffFor("/match/view/abc");
    expect(mustReloadForLiff("/match/join/abc")).toBe(false);
    expect(mustReloadForLiff("/admin/events")).toBe(true);
    expect(mustReloadForLiff("/")).toBe(true);
  });

  it("始めずに開いたあとでも、LIFF がもう始まっていれば読み直さない", async () => {
    await startLiffFor("/match/view/abc");
    await initLiff();
    expect(mustReloadForLiff("/admin/events")).toBe(false);
  });
});
