// 部品の土台の設定。画面の入口（main.tsx）で、画面全体を包む。
// Base UI の部品に <style> を書き足させない（画面の CSP は style-src 'self' だけで、書き足すと違反になるため。見た目はクラスで決める）。
import { CSPProvider } from "@base-ui/react/csp-provider";
import type * as React from "react";

/**
 * 部品の土台の設定。
 * @param props 中身（children）
 * @returns 包んだ要素
 */
export function UiProvider({ children }: { children: React.ReactNode }) {
  return <CSPProvider disableStyleElements>{children}</CSPProvider>;
}
