// チェックインの行を、答えの形にする（参加者の自分のチェックイン・一覧画面の行）。
// 一覧の行には、手で入れた人の表示名（account の findAccountById で引く。写さない。research R2）と、
// 同じ名前の印（約束の normalizeCheckinName で比べる。research R4）を付ける。
import type { CheckinView, MyCheckin } from "@workspace/contracts/reception";
import { normalizeCheckinName } from "@workspace/contracts/reception";
import type { Executor } from "../../kernel/db.ts";
import { findAccountById } from "../account/index.ts";
import type { CheckinRecord } from "./repository.ts";

/**
 * チェックインを、参加者が読む形にする。
 * @param record チェックイン
 * @returns 自分のチェックイン
 */
export function toMyCheckin(record: CheckinRecord): MyCheckin {
  return {
    id: record.id,
    name: record.name,
    applicationSource: record.applicationSource,
    referral: record.referral,
    paymentMethod: record.paymentMethod,
    amount: record.amount,
    checkedInAt: record.createdAt.toISOString(),
  };
}

/**
 * 同じ名前の印を付ける行の ID（そろえた名前が同じ行が2つ以上あり、その中に手でのチェックインがあるとき、その全部）。
 * @param records その交流会のチェックイン
 * @returns 印を付ける行の ID
 */
export function sameNameIds(records: readonly CheckinRecord[]): Set<string> {
  const groups = new Map<string, CheckinRecord[]>();
  for (const record of records) {
    const key = normalizeCheckinName(record.name);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const flagged = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2 || !group.some((record) => record.accountId === null)) continue;
    for (const record of group) flagged.add(record.id);
  }
  return flagged;
}

/**
 * 手で入れた人の表示名を引く（同じ人は1回だけ引く。アカウントが消えていれば入らない）。
 * @param db DB
 * @param records チェックイン
 * @returns account の ID から表示名
 */
export async function enteredByNames(
  db: Executor,
  records: readonly CheckinRecord[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(records.flatMap((record) => (record.enteredBy ? [record.enteredBy] : []))),
  ];
  const names = new Map<string, string>();
  for (const id of ids) {
    const found = await findAccountById(db, id);
    if (found) names.set(id, found.displayName);
  }
  return names;
}

/**
 * チェックインを、一覧画面の行にする。
 * @param record チェックイン
 * @param names 手で入れた人の表示名（enteredByNames）
 * @param flagged 同じ名前の印を付ける行の ID（sameNameIds）
 * @returns 一覧画面の行
 */
export function toCheckinView(
  record: CheckinRecord,
  names: ReadonlyMap<string, string>,
  flagged: ReadonlySet<string>,
): CheckinView {
  return {
    ...toMyCheckin(record),
    method: record.accountId === null ? "manual" : "line",
    accountId: record.accountId,
    enteredByName: record.enteredBy ? (names.get(record.enteredBy) ?? null) : null,
    sameName: flagged.has(record.id),
  };
}
