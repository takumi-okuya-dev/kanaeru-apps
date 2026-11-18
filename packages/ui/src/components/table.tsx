// 表（DESIGN.md Components の「表」）。見出しの行は head の地、行の間は border。値がないときは空欄（EXPERIENCE.md 4）。
// 狭い画面では、表を囲む枠の中で横に動かす（ページは横に動かさない。EXPERIENCE.md 7）。題は呼ぶ側が caption か aria-label でつける。
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/**
 * 表（横に動く枠つき）。
 * @param props table の属性
 * @returns 表の要素
 */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="w-full overflow-x-auto rounded-md border border-border bg-surface"
    >
      <table
        data-slot="table"
        className={cn("w-full border-collapse text-left text-s text-text", className)}
        {...props}
      />
    </div>
  );
}

/**
 * 表の見出しの行のまとまり。
 * @param props thead の属性
 * @returns thead の要素
 */
export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("bg-head", className)} {...props} />;
}

/**
 * 表の中身の行のまとまり。
 * @param props tbody の属性
 * @returns tbody の要素
 */
export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

/**
 * 表の行（行の間は border）。
 * @param props tr の属性
 * @returns tr の要素
 */
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b border-border last:border-b-0", className)}
      {...props}
    />
  );
}

/**
 * 見出しのセル。
 * @param props th の属性（scope の既定は col）
 * @returns th の要素
 */
export function TableHead({ className, scope = "col", ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope={scope}
      className={cn("px-xs py-xxs align-bottom font-bold whitespace-nowrap", className)}
      {...props}
    />
  );
}

/**
 * 中身のセル。数や日時の列には tabular-nums をつける（桁をそろえる。DESIGN.md Typography）。
 * @param props td の属性
 * @returns td の要素
 */
export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td data-slot="table-cell" className={cn("px-xs py-xxs align-top", className)} {...props} />
  );
}

/**
 * 表の題（見た目で隠すときは、呼ぶ側が sr-only をつける）。
 * @param props caption の属性
 * @returns caption の要素
 */
export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("px-xs py-xxs text-left text-s text-text-sub", className)}
      {...props}
    />
  );
}
