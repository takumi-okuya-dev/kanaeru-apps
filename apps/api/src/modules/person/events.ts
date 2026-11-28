// 会った場に選べる PaletKit の交流会（specs/person/002-event-meetings/research.md R1・R3。AD-31）。
// 選べる会の条件は、ここの selectableEvents の1か所だけに置く。候補の窓口（listEventCandidates）と、交流会から作る窓口の
// 確かめ直し（findSelectableEvent）の両方がこれを使い、条件が食い違わないようにする。
// - 受付アプリが使う人に見えなければ、選べる会はない（suite の isAppVisible。AD-15・AD-16）
// - 使う人が自分のアカウントでチェックインした会（reception の listCheckedInEventIds）と、持ち主か受付係の会を、
//   名前と始まりだけで読む（event の listAccountEventSummaries。組織の役割は数えない）
// - 今日（日本時間）の終わりまでに始まる会を、始まりの新しい順に最大50件
// 読むのは交流会の ID・名前・始まりだけ。チェックインの中身・ほかの参加者・名簿を読む関数は使わない（PRD FR-P8・AD-31）。
// 選べる会は人物メモに残さない（画面を開くたびに読む）。ログは書かない。
import { endOfJstDate, jstDate } from "@workspace/contracts/core";
import { PERSON_EVENT_CANDIDATE_MAX } from "@workspace/contracts/person";
import type { EventCandidateList } from "@workspace/contracts/person";
import type { Executor } from "../../kernel/db.ts";
import type { DomainConfig } from "../../kernel/http.ts";
import { isOrganizer } from "../account/index.ts";
import type { SessionAccount } from "../account/index.ts";
import { listAccountEventSummaries } from "../event/index.ts";
import { listCheckedInEventIds } from "../reception/index.ts";
import { isAppVisible } from "../suite/index.ts";
import { meetingIdsByEvent } from "./repository.ts";

/** 交流会を持つアプリの key（人物メモの uses。AD-15）。 */
const RECEPTION_APP_KEY = "reception";

/** 選べる会を決めるのに要るもの。 */
export type EventSourceDeps = {
  /** DB */
  db: Executor;
  /** 領域の設定（受付アプリが運営者だけのとき、運営者かを見る） */
  config: Pick<DomainConfig, "organizerLineUserId">;
};

/** 選べる交流会（名前と始まりだけ）。 */
export type SelectableEvent = {
  /** 交流会の ID */
  eventId: string;
  /** 交流会の今の名前 */
  name: string;
  /** 始まり */
  startsAt: Date;
};

/**
 * 使う人が会った場に選べる交流会（今日〈日本時間〉の終わりまでに始まるもの・始まりの新しい順・最大50件）。
 * @param deps db と config
 * @param account 今の利用者
 * @param now 今の時刻（テストで替える）
 * @returns 受付アプリが見えるか（available）と、選べる会の並び（見えなければ空）
 */
async function selectableEvents(
  deps: EventSourceDeps,
  account: SessionAccount,
  now: Date,
): Promise<{ available: boolean; events: SelectableEvent[] }> {
  const viewer = { isOperator: isOrganizer(deps.config, account) };
  if (!(await isAppVisible(deps.db, RECEPTION_APP_KEY, viewer))) {
    return { available: false, events: [] };
  }
  // listAccountEventSummaries は渡した ID の会を確かめずに返すので、チェックインした会の ID だけを渡す
  const checkedIn = await listCheckedInEventIds(deps.db, account.accountId);
  const summaries = await listAccountEventSummaries(deps.db, account.accountId, checkedIn);
  const end = endOfJstDate(now).getTime();
  // 並びは event の関数が始まりの新しい順にしてある
  const events = summaries
    .filter((summary) => summary.startsAt.getTime() < end)
    .slice(0, PERSON_EVENT_CANDIDATE_MAX)
    .map(({ eventId, name, startsAt }) => ({ eventId, name, startsAt }));
  return { available: true, events };
}

/**
 * 会った場の画面に出す、選べる交流会の一覧（作った会には、その会った場の ID を付ける）。
 * @param deps db と config
 * @param account 今の利用者
 * @param now 今の時刻（テストで替える）
 * @returns 一覧
 */
export async function listEventCandidates(
  deps: EventSourceDeps,
  account: SessionAccount,
  now: Date = new Date(),
): Promise<EventCandidateList> {
  const { available, events } = await selectableEvents(deps, account, now);
  const meetings = await meetingIdsByEvent(
    deps.db,
    account.accountId,
    events.map((event) => event.eventId),
  );
  return {
    available,
    items: events.map((event) => ({
      eventId: event.eventId,
      name: event.name,
      metOn: jstDate(event.startsAt),
      meetingId: meetings.get(event.eventId) ?? null,
    })),
  };
}

/**
 * 送られた交流会が、今、使う人に選べるかを確かめ直す（候補の一覧と同じ条件。AD-31）。
 * @param deps db と config
 * @param account 今の利用者
 * @param eventId 送られた交流会の ID
 * @param now 今の時刻（テストで替える）
 * @returns 選べる会（選べない・ない・受付アプリが見えなければ undefined）
 */
export async function findSelectableEvent(
  deps: EventSourceDeps,
  account: SessionAccount,
  eventId: string,
  now: Date = new Date(),
): Promise<SelectableEvent | undefined> {
  const { events } = await selectableEvents(deps, account, now);
  // DB は uuid を小文字で返す（送られた ID は大文字でも同じ会）
  const wanted = eventId.toLowerCase();
  return events.find((event) => event.eventId === wanted);
}
