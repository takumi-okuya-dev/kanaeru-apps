// ボタンの並べ方（DESIGN.md の「ボタンの並べ方」）。ボタンを並べる所は、どの画面もこの部品で同じ形にそろえる。
// - end（既定）：フォームの終わり・枠の下・ダイアログの下。PC は右寄せで、並べた順に左から（主のボタンを最後に書くと右に来る）、
//   どのボタンも同じ幅（いちばん長い文字に合わせる。並び全体は最低 160px・入れ物の幅まで。入りきらなければ文字を折り返す）。
//   スマホは縦に積み、主（最後に書いたもの）が上で横幅いっぱい。読み上げとキーボードの順は書いた順（二番 → 主）のまま
// - grid：画面の上の操作の並びなど、同じ重さの操作をいくつも並べる所。同じ幅の格子（スマホは2列・PC は3列）
// 並べる順は「二番の操作 → 主の操作」（主は1つのまとまりに1つ）。値は tokens.css の名前だけを使う。
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/** ボタンの並べ方が受け取るもの。 */
export type ButtonRowProps = {
  /** 並べるボタン（二番の操作 → 主の操作の順） */
  children: React.ReactNode;
  /** 並べ方（end：右寄せで同じ幅・grid：同じ幅の格子） */
  layout?: "end" | "grid";
  /** 追加の class */
  className?: string;
};

/** 右寄せで同じ幅の並べ方（ダイアログの下でも使う）。 */
export const buttonRowEndClassName =
  "flex flex-col-reverse gap-xxs *:w-full *:whitespace-normal wide:ml-auto wide:grid wide:w-fit wide:max-w-full wide:min-w-action wide:auto-cols-fr wide:grid-flow-col";

/** 同じ幅の格子の並べ方。 */
export const buttonRowGridClassName =
  "grid grid-cols-2 gap-xxs *:w-full *:whitespace-normal wide:grid-cols-3";

/**
 * ボタンの並べ方。
 * @param props 並べるボタン（children）・並べ方（layout）・追加の class
 * @returns 並べた要素
 */
export function ButtonRow({ children, layout = "end", className }: ButtonRowProps) {
  return (
    <div
      data-slot="button-row"
      className={cn(layout === "end" ? buttonRowEndClassName : buttonRowGridClassName, className)}
    >
      {children}
    </div>
  );
}
