// 人物メモの窓口の入力の形：人を足す・直す・書き足す・探す・会った場を作る（知らない欄は誤り・誤りの文は日本語・
// 字はコードポイントで数える・タグはそろえて同じものを1つにまとめる）。
import { describe, expect, it } from "vitest";
import {
  MeetingCreateInput,
  NoteAppendInput,
  NoteCreateInput,
  NoteSearchInput,
  NoteUpdateInput,
  PERSON_NOTE_LIMITS,
  uniqueTags,
} from "./index.ts";

const REQUEST_ID = "0193a1b2-0000-4000-8000-000000000001";

/**
 * 形が合わないときの、最初の誤りの欄と文。
 * @param result safeParse の結果
 * @returns 欄の名前と文（合えば undefined）
 */
function firstIssue(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const issue = result.error?.issues[0];
  return issue ? { path: issue.path.map(String).join("."), message: issue.message } : undefined;
}

describe("人を足す入力", () => {
  it("フルネームだけで足せる（前後の空白は除く）", () => {
    const result = NoteCreateInput.safeParse({
      clientRequestId: REQUEST_ID,
      fullName: " 田中 太郎 ",
    });
    expect(result.success && result.data).toEqual({
      clientRequestId: REQUEST_ID,
      fullName: "田中 太郎",
    });
  });

  it("フルネームが空なら誤り（日本語の文）", () => {
    const result = NoteCreateInput.safeParse({ clientRequestId: REQUEST_ID, fullName: "  " });
    expect(firstIssue(result)).toEqual({
      path: "fullName",
      message: "フルネームを入れてください。",
    });
  });

  it("欄の長さはコードポイントで数える（絵文字も1字）", () => {
    const emoji = "🍙".repeat(PERSON_NOTE_LIMITS.fullName);
    expect(
      NoteCreateInput.safeParse({ clientRequestId: REQUEST_ID, fullName: emoji }).success,
    ).toBe(true);
    const over = NoteCreateInput.safeParse({
      clientRequestId: REQUEST_ID,
      fullName: `${emoji}あ`,
    });
    expect(firstIssue(over)).toEqual({
      path: "fullName",
      message: "フルネームは100字までにしてください。",
    });
    const talk = NoteCreateInput.safeParse({
      clientRequestId: REQUEST_ID,
      fullName: "田中",
      talk: "あ".repeat(PERSON_NOTE_LIMITS.talk + 1),
    });
    expect(firstIssue(talk)).toEqual({
      path: "talk",
      message: "話したことは20,000字までにしてください。",
    });
  });

  it("全部の欄を受け取れる。知らない欄（電話番号など）は誤り", () => {
    const full = NoteCreateInput.safeParse({
      clientRequestId: REQUEST_ID,
      fullName: "田中 太郎",
      reading: "たなか たろう",
      lineName: "たろう🍙",
      appearance: "黒ぶちの眼鏡",
      accounts: { x: "@taro", url: "https://example.com" },
      tags: ["AI", "Go"],
      talk: "Go の話",
      nextTopic: "転職の話",
      meetingId: "0193a1b2-0000-7000-8000-000000000002",
    });
    expect(full.success).toBe(true);
    const phone = NoteCreateInput.safeParse({
      clientRequestId: REQUEST_ID,
      fullName: "田中",
      phone: "0312345678",
    });
    expect(phone.success).toBe(false);
  });

  it("そのほかの URL は http と https だけ", () => {
    for (const url of [
      "javascript:alert(1)",
      "tel:0312345678",
      "data:text/html,x",
      "example.com",
    ]) {
      const result = NoteCreateInput.safeParse({
        clientRequestId: REQUEST_ID,
        fullName: "田中",
        accounts: { url },
      });
      expect(firstIssue(result)).toEqual({
        path: "accounts.url",
        message: "http か https で始まる URL を入れてください。",
      });
    }
    const empty = NoteCreateInput.safeParse({
      clientRequestId: REQUEST_ID,
      fullName: "田中",
      accounts: { url: "" },
    });
    expect(empty.success).toBe(true);
  });

  it("タグは1つ30字まで。そろえて同じものは1つにまとめ、最初に入れた書き方を残す", () => {
    const result = NoteCreateInput.safeParse({
      clientRequestId: REQUEST_ID,
      fullName: "田中",
      tags: ["AI", " ai ", "ＡＩ", "Go"],
    });
    expect(result.success && result.data.tags).toEqual(["AI", "Go"]);
    const long = NoteCreateInput.safeParse({
      clientRequestId: REQUEST_ID,
      fullName: "田中",
      tags: ["あ".repeat(31)],
    });
    expect(firstIssue(long)).toEqual({ path: "tags.0", message: "タグは30字までにしてください。" });
    expect(uniqueTags(["b", "B", "a"])).toEqual(["b", "a"]);
  });
});

