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
        discountId: null,
        referrerName: "",
      }),
    ).toEqual({
      ok: true,
      input: {
        name: "佐藤",
        applicationSource: "peatix",
        referral: "sns",
        paymentMethod: "cash",
        discountId: null,
      },
    });
  });

  describe("割引と紹介者（reception-002）", () => {
    const filled = {
      name: "佐藤",
      applicationSource: "peatix",
      referral: "sns",
      paymentMethod: "cash",
      discountId: "0193a1b2-0000-7000-8000-000000000001",
      referrerName: " 田中 ",
    } as const;

    it("割引を選べば、紹介者の名前（前後の空白を除く）も送る", () => {
      const result = validateCheckinForm(filled);
      expect(result.ok && result.input).toMatchObject({
        discountId: filled.discountId,
        referrerName: "田中",
      });
    });

    it("割引なしなら紹介者は送らない", () => {
      const result = validateCheckinForm({ ...filled, discountId: null });
      expect(result.ok && result.input).not.toHaveProperty("referrerName");
    });

    it("紹介者が空なら null を送る。受付係が直す枠では送らない（前の名前を残す）", () => {
      const empty = { ...filled, referrerName: " " };
      const sent = validateCheckinForm(empty);
      expect(sent.ok && sent.input.referrerName).toBeNull();
      const omitted = validateCheckinForm(empty, { omitEmptyReferrer: true });
      expect(omitted.ok && omitted.input).not.toHaveProperty("referrerName");
    });

    it("長すぎる紹介者の名前は、その欄の誤り", () => {
      expect(validateCheckinForm({ ...filled, referrerName: "あ".repeat(51) })).toEqual({
        ok: false,
        errors: { referrerName: "紹介してくれた人の名前は50文字までにしてください。" },
      });
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
