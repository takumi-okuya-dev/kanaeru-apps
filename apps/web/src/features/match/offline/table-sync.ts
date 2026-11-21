// 試合表ごとの、端末の中身と送りの列（AD-28。match-005）。問い合わせ（queries.ts）と直す道具（table-editor.ts）が共に使う。
// - 読む：サーバーから読めたら、送っていない変更があればその中身を重ねて出し（送りを始める）、端末に置く。
//   電波がない・届かない・サーバーが答えない（5xx）ときは、端末に置いた最後の中身を出す（ネットなしで開く。AD-27）
// - 試合表が消された・開けなくなった（403・404）ときは、端末の中身と変更を消す
// - 送りの列は Outbox（送っていない変更を IndexedDB に持ち、古い順に送る）
import type { MatchTable } from "@workspace/contracts/match";
import { ApiError, NetworkError } from "../../../lib/api.ts";
import { fetchTable, saveTable } from "../api.ts";
import { deviceId } from "../device.ts";
import { Outbox } from "./outbox.ts";
import type { OutboxState } from "./outbox.ts";
import { deferredStore, offlineStore } from "./store.ts";

/** 試合表ごとの端末の中身と送りの列。 */
export type TableSync = {
  /** 送りの列 */
  outbox: Outbox;
  /** 送りの列の状態 */
  state: OutboxState;
  /** 端末に置いた中身を出しているなら、その置いた時刻（ミリ秒。サーバーから読めたら undefined） */
  deviceCopyAt: number | undefined;
  /** 変わり目を知らせる相手 */
  listeners: Set<() => void>;
  /** サーバーが受けた試合表を受け取る相手（送り終えたとき。問い合わせの入れ物に入れる） */
  onSent: ((table: MatchTable, remaining: number) => void) | undefined;
  /** 送りを止めた（held）ときに呼ぶ相手（サーバーの中身を読み直す） */
  onHeld: (() => void) | undefined;
};

/** 試合表ごとの端末の中身と送りの列。 */
const syncs = new Map<string, TableSync>();

/**
 * 変わり目を知らせる。
 * @param sync 試合表の端末の中身と送りの列
 */
function notify(sync: TableSync): void {
  for (const listener of sync.listeners) listener();
}

/**
 * 試合表の端末の中身と送りの列（なければ作る。送っていない変更を置き場所から読み始める）。
 * @param tableId 試合表の ID
 * @returns 端末の中身と送りの列
 */
export function tableSync(tableId: string): TableSync {
  let sync = syncs.get(tableId);
  if (sync) return sync;
  const created: TableSync = {
    outbox: undefined as unknown as Outbox,
    state: { status: "idle" },
    deviceCopyAt: undefined,
    listeners: new Set(),
    onSent: undefined,
    onHeld: undefined,
  };
  created.outbox = new Outbox({
    tableId,
    store: deferredStore(),
    send: (entry) =>
      saveTable(tableId, {
        deviceId: deviceId(),
        baseVersion: entry.baseVersion,
        changeId: entry.changeId,
        seed: entry.seed,
        content: entry.content,
      }),
    isOnline: () => typeof navigator === "undefined" || navigator.onLine,
    onSent: (table, remaining) => {
      // 送れた＝サーバーに届いた。端末の中身を出している印を外す
      if (created.deviceCopyAt !== undefined) {
        created.deviceCopyAt = undefined;
        notify(created);
      }
      created.onSent?.(table, remaining);
    },
    onChange: (state) => {
      const wasHeld = created.state.status === "held";
      created.state = state;
      notify(created);
      if (state.status === "held" && !wasHeld) created.onHeld?.();
    },
  });
  syncs.set(tableId, created);
  sync = created;
  return sync;
}

/**
 * 直した直後に「送っている」を出す（送りの列が置き場所に足し終える前に、画面をその場で描き直すため。
 * 直した中身は問い合わせの入れ物に入っているので、この描き直しで画面に出る）。
 * @param sync 試合表の端末の中身と送りの列
 */
export function markSending(sync: TableSync): void {
  sync.state = { status: "sending", count: sync.outbox.count() + 1 };
  notify(sync);
}

/**
 * 端末に試合表の最後の中身を置く（置けなくても止めない）。
 * @param table 試合表（content は直したものを含む）
 */
export function rememberTable(table: MatchTable): void {
  void offlineStore()
    .then((store) => store.writeSnapshot({ tableId: table.id, table, savedAt: Date.now() }))
    .catch(() => undefined);
}

/**
 * 端末の中身に切りかえるか（電波がない・届かない・サーバーが一時的に答えない）。
 * @param error 読みの誤り
 * @returns 切りかえるなら true
 */
function fallsBackToDevice(error: unknown): boolean {
  return error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
}

/**
 * 試合表を読む（問い合わせの queryFn）。読めたら送っていない変更を重ねて端末に置き、読めなければ端末の中身を出す。
 * @param tableId 試合表の ID
 * @returns 試合表（content は送っていない変更を含む。version は最後にサーバーが受けた版）
 * @throws {Error} 読めず、端末にも中身がないとき（もとの誤り）
 */
export async function loadTable(tableId: string): Promise<MatchTable> {
  const sync = tableSync(tableId);
  try {
    const server = await fetchTable(tableId);
    await sync.outbox.loaded();
    sync.outbox.observe(server.version);
    const latest = sync.outbox.isHeld() ? undefined : sync.outbox.latest();
    const table = latest ? { ...server, content: latest.content, seed: latest.seed } : server;
    sync.deviceCopyAt = undefined;
    notify(sync);
    rememberTable(table);
    if (latest) void sync.outbox.flush();
    return table;
  } catch (caught) {
    if (caught instanceof ApiError && (caught.status === 403 || caught.status === 404)) {
      void offlineStore()
        .then((store) => store.removeTable(tableId))
        .catch(() => undefined);
    }
    if (!fallsBackToDevice(caught)) throw caught;
    const snapshot = await (await offlineStore()).readSnapshot(tableId).catch(() => undefined);
    if (!snapshot) throw caught;
    await sync.outbox.loaded();
    const latest = sync.outbox.latest();
    sync.deviceCopyAt = latest?.createdAt ?? snapshot.savedAt;
    notify(sync);
    return latest
      ? { ...snapshot.table, content: latest.content, seed: latest.seed }
      : snapshot.table;
  }
}
