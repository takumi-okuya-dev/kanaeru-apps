// Threads のチーム運用（threads-013。PRD 組織 5章）の形と決まった値。組織そのもの（人・役割・招待）は suite が持つ。
// 運用アカウントごとの関わり（持ち主・担当の人・組織の管理者・組織の人）は API の1か所（access.ts）で決め、画面はここの形で受け取る。
// 止まっている日数・伸びの比などの決まった値は limits.ts（めぐるの 020 から写したもの。PRD O15）。
import { z } from "zod";
import { CONNECTION_STATUSES } from "./autopost.ts";
import { TEAM_STATUS_GROWTH_MIN_POSTS, TEAM_STATUS_GROWTH_POOR_RATIO } from "./limits.ts";

/** 日時（時差つきの ISO 8601）。 */
const DateTime = z.iso.datetime({ offset: true });

/** 組織の役割（suite の役割と同じ値。threads は suite の約束を読まずに、同じ並びを持つ）。 */
export const TEAM_ORGANIZATION_ROLES = ["admin", "editor", "member"] as const;

/** 組織の役割の型。 */
export type TeamOrganizationRole = (typeof TEAM_ORGANIZATION_ROLES)[number];

/** 組織の役割の見える名前。 */
export const TEAM_ROLE_LABELS: Record<TeamOrganizationRole, string> = {
  admin: "管理者",
  editor: "編集者",
  member: "メンバー",
};

/** 運用アカウントとの関わり（上から順に、最初に当たったもの。関わりなしは 404 で返すので含めない）。 */
export const THREADS_RELATIONS = ["owner", "assignee", "org_admin", "org_member"] as const;

/** 運用アカウントとの関わりの型。 */
export type ThreadsRelation = (typeof THREADS_RELATIONS)[number];

/** 今の利用者が、この運用アカウントでできること（画面の出し分け。判定の正は API）。 */
export const ThreadsAccountAccess = z.object({
  relation: z.enum(THREADS_RELATIONS),
  /** 持ち主の表示名 */
  ownerName: z.string(),
  /** 入っている組織と、今の利用者のその組織での役割（入っていなければ null） */
  organization: z
    .object({ id: z.guid(), name: z.string(), myRole: z.enum(TEAM_ORGANIZATION_ROLES) })
    .nullable(),
  /** 組織に見せているか */
  shared: z.boolean(),
  /** 今の利用者が承認を任されているか（担当の人のときだけ true になりうる） */
  delegated: z.boolean(),
  can: z.object({
    /** 投稿の案（一覧）と戦略を読む */
    readContent: z.boolean(),
    /** 反応・分析・設定（読むだけ）・ホームなどを見る */
    readPrivate: z.boolean(),
    /** 投稿の案・戦略・宣伝などを作る・直す */
    writeContent: z.boolean(),
    /** 承認・却下・承認を戻す・承認済みと却下の案を消す */
    review: z.boolean(),
    /** 設定を変える・接続・消す・組織の操作（持ち主だけ） */
    manage: z.boolean(),
    /** 操作の記録を見る */
    activity: z.boolean(),
  }),
});

/** 今の利用者が、この運用アカウントでできることの型。 */
export type ThreadsAccountAccess = z.infer<typeof ThreadsAccountAccess>;

/** 「このアカウントのチーム」の1人（組織の名前 → 管理者 → 持ち主 → 担当の人の順。FR-T30）。 */
export const ThreadsTeamPerson = z.object({
  accountId: z.guid(),
  displayName: z.string(),
  /** このアカウントでの立場 */
  position: z.enum(["admin", "owner", "assignee"]),
  /** 組織での役割 */
  role: z.enum(TEAM_ORGANIZATION_ROLES),
  /** 承認を任されているか（担当の人だけ） */
  delegated: z.boolean(),
  isMe: z.boolean(),
});

/** 「このアカウントのチーム」の1人の型。 */
export type ThreadsTeamPerson = z.infer<typeof ThreadsTeamPerson>;

