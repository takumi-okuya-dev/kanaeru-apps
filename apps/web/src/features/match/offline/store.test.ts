// 端末の置き場所：前の版で置いた写しと送っていない変更（1試合の長さと試合の時間の設定）を、読むときに今の形に直す（match-009）。
import { INITIAL_CONTENT } from "@workspace/contracts/match";
import type { MatchTable, MatchTableContent } from "@workspace/contracts/match";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryStore, offlineStore, setOfflineStoreForTest } from "./store.ts";

/** 前の形の設定の中身（15分・12:30〜14:30・分けない）。 */
const legacyContent = {
  ...INITIAL_CONTENT,
  settings: {
    format: "doubles",
    grouping: "none",
    minutesPerGame: 15,
    startTime: "12:30",
    endTime: "14:30",
  },
} as unknown as MatchTableContent;

afterEach(() => setOfflineStoreForTest(undefined));

describe("端末に置いた前の形の中身", () => {
  it("試合表の写しと送っていない変更は、読むときに今の形の設定に直る", async () => {
    const memory = createMemoryStore();
    setOfflineStoreForTest(memory);
    await memory.writeSnapshot({
      tableId: "t1",
      table: { id: "t1", content: legacyContent } as unknown as MatchTable,
      savedAt: 0,
    });
    await memory.addChange({
      tableId: "t1",
      changeId: "c1",
      baseVersion: 1,
      content: legacyContent,
      seed: 1,
      createdAt: 0,
    });
    const store = await offlineStore();
    const expected = {
      format: "doubles",
      gameCount: 8,
      levels: null,
      ungrouped: true,
      courts: null,
    };
    expect((await store.readSnapshot("t1"))?.table.content.settings).toEqual(expected);
    expect((await store.listChanges("t1"))[0]?.content.settings).toEqual(expected);
  });
});
