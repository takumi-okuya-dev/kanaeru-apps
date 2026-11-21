// 送っていない変更の列（AD-28。match-005）：もとにした版のつなぎ方・古い順に送る・電波がないときは残す・送り直しは同じ変更の ID・
// 409 は止めて残す・捨てる・上書き・置き場所から読み直す。
import { INITIAL_CONTENT } from "@workspace/contracts/match";
import type {
  MatchTable,
  MatchTableContent,
  MatchTableUpdateInput,
} from "@workspace/contracts/match";
import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../../../lib/api.ts";
import { Outbox, classifySendError } from "./outbox.ts";
import type { OutboxState } from "./outbox.ts";
import { createMemoryStore } from "./store.ts";
import type { OfflineStore, OutboxEntry } from "./store.ts";

/**
 * API の誤りを作る。
 * @param status 状態の番号
 * @param code code
 * @param message 文
 * @returns 誤り
 */
function apiError(status: number, code: string, message: string): ApiError {
  return new ApiError(status, { code, message, requestId: "r" });
}

/** 試合表の ID。 */
const TABLE_ID = "0193a1b2-0000-7000-8000-000000000001";

/**
 * 呼び名を1人足した中身（変更の見分けに使う）。
 * @param name 呼び名
 * @returns 中身
 */
function contentWith(name: string): MatchTableContent {
  return {
    ...INITIAL_CONTENT,
    players: [{ id: "p1", nickname: name, level: "advanced", status: "present" }],
  };
}

/**
 * 偽のサーバー（版・最後の変更の ID・届いた送り。AD-28 の受け方をまねる）。
 * @param version 始めの版
 * @returns サーバー
 */
function fakeServer(version: number) {
  const server = {
    version,
    lastChangeId: undefined as string | undefined,
    editor: "d-me",
    received: [] as { changeId: string; baseVersion: number; nickname: string | undefined }[],
    /** 次の送りで投げる誤り */
    failNext: [] as unknown[],
    send(entry: OutboxEntry): Promise<MatchTable> {
      const failure = server.failNext.shift();
      if (failure) return Promise.reject(failure instanceof Error ? failure : new Error("失敗"));
      const input: Pick<MatchTableUpdateInput, "changeId" | "baseVersion"> = entry;
      server.received.push({
        changeId: input.changeId,
        baseVersion: input.baseVersion,
        nickname: entry.content.players[0]?.nickname,
      });
      if (input.changeId === server.lastChangeId) return Promise.resolve(tableOf(server.version));
      if (input.baseVersion !== server.version) {
        return Promise.reject(apiError(409, "MATCH_VERSION_CONFLICT", "ほかの端末で直されました"));
      }
      server.version += 1;
      server.lastChangeId = input.changeId;
      return Promise.resolve(tableOf(server.version));
    },
  };
  return server;
}

/**
 * 答えの試合表（版だけ見る）。
 * @param version 版
 * @returns 試合表
 */
function tableOf(version: number): MatchTable {
  return { version } as MatchTable;
}

/**
 * 列を作る（変更の ID は c1, c2…・時刻は決まった値）。
 * @param options 置き場所・サーバー・つながっているか
 * @param options.store 置き場所
 * @param options.server サーバー
 * @param options.online つながっているか
 * @returns 列と、知らせた状態
 */
function makeOutbox(options: {
  store: OfflineStore;
  server: ReturnType<typeof fakeServer>;
  online: { value: boolean };
}) {
  let id = 0;
  const states: OutboxState[] = [];
  const outbox = new Outbox({
    tableId: TABLE_ID,
    store: options.store,
    send: (entry) => options.server.send(entry),
    isOnline: () => options.online.value,
    onChange: (state) => states.push(state),
    now: () => Date.UTC(2026, 11, 13, 4, 2),
    newChangeId: () => `c${++id}`,
    retryMs: 0,
  });
  return { outbox, states };
}

