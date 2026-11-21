// 試合表の読み書き（match の表だけを触る。AD-3）。組織の名前と役割は suite の index.ts から読む（AD-22）。
// 90日を過ぎた試合表は、運営が一覧を開いたときと試合表を作ったときに、その持ち主の古いものをまとめて消す（AD-25。定期の仕事は
// 足さない。原則 V）。
import { INITIAL_CONTENT, MATCH_ERRORS, MatchTableContent } from "@workspace/contracts/match";
import type { MatchTable, MatchTableSummary } from "@workspace/contracts/match";
import { jstDate } from "@workspace/contracts/core";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { listMemberships } from "../suite/index.ts";
import { EDITING_ROLES } from "./access.ts";
import type { TableAccess } from "./access.ts";
import { matchTable, matchTableOrganization } from "./schema.ts";
import { linkStateOf } from "./share-repository.ts";

/** 試合の日から消すまでの日数（AD-25【仮決め】）。 */
export const RETENTION_DAYS = 90;

/**
 * 日本時間の日付から日数を引く。
 * @param date 日付（YYYY-MM-DD）
 * @param days 引く日数
 * @returns 日付（YYYY-MM-DD）
 */
function minusDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) - days * 24 * 60 * 60 * 1000;
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * 持ち主の、試合の日から90日を過ぎた試合表を消す（受付の行・組織に入れる行も外部キーで消える）。
 * @param db DB
 * @param ownerAccountId 持ち主
 * @param now 今の時刻（日本時間の日付を決める。テストで固定する）
 * @returns 消した数
 */
export async function deleteExpiredTables(
  db: Executor,
  ownerAccountId: string,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = minusDays(jstDate(now), RETENTION_DAYS);
  const deleted = await db
    .delete(matchTable)
    .where(and(eq(matchTable.ownerAccountId, ownerAccountId), lt(matchTable.playDate, cutoff)))
    .returning({ id: matchTable.id });
  return deleted.length;
}

/** 今の利用者の組織の名前と役割。 */
type MembershipIndex = Map<string, { name: string; canEdit: boolean }>;

/**
 * 今の利用者が入っている組織を、ID から引ける形にする。
 * @param db DB
 * @param accountId 今の利用者
 * @returns 組織の ID → 名前と、試合表を直せる役割か
 */
async function membershipIndex(db: Executor, accountId: string): Promise<MembershipIndex> {
  const memberships = await listMemberships(db, accountId);
  return new Map(
    memberships.map((membership) => [
      membership.organizationId,
      { name: membership.organizationName, canEdit: EDITING_ROLES.includes(membership.role) },
    ]),
  );
}

/**
 * 今の利用者が開ける試合表の一覧（自分が持ち主のものと、管理者・編集者の組織に入れたもの。試合の日の新しい順）。
 * @param db DB
 * @param accountId 今の利用者
 * @returns 一覧の行
 */
