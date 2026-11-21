// 担当の端末の中の置き場所（IndexedDB。AD-28：中身と送っていない変更を端末に持ち、つながったら古い順に送る。match-005）。
// - tables：試合表ごとの最後の中身（直したものを含む）と、最後にサーバーが受けた版・置いた時刻
// - changes：送っていない変更（変更の ID・もとにした版・中身・くじの種・作った時刻）。足した順の番号（seq）で古い順に読む
// - meta：端末の ID・試合表の一覧など、小さな値
// IndexedDB を開けない（古いブラウザ・プライベートブラウズの一部）ときは、画面を開いている間だけの置き場所（memory）にする。
// 置くのはこの端末の運営が開いた試合表だけ（呼び名とレベル。氏名は持たない。Constitution II）。
import type { MatchTable, MatchTableContent } from "@workspace/contracts/match";

/** 送っていない変更（1つの変更は中身のまるごと。AD-28）。 */
export type OutboxEntry = {
  /** 足した順の番号（置き場所が決める） */
  seq?: number;
  /** 試合表の ID */
  tableId: string;
  /** 変更の ID（送り直しても同じ ID。サーバーは二重にしない） */
  changeId: string;
  /** もとにした版の番号 */
  baseVersion: number;
  /** 直した中身 */
  content: MatchTableContent;
  /** くじの種 */
  seed: number;
  /** 作った時刻（ミリ秒） */
  createdAt: number;
};

/** 試合表の最後の中身（端末に置く）。 */
export type TableSnapshot = {
  /** 試合表の ID */
  tableId: string;
  /** 試合表（content は直したものを含む。version は最後にサーバーが受けた版） */
  table: MatchTable;
  /** 置いた時刻（ミリ秒） */
  savedAt: number;
};

/** 端末の置き場所。 */
export type OfflineStore = {
  /** IndexedDB に置けているか（false なら画面を開いている間だけ） */
  readonly durable: boolean;
  /**
   * 試合表の最後の中身を読む。
   * @param tableId 試合表の ID
   * @returns 中身（なければ undefined）
   */
  readSnapshot(tableId: string): Promise<TableSnapshot | undefined>;
  /**
   * 試合表の最後の中身を置く。
   * @param snapshot 中身
   */
  writeSnapshot(snapshot: TableSnapshot): Promise<void>;
  /**
   * 試合表の中身と送っていない変更をみな消す（試合表が消された・開けなくなったとき）。
   * @param tableId 試合表の ID
   */
  removeTable(tableId: string): Promise<void>;
  /**
   * 送っていない変更を古い順に読む。
   * @param tableId 試合表の ID
   * @returns 変更（seq つき）
   */
  listChanges(tableId: string): Promise<OutboxEntry[]>;
  /**
   * 送っていない変更を足す。
   * @param entry 変更
   * @returns 足した順の番号
   */
  addChange(entry: OutboxEntry): Promise<number>;
  /**
   * 送れた変更を消す。
   * @param seq 足した順の番号
   */
  removeChange(seq: number): Promise<void>;
  /**
   * 試合表の送っていない変更をみな消す。
   * @param tableId 試合表の ID
   */
  clearChanges(tableId: string): Promise<void>;
  /**
   * 小さな値を読む。
   * @param key 鍵
   * @returns 値（なければ undefined）
   */
  readMeta<T>(key: string): Promise<T | undefined>;
  /**
   * 小さな値を置く。
   * @param key 鍵
   * @param value 値
   */
  writeMeta(key: string, value: unknown): Promise<void>;
};

/**
 * 画面を開いている間だけの置き場所（IndexedDB を開けないときと、テスト）。
 * @returns 置き場所
 */
export function createMemoryStore(): OfflineStore {
  const snapshots = new Map<string, TableSnapshot>();
  const changes = new Map<number, OutboxEntry>();
  const meta = new Map<string, unknown>();
  let nextSeq = 1;
  return {
    durable: false,
    readSnapshot: (tableId) => Promise.resolve(structuredClone(snapshots.get(tableId))),
    writeSnapshot: (snapshot) => {
      snapshots.set(snapshot.tableId, structuredClone(snapshot));
      return Promise.resolve();
    },
    removeTable: (tableId) => {
      snapshots.delete(tableId);
      for (const [seq, entry] of changes) if (entry.tableId === tableId) changes.delete(seq);
      return Promise.resolve();
    },
    listChanges: (tableId) =>
      Promise.resolve(
        [...changes.values()]
          .filter((entry) => entry.tableId === tableId)
          .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
          .map((entry) => structuredClone(entry)),
      ),
    addChange: (entry) => {
      const seq = nextSeq++;
      changes.set(seq, structuredClone({ ...entry, seq }));
      return Promise.resolve(seq);
    },
    removeChange: (seq) => {
      changes.delete(seq);
      return Promise.resolve();
    },
    clearChanges: (tableId) => {
      for (const [seq, entry] of changes) if (entry.tableId === tableId) changes.delete(seq);
      return Promise.resolve();
    },
    readMeta: <T>(key: string) => Promise.resolve(structuredClone(meta.get(key)) as T | undefined),
    writeMeta: (key, value) => {
      meta.set(key, structuredClone(value));
      return Promise.resolve();
    },
  };
}

