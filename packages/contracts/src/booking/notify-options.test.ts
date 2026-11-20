// 予約の知らせの選択肢：code と言葉がそろう・送り方の既定（最初）は off。
import { describe, expect, it } from "vitest";
import {
  NOTICE_KINDS,
  NOTICE_KIND_LABELS,
  NOTICE_METHODS,
  NOTICE_METHOD_LABELS,
  NOTICE_RESULTS,
  NOTICE_RESULT_LABELS,
  NOTIFY_MODES,
  NOTIFY_MODE_LABELS,
} from "./index.ts";

describe("予約の知らせの選択肢", () => {
  it("どの code にも言葉がある（並びと言葉の鍵がそろう）", () => {
    expect(Object.keys(NOTIFY_MODE_LABELS)).toEqual([...NOTIFY_MODES]);
    expect(Object.keys(NOTICE_KIND_LABELS)).toEqual([...NOTICE_KINDS]);
    expect(Object.keys(NOTICE_METHOD_LABELS)).toEqual([...NOTICE_METHODS]);
    expect(Object.keys(NOTICE_RESULT_LABELS)).toEqual([...NOTICE_RESULTS]);
  });

  it("送り方の最初は off（本番の既定。AD-24）", () => {
    expect(NOTIFY_MODES[0]).toBe("off");
  });

  it("知らせの種類は、PRD の6つと確かめのメッセージ", () => {
    expect(NOTICE_KINDS.filter((kind) => kind !== "test")).toHaveLength(6);
  });
});
