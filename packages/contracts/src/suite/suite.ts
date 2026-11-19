// スイート（suite）の窓口の入出力の形（API の入力の確かめ・OpenAPI の文書・画面が、同じ形を使う）。ふつうの zod で書く。
import { APP_ICONS, APP_KEY_FORMAT } from "../core/index.ts";
import { z } from "zod";
import { APP_VISIBILITIES } from "./visibility.ts";

/** 公開の状態。 */
export const AppVisibilitySchema = z.enum(APP_VISIBILITIES, {
  error: "公開の状態は「切」「運営者だけ」「公開」のどれかにしてください。",
});

/** アプリの key（道の値）。 */
export const AppKeySchema = z.string().regex(APP_KEY_FORMAT);

/** 見る人に見えるアプリ（GET /api/v1/suite/apps の1行）。 */
export const VisibleAppView = z.object({
  /** アプリの key */
  key: z.string(),
  /** 名前 */
  name: z.string(),
  /** 短い説明（切り替えのメニュー） */
  summary: z.string(),
  /** 説明（すべてのアプリ） */
  description: z.string(),
  /** アイコン */
  icon: z.enum(APP_ICONS),
  /** 属する領域 */
  domains: z.array(z.string()),
  /** 画面の道の頭 */
  basePath: z.string(),
  /** 退会で消える、このアプリの本人の記録 */
  accountData: z.string(),
  /** 公開の状態（運営者には「運営者だけ」も返る） */
  visibility: AppVisibilitySchema,
});

/** 見る人に見えるアプリの型。 */
export type VisibleAppView = z.infer<typeof VisibleAppView>;

/** 見る人に見えるアプリの一覧（登録の順）。 */
export const VisibleAppList = z.object({
  /** 見えるアプリ */
  apps: z.array(VisibleAppView),
  /** 見る人が運営者か（台帳への入口を出すか） */
  isOperator: z.boolean(),
});

/** 見る人に見えるアプリの一覧の型。 */
export type VisibleAppList = z.infer<typeof VisibleAppList>;

/** 台帳の1行（運営者だけ）。 */
export const AppSettingView = z.object({
  /** アプリの key */
  key: z.string(),
  /** 名前 */
  name: z.string(),
  /** 属する領域 */
  domains: z.array(z.string()),
  /** 公開の状態（行がなければ「運営者だけ」） */
  visibility: AppVisibilitySchema,
  /** 台帳に行があるか（ないときは既定の「運営者だけ」） */
  stored: z.boolean(),
});

/** 台帳の1行の型。 */
export type AppSettingView = z.infer<typeof AppSettingView>;

/** 台帳（登録されたアプリごとに1行。登録の順）。 */
export const AppSettingList = z.object({
  /** 台帳の行 */
  apps: z.array(AppSettingView),
});

/** 台帳の型。 */
export type AppSettingList = z.infer<typeof AppSettingList>;

/** 公開の状態を変える入力。 */
export const AppSettingInput = z.strictObject({
  /** 新しい公開の状態 */
  visibility: AppVisibilitySchema,
});

/** 公開の状態を変える入力の型。 */
export type AppSettingInput = z.infer<typeof AppSettingInput>;
