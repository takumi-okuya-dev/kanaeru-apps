// アプリの静的な定義の形（構成の決めごと AD-15）。アプリは apps.list.ts に1行ずつ defineApp で登録する。
// アプリは売る・公開する単位で、1つ以上の領域の束（AD-1）。どの領域も、ちょうど1つのアプリか、スイートの共通（COMMON_DOMAINS）に属する。
// zod を読まない（画面の外枠が読んでも zod が束に入らないため）。

/** アプリのアイコンの種類（画面の外枠が描く。足すときは apps/web/src/shell/NavIcon.tsx に線を足す）。 */
export const APP_ICONS = ["qr", "chat", "book", "calendar", "people", "list"] as const;

/** アプリのアイコンの種類。 */
export type AppIcon = (typeof APP_ICONS)[number];

/** アプリの静的な定義。 */
export type AppDefinition = {
  /** アプリの key（英小文字で始まる英小文字・数字の単数。道・窓口の範囲・台帳の行の名前に使う。予約語は使えない） */
  key: string;
  /** 画面に出す名前（短く） */
  name: string;
  /** 切り替えのメニューに出す短い説明（20文字ほど） */
  summary: string;
  /** すべてのアプリの画面に出す説明（1〜2文） */
  description: string;
  /** アイコン */
  icon: AppIcon;
  /** 属する領域（modules.list.ts・features.list.ts の名前。ほかのアプリと重ねない） */
  domains: readonly string[];
  /** 画面の道の頭（新しいアプリは `/<key>`。受付アプリだけは今の道 `/admin/events` のまま。AD-15） */
  basePath: string;
  /** 使ってよいほかのアプリの key（輪にしない。AD-15） */
  uses: readonly string[];
  /** 退会で消える、このアプリの本人の記録（退会の確かめの枠に出す。例：「チェックイン・アンケートの回答」） */
  accountData: string;
};

/**
 * アプリの定義を書く（形を型で確かめ、そのまま返す。apps.list.ts の1行で使う）。
 * @param definition アプリの定義
 * @returns 同じ定義
 */
export function defineApp(definition: AppDefinition): AppDefinition {
  return definition;
}
