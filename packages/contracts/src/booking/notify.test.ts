// 予約の知らせの約束の形：公式アカウントの設定の入力（初めと入れ直し・形）・メールアドレス（小文字・上限）・設定の画面の道。
import { describe, expect, it } from "vitest";
import {
  BOOKING_SETTINGS_ROUTE_PATTERNS,
  ContactInput,
  LineChannelInput,
  MailSettingInput,
  bookingSettingsPaths,
} from "./index.ts";

/** 見本の16進の32文字。 */
const HEX32 = "0123456789abcdef".repeat(2);
/** 見本の長い文字（記号を含む）。 */
const LONG = `${"abcdefghij".repeat(4)}+/=`;

describe("公式アカウントの設定の入力", () => {
  it("3つとも・1つだけを受け取り、前後の空白を消す", () => {
    expect(
      LineChannelInput.parse({
        lineChannelId: " 1234567890 ",
        channelSecret: HEX32,
        accessToken: LONG,
      }),
    ).toEqual({ lineChannelId: "1234567890", channelSecret: HEX32, accessToken: LONG });
    expect(LineChannelInput.parse({ accessToken: LONG })).toEqual({ accessToken: LONG });
  });

  it("空・形の違う値・知らない欄は止める", () => {
    expect(LineChannelInput.safeParse({}).success).toBe(false);
    expect(LineChannelInput.safeParse({ lineChannelId: "12a" }).success).toBe(false);
    expect(LineChannelInput.safeParse({ channelSecret: "abc" }).success).toBe(false);
    expect(LineChannelInput.safeParse({ accessToken: "short" }).success).toBe(false);
    expect(LineChannelInput.safeParse({ accessToken: `${LONG} x` }).success).toBe(false);
    expect(LineChannelInput.safeParse({ accessToken: LONG, extra: 1 }).success).toBe(false);
  });
});

describe("メールアドレス", () => {
  it("小文字にそろえ、形と長さを確かめる。返信先は null で消せる", () => {
    expect(ContactInput.parse({ email: "Hanako@Example.COM" })).toEqual({
      email: "hanako@example.com",
    });
    expect(ContactInput.safeParse({ email: "hanako" }).success).toBe(false);
    expect(ContactInput.safeParse({ email: "a\n@example.com" }).success).toBe(false);
    expect(ContactInput.safeParse({ email: `${"a".repeat(250)}@example.com` }).success).toBe(false);
    expect(MailSettingInput.parse({ replyToEmail: null })).toEqual({ replyToEmail: null });
  });
});

describe("設定の画面の道", () => {
  it("道を作る関数と、画面の道の形が同じ道を指す", () => {
    expect(bookingSettingsPaths.notify()).toBe(BOOKING_SETTINGS_ROUTE_PATTERNS.notify);
    expect(bookingSettingsPaths.notifyOrganization("o1")).toBe(
      BOOKING_SETTINGS_ROUTE_PATTERNS.notifyOrganization.replace("$organizationId", "o1"),
    );
  });
});
