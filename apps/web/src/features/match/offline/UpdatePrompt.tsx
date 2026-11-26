// 「新しい版があります」の知らせ（AD-27【仮決め】。match-005）。試合表の Service Worker の新しい版が入って待っているとき、
// 画面の下に出し、「読み直す」で入れ替えて読み直す。どの試合表の画面（ナビのある外枠・ナビのない外枠）にも同じ形で出すため、
// 画面の部品の木の外に、小さな React の根を1つ作って描く（mountUpdatePrompt。試合表の道でだけ呼ぶ）。
import { Button } from "@workspace/ui/components/button";
import { StrictMode, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { applyUpdate, hasUpdate, subscribeUpdate } from "./register.ts";

/**
 * 新しい版の知らせ（待っている版がなければ何も出さない）。
 * @returns 要素
 */
export function UpdatePrompt() {
  const waiting = useSyncExternalStore(subscribeUpdate, hasUpdate, () => false);
  const [later, setLater] = useState(false);
  if (!waiting || later) return null;
  return (
    <div
      role="region"
      aria-label="新しい版の知らせ"
      className="fixed inset-x-xs bottom-xs z-50 mx-auto flex max-w-form flex-wrap items-center gap-xxs rounded-md border border-border bg-surface p-xs shadow-layer3"
    >
      <p className="text-m">新しい版があります。読み直すと新しくなります。</p>
      <div className="flex gap-xxs">
        <Button size="small" onClick={() => setLater(true)}>
          あとで
        </Button>
        <Button size="small" variant="primary" onClick={applyUpdate}>
          読み直す
        </Button>
      </div>
    </div>
  );
}

/** 描いたか（1度だけ描く）。 */
let mounted = false;

/** 知らせの根を作って描く（試合表の道を開いたときに1度だけ）。 */
export function mountUpdatePrompt(): void {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  const element = document.createElement("div");
  element.id = "match-update-prompt";
  document.body.append(element);
  createRoot(element).render(
    <StrictMode>
      <UpdatePrompt />
    </StrictMode>,
  );
}
