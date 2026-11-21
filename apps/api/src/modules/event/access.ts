// 交流会ごとの権限（構成の決めごと AD-5・AD-23。event-002）。判定はこのファイルの resolveEventAccess の1か所で行う。
// - 主催者：交流会の持ち主（event.owner_account_id）か、交流会を入れた組織（event_organization）の管理者・編集者
// - 受付係：event_staff（その交流会だけ。組織と関係ない）。主催者で受付係でもある人は主催者
// - 部員：交流会を入れた組織のメンバー（この版では管理の画面を使えない。予約〈booking〉が使う）
// - 要求のたびに DB を引く（セッションに写さない）。組織の役割は suite の index.ts から引く（AD-22）
// - 運営者（account の isOrganizer）は交流会の権限に使わない。持ち主のない今の交流会を運営者のものにする（research R1）ためだけに読む
// - reception・survey も、index.ts の requireEventRole・currentEventRole・getEventRole だけで確かめる
import { EVENT_ERRORS } from "@workspace/contracts/event";
import type { EventAccessRole } from "@workspace/contracts/event";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import type { ApiEnv, DomainConfig } from "../../kernel/http.ts";
import { currentAccount, isOrganizer } from "../account/index.ts";
import type { SessionAccount } from "../account/index.ts";
import { findMembership } from "../suite/index.ts";
import { isUuid } from "./ids.ts";
import { claimLegacyEvents, findEventAccessRow } from "./repository.ts";

/** 文脈に今の役目を置く名前（event の中だけ。ほかの領域は currentEventRole で読む）。 */
const CONTEXT_KEY = "event.role";

/** 文脈の値の型（event の中だけ）。 */
type RoleEnv = { Variables: { [CONTEXT_KEY]: EventAccessRole } };

/** 判定の結果（交流会があるときだけ）。 */
export type EventAccess = {
  /** 今の利用者の役目（どれでもなければ null） */
  role: EventAccessRole | null;
  /** 今の利用者が持ち主か */
  isOwner: boolean;
  /** 持ち主（持ち主のない今の交流会は null） */
  ownerAccountId: string | null;
  /** 入れた組織（入れていなければ null） */
  organizationId: string | null;
};

/**
 * 今の利用者の、その交流会での役目を決める（判定の1か所。要求のたびに呼ぶ）。
 * 持ち主のない今の交流会を運営者が開いたときは、先に運営者のものにする（research R1）。
 * @param db DB
 * @param config 領域の設定（organizerLineUserId。運営者の account を知るためだけ）
 * @param eventId 交流会の ID
 * @param account 今の利用者（currentAccount(c) の値）
 * @returns 判定の結果。交流会がない（ID の形が違うときも）なら null
 */
export async function resolveEventAccess(
  db: Executor,
  config: Pick<DomainConfig, "organizerLineUserId">,
  eventId: string,
  account: SessionAccount,
): Promise<EventAccess | null> {
  if (!isUuid(eventId)) return null;
  const row = await findEventAccessRow(db, eventId, account.accountId);
  if (!row) return null;
  let ownerAccountId = row.ownerAccountId;
  if (ownerAccountId === null && isOrganizer(config, account)) {
    await claimLegacyEvents(db, account.accountId);
    ownerAccountId = account.accountId;
  }
  const isOwner = ownerAccountId === account.accountId;
  const membership =
    row.organizationId && !isOwner
      ? await findMembership(db, row.organizationId, account.accountId)
      : null;
  const base = { isOwner, ownerAccountId, organizationId: row.organizationId };
  if (isOwner || membership?.role === "admin" || membership?.role === "editor") {
    return { ...base, role: "organizer" };
  }
  if (row.isStaff) return { ...base, role: "staff" };
  if (membership) return { ...base, role: "member" };
  return { ...base, role: null };
}

/**
 * その account の、その交流会での役目を引く（要求のたびに呼ぶ。AD-5）。
 * null は「交流会がない（ID の形が違うときも）」と「どの役目でもない」の両方で、見分けられない。
 * 道で 404（ない）と 403（権限がない）を分けるときは、これで決めずに requireEventRole を付ける。
 * @param db DB
 * @param config 領域の設定（道の deps.config を渡す）
 * @param eventId 交流会の ID
 * @param account 今の利用者（currentAccount(c) の値）
 * @returns "organizer"・"staff"・"member"。交流会がない・役目がないときは null
 */
export async function getEventRole(
  db: Executor,
  config: Pick<DomainConfig, "organizerLineUserId">,
  eventId: string,
  account: SessionAccount,
): Promise<EventAccessRole | null> {
  return (await resolveEventAccess(db, config, eventId, account))?.role ?? null;
}

/**
 * 道の {eventId} の交流会で、決めた役目の人だけを通す middleware を作る（requireSession のあとに付ける）。
 * createRoute({ …, middleware: [requireSession(deps), requireEventRole(deps, ["organizer", "staff"])] as const })。
 * ID の形が違う・ない交流会は 404（NOT_FOUND）、役目が合わなければ 403（FORBIDDEN）。通した役目は currentEventRole(c) で読む。
 * @param deps 道の deps（db と config を使う）
 * @param deps.db DB
 * @param deps.config 領域の設定
 * @param roles 通す役目（部員〈member〉も選べる）
 * @returns middleware
 */
export function requireEventRole(
  deps: { db: Db; config: Pick<DomainConfig, "organizerLineUserId"> },
  roles: readonly EventAccessRole[],
) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const access = await resolveEventAccess(
      deps.db,
      deps.config,
      c.req.param("eventId") ?? "",
      currentAccount(c),
    );
    if (!access) throw new AppError(EVENT_ERRORS.NOT_FOUND);
    if (!access.role || !roles.includes(access.role)) throw new AppError(EVENT_ERRORS.FORBIDDEN);
    (c as unknown as Context<RoleEnv>).set(CONTEXT_KEY, access.role);
    await next();
  });
}

/**
 * requireEventRole が通した、今の利用者の役目を返す。
 * @param c 要求の文脈
 * @returns 主催者・受付係・部員
 * @throws {Error} requireEventRole を付けていない道で呼んだとき（作りの誤り）
 */
export function currentEventRole(c: Context): EventAccessRole {
  const value = (c as unknown as Context<RoleEnv>).get(CONTEXT_KEY) as EventAccessRole | undefined;
  if (!value) {
    throw new Error("currentEventRole は requireEventRole を付けた道の中で呼んでください。");
  }
  return value;
}
