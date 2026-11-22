// 部品が読めなかったら1回だけ読み直す（core-020）。
import { describe, expect, it } from "vitest";
import { installPreloadErrorReload } from "./preload-error.ts";

/**
 * 覚えるだけの保存場所を作る。
 * @returns 保存場所
 */
function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("installPreloadErrorReload", () => {
  it("読めなかったら読み直し、1分の間はもう読み直さない。1分たてば、また読み直す", () => {
    const target = new EventTarget();
    let time = 1_000_000;
    let reloads = 0;
    installPreloadErrorReload({
      target,
      storage: memoryStorage(),
      reload: () => (reloads += 1),
      now: () => time,
      isOnline: () => true,
    });
    const first = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(first);
    expect(reloads).toBe(1);
    // エラーは止めない（道の部品が読みこみ中のまま待つ）
    expect(first.defaultPrevented).toBe(false);
    time += 30_000;
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    expect(reloads).toBe(1);
    time += 31_000;
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    expect(reloads).toBe(2);
  });

  it("電波がないときは読み直さない。時計が戻って残した時刻が先にあっても、読み直せる", () => {
    const target = new EventTarget();
    const storage = memoryStorage();
    let online = false;
    let reloads = 0;
    installPreloadErrorReload({
      target,
      storage,
      reload: () => (reloads += 1),
      now: () => 1_000_000,
      isOnline: () => online,
    });
    target.dispatchEvent(new Event("vite:preloadError"));
    expect(reloads).toBe(0);
    online = true;
    storage.setItem("kanaeru:preload-reloaded-at", String(9_000_000));
    target.dispatchEvent(new Event("vite:preloadError"));
    expect(reloads).toBe(1);
  });

  it("時刻を残せないときは読み直さない（繰り返しを止められないため）", () => {
    const target = new EventTarget();
    let reloads = 0;
    installPreloadErrorReload({
      target,
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("保存できません");
        },
      },
      reload: () => (reloads += 1),
      isOnline: () => true,
    });
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    expect(reloads).toBe(0);
  });
});
