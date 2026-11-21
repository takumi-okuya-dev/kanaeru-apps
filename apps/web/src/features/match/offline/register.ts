// 試合表の Service Worker の入れ方・外し方・新しい版の知らせ（AD-27。match-005）。試合表の道を開いたとき（道の beforeLoad）に
// 1度だけ動く。ほかの道では呼ばない（ほかのアプリの画面には Service Worker を入れない）。
// - 機能の印 match.offline を窓口で確かめ、入なら /match/sw.js を範囲 /match/ で入れる。切か、アプリが見えない（404）なら、
//   入っている試合表の Service Worker を外し、置き場所（kanaeru-match-…）を消す。届かない（電波がない）ときは今のまま
// - 新しい版が入って待っているときは「新しい版があります」を出し（UpdatePrompt）、押されたら入れ替えて読み直す
// - つながったとき・1時間おきに、新しい版を確かめる（画面を開いたままの端末のため）
import { fetchOfflineSetting } from "../api.ts";
import { ApiError } from "../../../lib/api.ts";
import { syncDeviceId } from "../device.ts";

/** Service Worker の道（組み立てが書き出す。範囲の上限は置いたフォルダの /match/）。 */
export const MATCH_SW_URL = "/match/sw.js";
/** Service Worker の範囲。 */
export const MATCH_SW_SCOPE = "/match/";
/** 置き場所の名前の頭（sw.js と同じ）。 */
const CACHE_PREFIX = "kanaeru-match-";
/** 新しい版を確かめる間（ミリ秒）。 */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** 新しい版の知らせの状態。 */
type UpdateState = {
  /** 待っている新しい版（なければ undefined） */
  waiting: ServiceWorker | undefined;
};

const state: UpdateState = { waiting: undefined };
const listeners = new Set<() => void>();

/** 始めたか（1度だけ動かす）。 */
let started = false;

/** 変わり目を知らせる。 */
function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * 新しい版の知らせを受け取る。
 * @param listener 変わったときに呼ぶ関数
 * @returns 受け取りをやめる関数
 */
export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 新しい版が待っているか。
 * @returns 待っていれば true
 */
export function hasUpdate(): boolean {
  return state.waiting !== undefined;
}

/** 新しい版に入れ替えて読み直す（入れ替わったら、controllerchange で読み直す）。 */
export function applyUpdate(): void {
  const waiting = state.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  waiting.postMessage({ type: "SKIP_WAITING" });
}

/**
 * 待っている新しい版を見張る（入ったら知らせる。初めて入れたときは知らせない）。
 * @param registration 入れた Service Worker
 */
function watchUpdates(registration: ServiceWorkerRegistration): void {
  const notifyIfWaiting = () => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      state.waiting = registration.waiting;
      emit();
    }
  };
  notifyIfWaiting();
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed") notifyIfWaiting();
    });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // 新しい版に入れ替えると決めたときだけ読み直す（初めて入れたときの claim では読み直さない）
    if (reloading || !state.waiting) return;
    reloading = true;
    window.location.reload();
  });
  const check = () => void registration.update().catch(() => undefined);
  window.addEventListener("online", check);
  window.setInterval(check, UPDATE_CHECK_MS);
}

/**
 * 入っている試合表の Service Worker を外し、置き場所を消す（機能の印が切のとき）。
 * @returns 終わり
 */
export async function removeMatchServiceWorker(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => new URL(registration.scope).pathname === MATCH_SW_SCOPE)
      .map((registration) => registration.unregister()),
  );
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)),
    );
  }
}

/**
 * 機能の印を確かめる（入・切・分からない）。
 * @returns "on"・"off"（切か、アプリが見えない 404）・"unknown"（届かない）
 */
async function readSetting(): Promise<"on" | "off" | "unknown"> {
  try {
    return (await fetchOfflineSetting()).enabled ? "on" : "off";
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) return "off";
    return "unknown";
  }
}

/**
 * 試合表の道を開いたときに1度だけ呼ぶ：機能の印で Service Worker を入れるか外し、新しい版を見張る。端末の ID もそろえる。
 * 失敗しても画面は止めない（ネットなしで開けないだけ）。
 */
export function startMatchOffline(): void {
  if (started) return;
  started = true;
  void syncDeviceId();
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void (async () => {
    try {
      const setting = await readSetting();
      if (setting === "off") {
        await removeMatchServiceWorker();
        return;
      }
      const registration =
        setting === "on"
          ? await navigator.serviceWorker.register(MATCH_SW_URL, { scope: MATCH_SW_SCOPE })
          : await navigator.serviceWorker.getRegistration(MATCH_SW_SCOPE);
      if (registration) watchUpdates(registration);
    } catch {
      // 入れられなくても、つながっていれば今までどおり使える
    }
  })();
}

/** テストだけで使う：始めたことを忘れる。 */
export function resetMatchOfflineForTest(): void {
  started = false;
  state.waiting = undefined;
}
