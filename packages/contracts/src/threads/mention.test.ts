// 時間差のメンションの共通の決まり（threads-007。めぐるの packages/shared/test/mention.test.ts を写した）。
import { describe, expect, it } from "vitest";
import {
  buildMentionText,
  mentionDelayLabel,
  mentionDueAt,
  mentionUsernamesIn,
  normalizeMentionUsername,
  toggleMentionInText,
} from "./mention.ts";
import { MentionAttachInput, MentionSettingsInput } from "./mention-schemas.ts";
describe("normalizeMentionUsername", () => {
  it("@・空白・大文字をそろえ、形が違えば null", () => {
    expect(normalizeMentionUsername(" @Minato_Place ")).toBe("minato_place");
    expect(normalizeMentionUsername("＠taro.events")).toBe("taro.events");
    expect(normalizeMentionUsername("あいう")).toBeNull();
    expect(normalizeMentionUsername("a".repeat(31))).toBeNull();
    expect(normalizeMentionUsername("")).toBeNull();
    expect(normalizeMentionUsername("a b")).toBeNull();
  });
});

describe("buildMentionText", () => {
  it("ひとこと＋改行＋@a @b、ひとことが空なら @ だけ", () => {
    expect(buildMentionText("よければシェアお願いします", ["a", "b.c"])).toBe(
      "よければシェアお願いします\n@a @b.c",
    );
    expect(buildMentionText("  ", ["a"])).toBe("@a");
  });
});

describe("mentionUsernamesIn", () => {
  it("一覧にある人だけを、重なりなく文の順に", () => {
    expect(
      mentionUsernamesIn("ぜひ @Taro.events と @minato_place、@other @taro.events", [
        "minato_place",
        "taro.events",
      ]),
    ).toEqual(["taro.events", "minato_place"]);
    expect(mentionUsernamesIn("メンションなし", ["a"])).toEqual([]);
    // 句読点のあとも見分け、メールアドレスの中は見分けない
    expect(mentionUsernamesIn("@a、@b。x@a.com", ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("toggleMentionInText", () => {
  it("なければ最後の行に足し、あれば消す", () => {
    expect(toggleMentionInText("シェアお願いします\n@a", "b")).toBe("シェアお願いします\n@a @b");
    expect(toggleMentionInText("シェアお願いします", "b")).toBe("シェアお願いします\n@b");
    expect(toggleMentionInText("", "b")).toBe("@b");
    expect(toggleMentionInText("シェアお願いします\n@a @b", "a")).toBe("シェアお願いします\n@b");
    expect(toggleMentionInText("シェアお願いします\n@a", "a")).toBe("シェアお願いします");
    // 名前の一部だけには当てない
    expect(toggleMentionInText("@ab @a", "a")).toBe("@ab");
    expect(toggleMentionInText("@a.b", "a")).toBe("@a.b @a");
    // 句読点のあとの @ も消し、足し直さない（見分け方と同じ境目）
    expect(toggleMentionInText("ぜひ@a、@b", "b")).toBe("ぜひ@a、");
    expect(mentionUsernamesIn(toggleMentionInText("ぜひ@a、@b", "b"), ["a", "b"])).toEqual(["a"]);
  });
});

describe("mentionDueAt", () => {
  it("押した時刻、なければ投稿＋時間差、投稿の前は null", () => {
    expect(
      mentionDueAt(
        { delayMinutes: null, sendAfter: "2026-11-05T03:00:00.000Z" },
        null,
      )?.toISOString(),
    ).toBe("2026-11-05T03:00:00.000Z");
    expect(
      mentionDueAt(
        { delayMinutes: 30, sendAfter: null },
        "2026-11-05T03:00:00.000Z",
      )?.toISOString(),
    ).toBe("2026-11-05T03:30:00.000Z");
    expect(mentionDueAt({ delayMinutes: 30, sendAfter: null }, null)).toBeNull();
  });
});

describe("時間差の名前", () => {
  it("分・時間・日", () => {
    expect(mentionDelayLabel(10)).toBe("10分");
    expect(mentionDelayLabel(180)).toBe("3時間");
    expect(mentionDelayLabel(1440)).toBe("1日");
  });
});

describe("形", () => {
  it("設定：時間差は決まった値、ひとことは100文字まで", () => {
    expect(
      MentionSettingsInput.safeParse({ version: 0, message: "a", delayMinutes: 30 }).success,
    ).toBe(true);
    expect(
      MentionSettingsInput.safeParse({ version: 0, message: "a", delayMinutes: 45 }).success,
    ).toBe(false);
    expect(
      MentionSettingsInput.safeParse({ version: 0, message: "あ".repeat(101), delayMinutes: 30 })
        .success,
    ).toBe(false);
  });
  it("付ける：1〜5人、文は500文字まで", () => {
    const ok = { version: 1, usernames: ["a"] };
    expect(MentionAttachInput.safeParse(ok).success).toBe(true);
    expect(MentionAttachInput.safeParse({ ...ok, usernames: [] }).success).toBe(false);
    expect(
      MentionAttachInput.safeParse({ ...ok, usernames: ["a", "b", "c", "d", "e", "f"] }).success,
    ).toBe(false);
    expect(MentionAttachInput.safeParse({ ...ok, text: "あ".repeat(501) }).success).toBe(false);
  });
});
