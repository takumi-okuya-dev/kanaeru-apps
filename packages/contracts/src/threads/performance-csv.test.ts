// 反応の CSV の列と値の形（threads-012。めぐるの packages/shared/src/csv.ts と同じ形か）。
import { describe, expect, it } from "vitest";
import {
  POST_CSV_HEADER,
  SNAPSHOT_CSV_HEADER,
  formatJstIso,
  postCsvCells,
  snapshotCsvCells,
} from "./performance-csv.ts";
import type { PostCsvRow } from "./performance-csv.ts";

/** 「投稿ごと」の見本の行。 */
const ROW: PostCsvRow = {
  id: "0190a000-0000-7000-8000-000000000001",
  publishedAt: new Date("2026-09-25T10:01:00Z"),
  body: "朝の投稿😀",
  metrics: { views: 1200, likes: 30, replies: 2, reposts: 1, quotes: null, shares: 0 },
  ratio: 2.34567,
  state: "confirmed",
  judgment: "good",
  permalink: "https://www.threads.com/@a/post/1",
  lastFetchedAt: new Date("2026-10-02T10:00:00Z"),
  lastElapsedMinutes: 10_079,
  followersAtPost: 321,
  h24: null,
  batchId: "0190a000-0000-7000-8000-000000000002",
  batchPosition: 2,
  batchCreatedAt: new Date("2026-09-24T00:00:00Z"),
  approvedAt: new Date("2026-09-24T01:00:00Z"),
  prioritized: true,
  carryover: null,
  bodyEdited: false,
  slotMinute: 1170,
  strategyUpdatedAt: null,
  promotionsChangedAt: new Date("2026-09-01T15:00:00Z"),
  researchChangedAt: null,
  coreRulesChangedAt: null,
};

describe("反応の CSV", () => {
  it("列はめぐると同じ（投稿ごと37列・取りこみごと13列）", () => {
    expect(POST_CSV_HEADER).toHaveLength(37);
    expect(SNAPSHOT_CSV_HEADER).toHaveLength(13);
    expect(POST_CSV_HEADER.slice(0, 6)).toEqual([
      "投稿ID",
      "投稿した日時",
      "曜日",
      "時",
      "本文",
      "文字数",
    ]);
    expect(POST_CSV_HEADER.at(-1)).toBe("バッチ登録時の投稿ルールの最終更新日時");
  });

  it("日時は日本時間の時差つき、ないときは空", () => {
    expect(formatJstIso(new Date("2026-09-25T15:30:05Z"))).toBe("2026-09-26T00:30:05+09:00");
    expect(formatJstIso(null)).toBe("");
  });

  it("投稿ごとの1行（曜日・時・文字数・倍率は小数3桁・経過は時間・順番は1から・時刻の枠）", () => {
    const cells = postCsvCells(ROW);
    expect(cells).toHaveLength(37);
    expect(cells.slice(1, 6)).toEqual(["2026-09-25T19:01:00+09:00", "金", "19", ROW.body, "5"]);
    expect(cells.slice(6, 12)).toEqual(["1200", "30", "2", "1", "", "0"]);
    expect(cells[12]).toBe("2.346");
    expect(cells[13]).toBe("好調");
    expect(cells[16]).toBe("167");
    expect(cells[17]).toBe("確定");
    expect(cells.slice(19, 25)).toEqual(["", "", "", "", "", ""]);
    expect(cells[26]).toBe("3");
    expect(cells.slice(29, 33)).toEqual(["はい", "", "いいえ", "19:30"]);
    expect(cells[34]).toBe("2026-09-02T00:00:00+09:00");
  });

  it("判定の欄：確定待ち・計測できません・判定なし", () => {
    expect(postCsvCells({ ...ROW, state: "updating", judgment: null })[13]).toBe("確定待ち");
    expect(postCsvCells({ ...ROW, state: "pending", judgment: null })[13]).toBe("確定待ち");
    expect(postCsvCells({ ...ROW, state: "unmeasurable", judgment: null })[13]).toBe(
      "計測できません",
    );
    expect(postCsvCells({ ...ROW, judgment: null, ratio: null })[13]).toBe("判定なし");
  });

  it("取りこみごとの1行（種類・取り方・経過は時間）", () => {
    const cells = snapshotCsvCells({
      id: ROW.id,
      publishedAt: ROW.publishedAt,
      fetchedAt: new Date("2026-09-26T10:30:00Z"),
      elapsedMinutes: 1469,
      kind: "h24",
      method: "daily",
      metrics: { views: 10, likes: 1, replies: 0, reposts: 0, quotes: 0, shares: 0 },
      followersOnDay: null,
    });
    expect(cells).toHaveLength(13);
    expect(cells.slice(3, 6)).toEqual(["24", "24時間時点", "毎日の処理"]);
    expect(cells[12]).toBe("");
  });
});
