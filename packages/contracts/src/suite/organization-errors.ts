// スイートの組織（suite-001）のエラーの code と文言と、上限・役割の値（zod を読まない。画面が文言だけを読んでも zod を束に入れないため）。
// 文言は EXPERIENCE.md の言葉づかい（何が起きたか・どうすればよいか）。組織の人でない人には、組織があることを知らせない（404）。

/** 組織の役割（管理者・編集者・メンバー。管理者は1組織に1人。AD-22）。 */
export const ORGANIZATION_ROLES = ["admin", "editor", "member"] as const;

/** 組織の役割。 */
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/** 役割の見える名前。 */
export const ORGANIZATION_ROLE_LABELS = {
  admin: "管理者",
  editor: "編集者",
  member: "メンバー",
} as const satisfies Record<OrganizationRole, string>;

/** 組織の名前の長さの上限（前後の空白を除いて）。 */
export const ORGANIZATION_NAME_MAX = 50;

/** 1人が管理者として持てる組織の数の上限（PRD O1 の仮決め）。 */
export const ORGANIZATION_ADMIN_LIMIT = 20;

/** 1つの組織の人の数の上限（PRD O1 の仮決め）。 */
export const ORGANIZATION_MEMBER_LIMIT = 50;

/** 1つの組織の編集者の数の上限（PRD O1 の仮決め）。 */
export const ORGANIZATION_EDITOR_LIMIT = 10;

/** チームの名前の長さの上限（前後の空白を除いて。suite-003 の仮決め）。 */
export const TEAM_NAME_MAX = 30;

/** 1つの組織のチームの数の上限（suite-003 の仮決め）。 */
export const TEAM_LIMIT = 20;

/** 招待の札の形（base64url の43文字。32バイトの乱数）。 */
export const ORGANIZATION_INVITE_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const ORGANIZATION_ERRORS = {
  /** 組織がない・組織の人でない（あることを知らせない） */
  ORGANIZATION_NOT_FOUND: {
    code: "ORGANIZATION_NOT_FOUND",
    status: 404,
    message: "組織が見つかりません。組織から外れたか、組織が消えた可能性があります。",
  },
  /** 管理者だけができる操作 */
  ORGANIZATION_ADMIN_ONLY: {
    code: "ORGANIZATION_ADMIN_ONLY",
    status: 403,
    message: "この操作は、組織の管理者だけができます。",
  },
  /** 管理者として持てる組織の数の上限 */
  ORGANIZATION_LIMIT: {
    code: "ORGANIZATION_LIMIT",
    status: 409,
    message: `組織は${ORGANIZATION_ADMIN_LIMIT}まで作れます。使わない組織を消してから作ってください。`,
  },
  /** 組織の人の数の上限 */
  ORGANIZATION_FULL: {
    code: "ORGANIZATION_FULL",
    status: 409,
    message: `この組織は人数の上限（${ORGANIZATION_MEMBER_LIMIT}人）に達しています。管理者に相談してください。`,
  },
  /** 編集者の数の上限 */
  ORGANIZATION_EDITOR_LIMIT: {
    code: "ORGANIZATION_EDITOR_LIMIT",
    status: 409,
    message: `編集者は${ORGANIZATION_EDITOR_LIMIT}人までです。ほかの人をメンバーに戻してから、もう一度お試しください。`,
  },
  /** 招待のリンクが使えない（作り直された・組織が消えた） */
  ORGANIZATION_INVITE_INVALID: {
    code: "ORGANIZATION_INVITE_INVALID",
    status: 404,
    message: "この招待のリンクは使えません。作り直されたか、組織が消えた可能性があります。",
  },
  /** 自分には使えない操作（自分の役割を変える・自分を外す） */
  ORGANIZATION_SELF_NOT_ALLOWED: {
    code: "ORGANIZATION_SELF_NOT_ALLOWED",
    status: 409,
    message:
      "自分にはこの操作はできません。管理者を替えるときは「管理者を引き継ぐ」を使ってください。",
  },
  /** 管理者が抜けるときは、先に引き継ぐ人を選ぶ */
  ORGANIZATION_SUCCESSOR_REQUIRED: {
    code: "ORGANIZATION_SUCCESSOR_REQUIRED",
    status: 409,
    message:
      "管理者がいなくなると、招待や役割の切り替えができなくなります。引き継ぐ人を選んでください。ほかに誰もいなければ、組織を消してください。",
  },
  /** 相手が組織の人でない・管理者の役割は変えられない */
  ORGANIZATION_MEMBER_NOT_FOUND: {
    code: "ORGANIZATION_MEMBER_NOT_FOUND",
    status: 404,
    message: "その人は、この組織にいません。読みこみ直してください。",
  },
  /** チームがない（消えた・別の組織のチーム） */
  TEAM_NOT_FOUND: {
    code: "TEAM_NOT_FOUND",
    status: 404,
    message: "チームが見つかりません。消された可能性があります。読みこみ直してください。",
  },
  /** チームの数の上限 */
  TEAM_LIMIT: {
    code: "TEAM_LIMIT",
    status: 409,
    message: `チームは1つの組織に${TEAM_LIMIT}まで作れます。使わないチームを消してから作ってください。`,
  },
  /** 同じ組織に同じ名前のチームがある */
  TEAM_NAME_TAKEN: {
    code: "TEAM_NAME_TAKEN",
    status: 409,
    message: "同じ名前のチームがあります。別の名前にしてください。",
  },
  /** 相手がチームの人でない（足すときは組織の人でない） */
  TEAM_MEMBER_NOT_FOUND: {
    code: "TEAM_MEMBER_NOT_FOUND",
    status: 404,
    message: "その人は、この組織かチームにいません。読みこみ直してください。",
  },
} as const;

/** 領域のエラーの code。 */
export type OrganizationErrorCode = keyof typeof ORGANIZATION_ERRORS;
