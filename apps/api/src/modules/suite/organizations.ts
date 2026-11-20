// 組織の読み書き（suite-001。AD-22）。表は suite の領域だけが読み書きする（AD-3）。
// - 組織の操作（招待・役割・外す・引き継ぐ・名前・消す）は管理者だけ。判定は routes-organization.ts の1か所（requireOrganizationRole）
// - 人数・編集者の数・管理者が1人であることは、組織の行に鍵（FOR UPDATE）をかけてから数える（同時に来ても超えない）
// - 管理者のいない組織を残さない：管理者が抜けるときは先に引き継ぐ（窓口が止める）。退会では withdrawal.ts が引き継ぐ
// - ほかの領域の表は触らない。人が抜ける・組織が消えると、アプリの「組織に入れる」・担当は外部キーの CASCADE で消える
import { createHash, randomBytes } from "node:crypto";
import type { SecretBox } from "@workspace/secret-box";
import {
  ORGANIZATION_ADMIN_LIMIT,
  ORGANIZATION_EDITOR_LIMIT,
  ORGANIZATION_ERRORS,
  ORGANIZATION_INVITE_TOKEN_FORMAT,
  ORGANIZATION_MEMBER_LIMIT,
} from "@workspace/contracts/suite";
import type { OrganizationRole } from "@workspace/contracts/suite";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import type { Db, Executor } from "../../kernel/db.ts";
import { AppError } from "../../kernel/errors.ts";
import { findDisplayNames } from "../account/index.ts";
import { organization, organizationInvite, organizationMember } from "./schema.ts";

/** 組織の人の行。 */
export type OrganizationMembership = {
  organizationId: string;
  accountId: string;
  role: OrganizationRole;
  joinedAt: Date;
  /** 最後にメンバーに下げた日時（なければ null） */
  demotedAt: Date | null;
};

/** 表示名つきの組織の人。 */
export type NamedMembership = OrganizationMembership & { displayName: string };

/** 組織の行。 */
export type OrganizationRecord = {
  id: string;
  name: string;
  adminSeenAt: Date | null;
  createdAt: Date;
};

/** 読み出す列（組織の人）。 */
const memberColumns = {
  organizationId: organizationMember.organizationId,
  accountId: organizationMember.accountId,
  role: organizationMember.role,
  joinedAt: organizationMember.joinedAt,
  demotedAt: organizationMember.demotedAt,
};

/** 役割の並び（管理者 → 編集者 → メンバー）。 */
const ROLE_ORDER: Record<OrganizationRole, number> = { admin: 0, editor: 1, member: 2 };

/**
 * 組織を読む。
 * @param db DB
 * @param organizationId 組織の ID
 * @returns 組織（なければ null）
 */
export async function findOrganization(
  db: Executor,
  organizationId: string,
): Promise<OrganizationRecord | null> {
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      adminSeenAt: organization.adminSeenAt,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row ?? null;
}

/**
 * その人の、その組織での組織の人の行を読む（役割は要求のたびにここから引く。AD-22）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param accountId account の ID
 * @returns 組織の人の行（組織の人でなければ null）
 */
