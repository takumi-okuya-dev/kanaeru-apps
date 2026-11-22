// 古い画面が、新しい版にない部品（中身の印つきの JS・CSS）を読もうとして失敗したとき、1回だけ読み直す（core-020）。
// デプロイのあと開いたままの画面や、Cloudflare が源の失敗のあいだ出した前の画面（stale-if-error）が、
// 道を移ったときに古い部品を読みにいき、真っ白になるのを防ぐ。Vite は読めなかったとき window に vite:preloadError を投げる。
// 読み直しても直らないときに繰り返さないよう、1分に1回までにする（sessionStorage に時刻を残す）。

/** 前に読み直した時刻を残す場所の名前。 */
const RELOADED_AT_KEY = "kanaeru:preload-reloaded-at";

/** 読み直しを繰り返さない間（ミリ秒）。 */
const RELOAD_INTERVAL_MS = 60_000;

/** 読み直しの仕組みに渡すもの（テストで差しかえる）。 */
export type PreloadErrorReloadOptions = {
  /** vite:preloadError を受ける所（既定は window） */
  target?: EventTarget;
  /** 時刻を残す所（既定は sessionStorage） */
  storage?: Pick<Storage, "getItem" | "setItem">;
  /** 読み直す（既定は location.reload） */
  reload?: () => void;
  /** 今の時刻（ミリ秒） */
  now?: () => number;
};

/**
 * 部品が読めなかったら1回だけ読み直す仕組みを付ける。
 * @param options 受ける所・時刻を残す所・読み直す関数・今の時刻
 */
export function installPreloadErrorReload(options: PreloadErrorReloadOptions = {}): void {
  const target = options.target ?? window;
  const reload = options.reload ?? (() => window.location.reload());
  const now = options.now ?? Date.now;
  target.addEventListener("vite:preloadError", (event) => {
    try {
      const storage = options.storage ?? window.sessionStorage;
      const last = Number(storage.getItem(RELOADED_AT_KEY) ?? 0);
      if (now() - last < RELOAD_INTERVAL_MS) return;
      storage.setItem(RELOADED_AT_KEY, String(now()));
    } catch {
      // 時刻を残せないと繰り返しを止められないので、読み直さない（ふつうのエラーの画面になる）
      return;
    }
    event.preventDefault();
    reload();
  });
}
