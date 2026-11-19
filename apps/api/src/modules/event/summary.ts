// 交流会の要約（ログインしていれば誰でも読める。AD-5）と、交流会の答えの形。
// 要約の窓口と、index.ts の getEventSummary（survey が開閉を・reception が参加費を読む。AD-6・AD-13）が同じものを使う。
import type {
  EventDiscountView,
  EventRole,
  EventSummary,
  EventView,
} from "@workspace/contracts/event";
import type { Executor } from "../../kernel/db.ts";
import type { DomainConfig } from "../../kernel/http.ts";
import { listActiveDiscounts } from "./discounts.ts";
import { isUuid } from "./ids.ts";
import { findEventById } from "./repository.ts";
import type { EventRecord } from "./repository.ts";

/**
 * 交流会の行を、要約の形にする。
 * @param config 領域の設定（openChatUrl）
 * @param record 交流会
 * @param discounts 使っている割引（作った順）
 * @returns 要約
 */
export function toEventSummary(
  config: Pick<DomainConfig, "openChatUrl">,
  record: EventRecord,
  discounts: EventDiscountView[],
): EventSummary {
  return {
    id: record.id,
    name: record.name,
    startsAt: record.startsAt.toISOString(),
    venue: record.venue,
    fee: record.fee,
    surveyOpen: record.surveyOpen,
    googleFormUrl: record.googleFormUrl,
    lineGroupUrl: record.lineGroupUrl,
    openChatUrl: config.openChatUrl ?? null,
    discounts,
  };
}

/**
 * 交流会の要約を読む（ほかの領域は index.ts から使う）。
 * @param db DB
 * @param config 領域の設定（openChatUrl。道の deps.config を渡す）
 * @param eventId 交流会の ID（uuid の形でなければ null）
 * @returns 要約。なければ null
 */
export async function getEventSummary(
  db: Executor,
  config: Pick<DomainConfig, "openChatUrl">,
  eventId: string,
): Promise<EventSummary | null> {
  if (!isUuid(eventId)) return null;
  const record = await findEventById(db, eventId);
  if (!record) return null;
  return toEventSummary(config, record, await listActiveDiscounts(db, record.id));
}

/**
 * 交流会の行を、主催者と受付係が読む形にする。
 * @param record 交流会
 * @param myRole 今の利用者の役目
 * @param discounts 使っている割引（作った順）
 * @returns 交流会
 */
export function toEventView(
  record: EventRecord,
  myRole: EventRole,
  discounts: EventDiscountView[],
): EventView {
  return {
    id: record.id,
    name: record.name,
    startsAt: record.startsAt.toISOString(),
    venue: record.venue,
    fee: record.fee,
    googleFormUrl: record.googleFormUrl,
    lineGroupUrl: record.lineGroupUrl,
    surveyOpen: record.surveyOpen,
    discounts,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    myRole,
  };
}