export async function findMembership(
  db: Executor,
  organizationId: string,
  accountId: string,
): Promise<OrganizationMembership | null> {
  const [row] = await db
    .select(memberColumns)
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        eq(organizationMember.accountId, accountId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * その人が入っている組織（入った順）。
 * @param db DB
 * @param accountId account の ID
 * @returns 組織の名前つきの、組織の人の行
 */
export async function listMemberships(
  db: Executor,
  accountId: string,
): Promise<(OrganizationMembership & { organizationName: string })[]> {
  return db
    .select({ ...memberColumns, organizationName: organization.name })
    .from(organizationMember)
    .innerJoin(organization, eq(organization.id, organizationMember.organizationId))
    .where(eq(organizationMember.accountId, accountId))
    .orderBy(asc(organizationMember.joinedAt), asc(organizationMember.organizationId));
}

/**
 * 組織の人の一覧（表示名つき。管理者 → 編集者 → メンバー、同じ役割の中は入った順）。
 * @param db DB
 * @param organizationId 組織の ID
 * @returns 組織の人
 */
export async function listMembers(
  db: Executor,
  organizationId: string,
): Promise<NamedMembership[]> {
  const rows = await db
    .select(memberColumns)
    .from(organizationMember)
    .where(eq(organizationMember.organizationId, organizationId))
    .orderBy(asc(organizationMember.joinedAt), asc(organizationMember.accountId));
  const names = await findDisplayNames(
    db,
    rows.map((row) => row.accountId),
  );
  return rows
    .map((row) => ({ ...row, displayName: names.get(row.accountId) ?? "" }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

/**
 * 組織の人の数。
 * @param db DB
 * @param organizationId 組織の ID
 * @returns 人数
 */
export async function countMembers(db: Executor, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(organizationMember)
    .where(eq(organizationMember.organizationId, organizationId));
  return Number(row?.n ?? 0);
}

/**
 * 組織の管理者（表示名つき）。
 * @param db DB
 * @param organizationId 組織の ID
 * @returns 管理者（いなければ null）
 */
export async function findOrganizationAdmin(
  db: Executor,
  organizationId: string,
): Promise<{ accountId: string; displayName: string } | null> {
  const [row] = await db
    .select({ accountId: organizationMember.accountId })
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        eq(organizationMember.role, "admin"),
      ),
    )
    .limit(1);
  if (!row) return null;
  const names = await findDisplayNames(db, [row.accountId]);
  return { accountId: row.accountId, displayName: names.get(row.accountId) ?? "" };
}

/**
 * 組織の行に鍵をかける（人数・役割を数えて書くとき。トランザクションの中で呼ぶ）。
 * @param tx トランザクション
 * @param organizationId 組織の ID
 * @returns 組織があれば true
 */
async function lockOrganization(tx: Executor, organizationId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .for("update");
  return row !== undefined;
}

/**
 * 人ごとの「管理者になる」鍵をかける（トランザクションの中で呼ぶ）。組織を作る・管理者を引き継ぐ・退会の最後の確かめが、
 * 同じ人について順に動くようにする（退会で消える人が、消える直前に管理者にされて、管理者のいない組織が残るのを防ぐ）。
 * 鍵の順は「人 → 組織」にそろえる。
 * @param tx トランザクション
 * @param accountId 管理者になる（または退会する）人
 */
async function lockAdminOf(tx: Executor, accountId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`organization_admin:${accountId}`}, 0))`,
  );
}

/**
 * 組織を作る（作った人が管理者。管理者として持てる組織は20まで）。
 * @param db DB
 * @param accountId 作る人
 * @param name 名前（確かめたもの）
 * @returns 作った組織の ID
 * @throws {AppError} 上限のとき（ORGANIZATION_LIMIT）
 */
export async function createOrganization(db: Db, accountId: string, name: string): Promise<string> {
  return db.transaction(async (tx) => {
    // 同じ人が同時に作っても上限を超えないよう、人ごとの鍵をかけてから数える
    await lockAdminOf(tx, accountId);
    const [owned] = await tx
      .select({ n: count() })
      .from(organizationMember)
      .where(
        and(eq(organizationMember.accountId, accountId), eq(organizationMember.role, "admin")),
      );
    if (Number(owned?.n ?? 0) >= ORGANIZATION_ADMIN_LIMIT) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_LIMIT);
    }
    const [created] = await tx
      .insert(organization)
      .values({ name })
      .returning({ id: organization.id });
    if (!created) throw new Error("組織を作れませんでした。");
    await tx
      .insert(organizationMember)
      .values({ organizationId: created.id, accountId, role: "admin" });
    return created.id;
  });
}

/**
 * 管理者として持っている組織の数。
 * @param db DB
 * @param accountId account の ID
 * @returns 数
 */
export async function countAdminOrganizations(db: Executor, accountId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(organizationMember)
    .where(and(eq(organizationMember.accountId, accountId), eq(organizationMember.role, "admin")));
  return Number(row?.n ?? 0);
}

/**
 * 組織の名前を直す。
 * @param db DB
 * @param organizationId 組織の ID
 * @param name 名前（確かめたもの）
 */
export async function renameOrganization(
  db: Executor,
  organizationId: string,
  name: string,
): Promise<void> {
  await db.update(organization).set({ name }).where(eq(organization.id, organizationId));
}

/**
 * 組織を消す（組織の人・招待・アプリの中の担当と「組織に入れる」は外部キーで消える。記録は持ち主に残る）。
 * @param db DB
 * @param organizationId 組織の ID
 */
export async function deleteOrganization(db: Executor, organizationId: string): Promise<void> {
  await db.delete(organization).where(eq(organization.id, organizationId));
}

/**
 * 管理者が組織の画面を見た日時を今にする（新しい人の印を1回だけ出すため）。
 * @param db DB
 * @param organizationId 組織の ID
 */
export async function markAdminSeen(db: Executor, organizationId: string): Promise<void> {
  await db
    .update(organization)
    .set({ adminSeenAt: sql`now()` })
    .where(eq(organization.id, organizationId));
}

/**
 * 管理者が、自分以外の人の役割を、メンバー⇔編集者に切り替える（編集者からメンバーに下げた日時を残す。AD-22）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param targetAccountId 相手
 * @param role 新しい役割
 * @throws {AppError} 相手がいない・管理者（ORGANIZATION_MEMBER_NOT_FOUND）・編集者の上限（ORGANIZATION_EDITOR_LIMIT）
 */
export async function setMemberRole(
  db: Db,
  organizationId: string,
  targetAccountId: string,
  role: "editor" | "member",
): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await lockOrganization(tx, organizationId))) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_NOT_FOUND);
    }
    const target = await findMembership(tx, organizationId, targetAccountId);
    if (!target || target.role === "admin") {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_MEMBER_NOT_FOUND);
    }
    if (target.role === role) return;
    if (role === "editor") {
      const [editors] = await tx
        .select({ n: count() })
        .from(organizationMember)
        .where(
          and(
            eq(organizationMember.organizationId, organizationId),
            eq(organizationMember.role, "editor"),
          ),
        );
      if (Number(editors?.n ?? 0) >= ORGANIZATION_EDITOR_LIMIT) {
        throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_EDITOR_LIMIT);
      }
    }
    await tx
      .update(organizationMember)
      .set(role === "member" ? { role, demotedAt: sql`now()` } : { role })
      .where(
        and(
          eq(organizationMember.organizationId, organizationId),
          eq(organizationMember.accountId, targetAccountId),
        ),
      );
  });
}

/**
 * 組織の人の行を消す（抜ける・外す。アプリの中のその人の担当と、その人が入れた記録の「組織に入れる」は外部キーで消える）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param accountId 抜ける人
 * @returns 消したら true
 */
async function deleteMembership(
  db: Executor,
  organizationId: string,
  accountId: string,
): Promise<boolean> {
  const removed = await db
    .delete(organizationMember)
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        eq(organizationMember.accountId, accountId),
        ne(organizationMember.role, "admin"),
      ),
    )
    .returning({ accountId: organizationMember.accountId });
  return removed.length > 0;
}

/**
 * 管理者が、自分以外の人を組織から外す。
 * @param db DB
 * @param organizationId 組織の ID
 * @param targetAccountId 外す人
 * @throws {AppError} 相手がいない・管理者のとき（ORGANIZATION_MEMBER_NOT_FOUND）
 */
export async function removeMember(
  db: Db,
  organizationId: string,
  targetAccountId: string,
): Promise<void> {
  // 管理者の引き継ぎと同じ組織の鍵をかける（外した人へ同時に引き継いで、管理者のいない組織が残らないように）
  await db.transaction(async (tx) => {
    if (!(await lockOrganization(tx, organizationId))) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_NOT_FOUND);
    }
    if (!(await deleteMembership(tx, organizationId, targetAccountId))) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_MEMBER_NOT_FOUND);
    }
  });
}

/**
 * 管理者を引き継ぐ（トランザクションの中で呼ぶ。前の管理者は編集者になる。PRD O4）。
 * 管理者は1人の一意の制約があるので、先に前の管理者を下げてから、新しい管理者を上げる。
 * @param tx トランザクション（組織の行に鍵をかけたもの）
 * @param organizationId 組織の ID
 * @param fromAccountId 今の管理者
 * @param toAccountId 新しい管理者（組織の人）
 * @param options 前の管理者が組織に残るか（残るなら、編集者の上限を確かめる）
 * @param options.previousStays 前の管理者が組織に残るか
 * @throws {AppError} 新しい管理者が組織の人でない・上げられなかったとき（ORGANIZATION_MEMBER_NOT_FOUND）・編集者の上限（ORGANIZATION_EDITOR_LIMIT）
 */
async function transferAdminInTx(
  tx: Executor,
  organizationId: string,
  fromAccountId: string,
  toAccountId: string,
  options: { previousStays: boolean } = { previousStays: false },
): Promise<void> {
  if (fromAccountId === toAccountId) {
    throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_SELF_NOT_ALLOWED);
  }
  const target = await findMembership(tx, organizationId, toAccountId);
  if (!target) throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_MEMBER_NOT_FOUND);
  // 前の管理者が組織に残って編集者になるとき、メンバーへ引き継ぐと編集者が1人増える（上限を超えるなら断る。FR-O13）
  if (options.previousStays && target.role === "member") {
    const [editors] = await tx
      .select({ n: count() })
      .from(organizationMember)
      .where(
        and(
          eq(organizationMember.organizationId, organizationId),
          eq(organizationMember.role, "editor"),
        ),
      );
    if (Number(editors?.n ?? 0) >= ORGANIZATION_EDITOR_LIMIT) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_EDITOR_LIMIT);
    }
  }
  await tx
    .update(organizationMember)
    .set({ role: "editor" })
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        eq(organizationMember.accountId, fromAccountId),
      ),
    );
  const promoted = await tx
    .update(organizationMember)
    .set({ role: "admin" })
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        eq(organizationMember.accountId, toAccountId),
      ),
    )
    .returning({ accountId: organizationMember.accountId });
  // 上げられなかったら（同時に外された・退会したなど）、前の管理者を下げたまま終わらせない（トランザクションごと戻す）
  if (promoted.length !== 1) throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_MEMBER_NOT_FOUND);
}

/**
 * 管理者を引き継ぐ（抜けない。前の管理者は編集者になる）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param fromAccountId 今の管理者
 * @param toAccountId 新しい管理者
 * @throws {AppError} 今の管理者でない（ORGANIZATION_ADMIN_ONLY）・相手がいない（ORGANIZATION_MEMBER_NOT_FOUND）
 */
export async function transferAdmin(
  db: Db,
  organizationId: string,
  fromAccountId: string,
  toAccountId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // 鍵の順は「人 → 組織」（退会の最後の確かめと同じ順。相手が退会の途中なら、消え終わるのを待ってから確かめる）
    await lockAdminOf(tx, toAccountId);
    if (!(await lockOrganization(tx, organizationId))) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_NOT_FOUND);
    }
    const me = await findMembership(tx, organizationId, fromAccountId);
    if (me?.role !== "admin") throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_ADMIN_ONLY);
    await transferAdminInTx(tx, organizationId, fromAccountId, toAccountId, {
      previousStays: true,
    });
  });
}

/**
 * 組織を抜ける（管理者は、先に引き継ぐ人を選ぶ。選ばなければ断る）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param accountId 抜ける人
 * @param successorAccountId 新しい管理者（管理者が抜けるときだけ）
 * @throws {AppError} 組織の人でない（ORGANIZATION_NOT_FOUND）・管理者が引き継ぐ人を選んでいない（ORGANIZATION_SUCCESSOR_REQUIRED）
 */
export async function leaveOrganization(
  db: Db,
  organizationId: string,
  accountId: string,
  successorAccountId: string | undefined,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await lockOrganization(tx, organizationId))) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_NOT_FOUND);
    }
    const me = await findMembership(tx, organizationId, accountId);
    if (!me) throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_NOT_FOUND);
    if (me.role === "admin") {
      if (!successorAccountId) {
        throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_SUCCESSOR_REQUIRED);
      }
      await transferAdminInTx(tx, organizationId, accountId, successorAccountId);
    }
    await deleteMembership(tx, organizationId, accountId);
  });
}

/**
 * 招待の札の SHA-256。
 * @param token 札
 * @returns 16進64文字
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 招待のリンクの札を読む（包んだ写しを開ける。写しがない・開けないときは null）。
 * @param db DB
 * @param box 秘密の箱（なければ写しを開けない）
 * @param organizationId 組織の ID
 * @returns 札と作った日時
 */
export async function readInvite(
  db: Executor,
  box: SecretBox | undefined,
  organizationId: string,
): Promise<{ token: string | null; createdAt: Date | null }> {
  const [row] = await db
    .select()
    .from(organizationInvite)
    .where(eq(organizationInvite.organizationId, organizationId))
    .limit(1);
  if (!row) return { token: null, createdAt: null };
  if (!box || !row.tokenCiphertext || !row.tokenIv || row.keyVersion === null) {
    return { token: null, createdAt: row.createdAt };
  }
  try {
    const token = await box.open(
      { ciphertext: row.tokenCiphertext, iv: row.tokenIv, keyVersion: row.keyVersion },
      `organization_invite:${organizationId}`,
    );
    return { token, createdAt: row.createdAt };
  } catch {
    return { token: null, createdAt: row.createdAt };
  }
}

/**
 * 招待のリンクを作る・作り直す（前のリンクはすぐ使えなくなる）。
 * @param db DB
 * @param box 秘密の箱（あれば、出し直すための写しを包んで持つ）
 * @param organizationId 組織の ID
 * @returns 新しい札と作った日時
 */
export async function rotateInvite(
  db: Executor,
  box: SecretBox | undefined,
  organizationId: string,
): Promise<{ token: string; createdAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const sealed = box ? await box.seal(token, `organization_invite:${organizationId}`) : null;
  const values = {
    tokenHash: hashInviteToken(token),
    tokenCiphertext: sealed?.ciphertext ?? null,
    tokenIv: sealed?.iv ?? null,
    keyVersion: sealed?.keyVersion ?? null,
  };
  const [row] = await db
    .insert(organizationInvite)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({
      target: organizationInvite.organizationId,
      set: { ...values, createdAt: sql`now()` },
    })
    .returning({ createdAt: organizationInvite.createdAt });
  return { token, createdAt: row?.createdAt ?? new Date() };
}

/**
 * 札から組織を探す（形が違う・見つからないときは null）。
 * @param db DB
 * @param token 札
 * @returns 組織の ID
 */
async function findInvitedOrganization(db: Executor, token: string): Promise<string | null> {
  if (!ORGANIZATION_INVITE_TOKEN_FORMAT.test(token)) return null;
  const [row] = await db
    .select({ organizationId: organizationInvite.organizationId })
    .from(organizationInvite)
    .where(eq(organizationInvite.tokenHash, hashInviteToken(token)))
    .limit(1);
  return row?.organizationId ?? null;
}

/**
 * 招待の確かめの画面の中身。
 * @param db DB
 * @param token 札
 * @param accountId 開いた人
 * @returns 組織の名前・管理者・人数・すでに入っているか・人数の上限か
 * @throws {AppError} 使えないリンク（ORGANIZATION_INVITE_INVALID）
 */
export async function previewInvite(db: Executor, token: string, accountId: string) {
  const organizationId = await findInvitedOrganization(db, token);
  const found = organizationId ? await findOrganization(db, organizationId) : null;
  if (!organizationId || !found)
    throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_INVITE_INVALID);
  const [admin, memberCount, mine] = await Promise.all([
    findOrganizationAdmin(db, organizationId),
    countMembers(db, organizationId),
    findMembership(db, organizationId, accountId),
  ]);
  return {
    organizationId,
    name: found.name,
    adminName: admin?.displayName ?? "",
    memberCount,
    alreadyMember: mine !== null,
    full: mine === null && memberCount >= ORGANIZATION_MEMBER_LIMIT,
  };
}

/**
 * 招待から、メンバーとして入る（同じ人が同時に押しても1回だけ入る）。
 * @param db DB
 * @param token 札
 * @param accountId 入る人
 * @returns 組織の ID と、前から入っていたか
 * @throws {AppError} 使えないリンク（ORGANIZATION_INVITE_INVALID）・人数の上限（ORGANIZATION_FULL）
 */
export async function joinByInvite(
  db: Db,
  token: string,
  accountId: string,
): Promise<{ organizationId: string; alreadyMember: boolean }> {
  return db.transaction(async (tx) => {
    const organizationId = await findInvitedOrganization(tx, token);
    if (!organizationId || !(await lockOrganization(tx, organizationId))) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_INVITE_INVALID);
    }
    // 鍵をかけたあとで、札がまだ同じ組織を指すか確かめる（その間に作り直されたら使えない）
    if ((await findInvitedOrganization(tx, token)) !== organizationId) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_INVITE_INVALID);
    }
    if (await findMembership(tx, organizationId, accountId)) {
      return { organizationId, alreadyMember: true };
    }
    if ((await countMembers(tx, organizationId)) >= ORGANIZATION_MEMBER_LIMIT) {
      throw new AppError(ORGANIZATION_ERRORS.ORGANIZATION_FULL);
    }
    const inserted = await tx
      .insert(organizationMember)
      .values({ organizationId, accountId, role: "member" })
      .onConflictDoNothing()
      .returning({ accountId: organizationMember.accountId });
    return { organizationId, alreadyMember: inserted.length === 0 };
  });
}

/**
 * いちばん長くいる人（その人を除く。入った順 → ID の順）。
 * @param db DB
 * @param organizationId 組織の ID
 * @param excludeAccountId 除く人
 * @returns account の ID（ほかに誰もいなければ null）
 */
export async function findLongestMember(
  db: Executor,
  organizationId: string,
  excludeAccountId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ accountId: organizationMember.accountId })
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        ne(organizationMember.accountId, excludeAccountId),
      ),
    )
    .orderBy(asc(organizationMember.joinedAt), asc(organizationMember.accountId))
    .limit(1);
  return row?.accountId ?? null;
}

/**
 * 退会の最後の確かめ（アカウントを消すトランザクションの中で、消す直前に流す。AD-22）。
 * 前の手順のあとに、退会する人が管理者に戻された・組織を作った組織を、消す前に片付ける（引き継ぐか、誰もいなければ消す）。
 * @param tx アカウントを消すトランザクション
 * @param accountId 退会する人
 */
export async function finalizeAdminOrganizations(tx: Executor, accountId: string): Promise<void> {
  // 人の鍵を先にかける（この人を管理者にする操作は、消し終わるまで待つ。鍵の順は「人 → 組織」）
  await lockAdminOf(tx, accountId);
  const owned = (await listMemberships(tx, accountId)).filter((row) => row.role === "admin");
  for (const row of owned) {
    if (!(await lockOrganization(tx, row.organizationId))) continue;
    const me = await findMembership(tx, row.organizationId, accountId);
    if (me?.role !== "admin") continue;
    const successor = await findLongestMember(tx, row.organizationId, accountId);
    if (successor) await transferAdminInTx(tx, row.organizationId, accountId, successor);
    else await deleteOrganization(tx, row.organizationId);
  }
}

/**
 * 退会する人が管理者の組織を片付ける（退会の手順の (1)。AD-22）。組織ごとのトランザクションで、
 * いちばん長くいる人に管理者を引き継ぎ、誰もいなければ組織を消す。2回流しても同じ結果になる（済んだ組織は管理者でなくなる）。
 * アカウントを消すトランザクションの中でも、finalizeAdminOrganizations で同じことをもう一度確かめる。
 * @param db DB
 * @param accountId 退会する人
 */
export async function handOverAdminOrganizations(db: Db, accountId: string): Promise<void> {
  const owned = (await listMemberships(db, accountId)).filter((row) => row.role === "admin");
  for (const row of owned) {
    await db.transaction(async (tx) => {
      if (!(await lockOrganization(tx, row.organizationId))) return;
      const me = await findMembership(tx, row.organizationId, accountId);
      if (me?.role !== "admin") return;
      const successor = await findLongestMember(tx, row.organizationId, accountId);
      if (successor) await transferAdminInTx(tx, row.organizationId, accountId, successor);
      else await deleteOrganization(tx, row.organizationId);
    });
  }
}
