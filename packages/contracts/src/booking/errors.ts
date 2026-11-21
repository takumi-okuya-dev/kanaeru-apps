// 予約（booking）の領域のエラーの code と文言（zod を読まない）。
// 交流会がない・権限がないは event の EVENT_ERRORS（NOT_FOUND・FORBIDDEN）を使う。
// 文言は EXPERIENCE.md の言葉づかい（何が起きたか・なぜか・どうすればよいか）。

/** 領域のエラー（code・状態の番号・文言）。API は AppError にそのまま渡す。 */
export const BOOKING_ERRORS = {
  /** 使い方が「受付だけ」の交流会で、名簿の窓口を呼んだ（research R1） */
  ROSTER_OFF: {
    code: "BOOKING_ROSTER_OFF",
    status: 409,
    message:
      "この交流会は名簿を使っていません。準備の画面の「使い方」で「名簿を使う」を選んでから、もう一度開いてください。",
  },
  /** 名簿の行がない（ほかの端末で消された・まとめられた・別の交流会の ID） */
  ENTRY_NOT_FOUND: {
    code: "BOOKING_ENTRY_NOT_FOUND",
    status: 404,
    message:
      "名簿の行が見つかりません。ほかの端末でまとめられたかもしれません。画面を読み直してください。",
  },
  /** チェックインがない（取り消された・別の交流会の ID） */
  CHECKIN_NOT_FOUND: {
    code: "BOOKING_CHECKIN_NOT_FOUND",
    status: 404,
    message: "チェックインが見つかりません。取り消されたかもしれません。画面を読み直してください。",
  },
  /** 当てられない行（取り消し・もう当たっている） */
  ENTRY_NOT_MATCHABLE: {
    code: "BOOKING_ENTRY_NOT_MATCHABLE",
    status: 409,
    message:
      "この行には当てられません。取り消しの行か、もうほかのチェックインに当たっています。画面を読み直してください。",
  },
  /** チェックインがもう名簿に当たっている */
  CHECKIN_ALREADY_MATCHED: {
    code: "BOOKING_CHECKIN_ALREADY_MATCHED",
    status: 409,
    message: "このチェックインは、もう名簿に当たっています。画面を読み直してください。",
  },
  /** 外そうとした当てが、手で当てたものでない（同じアカウントの自動の当て・当たっていない） */
  MATCH_NOT_MANUAL: {
    code: "BOOKING_MATCH_NOT_MANUAL",
    status: 409,
    message:
      "この行は手で当てたものではないので外せません。同じ LINE のアカウントで自動で当たったときは、チェックインを取り消してください。",
  },
  /** 名前の違う行をまとめようとした（research R7） */
  MERGE_NAME_MISMATCH: {
    code: "BOOKING_MERGE_NAME_MISMATCH",
    status: 400,
    message: "まとめられるのは、同じ名前の2つの行だけです。画面を読み直して、選び直してください。",
  },
  /** 組織の知らせの設定を、組織の管理者でない人が開いた（booking-002 research R11） */
  NOTIFY_FORBIDDEN: {
    code: "BOOKING_NOTIFY_FORBIDDEN",
    status: 403,
    message:
      "組織の LINE 公式アカウントとメールの設定は、組織の管理者だけが変えられます。変えたいときは管理者に頼んでください。",
  },
  /** 鍵の束（TOKEN_ENCRYPTION_KEYS）の設定がなく、公式アカウントの鍵を包めない */
  NOTIFY_UNAVAILABLE: {
    code: "BOOKING_NOTIFY_UNAVAILABLE",
    status: 503,
    message:
      "公式アカウントの設定を保存する準備ができていません（鍵の設定がありません）。運営に知らせてください。",
  },
  /** ボット情報が 401（アクセストークンが合わない。research R10） */
  LINE_TOKEN_INVALID: {
    code: "BOOKING_LINE_TOKEN_INVALID",
    status: 400,
    message:
      "アクセストークンが合いません。LINE Developers の Messaging API の画面で発行した「チャネルアクセストークン（長期）」を貼り直してください。",
  },
  /** ボット情報を読めなかった（LINE に届かない） */
  LINE_UNREACHABLE: {
    code: "BOOKING_LINE_UNREACHABLE",
    status: 502,
    message: "LINE に確かめられませんでした。少し待ってから、もう一度保存してください。",
  },
  /** 公式アカウントの LINE の値がまだない（確かめのメッセージ） */
  LINE_NOT_SET: {
    code: "BOOKING_LINE_NOT_SET",
    status: 409,
    message:
      "公式アカウントの設定がまだありません。先にチャネル ID とシークレットとアクセストークンを入れてください。",
  },
  /** 紐づけの札が知らない・消えた（research R3） */
  LINK_INVALID: {
    code: "BOOKING_LINK_INVALID",
    status: 404,
    message:
      "このリンクは使えません。公式アカウントをいったんブロックしてから友だち追加し直すと、新しいリンクが届きます。",
  },
  /** 紐づけの札の期限が切れた */
  LINK_EXPIRED: {
    code: "BOOKING_LINK_EXPIRED",
    status: 410,
    message:
      "このリンクは期限（7日）が切れました。公式アカウントをいったんブロックしてから友だち追加し直すと、新しいリンクが届きます。",
  },
  /** 紐づけの札はもう使われた */
  LINK_USED: {
    code: "BOOKING_LINK_USED",
    status: 409,
    message:
      "このリンクは使い終わっています。紐づけ直すときは、公式アカウントをいったんブロックしてから友だち追加し直してください。",
  },
  /** 2つの行がどちらもチェックインに当たっているのに、まとめようとした（research R7） */
  MERGE_BOTH_MATCHED: {
    code: "BOOKING_MERGE_BOTH_MATCHED",
    status: 409,
    message:
      "2人とも来ています。別の人ではありませんか。同じ人なら、先に片方の当てを外してからまとめてください。",
  },
} as const;

/** 領域のエラーのキー。 */
export type BookingErrorKey = keyof typeof BOOKING_ERRORS;
