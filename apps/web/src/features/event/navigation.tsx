// 道の木に登録された道の読み方と、道の形が型で決まらない行き先（ほかの領域の画面）へのリンク。
// reception・survey の道は、その領域が道を足すまで道の木にないので、TanStack Router の Link の型では書けない。
// そこで、登録されているかを道の木で確かめてから、ふつうの <a> と router.navigate({ href }) で移る。
import { useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import type * as React from "react";

/**
 * 道の木に登録されている道の形（TanStack Router の path）。
 * @returns 道の形の集まり
 */
export function useRegisteredPaths(): ReadonlySet<string> {
  const router = useRouter();
  return useMemo(() => new Set(Object.keys(router.routesByPath)), [router]);
}

/** InternalLink が受け取るもの。 */
export type InternalLinkProps = Omit<React.ComponentProps<"a">, "href"> & {
  /** 行き先（/ で始まる同じ源の道） */
  href: string;
};

/**
 * 同じ源の道へのリンク（画面を読みこみ直さずに移る。新しいタブ・修飾キーつきはブラウザに任せる）。
 * @param props a の属性と行き先（href）
 * @returns リンクの要素
 */
export function InternalLink({ href, onClick, ...props }: InternalLinkProps) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void router.navigate({ href });
      }}
      {...props}
    />
  );
}
