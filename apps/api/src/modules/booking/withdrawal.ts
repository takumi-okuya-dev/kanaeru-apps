// 退会の手順の booking の段（booking-001 research R11）。名簿は交流会の持ち主のデータで、消し方は外部キーに任せる：
// 交流会を指す外部キーは CASCADE（event の段が組織に入れていない交流会を消すと名簿も消える）・入れた人は SET NULL・
// 本人の申込みは CASCADE・列の対応の持ち主は CASCADE。ここでは何も書かず、退会の確かめの中身だけを出す。
import type { WithdrawalStep } from "../../kernel/withdrawal.ts";
import { listPersonalEventIds } from "../event/index.ts";
import { countEntriesOfEvents } from "./repository.ts";

/** booking の退会の手順。 */
export const bookingWithdrawal: WithdrawalStep = {
  /**
   * 前の手順はない（外部キーが消す）。
   * @returns 終わり
   */
  prepare: () => Promise.resolve(),
  /**
   * 退会の確かめの中身（組織に入れていない交流会の名簿が消えること）。
   * @param db DB
   * @param accountId 退会する人
   * @returns 確かめの中身
   */
  preview: async (db, accountId) => {
    const count = await countEntriesOfEvents(db, await listPersonalEventIds(db, accountId));
    if (count === 0) return [];
    return [
      {
        kind: "delete",
        text: `組織に入れていない交流会の名簿（${count}人分）も一緒に消えます。`,
      },
    ];
  },
};
