// 今の利用者が替わったら、端末に置いた前の人の試合表の写しを消す（セキュリティの全体点検 run-1）。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notifyAccountChange } from "../../../lib/account-events.ts";
import { DEVICE_META_KEY } from "../device.ts";
import { OWNER_META_KEY, registerAccountReset, resetForAccount } from "./account-reset.ts";
import { createMemoryStore, setOfflineStoreForTest } from "./store.ts";
import type { OfflineStore } from "./store.ts";

/**
 * 前の人（a1）の写しを置く。
 * @param store 置き場所
 */
async function seedPrevious(store: OfflineStore): Promise<void> {
  await store.writeMeta(OWNER_META_KEY, "a1");
  await store.writeMeta(DEVICE_META_KEY, "device-1");
  await store.writeMeta("tableList", { list: ["前の人の試合表"], savedAt: 1 });
  await store.writeSnapshot({ tableId: "t1" } as never);
  await store.addChange({ tableId: "t1" } as never);
  window.localStorage.setItem("kanaeru.match.link.view.t1", "{}");
  window.localStorage.setItem("kanaeru.other", "残す");
}

describe("resetForAccount", () => {
  let store: OfflineStore;
  beforeEach(() => {
    store = createMemoryStore();
    setOfflineStoreForTest(store);
    window.localStorage.clear();
  });
  afterEach(() => {
    setOfflineStoreForTest(undefined);
    window.localStorage.clear();
  });

  it("ログアウト（null）で、試合表の中身・送っていない変更・一覧・共有のリンクを消す。端末の ID とほかの値は残す", async () => {
    await seedPrevious(store);
    await resetForAccount(null);
    expect(await store.readSnapshot("t1")).toBeUndefined();
    expect(await store.listChanges("t1")).toEqual([]);
    expect(await store.readMeta("tableList")).toBeUndefined();
    expect(await store.readMeta(OWNER_META_KEY)).toBeUndefined();
    expect(await store.readMeta(DEVICE_META_KEY)).toBe("device-1");
    expect(window.localStorage.getItem("kanaeru.match.link.view.t1")).toBeNull();
    expect(window.localStorage.getItem("kanaeru.other")).toBe("残す");
  });

  it("写しを置いた人と違う人がログインしたら消し、その人を写しの持ち主にする。同じ人なら残す", async () => {
    await seedPrevious(store);
    await resetForAccount("a1");
    expect(await store.readMeta("tableList")).toBeDefined();
    await resetForAccount("b2");
    expect(await store.readMeta("tableList")).toBeUndefined();
    expect(await store.readSnapshot("t1")).toBeUndefined();
    expect(await store.readMeta(OWNER_META_KEY)).toBe("b2");
  });

  it("入口が足した受け手で、account の知らせを受けて消す", async () => {
    await seedPrevious(store);
    const stop = registerAccountReset();
    await notifyAccountChange(null);
    expect(await store.readMeta("tableList")).toBeUndefined();
    stop();
  });
});