export async function listTables(db: Executor, accountId: string): Promise<MatchTableSummary[]> {
  const organizations = await membershipIndex(db, accountId);
  const editable = [...organizations].filter(([, value]) => value.canEdit).map(([id]) => id);
  const rows = await db
    .select({
      id: matchTable.id,
      name: matchTable.name,
      playDate: matchTable.playDate,
      ownerAccountId: matchTable.ownerAccountId,
      organizationId: matchTableOrganization.organizationId,
      updatedAt: matchTable.updatedAt,
    })
    .from(matchTable)
    .leftJoin(matchTableOrganization, eq(matchTableOrganization.matchTableId, matchTable.id))
    .where(
      editable.length > 0
        ? or(
            eq(matchTable.ownerAccountId, accountId),
            inArray(matchTableOrganization.organizationId, editable),
          )
        : eq(matchTable.ownerAccountId, accountId),
    )
    .orderBy(desc(matchTable.playDate), desc(matchTable.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    playDate: row.playDate,
    organization: row.organizationId
      ? { id: row.organizationId, name: organizations.get(row.organizationId)?.name ?? "" }
      : null,
    isOwner: row.ownerAccountId === accountId,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * 試合表を作る（作った端末が担当の端末。くじの種は乱数。中身は名簿なしの既定）。
 * @param db DB（トランザクション）
 * @param input 持ち主・名前・試合の日・入れる組織・端末・くじの種
 * @param input.ownerAccountId 持ち主
 * @param input.name 名前
 * @param input.playDate 試合の日
 * @param input.organizationId 入れる組織（なければ null。持ち主が入っていることは呼ぶ側が確かめる）
 * @param input.deviceId 作った端末
 * @param input.seed くじの種
 * @returns 試合表の ID
 */
export async function insertTable(
  db: Executor,
  input: {
    ownerAccountId: string;
    name: string;
    playDate: string;
    organizationId: string | null;
    deviceId: string;
    seed: number;
  },
): Promise<string> {
  const [row] = await db
    .insert(matchTable)
    .values({
      ownerAccountId: input.ownerAccountId,
      name: input.name,
      playDate: input.playDate,
      content: INITIAL_CONTENT,
      editorDeviceId: input.deviceId,
      seed: input.seed,
    })
    .returning({ id: matchTable.id });
  if (!row) throw new Error("試合表を作れませんでした。");
  if (input.organizationId) {
    await db.insert(matchTableOrganization).values({
      matchTableId: row.id,
      organizationId: input.organizationId,
      ownerAccountId: input.ownerAccountId,
    });
  }
  return row.id;
}

/** 書くときに読む試合表の欄（版・担当の端末・最後の変更）。 */
export type TableState = {
  /** 版の番号 */
  version: number;
  /** 担当の端末 */
  editorDeviceId: string | null;
  /** 最後に受けた変更の ID */
  lastChangeId: string | null;
};

/**
 * 書くときに読む試合表の欄（requireTableAccess で行を押さえたあとに読む）。
 * @param db DB（トランザクション）
 * @param tableId 試合表の ID
 * @returns 版・担当の端末・最後の変更（なければ undefined）
 */
export async function readTableState(
  db: Executor,
  tableId: string,
): Promise<TableState | undefined> {
  const [row] = await db
    .select({
      version: matchTable.version,
      editorDeviceId: matchTable.editorDeviceId,
      lastChangeId: matchTable.lastChangeId,
    })
    .from(matchTable)
    .where(eq(matchTable.id, tableId));
  return row;
}

/**
 * 中身を書き、版を1つ上げる（担当の端末と版は呼ぶ側が確かめる）。
 * @param db DB（トランザクション）
 * @param tableId 試合表の ID
 * @param input 中身・くじの種・変更の ID・今の版
 * @param input.content 中身（約束で確かめたもの）
 * @param input.seed くじの種
 * @param input.changeId 変更の ID
 * @param input.version 今の版
 */
export async function writeContent(
  db: Executor,
  tableId: string,
  input: { content: MatchTableContent; seed: number; changeId: string; version: number },
): Promise<void> {
  await db
    .update(matchTable)
    .set({
      content: input.content,
      seed: input.seed,
      lastChangeId: input.changeId,
      version: input.version + 1,
    })
    .where(eq(matchTable.id, tableId));
}

/**
 * 担当の端末を替える（版は上げない。中身は変わらないため）。
 * @param db DB
 * @param tableId 試合表の ID
 * @param deviceId 新しい担当の端末
 */
export async function setEditorDevice(db: Executor, tableId: string, deviceId: string) {
  await db.update(matchTable).set({ editorDeviceId: deviceId }).where(eq(matchTable.id, tableId));
}

/**
 * 試合表を消す（受付の行・組織に入れる行も外部キーで消える）。
 * @param db DB
 * @param tableId 試合表の ID
 */
export async function deleteTable(db: Executor, tableId: string): Promise<void> {
  await db.delete(matchTable).where(eq(matchTable.id, tableId));
}

/**
 * 試合表を中身つきで読む（権限は呼ぶ側が確かめる）。
 * 中身は書くときに約束で確かめているが、読むときも約束で読み直す（形が合わなければ止める）。
 * @param db DB
 * @param access 権限を確かめた試合表
 * @param accountId 今の利用者
 * @returns 試合表
 * @throws {AppError} 行がないとき（確かめたあとに消えたとき。MATCH_NOT_FOUND）
 * @throws {Error} 中身の形が合わないとき
 */
export async function readTable(
  db: Executor,
  access: TableAccess,
  accountId: string,
): Promise<MatchTable> {
  const [row] = await db.select().from(matchTable).where(eq(matchTable.id, access.tableId));
  if (!row) throw new AppError(MATCH_ERRORS.NOT_FOUND);
  const parsed = MatchTableContent.safeParse(row.content);
  // 形の合わない中身を既定に置きかえて返すと、次の送りで保存した中身を上書きしてしまうので、返さずに止める（500）
  if (!parsed.success) throw new Error("試合表の中身の形が合いません。");
  const organizations = access.organizationId ? await membershipIndex(db, accountId) : null;
  return {
    id: row.id,
    name: row.name,
    playDate: row.playDate,
    organization: access.organizationId
      ? {
          id: access.organizationId,
          name: organizations?.get(access.organizationId)?.name ?? "",
        }
      : null,
    isOwner: access.isOwner,
    updatedAt: row.updatedAt.toISOString(),
    content: parsed.data,
    version: row.version,
    seed: row.seed,
    editorDeviceId: row.editorDeviceId,
    links: linkStateOf(row, new Date()),
  };
}

/**
 * 試合表の中身と試合の日と札の状態を読む（権限は呼ぶ側が確かめる。見せる・受け付ける窓口が使う）。
 * @param db DB
 * @param tableId 試合表の ID
 * @returns 中身・試合の日・札の状態
 * @throws {AppError} 行がないとき（MATCH_NOT_FOUND）
 * @throws {Error} 中身の形が合わないとき
 */
export async function readContent(
  db: Executor,
  tableId: string,
): Promise<{
  content: MatchTableContent;
  playDate: string;
  links: MatchTable["links"];
}> {
  const [row] = await db.select().from(matchTable).where(eq(matchTable.id, tableId));
  if (!row) throw new AppError(MATCH_ERRORS.NOT_FOUND);
  const parsed = MatchTableContent.safeParse(row.content);
  if (!parsed.success) throw new Error("試合表の中身の形が合いません。");
  return { content: parsed.data, playDate: row.playDate, links: linkStateOf(row, new Date()) };
}