/** 運用アカウントのチーム（設定の画面の「組織」とカード。持ち主と担当の人だけが読む）。 */
export const ThreadsAccountTeam = z.object({
  /** 入っている組織（入っていなければ null） */
  organization: z.object({ id: z.guid(), name: z.string() }).nullable(),
  shared: z.boolean(),
  /** カードの人（組織に入っていなければ空） */
  people: z.array(ThreadsTeamPerson),
  /** 入れられる組織（持ち主が入っている組織。持ち主のときだけ。どこにも入っていなければ空） */
  candidates: z.array(z.object({ id: z.guid(), name: z.string() })),
});

/** 運用アカウントのチームの型。 */
export type ThreadsAccountTeam = z.infer<typeof ThreadsAccountTeam>;

/** 組織に入れる・外す入力（null で外す）。 */
export const ThreadsPlacementInput = z.strictObject({
  organizationId: z.guid({ error: "組織を選んでください。" }).nullable(),
});

/** 組織に入れる・外す入力の型。 */
export type ThreadsPlacementInput = z.infer<typeof ThreadsPlacementInput>;

/** 組織に見せるの入力。 */
export const ThreadsSharedInput = z.strictObject({ shared: z.boolean() });

/** 組織に見せるの入力の型。 */
export type ThreadsSharedInput = z.infer<typeof ThreadsSharedInput>;

/** 承認を任せるの入力。 */
export const ThreadsDelegationInput = z.strictObject({ delegated: z.boolean() });

/** 承認を任せるの入力の型。 */
export type ThreadsDelegationInput = z.infer<typeof ThreadsDelegationInput>;

/** 担当を付け外しする入力（管理者だけ）。 */
export const ThreadsAssignmentInput = z.strictObject({
  /** 運用アカウント（組織に入っているもの） */
  threadsAccountId: z.guid(),
  /** 担当の人（編集者か管理者） */
  accountId: z.guid(),
  assigned: z.boolean(),
});

/** 担当を付け外しする入力の型。 */
export type ThreadsAssignmentInput = z.infer<typeof ThreadsAssignmentInput>;

/** 入っている組織（Threads の組織の一覧の1行）。 */
export const ThreadsOrganizationSummary = z.object({
  id: z.guid(),
  name: z.string(),
  myRole: z.enum(TEAM_ORGANIZATION_ROLES),
  /** 組織に入っている運用アカウントの数 */
  accountCount: z.number().int(),
});

/** 入っている組織の一覧（どこにも入っていなければ空。ナビの「組織」を出すかに使う）。 */
export const ThreadsOrganizationList = z.object({
  organizations: z.array(ThreadsOrganizationSummary),
});

/** 入っている組織の一覧の型。 */
export type ThreadsOrganizationList = z.infer<typeof ThreadsOrganizationList>;

/** 組織に入っている運用アカウント（Threads の組織の画面の1行。名前・持ち主・見せる状態はどの組織の人にも見える）。 */
export const ThreadsOrganizationAccount = z.object({
  id: z.guid(),
  name: z.string(),
  ownerAccountId: z.guid(),
  ownerName: z.string(),
  ownerIsMe: z.boolean(),
  shared: z.boolean(),
  connectionStatus: z.enum(CONNECTION_STATUSES),
  /** 今の利用者の開き方（manage：持ち主・assigned：担当・shared：見せてもらう〈読むだけ〉・none：開けない） */
  access: z.enum(["manage", "assigned", "shared", "none"]),
  placedAt: DateTime,
});

/** 組織に入っている運用アカウントの型。 */
export type ThreadsOrganizationAccount = z.infer<typeof ThreadsOrganizationAccount>;

/** 担当を決める表の1人（管理者にだけ返す。編集者と管理者）。 */
export const ThreadsAssignmentRow = z.object({
  accountId: z.guid(),
  displayName: z.string(),
  role: z.enum(TEAM_ORGANIZATION_ROLES),
  isMe: z.boolean(),
  /** 担当の運用アカウント */
  assignedAccountIds: z.array(z.guid()),
});

/** 担当を決める表の1人の型。 */
export type ThreadsAssignmentRow = z.infer<typeof ThreadsAssignmentRow>;

