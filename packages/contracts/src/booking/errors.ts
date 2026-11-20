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
  /** 交流会がない・使い方が自前でない（booking-003 research R13） */
  PAGE_NOT_FOUND: {
    code: "BOOKING_PAGE_NOT_FOUND",
    status: 404,
    message: "この会の申込みページはありません。主催者から届いた URL を確かめてください。",
  },
  /** 部員だけの回を、主催者・部員でない人が開いた（research R8） */
  PAGE_MEMBERS_ONLY: {
    code: "BOOKING_PAGE_MEMBERS_ONLY",
    status: 403,
    message:
      "この会は見られません。部員だけの会です。部員の方は、部の LINE ログインで開いてください。",
  },
  /** 受付を閉じている・始まりを過ぎた（research R1） */
  PAGE_CLOSED: {
    code: "BOOKING_PAGE_CLOSED",
    status: 409,
    message:
      "いまは申込みを受け付けていません。主催者が受付を閉じたか、始まりを過ぎました。画面を読み直してください。",
  },
  /** 始まりを過ぎてから取り消そうとした（research R7） */
  CANCEL_CLOSED: {
    code: "BOOKING_CANCEL_CLOSED",
    status: 409,
    message:
      "始まりを過ぎたので、ここからは取り消せません。行けなくなったときは、主催者に直接知らせてください。",
  },
  /** 知らない札・交流会が消えた（research R10） */
  ENTRY_TOKEN_INVALID: {
    code: "BOOKING_ENTRY_TOKEN_INVALID",
    status: 404,
    message:
      "このリンクは使えません。新しいリンクで確定したか、会がなくなったかもしれません。届いた最新のメールのリンクを開いてください。",
  },
  /** 確認の札の期限が切れた（research R10） */
  ENTRY_TOKEN_EXPIRED: {
    code: "BOOKING_ENTRY_TOKEN_EXPIRED",
    status: 410,
    message:
      "このリンクは期限（24時間）が切れました。申込みページから、もう一度申し込んでください。",
  },
  /** 交流会ごとの確認の待ちが上限に達した（research R11） */
  EMAIL_REQUEST_LIMIT: {
    code: "BOOKING_EMAIL_REQUEST_LIMIT",
    status: 429,
    message:
      "いまは確認のメールを送れません。申込みが集中しています。しばらくしてから、もう一度送ってください。",
  },
  /** 使い方が自前でないのに、受付・見せる範囲を変えようとした（research R13） */
  SELF_PAGE_OFF: {
    code: "BOOKING_SELF_PAGE_OFF",
    status: 409,
    message:
      "この交流会は自前で申込みを受けていません。準備の画面の「使い方」で「自前で申込みを受ける」を選んでから、もう一度開いてください。",
  },
  /** 組織に入れていない交流会を部員だけにしようとした（research R8） */
  VISIBILITY_NEEDS_ORGANIZATION: {
    code: "BOOKING_VISIBILITY_NEEDS_ORGANIZATION",
    status: 400,
    message:
      "部員だけにするには、先に交流会を組織に入れてください。準備の画面の「組織に入れる」から入れられます。",
  },
  /** 本人のものでない・ない案内の同意（research R5） */
  CONSENT_NOT_FOUND: {
    code: "BOOKING_CONSENT_NOT_FOUND",
    status: 404,
    message: "案内の同意が見つかりません。もう外したかもしれません。画面を読み直してください。",
  },
  /** 枠の合計が定員を超える・定員なしで枠（booking-004 research R1） */
  QUOTA_OVER_CAPACITY: {
    code: "BOOKING_QUOTA_OVER_CAPACITY",
    status: 400,
    message:
      "媒体の枠の合計が定員を超えています。枠を減らすか、定員を増やしてから保存してください。",
  },
  /** 自前で定員がないのに、キャンセル待ち・打診を使おうとした（research R4・R14） */
  WAITLIST_OFF: {
    code: "BOOKING_WAITLIST_OFF",
    status: 409,
    message:
      "この交流会はキャンセル待ちを使っていません。自前で申込みを受け、定員を入れると使えます。",
  },
  /** 手で打診する行がキャンセル待ちでない（research R14） */
  ENTRY_NOT_WAITLISTED: {
    code: "BOOKING_ENTRY_NOT_WAITLISTED",
    status: 409,
    message: "この行はキャンセル待ちではありません。画面を読み直してください。",
  },
  /** 始まりが近くて、返事の期限が1時間取れない（research R6・R14） */
  OFFER_WINDOW_SHORT: {
    code: "BOOKING_OFFER_WINDOW_SHORT",
    status: 409,
    message:
      "始まりまでの時間が短いので、打診できません（返事の期限が1時間取れません）。参加してもらうときは「確定にする」を押してください。",
  },
  /** 返事する打診がない（research R8） */
  OFFER_NOT_PENDING: {
    code: "BOOKING_OFFER_NOT_PENDING",
    status: 409,
    message:
      "いまは返事を受け付けていません。打診中ではないか、もう答えています。画面を読み直してください。",
  },
  /** 返事の期限が過ぎた（research R8） */
  OFFER_EXPIRED: {
    code: "BOOKING_OFFER_EXPIRED",
    status: 410,
    message:
      "返事の期限が過ぎたので、この申込みは取り消しになりました。席は次の方にお回ししました。",
  },
  /** 当日の空きが埋まった（research R7） */
  NO_SEAT: {
    code: "BOOKING_NO_SEAT",
    status: 409,
    message: "当日の空きは埋まりました。キャンセル待ちのまま、また席が空いたらお知らせします。",
  },
  /** 中止した会に申し込む・受付を開く（research R11） */
  EVENT_CANCELLED: {
    code: "BOOKING_EVENT_CANCELLED",
    status: 409,
    message: "この会は中止になりました。申込みは受け付けていません。",
  },
  /** 知らせる変更がない（research R10） */
  NO_CHANGE: {
    code: "BOOKING_NO_CHANGE",
    status: 409,
    message: "知らせる日時や場所の変更はありません。画面を読み直してください。",
  },
} as const;

/** 領域のエラーのキー。 */
export type BookingErrorKey = keyof typeof BOOKING_ERRORS;
