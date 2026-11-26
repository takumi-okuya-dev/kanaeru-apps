// 見るだけのページで、電波なしで渡された QR を取り込むかの決め方（AD-28・match-005 R8・R9）：
// - サーバーの最後の保存と同じ分に作った、新しい版の QR を落とさない（QR の時刻は分に丸めてある）
// - 取り込んだと出すのは、取り込んだ表が画面に出るときだけ
// - 担当の端末が電波なしで直すたびに、渡す版（送り終えたあとにサーバーが持つ版）が上がり、最後に同期した版を持つ見る端末が
//   続けて取り込める
import { INITIAL_CONTENT } from "@workspace/contracts/match";
import type { MatchTable, MatchView } from "@workspace/contracts/match";
import { describe, expect, it } from "vitest";
import { handoffOfTable, viewFromHandoff } from "./handoff.ts";
import type { HandoffTable } from "./handoff.ts";
import { Outbox } from "./offline/outbox.ts";
import { createMemoryStore } from "./offline/store.ts";
import { decideHandoffImport, isHandoffNewer, newerView } from "./view-import.ts";

/** 見るだけの札の印。 */
const HINT = "0a1b2c3d";
/** 見られる期限。 */
const EXPIRES_AT = "2026-12-13T14:59:59.999Z";

/**
 * 時刻（2026-12-13 の日本時間 13時台）。
 * @param minute 分
 * @param second 秒
 * @param ms ミリ秒
 * @returns ミリ秒
 */
function at(minute: number, second = 0, ms = 0): number {
  return Date.UTC(2026, 11, 13, 4, minute, second, ms);
}

/**
 * 試合表（運営の端末が持つ形。版と中身は呼ぶ側が決める）。
 * @param version 版
 * @param nickname 1つ目の試合に入る人の呼び名（中身の見分け）
 * @returns 試合表
 */
function tableOf(version: number, nickname: string): MatchTable {
  const players = [nickname, "伊藤", "渡辺", "山本"].map((name, index) => ({
    id: `p${index}`,
    nickname: name,
    level: "advanced" as const,
    status: "present" as const,
  }));
  return {
    id: "0193a1b2-0000-7000-8000-000000000001",
    name: "12/13(日) 練習会",
    playDate: "2026-12-13",
    version,
    links: { viewHint: HINT },
    content: {
      ...INITIAL_CONTENT,
      players,
      plan: [
        { key: "advanced", offset: 0, games: [{ players: players.map((p) => p.id), done: false }] },
      ],
    },
  } as unknown as MatchTable;
}

/**
 * サーバーから読んだ表（見るだけの窓口の形）。
 * @param version 版
 * @param savedAt サーバーの最後の保存（ミリ秒。丸めない）
 * @returns 表
 */
function serverView(version: number, savedAt: number): MatchView {
  return {
    name: "12/13(日) 練習会",
    playDate: "2026-12-13",
    version,
    groups: [],
    updatedAt: new Date(savedAt).toISOString(),
    expiresAt: EXPIRES_AT,
  };
}

/**
 * 運営の端末が出す QR の中身。
 * @param version 渡す版
 * @param madeAt 作った時刻（ミリ秒）
 * @returns 渡す試合表
 */
function handoff(version: number, madeAt: number): HandoffTable {
  return handoffOfTable(tableOf(version, "高橋"), version, madeAt);
}

/**
 * 取り込むかを決める（札の印と期限は決まったもの）。
 * @param table 渡された試合表
 * @param current 今出している表
 * @param server サーバーから読んだ表
 * @param now 今の時刻
 * @returns 決めた結果
 */
function decide(
  table: HandoffTable,
  current: MatchView | undefined,
  server: MatchView | undefined,
  now: number,
) {
  return decideHandoffImport(table, { hint: HINT, current, server, now, expiresAt: EXPIRES_AT });
}

describe("isHandoffNewer", () => {
  it("サーバーの最後の保存と同じ分に作った、新しい版の QR は先に出す（QR の時刻は分に丸めてある）", () => {
    const server = serverView(5, at(5, 30, 123));
    const qr = viewFromHandoff(handoff(6, at(5, 55)), EXPIRES_AT);
    expect(qr.updatedAt).toBe(new Date(at(5)).toISOString());
    expect(isHandoffNewer(qr, server)).toBe(true);
  });

  it("サーバーの最後の保存より前の分に作った QR・版が大きくない QR は先に出さない", () => {
    const server = serverView(5, at(5, 30));
    expect(isHandoffNewer(viewFromHandoff(handoff(9, at(4, 59)), EXPIRES_AT), server)).toBe(false);
    expect(isHandoffNewer(viewFromHandoff(handoff(5, at(6)), EXPIRES_AT), server)).toBe(false);
    expect(isHandoffNewer(viewFromHandoff(handoff(4, at(6)), EXPIRES_AT), server)).toBe(false);
  });
});

