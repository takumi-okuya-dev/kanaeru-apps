// 設定の画面（/settings。どのアプリにも属さない外枠の画面。core-005）の項目の形と、出す項目の決め方。
// 項目は、領域が feature.settings で出し、組み立て（router.tsx）が属するアプリを付けて provideSettingsSections で渡す。
// 設定の画面（PC のサイドバーとスマホの一覧）は、ここから読む。
// - 個人の設定：アカウントなど（だれにでも）
// - アプリの設定：アプリの領域が出す項目（そのアプリが見えるときだけ）
// - 運営（運営者だけ）：アプリの台帳など
import type { NavIcon } from "./feature.ts";

/** 設定の項目のまとまり（並びの順）。 */
export const SETTINGS_GROUPS = ["personal", "app", "operator"] as const;

/** 設定の項目のまとまり。 */
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

/** まとまりの見出し。 */
export const SETTINGS_GROUP_LABELS = {
  personal: "個人の設定",
  app: "アプリの設定",
  operator: "運営（運営者だけ）",
} as const satisfies Record<SettingsGroup, string>;

/** 設定の項目（領域が feature.settings で出す）。 */
export type SettingsSection = {
  /** 項目の ID（設定の中で重ならない） */
  id: string;
  /** 見える名前 */
  label: string;
  /** 行き先の道（/settings/… の下） */
  to: string;
  /** まとまり */
  group: SettingsGroup;
  /** アイコン（書かなければ list） */
  icon?: NavIcon;
  /** 運営者だけに出すか（運営のまとまりは、書かなくても運営者だけ） */
  operatorOnly?: boolean;
};

/** 属するアプリを付けた設定の項目（組み立てが作る）。 */
export type ResolvedSettingsSection = SettingsSection & {
  /** 項目を出した領域が属するアプリの key（共通の領域なら undefined） */
  appKey?: string;
};

/** 出す項目を決めるときの、見る人の状態。 */
export type SettingsViewer = {
  /** 見えるアプリの key（読みこむ前・読めないときは null。そのときアプリの項目は出さない） */
  visibleAppKeys: ReadonlySet<string> | null;
  /** 運営者か */
  isOperator: boolean;
};

/**
 * 見る人に出す設定の項目（まとまりの順・同じまとまりの中は登録の順）。
 * 見えないアプリの項目と、運営者でない人への運営の項目は出さない。
 * @param sections 属するアプリを付けた項目
 * @param viewer 見る人の状態
 * @returns 出す項目
 */
export function visibleSettingsSections(
  sections: readonly ResolvedSettingsSection[],
  viewer: SettingsViewer,
): ResolvedSettingsSection[] {
  return SETTINGS_GROUPS.flatMap((group) =>
    sections.filter((section) => {
      if (section.group !== group) return false;
      if ((section.operatorOnly || group === "operator") && !viewer.isOperator) return false;
      if (section.appKey !== undefined) return viewer.visibleAppKeys?.has(section.appKey) === true;
      return true;
    }),
  );
}

/** 組み立てが渡した項目。 */
let provided: readonly ResolvedSettingsSection[] = [];

/**
 * 組み立てが、登録された領域の設定の項目（属するアプリを付けたもの）を渡す（起動のときに1度）。
 * @param sections 項目
 */
export function provideSettingsSections(sections: readonly ResolvedSettingsSection[]): void {
  provided = sections;
}

/**
 * 組み立てが渡した設定の項目（見る人で絞る前）。
 * @returns 項目
 */
export function settingsSections(): readonly ResolvedSettingsSection[] {
  return provided;
}
