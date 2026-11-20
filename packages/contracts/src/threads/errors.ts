// Threads の運用（threads）の領域のエラーの code と文言（zod を読まない）。
// 運用アカウントがない・ほかの人のアカウントは、土台の NOT_FOUND（404）で返す（あることを知らせない）。
// 文言は EXPERIENCE.md の言葉づかい（何が起きたか・どうすればよいか）。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const THREADS_ERRORS = {
  /** 運用アカウントの数の上限 */
  THREADS_ACCOUNT_LIMIT: {
    code: "THREADS_ACCOUNT_LIMIT",
    status: 409,
    message: "これ以上アカウントを作れません。使わないアカウントを消してから作ってください。",
  },
  /** ほかの画面で先に直された（版が合わない） */
  THREADS_VERSION_CONFLICT: {
    code: "THREADS_VERSION_CONFLICT",
    status: 409,
    message: "ほかの画面で先に直されました。読みこみ直してから、もう一度直してください。",
  },
  /** 今の状態ではできない（承認済みの案を直すなど） */
  THREADS_DRAFT_STATE: {
    code: "THREADS_DRAFT_STATE",
    status: 409,
    message: "この案は、今の状態ではその操作ができません。読みこみ直してください。",
  },
  /** NG ワードや文字数の上限で承認できない */
  THREADS_DRAFT_NOT_APPROVABLE: {
    code: "THREADS_DRAFT_NOT_APPROVABLE",
    status: 409,
    message:
      "NGワードを含むか、Threads の上限（500文字・リンク5つ）を超える案は承認できません。本文を直してください。",
  },
  /** 同じ NG ワードがある */
  THREADS_NG_WORD_DUPLICATE: {
    code: "THREADS_NG_WORD_DUPLICATE",
    status: 409,
    message: "同じNGワードがあります。",
  },
  /** NG ワードの数の上限 */
  THREADS_NG_WORD_LIMIT: {
    code: "THREADS_NG_WORD_LIMIT",
    status: 409,
    message: "これ以上NGワードを足せません。使わないNGワードを外してから足してください。",
  },
  /** ためられる案の数の上限 */
  THREADS_DRAFT_LIMIT: {
    code: "THREADS_DRAFT_LIMIT",
    status: 409,
    message: "承認待ちの案が多すぎます。承認か却下をしてから、ためてください。",
  },
  /** 貼ったトークンを Threads で確かめられない（形が違う・無効・期限切れ） */
  THREADS_TOKEN_INVALID: {
    code: "THREADS_TOKEN_INVALID",
    status: 400,
    message:
      "トークンを確かめられませんでした。Meta のアプリで作った長期のアクセストークンを、前後の空白なしで貼ってください。",
  },
  /** 期限の短いトークン（短期トークン） */
  THREADS_TOKEN_SHORT_LIVED: {
    code: "THREADS_TOKEN_SHORT_LIVED",
    status: 400,
    message:
      "期限が48時間より短いトークンです。Meta のアプリで長期のアクセストークン（60日）に替えてから貼ってください。",
  },
  /** トークンの確かめの失敗が続いた */
  THREADS_TOKEN_CHECK_LOCKED: {
    code: "THREADS_TOKEN_CHECK_LOCKED",
    status: 429,
    message:
      "トークンの確かめに何度も失敗したため、少し止めています。10分ほど待ってから貼り直してください。",
  },
  /** Threads が一時的に答えない */
  THREADS_UNAVAILABLE: {
    code: "THREADS_UNAVAILABLE",
    status: 503,
    message: "Threads に一時的につながりません。少し待ってから、もう一度お試しください。",
  },
  /** 接続し直しで、前と違う Threads のアカウントのトークンを貼った */
  THREADS_RECONNECT_MISMATCH: {
    code: "THREADS_RECONNECT_MISMATCH",
    status: 409,
    message:
      "前につないでいた Threads のアカウントと違います。同じアカウントのトークンを貼るか、いったん接続を切ってからつないでください。",
  },
  /** その Threads のアカウントは、ほかの運用アカウントがつないでいる */
  THREADS_ACCOUNT_TAKEN: {
    code: "THREADS_ACCOUNT_TAKEN",
    status: 409,
    message:
      "この Threads のアカウントは、ほかの運用アカウントでつながっています。そちらの接続を切ってから、つないでください。",
  },
  /** その Threads のアカウントは、自分の別の運用アカウントがつないでいる（threads-012。ほかの人のときは THREADS_ACCOUNT_TAKEN） */
  THREADS_ACCOUNT_REGISTERED: {
    code: "THREADS_ACCOUNT_REGISTERED",
    status: 409,
    message:
      "この Threads のアカウントは、あなたの別の運用アカウントでつながっています。そのアカウントの設定から接続し直してください。",
  },
  /** トークンを包む鍵の設定がない（サーバーの準備ができていない） */
  THREADS_CONNECTION_UNAVAILABLE: {
    code: "THREADS_CONNECTION_UNAVAILABLE",
    status: 503,
    message:
      "今は Threads に接続できません（サーバーの準備ができていません）。時間をおいてお試しください。",
  },
  /** 自動投稿をオンにできない（未接続・接続し直しが要る・投稿の権限がない） */
  THREADS_NOT_READY: {
    code: "THREADS_NOT_READY",
    status: 409,
    message:
      "Threads に投稿できる状態でないため、自動投稿をオンにできません。設定の「Threads への接続」を確かめてください。",
  },
  /** 投稿の途中なので、今はできない */
  THREADS_PUBLISHING: {
    code: "THREADS_PUBLISHING",
    status: 409,
    message: "Threads に投稿している途中です。数分待ってから、もう一度お試しください。",
  },
  /** 宣伝・参考の投稿・キーワードの数の上限 */
  THREADS_ITEM_LIMIT: {
    code: "THREADS_ITEM_LIMIT",
    status: 409,
    message: "これ以上足せません。使わないものを消してから足してください。",
  },
  /** 同じキーワードがある */
  THREADS_KEYWORD_DUPLICATE: {
    code: "THREADS_KEYWORD_DUPLICATE",
    status: 409,
    message: "同じキーワードがあります。",
  },
  /** 時間差のメンション：今はその人を選べない（ほかの投稿で予定・24時間以内に済み） */
  THREADS_MENTION_BLOCKED: {
    code: "THREADS_MENTION_BLOCKED",
    status: 409,
    message:
      "同じ人へのメンションは24時間に1回までです。ほかの投稿で予定に入っているか、24時間以内に済んだ人を外してください。",
  },
  /** 時間差のメンション：この案には付けられない（状態・期間・権限・もう付いている） */
  THREADS_MENTION_NOT_ALLOWED: {
    code: "THREADS_MENTION_NOT_ALLOWED",
    status: 409,
    message:
      "この投稿には、今はメンションを付けられません（投稿から7日を過ぎた・もう付いている・返信の権限がないなど）。読みこみ直してください。",
  },
  /** 時間差のメンション：もう出したか、出している途中なので変えられない */
  THREADS_MENTION_SENT: {
    code: "THREADS_MENTION_SENT",
    status: 409,
    message: "この返信は、もう出したか出している途中なので、変えられません。",
  },
  /** OAuth の接続：許可の画面から戻る途中で、Meta の連携が解かれた（threads-012） */
  THREADS_AUTH_REVOKED: {
    code: "THREADS_AUTH_REVOKED",
    status: 409,
    message:
      "つなぐ途中で、Threads の側で連携が解かれました。もう一度つなぐなら、設定の画面から始めてください。",
  },
  /** OAuth の接続：その Threads のアカウントのデータの削除の要求を受けている（threads-012） */
  THREADS_DATA_DELETION_REQUESTED: {
    code: "THREADS_DATA_DELETION_REQUESTED",
    status: 409,
    message:
      "この Threads のアカウントは、データの削除の要求を受けているため、今はつなげません。削除が終わって1日たってから、もう一度つないでください。",
  },
  /** 運用アカウントを消す：入れた名前が合わない（threads-012） */
  THREADS_ACCOUNT_NAME_MISMATCH: {
    code: "THREADS_ACCOUNT_NAME_MISMATCH",
    status: 400,
    message:
      "入れた名前がアカウントの名前と違います。消すアカウントの名前をそのまま入れてください。",
  },
  /** チーム運用：権限が足りない（関わりはあるが、その操作は許されていない。threads-013） */
  THREADS_TEAM_FORBIDDEN: {
    code: "THREADS_TEAM_FORBIDDEN",
    status: 403,
    message:
      "この運用アカウントでは、この操作はできません。持ち主か、承認を任された担当の人に頼んでください。",
  },
  /** チーム運用：組織がない・組織の人でない（threads-013） */
  THREADS_TEAM_NOT_FOUND: {
    code: "THREADS_TEAM_NOT_FOUND",
    status: 404,
    message: "組織が見つかりません。組織から外れたか、組織が消えた可能性があります。",
  },
  /** チーム運用：担当にできない（メンバー・持ち主自身・組織に入っていない運用アカウント。threads-013） */
  THREADS_ASSIGNMENT_NOT_ALLOWED: {
    code: "THREADS_ASSIGNMENT_NOT_ALLOWED",
    status: 409,
    message:
      "この人は、この運用アカウントの担当にできません。編集者か管理者で、運用アカウントの持ち主でない人を選んでください。",
  },
  /** チーム運用：承認を任せられない（担当の人でない。threads-013） */
  THREADS_DELEGATION_NOT_ALLOWED: {
    code: "THREADS_DELEGATION_NOT_ALLOWED",
    status: 409,
    message: "承認を任せられるのは、この運用アカウントの担当の人だけです。読みこみ直してください。",
  },
} as const;

/** 領域のエラーのキー。 */
export type ThreadsErrorKey = keyof typeof THREADS_ERRORS;
