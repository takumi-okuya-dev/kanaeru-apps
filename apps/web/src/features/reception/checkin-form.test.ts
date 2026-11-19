// チェックインの入力の確かめ：前後の空白を除いた入力にし、選んでいない設問は設問の名前を入れた文にする。
import { describe, expect, it } from "vitest";
import { EMPTY_CHECKIN_FORM, validateCheckinForm } from "./checkin-form.ts";

describe("チェックインの入力の確かめ", () => {
  it("全部あれば送る入力にする（名前の前後の空白を除く）", () => {
    expect(
      validateCheckinForm({
        name: " 佐藤 ",
        applicationSource: "peatix",
        referral: "sns",
        paymentMethod: "cash",
      }),
    ).toEqual({
      ok: true,
      input: { name: "佐藤", applicationSource: "peatix", referral: "sns", paymentMethod: "cash" },
    });
  });

  it("空の名前と選んでいない設問を、欄の名前ごとにまとめる", () => {
    expect(validateCheckinForm(EMPTY_CHECKIN_FORM)).toEqual({
      ok: false,
      errors: {
        name: "名前を入れてください。",
        applicationSource: "申し込みの媒体を選んでください。",
        referral: "知ったきっかけを選んでください。",
        paymentMethod: "支払い方法を選んでください。",
      },
    });
  });
});