describe("decideHandoffImport", () => {
  it("同じ分にサーバーで保存した直後の、新しい版の QR を取り込み、取り込んだ表が画面に出る", () => {
    const server = serverView(5, at(5, 30, 123));
    const fromServer = { view: server, readAt: at(5, 40) };
    const decision = decide(handoff(6, at(5, 55)), server, server, at(6));
    expect(decision).toMatchObject({ kind: "import", text: "版 6 の表を取り込みました。" });
    if (decision.kind !== "import") return;
    const shown = newerView(fromServer, { view: decision.view, readAt: at(6), source: "qr" });
    expect(shown?.view.version).toBe(6);
  });

  it("QR を作ったあとにサーバーで保存されていれば、取り込んだとは出さない（サーバーの表を出したまま）", () => {
    const server = serverView(5, at(7, 10));
    const decision = decide(handoff(6, at(5, 55)), server, server, at(8));
    expect(decision.kind).toBe("reject");
    expect(decision.text).toContain("サーバーで試合表が保存されています");
  });

  it("同じ版・古い版・別の試合表・先の時刻の QR は取り込まない", () => {
    const server = serverView(5, at(5));
    expect(decide(handoff(5, at(6)), server, server, at(7)).text).toBe(
      "もう同じ版（版 5）の表が入っています。",
    );
    expect(decide(handoff(4, at(6)), server, server, at(7)).text).toContain(
      "この端末の表のほうが新しい",
    );
    expect(decide({ ...handoff(6, at(6)), hint: "ffffffff" }, server, server, at(7))).toMatchObject(
      { kind: "reject", tone: "danger" },
    );
    expect(decide(handoff(6, at(20)), server, server, at(7))).toMatchObject({
      kind: "reject",
      tone: "danger",
    });
  });

  it("サーバーから読めていない（電波なしで開いた）ときは、今出している表より新しい版なら取り込む", () => {
    expect(decide(handoff(6, at(6)), undefined, undefined, at(7)).kind).toBe("import");
    const saved = serverView(5, at(5));
    expect(decide(handoff(6, at(6)), saved, undefined, at(7)).kind).toBe("import");
  });
});

describe("電波なしで直すたびに渡す版が上がる（AD-28。サーバーの版は送るまで上がらない）", () => {
  it("最後に同期した版を持つ見る端末が、電波なしの変更の QR を続けて取り込める", async () => {
    const outbox = new Outbox({
      tableId: "0193a1b2-0000-7000-8000-000000000001",
      store: createMemoryStore(),
      send: () => Promise.reject(new Error("送らない")),
      isOnline: () => false,
      onChange: () => {},
      now: () => at(10),
      newChangeId: (() => {
        let id = 0;
        return () => `c${++id}`;
      })(),
      retryMs: 0,
    });
    // 見る端末は、版 5（13:05 に保存）をサーバーから読んだあと、電波がなくなった
    const server = serverView(5, at(5, 30));
    outbox.observe(5);
    let current: MatchView = server;

    // 担当の端末が電波なしで2回直して QR を出す → 渡す版は 7（サーバーはまだ 5）
    await outbox.enqueue({ content: tableOf(5, "一").content, seed: 1 }, 5);
    await outbox.enqueue({ content: tableOf(5, "二").content, seed: 1 }, 5);
    expect(outbox.expectedVersion()).toBe(7);
    const first = decide(handoff(outbox.expectedVersion() ?? 0, at(10)), current, server, at(10));
    expect(first.kind).toBe("import");
    if (first.kind !== "import") return;
    current = first.view;

    // もう1回直す → 渡す版は 8。前に取り込んだ版 7 より新しいので取り込める
    await outbox.enqueue({ content: tableOf(5, "三").content, seed: 1 }, 5);
    const second = decide(handoff(outbox.expectedVersion() ?? 0, at(12)), current, server, at(12));
    expect(second).toMatchObject({ kind: "import", text: "版 8 の表を取り込みました。" });
  });
});