describe("直す入力", () => {
  it("もとの版が要る", () => {
    expect(NoteUpdateInput.safeParse({ fullName: "田中" }).success).toBe(false);
    expect(NoteUpdateInput.safeParse({ baseVersion: 0, fullName: "田中" }).success).toBe(false);
    expect(
      NoteUpdateInput.safeParse({ baseVersion: 2, fullName: "田中", nextTopic: "" }).success,
    ).toBe(true);
  });
});

describe("書き足す入力", () => {
  it("書き足しの ID と、1字以上の文が要る", () => {
    expect(NoteAppendInput.safeParse({ appendId: REQUEST_ID, text: "転職の話" }).success).toBe(
      true,
    );
    const empty = NoteAppendInput.safeParse({ appendId: REQUEST_ID, text: " " });
    expect(firstIssue(empty)).toEqual({
      path: "text",
      message: "書き足すことを入れてください。",
    });
    expect(NoteAppendInput.safeParse({ text: "転職の話" }).success).toBe(false);
  });
});

describe("探す入力", () => {
  it("言葉かタグのどちらかが要る。両方でもよい", () => {
    expect(NoteSearchInput.safeParse({ query: "たなか" }).success).toBe(true);
    expect(NoteSearchInput.safeParse({ tag: "AI" }).success).toBe(true);
    expect(NoteSearchInput.safeParse({ query: "たなか", tag: "AI" }).success).toBe(true);
    for (const body of [{}, { query: " " }, { query: "", tag: "" }]) {
      expect(firstIssue(NoteSearchInput.safeParse(body))).toEqual({
        path: "query",
        message: "探す言葉かタグを入れてください。",
      });
    }
  });

  it("言葉に改行は入れられない", () => {
    expect(NoteSearchInput.safeParse({ query: "たなか\nたろう" }).success).toBe(false);
  });
});

describe("会った場を作る入力", () => {
  it("名前と日付が要る", () => {
    expect(
      MeetingCreateInput.safeParse({ name: "11月の AI 勉強会", metOn: "2026-11-20" }).success,
    ).toBe(true);
    expect(firstIssue(MeetingCreateInput.safeParse({ name: " ", metOn: "2026-11-20" }))).toEqual({
      path: "name",
      message: "会った場の名前を入れてください。",
    });
    expect(firstIssue(MeetingCreateInput.safeParse({ name: "勉強会", metOn: "11/20" }))).toEqual({
      path: "metOn",
      message: "日付を選んでください。",
    });
  });

  it("そろえると長くなる字（NFKC で字が増える）が多く、そろえた名前が上限を超えるなら、名前の欄の誤り", () => {
    // U+FDFA は NFKC で18字になる。30字の名前は、そろえると540字
    const name = "\uFDFA".repeat(30);
    expect(firstIssue(MeetingCreateInput.safeParse({ name, metOn: "2026-11-20" }))).toEqual({
      path: "name",
      message: "会った場の名前に、そろえると長くなる字が多すぎます。短くしてください。",
    });
    // ㍿ は「株式会社」（4字）。100字の名前は、そろえるとちょうど400字で通る
    expect(
      MeetingCreateInput.safeParse({ name: "㍿".repeat(100), metOn: "2026-11-20" }).success,
    ).toBe(true);
  });
});
