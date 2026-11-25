// 試合表と受付の交流会のつながり（名簿を入れた交流会。AD-25・match-006 の入れる窓口・match-007）。
// - 入れてよいか（canImportEvent）：受付アプリが見え、今の利用者が交流会の主催者で、交流会と試合表の持ち主が同じ（同じ組織に
//   入れたか、どちらも組織に入れず持ち主が同じ人。AD-23 の組織ごとに閉じる）とき。入れる窓口と、中身を送ったときに
//   match_table.event_id を書くときの両方がここで決める（match-006 research R8）
// - 見せ方（resolveReceptionLinks）：名前と日時は中身の写し（content.receptionEvent）。受付アプリで開くリンクは、つないだ交流会
//   （event_id）が写しの交流会と同じで、今の利用者がその交流会の主催者か受付係で、受付アプリが見えるときだけ出す
// - 交流会のことは event・suite の index.ts からだけ読む（AD-3）。見るだけのページ・電波なしで渡す QR には出さない（AD-26）
import { MatchReceptionSource } from "@workspace/contracts/match";
import type { MatchReceptionEventLink } from "@workspace/contracts/match";
import type { Executor } from "../../kernel/db.ts";
import type { DomainConfig } from "../../kernel/http.ts";
import { isOrganizer } from "../account/index.ts";
import type { SessionAccount } from "../account/index.ts";
import { findEventOrganizationId, findEventOwnerAccountId, getEventRole } from "../event/index.ts";
import { isAppVisible } from "../suite/index.ts";

/** 交流会を持つアプリの key（試合表のアプリの uses。AD-15・AD-25）。 */
export const RECEPTION_APP_KEY = "reception";

/** 受付アプリで交流会を開ける役目（一覧画面 /admin/events/{eventId} は主催者と受付係が開ける）。 */
const OPENING_ROLES: readonly string[] = ["organizer", "staff"];

/** 交流会の判定に要る設定。 */
type EventConfig = Pick<DomainConfig, "organizerLineUserId">;

/** 試合表の持ち主（組織に入れていれば組織）。 */
type TableHolder = {
  /** 試合表を入れた組織（なければ null） */
  organizationId: string | null;
  /** 試合表の持ち主 */
  ownerAccountId: string;
};

/**
 * 受付アプリが今の利用者に見えるか（AD-16）。
 * @param db DB
 * @param config 領域の設定
 * @param account 今の利用者
 * @returns 見えれば true
 */
export function receptionVisible(
  db: Executor,
  config: EventConfig,
  account: SessionAccount,
): Promise<boolean> {
  return isAppVisible(db, RECEPTION_APP_KEY, { isOperator: isOrganizer(config, account) });
}

/**
 * 交流会と試合表の持ち主が同じか（同じ組織に入れたか、どちらも組織に入れず持ち主が同じ人）。
 * @param db DB
 * @param eventId 交流会の ID
 * @param holder 試合表の持ち主
 * @returns 同じなら true
 */
async function sameHolder(db: Executor, eventId: string, holder: TableHolder): Promise<boolean> {
  const organizationId = await findEventOrganizationId(db, eventId);
  if (organizationId || holder.organizationId) return organizationId === holder.organizationId;
  return (await findEventOwnerAccountId(db, eventId)) === holder.ownerAccountId;
}

/**
 * 今の利用者が、この試合表にこの交流会の名簿を入れてよいか（受付アプリが見え・交流会の主催者で・持ち主が同じ）。
 * ない交流会・ID の形が違うときも false。
 * @param db DB
 * @param config 領域の設定
 * @param account 今の利用者
 * @param eventId 交流会の ID
 * @param holder 試合表の持ち主（権限を確かめた試合表）
 * @returns 入れてよければ true
 */
export async function canImportEvent(
  db: Executor,
  config: EventConfig,
  account: SessionAccount,
  eventId: string,
  holder: TableHolder,
): Promise<boolean> {
  if (!(await receptionVisible(db, config, account))) return false;
  if ((await getEventRole(db, config, eventId, account)) !== "organizer") return false;
  // 組織ごとに閉じる（AD-23）：ほかの組織・個人の交流会の名簿と account を、別の持ち主の試合表に写さない（research R8）
  return sameHolder(db, eventId, holder);
}

/** 見せ方を決める試合表の行（中身の写しと、つないだ交流会）。 */
export type ReceptionLinkRow = {
  /** 中身の receptionEvent（形を確かめる前の DB の値。なければ undefined か null） */
  source: unknown;
  /** つないだ交流会（match_table.event_id） */
  linkedEventId: string | null;
};

/**
 * 試合表の行ごとに、名簿を入れた受付の交流会の見せ方を決める（受付アプリが見えるかは1度だけ、役目は交流会ごとに1度だけ引く）。
 * @param db DB
 * @param config 領域の設定
 * @param account 今の利用者
 * @param rows 試合表の行
 * @returns 行ごとの見せ方（受付の交流会から入れていなければ null）
 */
export async function resolveReceptionLinks(
  db: Executor,
  config: EventConfig,
  account: SessionAccount,
  rows: readonly ReceptionLinkRow[],
): Promise<(MatchReceptionEventLink | null)[]> {
  const sources = rows.map((row) => {
    const parsed = MatchReceptionSource.safeParse(row.source);
    return parsed.success ? parsed.data : null;
  });
  const linked = new Set(
    rows.flatMap((row, index) =>
      row.linkedEventId && row.linkedEventId === sources[index]?.eventId ? [row.linkedEventId] : [],
    ),
  );
  const openable = new Set<string>();
  if (linked.size > 0 && (await receptionVisible(db, config, account))) {
    for (const eventId of linked) {
      const role = await getEventRole(db, config, eventId, account);
      if (role && OPENING_ROLES.includes(role)) openable.add(eventId);
    }
  }
  return sources.map((source, index) =>
    source
      ? {
          eventId: source.eventId,
          name: source.name,
          startsAt: source.startsAt,
          canOpen: rows[index]?.linkedEventId === source.eventId && openable.has(source.eventId),
        }
      : null,
  );
}
