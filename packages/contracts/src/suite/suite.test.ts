// スイートの約束：公開の状態と、見る人に見えるか（AD-16）。
import { describe, expect, it } from "vitest";
import {
  APP_VISIBILITIES,
  APP_VISIBILITY_AUDIENCES,
  APP_VISIBILITY_DESCRIPTIONS,
  APP_VISIBILITY_LABELS,
  AppSettingInput,
  DEFAULT_APP_VISIBILITY,
  isVisibleTo,
} from "./index.ts";

describe("公開の状態", () => {
  it("行がないアプリは「運営者だけ」で、どの状態にも言葉・見える人・説明がある", () => {
    expect(DEFAULT_APP_VISIBILITY).toBe("operator_only");
    for (const visibility of APP_VISIBILITIES) {
      expect(APP_VISIBILITY_LABELS[visibility]).toMatch(/\S/);
      expect(APP_VISIBILITY_AUDIENCES[visibility]).toMatch(/\S/);
      expect(APP_VISIBILITY_DESCRIPTIONS[visibility]).toMatch(/\S/);
    }
  });

  it("公開はだれにも、運営者だけは運営者だけに、切はだれにも見えない（ログインの前は null）", () => {
    const operator = { isOperator: true };
    const member = { isOperator: false };
    expect([null, member, operator].map((viewer) => isVisibleTo("public", viewer))).toEqual([
      true,
      true,
      true,
    ]);
    expect([null, member, operator].map((viewer) => isVisibleTo("operator_only", viewer))).toEqual([
      false,
      false,
      true,
    ]);
    expect([null, member, operator].map((viewer) => isVisibleTo("off", viewer))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("変える入力は3つの状態だけを受け、ほかは日本語の誤り", () => {
    expect(AppSettingInput.parse({ visibility: "public" })).toEqual({ visibility: "public" });
    const wrong = AppSettingInput.safeParse({ visibility: "hidden" });
    expect(wrong.error?.issues[0]?.message).toBe(
      "公開の状態は「切」「運営者だけ」「公開」のどれかにしてください。",
    );
    expect(AppSettingInput.safeParse({ visibility: "public", sale: "suite" }).success).toBe(false);
  });
});
