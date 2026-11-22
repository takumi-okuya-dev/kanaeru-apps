// 今の利用者が替わったら、端末に置いた前の人の試合表の写しを消す（セキュリティの全体点検 run-1）。
// 共有の端末（コートの横のタブレットなど）で、ログアウトしたあと・別の人がログインしたあとに、
// 電波がないときや夜間の停止のあいだ、前の人の試合表・名簿・共有のリンクを見せないため。
// 送っていない変更も消える（前の人の変更を、次にログインした人の名前で送らないため）。
import { onAccountChange } from "../../../lib/account-events.ts";
import { DEVICE_META_KEY, DEVICE_STORAGE_KEY } from "../device.ts";
import { clearMemoryLinks } from "../link-store.ts";
import { offlineStore } from "./store.ts";

/** 写しを置いた人の ID を置く localStorage の鍵（IndexedDB を待たずに読めるよう、localStorage に置く）。 */
export const OWNER_STORAGE_KEY = "kanaeru.match.owner";

/** 試合表が localStorage に置く値の鍵の頭（共有のリンクの札・見るだけのページの写しと自分の選んだ名前など）。 */
const LOCAL_PREFIX = "kanaeru.match.";

/** 片付けで残す localStorage の鍵（端末の ID と、写しを置いた人）。 */
const KEEP_LOCAL = new Set([DEVICE_STORAGE_KEY, OWNER_STORAGE_KEY]);

/**
 * 試合表が localStorage と画面の中に置いた値を消す（端末の ID は本人のデータでないので残す）。
 */
function clearLocalValues(): void {
  clearMemoryLinks();
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(LOCAL_PREFIX) && !KEEP_LOCAL.has(key)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // localStorage が使えない（プライベートの画面など）なら、置いてもいないので何もしない
  }
}

/**
 * 写しを置いた人を読む。
 * @returns account の ID（わからなければ undefined）
 */
function readOwner(): string | undefined {
  try {
    return window.localStorage.getItem(OWNER_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 写しを置いた人を書く（null なら消す）。
 * @param accountId account の ID
 */
function writeOwner(accountId: string | null): void {
  try {
    if (accountId === null) window.localStorage.removeItem(OWNER_STORAGE_KEY);
    else window.localStorage.setItem(OWNER_STORAGE_KEY, accountId);
  } catch {
    // 書けなければ、次のログインでもわからないので、また消す（安全な側）
  }
}

/**
 * 今の利用者に合わせて、端末の写しを片付ける。ログアウト・退会（null）と、写しを置いた人と違う人のログインでは消す。
 * 写しを置いた人がわからない（この仕組みの前に置いた写し）ときも、ログインした人と違うかもしれないので消す。
 * localStorage の値は IndexedDB を待たずに先に消す（IndexedDB が答えなくても、共有のリンクの札を残さない）。
 * @param accountId 今の利用者の ID（ログアウト・退会は null）
 */
export async function resetForAccount(accountId: string | null): Promise<void> {
  const stale = accountId === null || readOwner() !== accountId;
  if (stale) clearLocalValues();
  writeOwner(accountId);
  if (!stale) return;
  try {
    const store = await offlineStore();
    await store.clearAccountData([DEVICE_META_KEY]);
  } catch {
    // 端末の置き場所を開けなければ、写しも置けていない
  }
}

/**
 * 今の利用者が替わったときの片付けを足す（試合表の画面の入口が1度だけ呼ぶ）。
 * @returns 外す関数
 */
export function registerAccountReset(): () => void {
  return onAccountChange(resetForAccount);
}
