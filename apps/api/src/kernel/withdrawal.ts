// 退会の手順の形（AD-22。PRD 組織 FR-O36・O20）。各領域は自分の index.ts から withdrawal（この形）を出し、
// 組み立て（app.ts）が「共通（suite）を先、アプリを一覧の順」に並べて、account の退会の窓口に渡す。
// account はほかの領域を知らずに、渡された手順を順に呼んでからアカウントを消す。領域をまたぐトランザクションは作らない。
// 各段は自分の領域の中で終わり、2回流しても同じ結果になる形にする（途中で止まっても、退会をもう一度押せば続きから終わる）。
import type { WithdrawalItem } from "@workspace/contracts/account";
import type { Db } from "./db.ts";

/** 領域が出す退会の手順。 */
export type WithdrawalStep = {
  /**
   * 退会の前の手順（アカウントを消す前に流す。2回流しても同じ結果にする）。
   * @param db DB
   * @param accountId 退会する人
   */
  prepare: (db: Db, accountId: string) => Promise<void>;
  /**
   * 退会の確かめの中身（引き継がれるもの・消えるもの。文は日本語）。書きこまない。
   * @param db DB
   * @param accountId 退会する人
   * @returns 確かめの中身（出すものがなければ空。source は組み立てが付ける）
   */
  preview: (db: Db, accountId: string) => Promise<Omit<WithdrawalItem, "source">[]>;
};

/** 組み立てが並べた退会の手順（領域の名前と、属するアプリの名前つき）。 */
export type RegisteredWithdrawalStep = WithdrawalStep & {
  /** 領域の名前 */
  domain: string;
  /** 確かめの中身に出す名前（属するアプリの名前。共通の領域は「スイート」） */
  source: string;
};