/** Threads の組織の画面。 */
export const ThreadsOrganizationView = z.object({
  id: z.guid(),
  name: z.string(),
  myRole: z.enum(TEAM_ORGANIZATION_ROLES),
  accounts: z.array(ThreadsOrganizationAccount),
  /** 担当を決める表（管理者だけ。ほかは空） */
  assignments: z.array(ThreadsAssignmentRow),
  /** 担当を決められるか（管理者） */
  canAssign: z.boolean(),
  /** 運用状況を見られるか（管理者と、担当が1つ以上ある編集者） */
  canSeeStatus: z.boolean(),
});

/** Threads の組織の画面の型。 */
export type ThreadsOrganizationView = z.infer<typeof ThreadsOrganizationView>;

/** 伸び（直近30日の閲覧数の中央値 ÷ その前の30日）。 */
export const TeamStatusGrowth = z.object({
  state: z.enum(["ok", "poor", "insufficient"]),
  /** 比（判定できたときだけ。小数第2位まで） */
  ratio: z.number().nullable(),
});

/** 伸びの型。 */
export type TeamStatusGrowth = z.infer<typeof TeamStatusGrowth>;

/** 運用状況（数と日付だけ。本文・戦略・設定・記録の中身は含めない。FR-T46）。 */
export const ThreadsTeamStatus = z.object({
  /** 見る範囲（管理者はすべて・編集者は担当の分だけ） */
  scope: z.enum(["all", "assigned"]),
  generatedAt: DateTime,
  /** 止まっている人と運用アカウントの数 */
  stoppedCount: z.number().int(),
  people: z.array(
    z.object({
      accountId: z.guid(),
      displayName: z.string(),
      role: z.enum(TEAM_ORGANIZATION_ROLES),
      isMe: z.boolean(),
      lastActiveAt: DateTime.nullable(),
      activeCount7d: z.number().int(),
      stopped: z.boolean(),
    }),
  ),
  accounts: z.array(
    z.object({
      threadsAccountId: z.guid(),
      name: z.string(),
      ownerName: z.string(),
      ownerIsMe: z.boolean(),
      connectionStatus: z.enum(CONNECTION_STATUSES),
      lastPostedAt: DateTime.nullable(),
      postCount7d: z.number().int(),
      approvedCount: z.number().int(),
      needsReviewCount: z.number().int(),
      stopped: z.boolean(),
      growth: TeamStatusGrowth,
    }),
  ),
});

/** 運用状況の型。 */
export type ThreadsTeamStatus = z.infer<typeof ThreadsTeamStatus>;

/** Threads のはじめの画面に1回だけ出す知らせ（担当が付いた・退会で引き継いだ。FR-T52・FR-T66）。 */
export const ThreadsTeamNotices = z.object({
  assignments: z.array(
    z.object({
      threadsAccountId: z.guid(),
      accountName: z.string(),
      ownerName: z.string(),
      organizationName: z.string(),
    }),
  ),
  handovers: z.array(
    z.object({ threadsAccountId: z.guid(), accountName: z.string(), fromName: z.string() }),
  ),
});

/** 知らせの型。 */
export type ThreadsTeamNotices = z.infer<typeof ThreadsTeamNotices>;

/**
 * 伸びを決める（直近30日とその前の30日の、確定した閲覧数の中央値の比。どちらかが5件に満たなければ判定しない）。
 * @param recent 直近30日の中央値と件数
 * @param recent.median 中央値（なければ null）
 * @param recent.count 件数
 * @param previous その前の30日の中央値と件数
 * @param previous.median 中央値（なければ null）
 * @param previous.count 件数
 * @returns 伸び
 */
export function teamGrowthOf(
  recent: { median: number | null; count: number },
  previous: { median: number | null; count: number },
): TeamStatusGrowth {
  if (
    recent.count < TEAM_STATUS_GROWTH_MIN_POSTS ||
    previous.count < TEAM_STATUS_GROWTH_MIN_POSTS ||
    recent.median === null ||
    previous.median === null ||
    previous.median <= 0
  ) {
    return { state: "insufficient", ratio: null };
  }
  const raw = recent.median / previous.median;
  return {
    state: raw <= TEAM_STATUS_GROWTH_POOR_RATIO ? "poor" : "ok",
    ratio: Math.round(raw * 100) / 100,
  };
}
