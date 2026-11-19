// アプリのアイコンの箱（切り替え・すべてのアプリ・設定で同じ形）。今のアプリ（選んだ状態）は墨の地、ほかはくぼみの地。
import type { AppIcon } from "@workspace/contracts/core";
import { cn } from "@workspace/ui/lib/cn";
import { Icon } from "../../lib/icon.tsx";

/**
 * アプリのアイコンの箱（48px の四角。読み上げは隣の名前が伝えるので隠す）。
 * @param props アイコン（icon）・選んだ状態か（selected）
 * @returns 箱の要素
 */
export function AppIconBox({ icon, selected = false }: { icon: AppIcon; selected?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-xl shrink-0 items-center justify-center rounded-md",
        selected
          ? "bg-primary text-on-primary"
          : "border border-border bg-surface-sunken text-text",
      )}
    >
      <Icon name={icon} />
    </span>
  );
}
