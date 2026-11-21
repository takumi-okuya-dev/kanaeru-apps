// 退会の手順の booking の段（booking-001 research R11）。名簿は交流会の持ち主のデータで、消し方は外部キーに任せる：
// 交流会を指す外部キーは CASCADE（event の段が組織に入れていない交流会を消すと名簿も消える）・入れた人は SET NULL・
// 本人の申込みは CASCADE・列の対応の持ち主は CASCADE。知らせ（booking-002 research R22）：個人の公式アカウントの設定・その人の紐づけ・
// 連絡のメールアドレスも CASCADE。自前の申込み（booking-003 research R20）：本人の申込みと案内の同意も CASCADE。
// ここでは何も書かず、退会の確かめの中身だけを出す。
import type { WithdrawalStep } from "../../kernel/withdrawal.ts";
import { listPersonalEventIds } from "../event/index.ts";
import { countAccountEntries, countConsents } from "./apply-repository.ts";
import { hasPersonalChannel } from "./notify-repository.ts";
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
    const items: Awaited<ReturnType<WithdrawalStep["preview"]>> = [];
    if (count > 0) {
      items.push({
        kind: "delete",
        text: `組織に入れていない交流会の名簿（${count}人分）も一緒に消えます。`,
      });
    }
    if (await hasPersonalChannel(db, accountId)) {
      items.push({
        kind: "delete",
        text: "個人の LINE 公式アカウントとメールの設定（予約の知らせ）も一緒に消えます。",
      });
    }
    // 自分の申込み・案内の同意（booking-003 research R20）
    const entries = await countAccountEntries(db, accountId);
    const consents = await countConsents(db, accountId);
    if (entries > 0 || consents > 0) {
      items.push({
        kind: "delete",
        text: `あなたの予約の申込み（${entries}件）と案内の同意（${consents}件）も一緒に消えます。`,
      });
    }
    return items;
  },
};
