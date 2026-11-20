// 道の文脈の型と、領域の道に土台が渡す道具の型、領域の道で共に使う手伝い（道の値の形・よく使うエラーの応答・CSV を返すヘッダー）。
// 組み立て（app.ts）と領域（modules/<領域>/）が同じ型を使う。領域は組み立てを読めない（境界の決まり）ので、ここに置く。
import { z } from "@hono/zod-openapi";
import { jstDate } from "@workspace/contracts/core";
import type { AppDefinition } from "@workspace/contracts/core";
import type { SecretBox } from "@workspace/secret-box";
import type { RequestIdVariables } from "hono/request-id";
import type { Config } from "./config.ts";
import type { Db } from "./db.ts";
import { errorResponse } from "./errors.ts";
import type { DomainFeatures } from "./features.ts";
import type { MetaApp } from "./meta-app.ts";
import type { Logger } from "./logger.ts";
import type { RegisteredWithdrawalStep } from "./withdrawal.ts";

/** 道の文脈の型（要求ごとの値）。 */
export type ApiEnv = { Variables: RequestIdVariables };

/**
 * 設定のうち、領域が読んでよい値（秘密を含まない。DB の接続先などは渡さない）。
 * 環境の名前（appEnv）は渡さない（環境の名前でふるまいを分けないため。docs/rules/coding.md 2）。
 */
export type DomainConfig = Readonly<
  Pick<
    Config,
    | "webUrl"
    | "lineChannelIds"
    | "organizerLineUserId"
    | "openChatUrl"
    | "testLoginEnabled"
    | "threadsApiBaseUrl"
  >
>;

/** 領域の道を作るときに、土台が渡す道具。設定のまるごとは渡さない。 */
export type DomainRouteDeps = {
  /** DB */
  db: Db;
  /** ログ（要求と応答の本文・利用者の入れた値は出さない） */
  logger: Logger;
  /** 領域の機能の印（設定 DOMAIN_FEATURES。enabled("<領域>.<名前>")。既定はどれも切） */
  features: DomainFeatures;
  /** 設定のうち、領域が読んでよい値（秘密を含まない） */
  config: DomainConfig;
  /** 外のサービス（LINE など）への HTTP の出口。テストでは差しかえる（既定は外へ出ない） */
  fetch: typeof fetch;
  /**
   * 秘密の箱（外のサービスのトークンを DB に持つ前に包む。AES-256-GCM。鍵の値は渡さない）。
   * 設定 TOKEN_ENCRYPTION_KEYS がなければ undefined（トークンを持つ機能は「準備ができていない」と断る）
   */
  secretBox: SecretBox | undefined;
  /**
   * 定期の仕事（Cloud Scheduler）からの要求かを確かめる（見出し Authorization: Bearer <JOB_TRIGGER_SECRET>）。
   * 合言葉の設定がなければ、いつも false（定期の仕事の窓口は断る）。合言葉の値は渡さない
   */
  isJobRequest: (authorization: string | undefined) => boolean;
  /**
   * アプリの Meta のアプリ（OAuth の接続・Meta の Webhook の署名の確かめ。秘密の値は渡さない）。
   * 設定 THREADS_APP_ID・THREADS_APP_SECRET がなければ undefined（その機能は使えない）。手で組み立てるテストは書かなくてよい
   */
  metaApp?: MetaApp | undefined;
  /** 登録されたアプリ（apps.list.ts の順。テストでは組み立ての extraApps も足す。suite の台帳が読む。AD-15） */
  apps: readonly AppDefinition[];
  /**
   * 退会の手順（組み立てが各領域の withdrawal を「共通 → アプリの一覧の順」に並べたもの。account の退会の窓口だけが使う。AD-22）。
   * 手で組み立てるテストは書かなくてよい（なければ手順なし）
   */
  withdrawalSteps?: readonly RegisteredWithdrawalStep[];
};

/**
 * 道の値の形（uuid の形の ID）。形が合わなければ、組み立ての入力の確かめ（app.ts の defaultHook）が、
 * 道の値の誤りとして、ないときと同じ 404（NOT_FOUND）にする（DB を読まない。各処理で形を確かめなくてよい）。
 * @param name 道の名前
 * @param description 説明
 * @returns zod の形
 */
export function uuidParam(name: string, description: string) {
  return z.guid().openapi({ param: { name, in: "path" }, format: "uuid", description });
}

/** 404 の応答。 */
export const notFoundResponse = errorResponse("NOT_FOUND", "ない（消した・ID が違う）");

/** 400 の応答。 */
export const invalidInputResponse = errorResponse(
  "INVALID_INPUT",
  "入力が合わない（欄ごとの理由）",
);

/** CSV のファイル名の頭に使える形（英小文字・数字・-。ヘッダーに差しこまれないように）。 */
const CSV_BASENAME_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * CSV を添付として返すヘッダー（`c.body(csv, 200, csvAttachment("participants"))`）。ファイル名は `<名前>-<日本時間の日付>.csv`。
 * @param basename ファイル名の頭（英小文字・数字・-）
 * @param now 今の時刻（日付を決める。テストで固定する）
 * @returns ヘッダー（種類と添付）
 * @throws {RangeError} 使えない名前のとき
 */
export function csvAttachment(basename: string, now: Date = new Date()): Record<string, string> {
  if (!CSV_BASENAME_FORMAT.test(basename)) {
    throw new RangeError("CSV のファイル名の頭は、英小文字・数字・- で書いてください。");
  }
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${basename}-${jstDate(now)}.csv"`,
  };
}
