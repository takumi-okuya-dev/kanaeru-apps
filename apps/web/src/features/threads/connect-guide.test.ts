// Threads につなぐときの案内の文と、トークンの欄を隠す道具の単体のテスト（threads-012）。
import { describe, expect, it } from "vitest";
import {
  TOKEN_MASK,
  TOKEN_STEPS,
  accountGuideParts,
  accountSwitchSteps,
  isAccountSwitchError,
  lockedUntilLabel,
  unmask,
} from "./connect-guide.ts";

describe("トークンの欄を隠す", () => {
  it("打った文字は最後に足し、消したら全部を消す", () => {
    expect(unmask("", "a")).toBe("a");
    expect(unmask("ab", `${TOKEN_MASK}${TOKEN_MASK}c`)).toBe("abc");
    expect(unmask("abc", `${TOKEN_MASK}${TOKEN_MASK}`)).toBe("");
  });

  it("全部を選んで打ちかえたら、打った文字だけにする", () => {
    expect(unmask("abc", "xyz")).toBe("xyz");
    expect(unmask("abc", `${TOKEN_MASK}xy`)).toBe("xy");
  });

  it("手順は5つで、最後は「つなぐ」を押す", () => {
    expect(TOKEN_STEPS).toHaveLength(5);
    expect(TOKEN_STEPS.at(-1)).toContain("つなぐ");
  });
});

describe("許可する前の案内", () => {
  it("使うべきアカウントが決まっていれば @名前を添える", () => {
    expect(accountGuideParts("taku")).toEqual({
      lead: "threads.com でログインしているアカウントで許可されます。",
      check: { name: "@taku", rest: " でログインしているか確かめてください。" },
    });
    expect(accountGuideParts(null).check).toBeNull();
  });

  it("切り替えの手順は3行で、もう一度押すボタンの名前を入れる", () => {
    const steps = accountSwitchSteps("taku", "Meta のアプリでつなぎ直す");
    expect(steps[1]).toBe("@taku でログインし直す");
    expect(steps[2]).toContain("「Meta のアプリでつなぎ直す」");
    expect(accountSwitchSteps(null, "x")[1]).toBe("つなぎたいアカウントでログインし直す");
  });

  it("違うアカウントで起きるエラーにだけ、手順を添える", () => {
    expect(isAccountSwitchError("THREADS_RECONNECT_MISMATCH")).toBe(true);
    expect(isAccountSwitchError("THREADS_ACCOUNT_REGISTERED")).toBe(true);
    expect(isAccountSwitchError("THREADS_TOKEN_INVALID")).toBe(false);
    expect(isAccountSwitchError(undefined)).toBe(false);
  });

  it("待ちが終わる時刻は日本時間の HH:MM", () => {
    expect(lockedUntilLabel(Date.parse("2026-11-20T03:05:00Z"))).toBe("12:05");
  });
});
