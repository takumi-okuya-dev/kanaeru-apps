// 試合表の道に入ったときの始め方（道の beforeLoad から呼ぶ。match-005）：Service Worker を入れる・外す（register.ts）と、
// 「新しい版があります」の知らせの根（UpdatePrompt.tsx）。Service Worker のないブラウザ（とテストの jsdom）では何もしない。
import { startMatchOffline } from "./register.ts";
import { mountUpdatePrompt } from "./UpdatePrompt.tsx";

/** 試合表の道に入ったときに呼ぶ（何度呼んでも、動くのは1度だけ）。 */
export function enterMatchRoute(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  startMatchOffline();
  mountUpdatePrompt();
}
