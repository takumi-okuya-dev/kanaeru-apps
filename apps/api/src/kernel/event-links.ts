// 交流会の招待のリンク（Googleフォーム・LINEグループ）を、交流会の役目のある人だけに絞る決まりの形（AD-5・AD-23）。
// 絞るかを決める領域（booking の「部員だけ」の回）が自分の index.ts から eventLinkRestriction（この形）を出し、
// 組み立て（app.ts）が並べて event に渡す（deps.eventLinkRestrictions）。event の参加者向けの要約の窓口だけが使う。
// event は booking を読めない（依存は booking → reception → event の一方向）ので、退会の手順（kernel/withdrawal.ts）と同じく
// 向きを組み立てで逆にする。決まりは要求のたびに引き、写さない（AD-5）。
import type { Executor } from "./db.ts";

/** 領域が出す、交流会の招待のリンクを絞る決まり。 */
export type EventLinkRestriction = {
  /**
   * その交流会の招待のリンクを、交流会の役目のある人（主催者・受付係・部員）だけに見せるか。書きこまない。
   * @param db DB
   * @param eventId 交流会の ID（uuid の形を確かめたあと）
   * @returns 絞るなら true
   */
  restrictsLinks: (db: Executor, eventId: string) => Promise<boolean>;
};
