// スイートの組織（suite-001。AD-22）の窓口の入出力の形（API の入力の確かめ・OpenAPI の文書・画面が、同じ形を使う）。ふつうの zod で書く。
import { z } from "zod";
import { ORGANIZATION_NAME_MAX, ORGANIZATION_ROLES, TEAM_NAME_MAX } from "./organization-errors.ts";

/** 日時（ISO 8601）。 */
const DateTime = z.string();

/** 組織の役割。 */
export const OrganizationRoleSchema = z.enum(ORGANIZATION_ROLES);

/** 組織の名前（前後の空白を除いて1〜50文字）。 */
export const OrganizationName = z
  .string({ error: "名前を入れてください。" })
  .trim()
  .min(1, { error: "名前を入れてください。" })
  .max(ORGANIZATION_NAME_MAX, { error: `名前は${ORGANIZATION_NAME_MAX}文字までにしてください。` });

/** 組織を作る・名前を直す入力。 */
export const OrganizationNameInput = z.strictObject({ name: OrganizationName });

/** 組織を作る・名前を直す入力の型。 */
export type OrganizationNameInput = z.infer<typeof OrganizationNameInput>;

/** 入っている組織（一覧の1行）。 */
export const OrganizationSummary = z.object({
  id: z.guid(),
  name: z.string(),
  /** 自分の役割 */
  myRole: OrganizationRoleSchema,
  /** 組織の人の数 */
  memberCount: z.number().int(),
  /** 自分が入った日時 */
  joinedAt: DateTime,
});

/** 入っている組織の型。 */
export type OrganizationSummary = z.infer<typeof OrganizationSummary>;

/** 入っている組織の一覧（入った順）。 */
export const OrganizationList = z.object({
  organizations: z.array(OrganizationSummary),
  /** 自分が管理者の組織の数と、その上限 */
  adminCount: z.number().int(),
  adminLimit: z.number().int(),
});

/** 入っている組織の一覧の型。 */
export type OrganizationList = z.infer<typeof OrganizationList>;

/** 組織の人（表示名・役割・入った日。どの組織の人にも見える）。 */
export const OrganizationMemberView = z.object({
  accountId: z.guid(),
  /** kanaeru の表示名（LINE の名前） */
  displayName: z.string(),
  role: OrganizationRoleSchema,
  joinedAt: DateTime,
  /** 見ている人か */
  isMe: z.boolean(),
  /** 管理者が前に見てから入った人か（管理者にだけ true になる。FR-O55） */
  isNew: z.boolean(),
});

/** 組織の人の型。 */
export type OrganizationMemberView = z.infer<typeof OrganizationMemberView>;

/** チームの名前（前後の空白を除いて1〜30文字。suite-003）。 */
export const TeamName = z
  .string({ error: "チームの名前を入れてください。" })
  .trim()
  .min(1, { error: "チームの名前を入れてください。" })
  .max(TEAM_NAME_MAX, { error: `チームの名前は${TEAM_NAME_MAX}文字までにしてください。` });

/** チームを作る・名前を直す入力。 */
export const TeamNameInput = z.strictObject({ name: TeamName });

/** チームを作る・名前を直す入力の型。 */
export type TeamNameInput = z.infer<typeof TeamNameInput>;

/** チームに人を足す・リーダーを切り替える入力（管理者だけ）。 */
export const TeamMemberInput = z.strictObject({
  /** リーダーにするか */
  leader: z.boolean(),
});

/** チームに人を足す・リーダーを切り替える入力の型。 */
export type TeamMemberInput = z.infer<typeof TeamMemberInput>;

/** チームの人（組織の人のうち、そのチームに入っている人）。 */
export const TeamMemberView = z.object({
  accountId: z.guid(),
  displayName: z.string(),
  /** 組織の役割 */
  role: OrganizationRoleSchema,
  leader: z.boolean(),
  isMe: z.boolean(),
});

/** チームの人の型。 */
export type TeamMemberView = z.infer<typeof TeamMemberView>;

/** チーム（組織の画面の「チーム」の区分の1つ。組織の人の全員が見る）。 */
export const TeamView = z.object({
  id: z.guid(),
  name: z.string(),
  /** チームの人（リーダー → 組織の役割の順 → 表示名） */
  members: z.array(TeamMemberView),
  createdAt: DateTime,
});

/** チームの型。 */
export type TeamView = z.infer<typeof TeamView>;

/** 組織の画面（組織の人の全員が見る）。 */
export const OrganizationDetail = z.object({
  id: z.guid(),
  name: z.string(),
  myRole: OrganizationRoleSchema,
  /** 組織の人（管理者 → 編集者 → メンバー、同じ役割の中は入った順） */
  members: z.array(OrganizationMemberView),
  /** 人数と編集者の上限 */
  memberLimit: z.number().int(),
  editorLimit: z.number().int(),
  /** チーム（作った順。suite-003） */
  teams: z.array(TeamView),
  /** チームの数の上限 */
  teamLimit: z.number().int(),
  createdAt: DateTime,
});

/** 組織の画面の型。 */
export type OrganizationDetail = z.infer<typeof OrganizationDetail>;

/** 招待のリンクの札（管理者だけ。まだ作っていない・出し直せないときは null。作り直すと出る）。 */
export const OrganizationInviteView = z.object({
  token: z.string().nullable(),
  /** 作った日時（まだなら null） */
  createdAt: DateTime.nullable(),
});

/** 招待のリンクの札の型。 */
export type OrganizationInviteView = z.infer<typeof OrganizationInviteView>;

/** 役割を切り替える入力（管理者は引き継ぎでだけ替わる）。 */
export const OrganizationMemberRoleInput = z.strictObject({
  role: z.enum(["editor", "member"], { error: "役割は「編集者」か「メンバー」にしてください。" }),
});

/** 役割を切り替える入力の型。 */
export type OrganizationMemberRoleInput = z.infer<typeof OrganizationMemberRoleInput>;

/** 管理者を引き継ぐ入力。 */
export const OrganizationTransferInput = z.strictObject({
  /** 新しい管理者（組織の人） */
  accountId: z.guid({ error: "引き継ぐ人を選んでください。" }),
});

/** 管理者を引き継ぐ入力の型。 */
export type OrganizationTransferInput = z.infer<typeof OrganizationTransferInput>;

/** 組織を抜ける入力（管理者は引き継ぐ人を選ぶ）。 */
export const OrganizationLeaveInput = z.strictObject({
  successorAccountId: z.guid({ error: "引き継ぐ人を選んでください。" }).optional(),
});

/** 組織を抜ける入力の型。 */
export type OrganizationLeaveInput = z.infer<typeof OrganizationLeaveInput>;

/** 招待の確かめの画面の中身（ログインした人に出す）。 */
export const OrganizationInvitePreview = z.object({
  organizationId: z.guid(),
  name: z.string(),
  /** 管理者の表示名 */
  adminName: z.string(),
  memberCount: z.number().int(),
  /** すでに入っているか */
  alreadyMember: z.boolean(),
  /** 人数の上限に達しているか（入れない） */
  full: z.boolean(),
});

/** 招待の確かめの画面の中身の型。 */
export type OrganizationInvitePreview = z.infer<typeof OrganizationInvitePreview>;

/** 招待から入った結果。 */
export const OrganizationJoinResult = z.object({
  organizationId: z.guid(),
  /** 前から入っていたか（同じ人が2回押しても1回だけ入る） */
  alreadyMember: z.boolean(),
});

/** 招待から入った結果の型。 */
export type OrganizationJoinResult = z.infer<typeof OrganizationJoinResult>;
