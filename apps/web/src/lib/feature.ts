// 画面の領域（features/<領域>/index.ts）が出すものの形。組み立て（router.tsx）が features.list.ts を読んでつなぐ。
import type { AnyRoute } from "@tanstack/react-router";

/** 領域が出すもの。 */
export type WebFeature = {
  /** 領域の ID（仕様のフォルダ specs/<領域>/ と同じ） */
  id: string;
  /** 道（rootRoute の子。createRoute で作る） */
  routes: readonly AnyRoute[];
  /** ナビに出す項目（任意。並びは features.list.ts の順） */
  nav?: {
    /** 見える名前 */
    label: string;
    /** 行き先の道 */
    to: string;
  };
};