describe("Outbox", () => {
  it("もとにした版は前の変更の版＋1でつなぎ、古い順に送る", async () => {
    const store = createMemoryStore();
    const server = fakeServer(5);
    const online = { value: false };
    const { outbox } = makeOutbox({ store, server, online });
    outbox.observe(5);
    await outbox.enqueue({ content: contentWith("一"), seed: 1 }, 5);
    await outbox.enqueue({ content: contentWith("二"), seed: 1 }, 5);
    await outbox.enqueue({ content: contentWith("三"), seed: 1 }, 5);
    await outbox.flush();
    expect(outbox.state()).toMatchObject({ status: "waiting", reason: "offline", count: 3 });
    expect((await store.listChanges(TABLE_ID)).map((entry) => entry.baseVersion)).toEqual([
      5, 6, 7,
    ]);
    expect(outbox.expectedVersion()).toBe(8);
    expect(server.received).toEqual([]);

    online.value = true;
    await outbox.flush();
    expect(server.received.map((entry) => entry.nickname)).toEqual(["一", "二", "三"]);
    expect(server.version).toBe(8);
    expect(outbox.state()).toEqual({ status: "idle" });
    expect(await store.listChanges(TABLE_ID)).toEqual([]);
  });

  it("通信の誤りで送れなければ残し、送り直しは同じ変更の ID（届いていたら二重にしない）", async () => {
    const store = createMemoryStore();
    const server = fakeServer(1);
    const online = { value: true };
    const { outbox } = makeOutbox({ store, server, online });
    outbox.observe(1);
    // 1回目は届いたが答えが返らなかった形：サーバーは受けてから、通信の誤りにする
    const realSend = server.send.bind(server);
    let lost = true;
    server.send = async (entry) => {
      const saved = await realSend(entry);
      if (lost) {
        lost = false;
        throw new NetworkError(new TypeError("Failed to fetch"));
      }
      return saved;
    };
    await outbox.enqueue({ content: contentWith("一"), seed: 1 }, 1);
    await outbox.settled();
    expect(outbox.state()).toMatchObject({ status: "waiting", reason: "offline", count: 1 });
    expect(await store.listChanges(TABLE_ID)).toHaveLength(1);
    await outbox.flush();
    expect(server.received.map((entry) => entry.changeId)).toEqual(["c1", "c1"]);
    expect(server.version).toBe(2);
    expect(outbox.state()).toEqual({ status: "idle" });
  });

  it("サーバーが一時的に答えない（5xx）ときは残して待つ", async () => {
    const store = createMemoryStore();
    const server = fakeServer(1);
    const { outbox } = makeOutbox({ store, server, online: { value: true } });
    server.failNext.push(apiError(503, "DB_UNAVAILABLE", "止まっています"));
    await outbox.enqueue({ content: contentWith("一"), seed: 1 }, 1);
    await outbox.settled();
    expect(outbox.state()).toMatchObject({ status: "waiting", reason: "server", count: 1 });
    await outbox.flush();
    expect(outbox.state()).toEqual({ status: "idle" });
  });

  it("409（ほかの端末で直された）は送りを止め、変更を端末に残して知らせる。捨てると空になる", async () => {
    const store = createMemoryStore();
    const server = fakeServer(3);
    const online = { value: false };
    const { outbox, states } = makeOutbox({ store, server, online });
    outbox.observe(3);
    await outbox.enqueue({ content: contentWith("一"), seed: 1 }, 3);
    await outbox.enqueue({ content: contentWith("二"), seed: 1 }, 3);
    // 電波がない間に、ほかの端末がサーバーの版を進めた
    server.version = 4;
    online.value = true;
    await outbox.flush();
    expect(outbox.state()).toMatchObject({
      status: "held",
      reason: "conflict",
      count: 2,
      message: "ほかの端末で直されました",
    });
    expect(states.some((state) => state.status === "held")).toBe(true);
    expect(await store.listChanges(TABLE_ID)).toHaveLength(2);
    // 止めている間は送らない
    await outbox.flush();
    expect(server.received).toHaveLength(1);
    await outbox.discard();
    expect(outbox.state()).toEqual({ status: "idle" });
    expect(await store.listChanges(TABLE_ID)).toEqual([]);
  });

  it("担当が替わった（MATCH_NOT_EDITOR）も止めて残す。上書きを選ぶと、最後の中身をサーバーの今の版の上に1つで送る", async () => {
    const store = createMemoryStore();
    const server = fakeServer(2);
    const { outbox } = makeOutbox({ store, server, online: { value: true } });
    server.failNext.push(apiError(409, "MATCH_NOT_EDITOR", "担当の端末でない"));
    outbox.observe(2);
    await outbox.enqueue({ content: contentWith("一"), seed: 1 }, 2);
    await outbox.settled();
    expect(outbox.state()).toMatchObject({ status: "held", reason: "not-editor", count: 1 });
    await outbox.enqueue({ content: contentWith("二"), seed: 9 }, 2);
    expect(outbox.count()).toBe(2);
    server.version = 7;
    await outbox.overwrite(7);
    expect(server.received.at(-1)).toMatchObject({ baseVersion: 7, nickname: "二" });
    expect(server.version).toBe(8);
    expect(outbox.state()).toEqual({ status: "idle" });
    expect(await store.listChanges(TABLE_ID)).toEqual([]);
  });

  it("401 は残してログインを待つ。400 などの直せない誤りは止めて残す", async () => {
    const store = createMemoryStore();
    const server = fakeServer(1);
    const { outbox } = makeOutbox({ store, server, online: { value: true } });
    server.failNext.push(apiError(401, "UNAUTHENTICATED", "ログイン"));
    await outbox.enqueue({ content: contentWith("一"), seed: 1 }, 1);
    await outbox.settled();
    expect(outbox.state()).toMatchObject({ status: "unauthenticated", count: 1 });
    server.failNext.push(apiError(400, "INVALID_INPUT", "形が合いません"));
    await outbox.flush();
    expect(outbox.state()).toMatchObject({ status: "held", reason: "rejected", count: 1 });
  });

  it("画面を開き直しても、置き場所の変更を読んで同じ順に送る", async () => {
    const store = createMemoryStore();
    const server = fakeServer(10);
    const first = makeOutbox({ store, server, online: { value: false } });
    first.outbox.observe(10);
    await first.outbox.enqueue({ content: contentWith("一"), seed: 1 }, 10);
    await first.outbox.enqueue({ content: contentWith("二"), seed: 1 }, 10);
    first.outbox.stop();

    const second = makeOutbox({ store, server, online: { value: true } });
    await second.outbox.loaded();
    expect(second.outbox.state()).toMatchObject({ status: "waiting", count: 2 });
    expect(second.outbox.latest()?.content.players[0]?.nickname).toBe("二");
    await second.outbox.flush();
    expect(server.received.map((entry) => [entry.baseVersion, entry.nickname])).toEqual([
      [10, "一"],
      [11, "二"],
    ]);
    expect(second.outbox.state()).toEqual({ status: "idle" });
  });
});

describe("classifySendError", () => {
  it("誤りを分ける", () => {
    expect(classifySendError(new NetworkError(new TypeError("x")))).toBe("network");
    expect(classifySendError(apiError(409, "MATCH_VERSION_CONFLICT", ""))).toBe("conflict");
    expect(classifySendError(apiError(409, "MATCH_NOT_EDITOR", ""))).toBe("not-editor");
    expect(classifySendError(apiError(401, "UNAUTHENTICATED", ""))).toBe("unauthenticated");
    expect(classifySendError(apiError(503, "DB_UNAVAILABLE", ""))).toBe("server");
    expect(classifySendError(apiError(429, "RATE_LIMITED", ""))).toBe("server");
    expect(classifySendError(apiError(404, "MATCH_NOT_FOUND", ""))).toBe("rejected");
  });
});
