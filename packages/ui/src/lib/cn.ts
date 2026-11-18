// クラスの名前をまとめる（shadcn/ui の部品が使う）。Tailwind の同じ役のクラスは、後のものを残す。
// tailwind-merge は、知らない text-* を「文字の色」とみなすので、tokens.css の文字の大きさと色の名前を教える
// （教えないと、text-m（大きさ）と text-text（色）がぶつかったとみなされ、片方が消える）。
// tokens.test.ts が、ここの名前と tokens.css が同じかを確かめる。
import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tokens.css の文字の大きさの名前（--text-*）。 */
export const TEXT_SIZE_NAMES = ["xxs", "xs", "s", "m", "l", "xl", "xxl"] as const;

/** tokens.css の余白の名前（--spacing-*）。 */
export const SPACING_NAMES = [
  "0",
  "x3s",
  "xxs",
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "x3l",
  "sidebar",
] as const;

const twMerge = extendTailwindMerge({
  override: {
    theme: { text: [...TEXT_SIZE_NAMES], spacing: [...SPACING_NAMES] },
  },
});

/**
 * クラスの名前をまとめる。
 * @param inputs クラスの名前（条件つきでもよい）
 * @returns まとめたクラスの名前
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
