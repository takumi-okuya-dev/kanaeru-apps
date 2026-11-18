// メモの入力の形：誤りの文が、欄のそばに出せる日本語になっていること。
import { describe, expect, it } from "vitest";
import { NOTE_BODY_MAX, NOTE_TITLE_MAX, NoteInput } from "./note.ts";

/**
 * 入力を確かめ、欄ごとの誤りの文を返す。
 * @param input 入力
 * @returns 欄の名前と文
 */
function messages(input: unknown): Record<string, string> {
  const result = NoteInput.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

describe("メモの入力", () => {
  it("前後の空白を除き、本文がなければ空にする", () => {
    expect(NoteInput.parse({ title: "  買い物  " })).toEqual({ title: "買い物", body: "" });
  });

  it("題がない・空白だけなら「題を入れてください。」", () => {
    expect(messages({})).toEqual({ title: "題を入れてください。" });
    expect(messages({ title: "   " })).toEqual({ title: "題を入れてください。" });
  });

  it("長すぎる題と本文は、上限の文字数を出す", () => {
    expect(
      messages({ title: "あ".repeat(NOTE_TITLE_MAX + 1), body: "い".repeat(NOTE_BODY_MAX + 1) }),
    ).toEqual({
      title: `題は${NOTE_TITLE_MAX}文字までにしてください。`,
      body: `本文は${NOTE_BODY_MAX}文字までにしてください。`,
    });
  });

  it("知らない欄は受け取らない", () => {
    expect(NoteInput.safeParse({ title: "買い物", owner: "x" }).success).toBe(false);
  });
});
