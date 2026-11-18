// ページの形（EXPERIENCE.md・DESIGN.md Layout：題 → リード文 → まとまり）。題は h1 で、外枠が道の変わり目にフォーカスを移す。
// ブラウザの題（<title>）を「{ページの題}｜{APP_NAME}」にする。
import { useEffect } from "react";
import type * as React from "react";
import { APP_NAME } from "./app-name.ts";

/** ページが受け取るもの。 */
export type PageProps = {
  /** ページの題（h1） */
  title: string;
  /** 題の下のリード文（任意） */
  lead?: React.ReactNode;
  /** 題の横に置く主の操作（任意。1つのページに主の操作は1つ） */
  actions?: React.ReactNode;
  /** 中身 */
  children?: React.ReactNode;
};

/**
 * ページ。
 * @param props 題（title）・リード文（lead）・操作（actions）・中身（children）
 * @returns ページの要素
 */
export function Page({ title, lead, actions, children }: PageProps) {
  useEffect(() => {
    document.title = `${title}｜${APP_NAME}`;
  }, [title]);
  return (
    <div className="flex flex-col gap-s">
      <div className="flex flex-col gap-xxs">
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <h1 tabIndex={-1} className="text-xl leading-tight font-bold outline-none">
            {title}
          </h1>
          {actions ? <div className="flex flex-wrap gap-xxs">{actions}</div> : null}
        </div>
        {lead ? <p className="text-m text-text-sub">{lead}</p> : null}
      </div>
      {children}
    </div>
  );
}
