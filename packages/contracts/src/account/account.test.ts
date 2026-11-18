// アカウントの約束：入力の形・誤りの文・エラーの code。
import { describe, expect, it } from "vitest";
import { ACCOUNT_ERRORS, CurrentAccountView, LineLoginInput, TestLoginInput } from "./index.ts";

/** テストの LINE のユーザー ID。 */
const LINE_USER_ID = `U${"0123456789abcdef".repeat(2)}`;

describe("アカウントの約束", () => {
  it("LINE のログインは ID トークンだけを受け取り、名前やユーザー ID を足すと誤り", () => {
    expect(LineLoginInput.parse({ idToken: "a.b.c" })).toEqual({ idToken: "a.b.c" });
    expect(LineLoginInput.safeParse({ idToken: "" }).success).toBe(false);
    expect(LineLoginInput.safeParse({ idToken: "x".repeat(4097) }).success).toBe(false);
    const extra = LineLoginInput.safeParse({ idToken: "a.b.c", displayName: "なりすまし" });
    expect(extra.success).toBe(false);
  });

  it("試験用のログインは、LINE のユーザー ID の形と表示名（前後の空白を除く・50文字まで）を確かめる", () => {
    expect(
      TestLoginInput.parse({ lineUserId: ` ${LINE_USER_ID} `, displayName: " 佐藤 " }),
    ).toEqual({ lineUserId: LINE_USER_ID, displayName: "佐藤" });
    const wrong = TestLoginInput.safeParse({ lineUserId: "U123", displayName: " " });
    expect(wrong.success).toBe(false);
    expect(wrong.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["lineUserId", "LINE のユーザー ID は、U と16進（0〜9・a〜f）の32文字にしてください。"],
      ["displayName", "表示名を入れてください。"],
    ]);
    expect(
      TestLoginInput.safeParse({ lineUserId: LINE_USER_ID, displayName: "あ".repeat(51) }).success,
    ).toBe(false);
  });

  it("今の利用者は、ID・表示名・主催者か・登録日（時差つき）", () => {
    const view = {
      id: "0193a1b2-0000-7000-8000-000000000000",
      displayName: "佐藤",
      isOrganizer: false,
      registeredAt: "2026-11-19T10:00:00.000Z",
    };
    expect(CurrentAccountView.parse(view)).toEqual(view);
  });

  it("エラーは code・状態の番号・日本語の文を持ち、未ログインは 401 UNAUTHENTICATED", () => {
    expect(ACCOUNT_ERRORS.UNAUTHENTICATED).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    for (const [key, spec] of Object.entries(ACCOUNT_ERRORS)) {
      expect(spec.code).toBe(key);
      expect(spec.message).toMatch(/[ぁ-ん]/);
    }
  });
});