/** IndexedDB の名前と版。 */
const DB_NAME = "kanaeru-match";
/** IndexedDB の版（表の形を変えたら上げる）。 */
const DB_VERSION = 1;

/**
 * IndexedDB の要求を Promise にする。
 * @param request 要求
 * @returns 結果
 */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB の要求に失敗しました。"));
  });
}

/**
 * IndexedDB を開く（表がなければ作る）。
 * @returns DB
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("tables"))
        db.createObjectStore("tables", { keyPath: "tableId" });
      if (!db.objectStoreNames.contains("changes")) {
        const changes = db.createObjectStore("changes", { keyPath: "seq", autoIncrement: true });
        changes.createIndex("tableId", "tableId");
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB を開けません。"));
    request.onblocked = () => reject(new Error("IndexedDB がほかの画面に止められています。"));
  });
}

/**
 * IndexedDB の置き場所。
 * @param db 開いた DB
 * @returns 置き場所
 */
function createIndexedDbStore(db: IDBDatabase): OfflineStore {
  const store = (name: string, mode: IDBTransactionMode) =>
    db.transaction(name, mode).objectStore(name);
  return {
    durable: true,
    readSnapshot: async (tableId) =>
      (await done(store("tables", "readonly").get(tableId))) as TableSnapshot | undefined,
    writeSnapshot: async (snapshot) => {
      await done(store("tables", "readwrite").put(snapshot));
    },
    removeTable: async (tableId) => {
      await done(store("tables", "readwrite").delete(tableId));
      const changes = store("changes", "readwrite");
      const keys = await done(changes.index("tableId").getAllKeys(tableId));
      await Promise.all(keys.map((key) => done(changes.delete(key))));
    },
    listChanges: async (tableId) => {
      const rows = (await done(
        store("changes", "readonly").index("tableId").getAll(tableId),
      )) as OutboxEntry[];
      return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    },
    addChange: async (entry) => {
      const { seq: _seq, ...row } = entry;
      return (await done(store("changes", "readwrite").add(row))) as number;
    },
    removeChange: async (seq) => {
      await done(store("changes", "readwrite").delete(seq));
    },
    clearChanges: async (tableId) => {
      const changes = store("changes", "readwrite");
      const keys = await done(changes.index("tableId").getAllKeys(tableId));
      await Promise.all(keys.map((key) => done(changes.delete(key))));
    },
    readMeta: async <T>(key: string) => {
      const row = (await done(store("meta", "readonly").get(key))) as
        { key: string; value: T } | undefined;
      return row?.value;
    },
    writeMeta: async (key, value) => {
      await done(store("meta", "readwrite").put({ key, value }));
    },
  };
}

/** 開いた置き場所（1つだけ）。 */
let opened: Promise<OfflineStore> | undefined;

/**
 * 端末の置き場所を開く（何度呼んでも1度だけ開く。開けなければ画面を開いている間だけの置き場所）。
 * @returns 置き場所
 */
export function offlineStore(): Promise<OfflineStore> {
  opened ??= (async () => {
    try {
      if (typeof indexedDB === "undefined") return createMemoryStore();
      return createIndexedDbStore(await openDatabase());
    } catch {
      return createMemoryStore();
    }
  })();
  return opened;
}

/**
 * 開くのを待たずに使える置き場所（使うたびに offlineStore() を待ってから、開いた置き場所に渡す）。
 * @returns 置き場所
 */
export function deferredStore(): OfflineStore {
  return {
    get durable() {
      return false;
    },
    readSnapshot: async (tableId) => (await offlineStore()).readSnapshot(tableId),
    writeSnapshot: async (snapshot) => (await offlineStore()).writeSnapshot(snapshot),
    removeTable: async (tableId) => (await offlineStore()).removeTable(tableId),
    listChanges: async (tableId) => (await offlineStore()).listChanges(tableId),
    addChange: async (entry) => (await offlineStore()).addChange(entry),
    removeChange: async (seq) => (await offlineStore()).removeChange(seq),
    clearChanges: async (tableId) => (await offlineStore()).clearChanges(tableId),
    readMeta: async <T>(key: string) => (await offlineStore()).readMeta<T>(key),
    writeMeta: async (key, value) => (await offlineStore()).writeMeta(key, value),
  };
}

/**
 * テストだけで使う：置き場所を差しかえる。
 * @param store 置き場所（undefined なら次に開き直す）
 */
export function setOfflineStoreForTest(store: OfflineStore | undefined): void {
  opened = store ? Promise.resolve(store) : undefined;
}
