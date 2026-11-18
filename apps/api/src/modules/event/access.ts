// 交流会ごとの権限（構成の決めごと AD-5。research R1）。
// - 役目は「主催者（設定。どの交流会でも）」「受付係（event_staff。その交流会だけ）」「どちらでもない（null）」の3つ。
// - 要求のたびに DB を引く（セッションに写さない。外した受付係は次の要求から 403）。
// - reception・survey も、index.ts の requireEventRole・currentEventRole・getEventRole だけで確かめる。
import { EVENT_ERRORS } from "@workspace/contracts/event";
import type { EventRole } from "@workspace/contracts/event";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { ApiEnv, DomainConfig } from "../../kernel/http.ts";
import { currentAccount, isOrganizer } from "../account/index.ts";
import type { SessionAccount } from "../account/index.ts";
import { isUuid } from "./ids.ts";
import { findEventMembership } from "./repository.ts";

/** 文脈に今の役目を置く名前（event の中だけ。ほかの領域は currentEventRole で読む）。 */
const CONTEXT_KEY = "event.role";

/** 文脈の値の型（event の中だけ）。 */
type RoleEnv = { Variables: { [CONTEXT_KEY]: EventRole } };

/**
 * その account の、その交流会での役目を引く（要求のたびに呼ぶ。AD-5）。
 * @param db DB
 * @param config 領域の設定（organizerLineUserId。道の deps.config を渡す）
 * @param eventId 交流会の ID（uuid の形でなければ null）
 * @param account 今の利用者（currentAccount(c) の値）
 * @returns 主催者・受付係・どちらでもない（交流会がなければ null）
 */
export async function getEventRole(
  db: Executor,
  config: Pick<DomainConfig, "organizerLineUserId">,
  eventId: string,
  account: SessionAccount,
): Promise<EventRole | null> {
  const found = await lookupRole(db, config, eventId, account);
  return found.exists ? found.role : null;
}

/**
 * 交流会があるかと役目を引く。
 * @param db DB
 * @param config 領域の設定
 * @param eventId 交流会の ID
 * @param account 今の利用者
 * @returns あるか・役目
 */
async function lookupRole(
  db: Executor,
  config: Pick<DomainConfig, "organizerLineUserId">,
  eventId: string,
  account: SessionAccount,
): Promise<{ exists: boolean; role: EventRole | null }> {
  if (!isUuid(eventId)) return { exists: false, role: null };
  const membership = await findEventMembership(db, eventId, account.accountId);
  if (!membership) return { exists: false, role: null };
  if (isOrganizer(config, account)) return { exists: true, role: "organizer" };
  return { exists: true, role: membership.isStaff ? "staff" : null };
}

/**
 * 道の {eventId} の交流会で、決めた役目の人だけを通す middleware を作る（requireSession のあとに付ける）。
 * createRoute({ …, middleware: [requireSession(deps), requireEventRole(deps, ["organizer", "staff"])] as const })。
 * ID の形が違う・ない交流会は 404（NOT_FOUND）、役目が合わなければ 403（FORBIDDEN）。通した役目は currentEventRole(c) で読む。
 * @param deps 道の deps（db と config を使う）
 * @param deps.db DB
 * @param deps.config 領域の設定（organizerLineUserId）
 * @param roles 通す役目
 * @returns middleware
 */
export function requireEventRole(
  deps: { db: Db; config: Pick<DomainConfig, "organizerLineUserId"> },
  roles: readonly EventRole[],
) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const found = await lookupRole(
      deps.db,
      deps.config,
      c.req.param("eventId") ?? "",
      currentAccount(c),
    );
    if (!found.exists) throw new AppError(EVENT_ERRORS.NOT_FOUND);
    if (!found.role || !roles.includes(found.role)) throw new AppError(EVENT_ERRORS.FORBIDDEN);
    (c as unknown as Context<RoleEnv>).set(CONTEXT_KEY, found.role);
    await next();
  });
}

/**
 * requireEventRole が通した、今の利用者の役目を返す。
 * @param c 要求の文脈
 * @returns 主催者・受付係
 * @throws {Error} requireEventRole を付けていない道で呼んだとき（作りの誤り）
 */
export function currentEventRole(c: Context): EventRole {
  const value = (c as unknown as Context<RoleEnv>).get(CONTEXT_KEY) as EventRole | undefined;
  if (!value) {
    throw new Error("currentEventRole は requireEventRole を付けた道の中で呼んでください。");
  }
  return value;
}
