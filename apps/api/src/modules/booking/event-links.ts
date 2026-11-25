// 交流会の招待のリンクを絞る決まり（AD-5・AD-23。kernel/event-links.ts の形）。index.ts から eventLinkRestriction で出し、
// 組み立てが event の要約の窓口に渡す。見せる範囲が「部員だけ」（members）の交流会は、招待のリンク（Googleフォーム・LINEグループ）を
// 交流会の役目のある人（主催者・受付係・部員）だけに見せる（research R8。2026-11-21 主催者が決めた）。使い方（自前・名簿など）によらず、
// 見せる範囲だけで決める（申込みページの assertVisible と同じ）。
import type { EventLinkRestriction } from "../../kernel/event-links.ts";
import { findPageSetting } from "./apply-repository.ts";

/** 「部員だけ」の交流会の招待のリンクを絞る決まり。 */
export const bookingEventLinkRestriction: EventLinkRestriction = {
  async restrictsLinks(db, eventId) {
    return (await findPageSetting(db, eventId)).visibility === "members";
  },
};
