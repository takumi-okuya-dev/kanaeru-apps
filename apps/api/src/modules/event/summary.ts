// 交流会の要約（ログインしていれば誰でも読める。AD-5）と、交流会の答えの形。
// 要約の窓口と、index.ts の getEventSummary（survey が開閉を・reception が参加費を読む。AD-6・AD-13）が同じものを使う。
import type {
  EventDiscountView,
  EventOrganizationView,
  EventOwnerView,
  EventRole,
  EventSummary,
  EventView,
} from "@workspace/contracts/event";
import type { Executor } from "../../kernel/db.ts";
import type { DomainConfig } from "../../kernel/http.ts";
import { findDisplayNames } from "../account/index.ts";
import { findOrganization } from "../suite/index.ts";
import { listActiveDiscounts, listActiveDiscountsByEvents } from "./discounts.ts";
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

/** 交流会の答えに添える、持ち主と組織（event-002）。 */
export type EventContext = {
  /** 持ち主（持ち主のない今の交流会は null） */
  owner: EventOwnerView | null;
  /** 入れた組織（入れていなければ null） */
  organization: EventOrganizationView | null;
  /** 今の利用者が持ち主か */
  isOwner: boolean;
};

/**
 * 交流会の行を、主催者と受付係が読む形にする。
 * @param record 交流会
 * @param myRole 今の利用者の役目
 * @param discounts 使っている割引（作った順）
 * @param context 持ち主と組織
 * @returns 交流会
 */
export function toEventView(
  record: EventRecord,
  myRole: EventRole,
  discounts: EventDiscountView[],
  context: EventContext,
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
    owner: context.owner,
    organization: context.organization,
    isOwner: context.isOwner,
  };
}

/** buildEventViews に渡す1行。 */
export type EventViewSource = {
  /** 交流会 */
  record: EventRecord;
  /** 入れた組織（入れていなければ null） */
  organizationId: string | null;
  /** 今の利用者の役目 */
  myRole: EventRole;
};

/**
 * 交流会の行を、持ち主の名前（account の findDisplayNames）・組織の名前（suite の findOrganization）・使っている割引と
 * 一緒に、答えの形にする（一覧も1件も同じ形。表は結ばない。AD-3）。
 * @param db DB
 * @param viewerAccountId 今の利用者
 * @param sources 交流会・入れた組織・役目の並び
 * @returns 交流会の並び（渡した順）
 */
export async function buildEventViews(
  db: Executor,
  viewerAccountId: string,
  sources: readonly EventViewSource[],
): Promise<EventView[]> {
  const discounts = await listActiveDiscountsByEvents(
    db,
    sources.map((source) => source.record.id),
  );
  const names = await findDisplayNames(
    db,
    sources.flatMap((source) =>
      source.record.ownerAccountId ? [source.record.ownerAccountId] : [],
    ),
  );
  const organizations = new Map<string, EventOrganizationView | null>();
  for (const source of sources) {
    const id = source.organizationId;
    if (!id || organizations.has(id)) continue;
    const found = await findOrganization(db, id);
    organizations.set(id, found ? { id: found.id, name: found.name } : null);
  }
  return sources.map(({ record, organizationId, myRole }) =>
    toEventView(record, myRole, discounts.get(record.id) ?? [], {
      owner: record.ownerAccountId
        ? { accountId: record.ownerAccountId, displayName: names.get(record.ownerAccountId) ?? "" }
        : null,
      organization: organizationId ? (organizations.get(organizationId) ?? null) : null,
      isOwner: record.ownerAccountId === viewerAccountId,
    }),
  );
}
