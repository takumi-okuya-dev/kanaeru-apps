// 画面の領域（features/<領域>/index.ts）が出すものの形。組み立て（router.tsx）が features.list.ts を読んでつなぐ。
// ナビの項目の形（NavItem）もここに置く（領域が出し、外枠〈shell〉が描く。外枠は lib だけを読む）。
import type { AnyRoute } from "@tanstack/react-router";

/** ナビのアイコンの種類（外枠の shell/NavIcon.tsx が描く）。 */
export type NavIcon = "list" | "people" | "concerns" | "setup";

/** ナビの項目（PC のサイドバーとスマホのタブバー）。 */
export type NavItem = {
  /** 項目の ID（ナビの中で重ならない） */
  id: string;
  /** 見える名前（タブバーにも出すので短く） */
  label: string;
  /** 行き先の道（値を入れた道。/ で始まる） */
  to: string;
  /** アイコン */
  icon: NavIcon;
  /** ほかに、この項目の「今いる所」に含める道の頭（任意。例：準備に交流会を直すの道） */
  also?: readonly string[];
};

/** 領域が出すもの。 */
export type WebFeature = {
  /** 領域の ID（仕様のフォルダ specs/<領域>/ と同じ） */
  id: string;
  /** 道（rootRoute の子。createRoute で作る。参加者が開く道は staticData: { layout: "bare" }） */
  routes: readonly AnyRoute[];
  /** ナビに出す項目（任意。並びは features.list.ts の順。はじめの画面〈/〉は最初の項目へ移る） */
  nav?: {
    /** 見える名前 */
    label: string;
    /** 行き先の道 */
    to: string;
    /** アイコン（書かなければ list） */
    icon?: NavIcon;
  };
  /**
   * 今の道に合わせたナビの項目を返す React のフック（任意。あれば nav の代わりに、これの項目を出す）。
   * 外枠が描くたびに、領域の並びの順で呼ぶ。問い合わせを新しく始めず、画面が読んだものから決める。
   */
  useNavItems?: () => readonly NavItem[];
};
