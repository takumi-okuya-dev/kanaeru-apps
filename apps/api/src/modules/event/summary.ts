// 交流会の要約（ログインしていれば誰でも読める。AD-5）と、交流会の答えの形。
// 要約の窓口と、index.ts の getEventSummary（survey が開閉を・reception が参加費を読む。AD-6・AD-13）が同じものを使う。
import type { EventRole, EventSummary, EventView } from "@workspace/contracts/event";
import type { Executor } from "../../kernel/db.ts";
import type { DomainConfig } from "../../kernel/http.ts";
import { isUuid } from "./ids.ts";
import { findEventById } from "./repository.ts";
import type { EventRecord } from "./repository.ts";

/**
 * 交流会の行を、要約の形にする。
 * @param config 領域の設定（openChatUrl）
 * @param record 交流会
 * @returns 要約
 */
export function toEventSummary(
  config: Pick<DomainConfig, "openChatUrl">,
  record: EventRecord,
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
  return record ? toEventSummary(config, record) : null;
}

/**
 * 交流会の行を、主催者と受付係が読む形にする。
 * @param record 交流会
 * @param myRole 今の利用者の役目
 * @returns 交流会
 */
export function toEventView(record: EventRecord, myRole: EventRole): EventView {
  return {
    id: record.id,
    name: record.name,
    startsAt: record.startsAt.toISOString(),
    venue: record.venue,
    fee: record.fee,
    googleFormUrl: record.googleFormUrl,
    lineGroupUrl: record.lineGroupUrl,
    surveyOpen: record.surveyOpen,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    myRole,
  };
}
