// 画面の領域（features/<領域>/index.ts）が出すものの形。組み立て（router.tsx）が features.list.ts を読んでつなぐ。
// ナビの項目の形（NavItem）もここに置く（領域が出し、外枠〈shell〉が描く。外枠は lib だけを読む）。
// 設定の画面の項目（SettingsSection。lib/settings.ts）も、領域が feature.settings で出す（core-005）。
// 組織の画面に足すもの（OrganizationExtension。lib/organization.ts）も、領域が feature.organization で出す（suite-001）。
import type { AnyRoute } from "@tanstack/react-router";
import type { OrganizationExtension } from "./organization.ts";
import type { SettingsSection } from "./settings.ts";

/** ナビのアイコンの種類（線は lib/icon.tsx）。同じナビの中では、項目ごとに違うアイコンを選ぶ（目で探しやすくする。core-011）。 */
export type NavIcon =
  | "list"
  | "people"
  | "concerns"
  | "setup"
  | "account"
  | "ledger"
  | "home"
  | "at"
  | "drafts"
  | "pen"
  | "target"
  | "search"
  | "heart"
  | "chart"
  | "globe"
  | "sliders";

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
  /** まとまりの見出し（任意。設定のナビのように、見出しごとに分けて出すとき。同じ見出しの項目は続けて並べる） */
  group?: string;
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
  /**
   * 設定の画面（/settings）に出す項目（任意。core-005）。アプリの領域の項目は「アプリの設定」に出し、
   * そのアプリが見えないときは出さない（属するアプリは組み立てが apps.list.ts から決める）。
   */
  settings?: readonly SettingsSection[];
  /**
   * 組織の画面への入口と、組織の招待の確かめの画面の説明（任意。suite-001）。そのアプリが見えないときは出さない。
   */
  organization?: OrganizationExtension;
};
