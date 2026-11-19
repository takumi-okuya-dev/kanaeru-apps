// ナビのアイコン（線は lib/icon.tsx の1か所。外枠はここから読む）。読み上げは、隣の名前が伝えるので隠す。
import { Icon } from "../lib/icon.tsx";
import type { IconName } from "../lib/icon.tsx";

/**
 * ナビのアイコン（24px の四角）。
 * @param props アイコンの種類（name）
 * @returns アイコンの要素
 */
export function NavIcon({ name }: { name: IconName }) {
  return <Icon name={name} />;
}
