# 予約（booking）の地図

2026-11-20 作成（booking-001。決めた理由は [specs/booking/001-roster/research.md](../../specs/booking/001-roster/research.md)）。2026-11-20 直した（booking-002：知らせの仕組み〈LINE 公式アカウントの設定・Webhook・紐づけ・参加者の連絡のメールアドレス・知らせの記録・`sendNotice`〉。理由は [specs/booking/002-notify/research.md](../../specs/booking/002-notify/research.md)）。2026-11-20 直した（booking-003：自前の申込みページ〈申込みページ・LINE ログインで申し込む・案内の同意・取り消し・カレンダー・部員だけの回・メールで申し込む・自分の申込みと部の予定〉。理由は [specs/booking/003-apply/research.md](../../specs/booking/003-apply/research.md)）。2026-11-20 直した（booking-004 の1つ目：定員・媒体の枠・キャンセル待ち・打診の表と列。窓口と画面は次の変更。理由は [specs/booking/004-waitlist/research.md](../../specs/booking/004-waitlist/research.md)）。

受付アプリの4つ目の領域（構成の決めごと AD-23）。交流会ごとの使い方（受付だけ・名簿を使う・自前で申込みを受ける）と名簿（申込み）を持ち、名簿を手で足す・貼る・CSV で作る・取り消す・まとめる・書き出す窓口と、受付係がチェックインを名簿に当てる窓口・画面を出す。依存は booking → reception → event の一方向で、reception は booking を読まない。チェックインとの当ては booking が読むときに決める（AD-3・AD-5・AD-7・AD-19・AD-23）。

知らせ（AD-24）：組織と個人の LINE 公式アカウントの設定・友だち追加の Webhook と紐づけ・参加者の連絡のメールアドレス・知らせの記録を持ち、送る道具（守りつき）は `platform/notify`（[全体の形](../architecture.md) 2章）を使う。アプリの中から送るのは、設定の画面の確かめのメッセージ・友だち追加へのあいさつ・申込みの確定の知らせ（`sendNotice`）・メールで申し込む人への確認のメールだけ。

自前の申込み（booking-003）：使い方が「自前で申込みを受ける」の交流会は、参加者が外から開く申込みページ（`/e/{eventId}`。ログインなしで見られる）を持つ。受付は主催者が開く（既定は閉じる）・始まりを過ぎたら読むときに閉じたものとして扱う。LINE ログインで1交流会1人1つ申し込み（入口「自前」・媒体「直接」・確定）、案内の同意（組織か持ち主ごと）を任意で残す。LINE を使わない人は確認のメール（札は SHA-256 だけ・24時間）のリンクで確定し、同じ札のページ（`/e/{eventId}/entry/{entryToken}`）で見る・取り消す。参加者は自分の申込み（`/my-bookings`）で取り消し、部の予定を見る。部員だけの回は、主催者と部員のほかには中身を返さない。定員はまだないので、申し込めばみな確定する。

この版で作っていないもの：定員と媒体の枠・席の残り・キャンセル待ちと打診・日時や場所の変更と中止の知らせ・案内を送る機能（同意は記録だけ）・本物のメールの送信のサービス（PRD 受付アプリの予約 8.1 の7番）。

## 1. 表

| 表 | 列 | 決まり |
|---|---|---|
| `booking_setting` | `event_id`（主キー）・`mode`・`accepting`・`visibility`・`capacity`・`quota_released_at`・`cancelled_at`・`notified_starts_at`・`notified_venue`・`change_detected_at`・`same_day_notified_at`・`created_at`・`updated_at` | 交流会ごとの使い方。行がなければ受付だけ。`mode` は `reception`（受付だけ）・`roster`（名簿を使う）・`self_page`（自前で申込みを受ける。booking-003）の CHECK（`booking_setting_mode_check`）。「受付だけ」に戻しても行は消さない。`accepting`（申込みページの受付を開いているか。既定 false）・`visibility`（`public`＝誰でも・`members`＝部員だけ。既定 `public`。CHECK `booking_setting_visibility_check`）は booking-003。`capacity`（定員。空＝定員なし。1〜1000 の CHECK `booking_setting_capacity_check`）・`quota_released_at`（一度満員になって媒体の枠を押さえるのをやめた時刻）・`cancelled_at`（予約を中止した時刻）・`notified_starts_at`・`notified_venue`（最後に知らせた日時と場所。変更を比べる）・`change_detected_at`（定期の仕事が変更に気づいた時刻）・`same_day_notified_at`（当日の空きを知らせた時刻）は booking-004 |
| `booking_entry` | `id`・`event_id`・`name`・`application_source`（媒体）・`entry_kind`（入口）・`status`（状態）・`applied_at`（申し込んだ日時）・`entered_by`（入れた人）・`memo`・`account_id`（本人の申込み〈自前のページで LINE ログインして申し込んだ人〉）・`checkin_id`（手で当てたチェックイン）・`contact_email`（メールで申し込んだ人の連絡のメール。主催者に見せない）・`entry_token_hash`（メールで申し込んだ人の札の SHA-256）・`created_at`・`updated_at` | 名簿の1行。媒体は受付の申し込みの媒体（`connpass`・`peatix`・`direct`・`other`）、入口は `manual`（手で足す）・`import`（取り込み）・`walk_in`（飛び入り）・`self_page`（自前。booking-003）、状態は `confirmed`（確定）・`waitlisted`（キャンセル待ち）・`offered`（打診中）・`cancelled`（取り消し）の CHECK（キャンセル待ち・打診中は booking-004）。`checkin_id` は空でない行で一意（`booking_entry_checkin_id_unique`）、`(event_id, account_id)` は `account_id` が空でない行で一意、`(event_id, contact_email)`・`entry_token_hash` は空でない行で一意（booking-003）。`contact_email` は254文字まで。索引 `booking_entry_event_id_applied_at_idx`・`booking_entry_entered_by_idx`・`booking_entry_account_id_idx`・`booking_entry_event_id_status_idx`（booking-004） |
| `booking_dismissal` | `id`・`event_id`・`checkin_id`・`entry_id`・`dismissed_by`・`created_at` | 受付係が「ちがう人」にした組。`(checkin_id, entry_id)` で一意 |
| `booking_import_mapping` | `id`・`owner_account_id`・`header_key`（見出しの並びの JSON）・`name_column`・`application_source`・`created_at`・`updated_at` | 交流会の持ち主ごとの CSV の列の対応。`(owner_account_id, header_key)` で一意 |

| `booking_line_channel` | `id`・`holder_account_id`・`holder_organization_id`・`line_channel_id`・`channel_secret_ciphertext`・`channel_secret_iv`・`channel_secret_key_version`・`channel_secret_tail`・`access_token_ciphertext`・`access_token_iv`・`access_token_key_version`・`access_token_tail`・`basic_id`・`reply_to_email`・`created_at`・`updated_at` | LINE 公式アカウントの設定とメールの返信先（booking-002）。持ち主はアカウントか組織のどちらか1つ（`booking_line_channel_holder_check`）で、持ち主ごとに1行（部分の一意）。LINE の値の9つの列は、そろって空か、そろって入っている（`booking_line_channel_line_check`。返信先だけの行を許す）。鍵は秘密の箱で包み（ひもづけ `<id>:secret`・`<id>:token`）、画面には末尾4文字だけを出す |
| `booking_line_link` | `id`・`channel_id`・`line_user_id`・`account_id`・`created_at`・`updated_at` | 紐づけ。`line_user_id` は公式アカウントから見える ID（送り先。LINE ログインの `sub` ではない。CHECK `^U[0-9a-f]{32}$`）。`(channel_id, account_id)`・`(channel_id, line_user_id)` で一意 |
| `booking_line_link_token` | `id`・`channel_id`・`line_user_id`・`token_hash`（SHA-256。一意）・`expires_at`・`used_at`・`used_by_account_id`・`created_at` | 紐づけの札。7日・1回だけ。同じ人の使っていない札は、友だち追加し直したときとブロックで消す |
| `booking_contact` | `account_id`（主キー）・`email`・`created_at`・`updated_at` | 参加者の連絡のメールアドレス（予約の知らせのためだけ・任意・本人の窓口だけが読み書きする・主催者に見せない。254文字まで） |
| `booking_consent` | `id`・`account_id`（同意した人）・`organization_id`・`owner_account_id`・`created_at` | 案内の同意（booking-003）。相手は組織か交流会の持ち主のどちらか1つ（`booking_consent_holder_check`）。相手ごとに1つ（部分の一意）。案内を送る機能はまだない（記録だけ） |
| `booking_email_request` | `id`・`event_id`・`name`・`email`・`token_hash`（SHA-256。一意）・`expires_at`・`created_at` | メールで申し込む確認の待ち（booking-003）。24時間。確定すると消し、期限切れはその交流会に新しい待ちを作るときに消す |
| `booking_quota` | `id`・`event_id`・`application_source`・`seats`・`manage_url`・`created_at`・`updated_at` | 媒体の枠（booking-004）。媒体は直接を除く `connpass`・`peatix`・`other` の CHECK、席は1〜1000、管理ページの URL は任意（`http(s)://` で500文字まで）。`(event_id, application_source)` で一意 |
| `booking_offer` | `id`・`event_id`・`entry_id`・`status`・`deadline`・`token_hash`・`offered_by`・`responded_at`・`created_at`・`updated_at` | 打診と返事の期限（booking-004）。状態は `pending`（待っている）・`accepted`（参加）・`declined`（辞退）・`expired`（期限切れ）・`withdrawn`（取り下げ）の CHECK。待っている打診は申込みごとに1つ（`booking_offer_entry_id_pending_unique`）。`token_hash` はメールの人の返事の札の SHA-256（空でなければ一意）、`offered_by` は手で打診した主催者（自動は空）。索引 `(status, deadline)`・`event_id`・`offered_by` |
| `booking_notice` | `id`・`entry_id`・`channel_id`・`kind`・`method`・`result`・`created_at` | 知らせの記録。種類 `confirmed`・`waitlisted`・`offered`・`offer_expired`・`changed`・`cancelled_event`・`same_day`（当日の空き。booking-004）・`test`、手段 `line`・`email`・`none`、結果 `sent`・`off`・`not_allowed`・`no_destination`・`failed`・`unavailable` の CHECK。申込みが空なのは確かめのメッセージ（`test`）だけ。本文・宛先・トークンは持たない |

消し方（research R11）：

| 外部キー | 消し方 |
|---|---|
| 交流会を指すもの（`booking_setting`・`booking_entry`・`booking_dismissal` の `event_id`） | `CASCADE`（名簿は持ち主のデータ。event の退会の段が組織に入れていない交流会を消すと、名簿も消える） |
| `booking_entry.account_id`・`booking_import_mapping.owner_account_id` | `CASCADE`（本人の申込み・持ち主のデータ） |
| `booking_entry.entered_by`・`booking_dismissal.dismissed_by` | `SET NULL`（誰がしたか） |
| `booking_entry.checkin_id` | `SET NULL`（チェックインを取り消すと当てが外れる） |
| `booking_dismissal.checkin_id`・`booking_dismissal.entry_id` | `CASCADE` |
| `booking_line_channel` の持ち主（アカウント・組織）・`booking_line_link.account_id`・`booking_contact.account_id` | `CASCADE`（持ち主・本人のデータ。booking-002） |
| `booking_line_link.channel_id`・`booking_line_link_token.channel_id` | `CASCADE` |
| `booking_line_link_token.used_by_account_id` | `SET NULL` |
| `booking_notice.entry_id` | `CASCADE`／`booking_notice.channel_id` は `SET NULL`（記録は残る） |
| `booking_consent` の `account_id`・`organization_id`・`owner_account_id` | `CASCADE`（本人の同意・相手がいなくなれば消える。booking-003） |
| `booking_email_request.event_id` | `CASCADE`（交流会と一緒に消える） |
| `booking_quota.event_id`・`booking_offer.event_id`・`booking_offer.entry_id` | `CASCADE`（交流会・申込みと一緒に消える。booking-004） |
| `booking_offer.offered_by` | `SET NULL`（誰がしたか。booking-004） |

- 使い方・入口・状態の値は今使うものだけを CHECK に入れている。足すときは CHECK を広げる（今の行はどれも通るので1回の DB の変更でよい。`self_page` は booking-003、キャンセル待ち・打診中・当日の空きは booking-004 でこの形で足した）。
- 名前は前後の空白を消して持つ。そろえた名前（`normalizeCheckinName`）は持たず、比べるときに作る。名前はログに出さない。
- 参加者のメールアドレスは、メールで申し込んだ人の `contact_email` と、本人が入れた `booking_contact` だけ。主催者・受付係の答え（名簿・CSV・当てる画面）には出さない（PRD FR-B26・Constitution II）。

## 2. 窓口（どれもログイン必須。道の頭は `/api/v1/booking/events/{eventId}`）

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `…/setting` | 主催者・受付係 | 使い方と名簿の行の数・申込みページの設定（行がなければ `reception`・閉じる・誰でも） |
| PUT | `…/setting` | 主催者 | 使い方を変える（`reception`・`roster`・`self_page`。ほかは 400） |
| GET | `…/entries` | 主催者・受付係 | 名簿（行は申し込んだ日時の古い順。行ごとに `sameName`・`attendance`〈`came`・`no_show`・`pending`〉・`match`〈`manual`・`auto`〉・`enteredByName`〈手で足した・飛び入りの入れた人〉）・人数（確定・取り消し・来た・来なかった・飛び入り・媒体ごとの確定）・`eventEnded` |
| POST | `…/entries` | 主催者・受付係 | 1人足す（名前・媒体・メモ。入口は手で足す。201） |
| PUT | `…/entries/{entryId}/status` | 主催者 | 取り消す・戻す |
| POST | `…/entries/merge` | 主催者 | 同じ名前の2つの行をまとめる（`{ keepEntryId, removeEntryId }`。消す行の当て・アカウント・メモを、残す行になければ移す。名前が違えば 400 `BOOKING_MERGE_NAME_MISMATCH`） |
| POST | `…/entries/import/preview` | 主催者 | 取り込む前の見積もり（書かない） |
| POST | `…/entries/import` | 主催者 | 取り込む（`{ applicationSource, rows: [{ line, name }], mapping? }`。1〜500行・名前は50文字まで。`mapping` があれば持ち主の列の対応を覚える） |
| GET | `…/import-mappings` | 主催者 | 交流会の持ち主が覚えた列の対応（新しく覚えた順） |
| GET | `…/entries/export` | 主催者 | 名簿の CSV（`roster-YYYY-MM-DD.csv`。列は 名前・媒体・入口・状態・申し込んだ日時・来た・入れた人・メモ。`@workspace/csv` で BOM・CRLF・式の守り） |
| GET | `…/matches` | 主催者・受付係 | 名簿に当てる画面（チェックインごとの `state`〈`candidate`・`unmatched`・`matched_auto`・`matched_manual`・`walk_in`〉と当たった行か候補・名簿から選べる行・人数） |
| POST | `…/checkins/{checkinId}/match` | 主催者・受付係 | 当てる・名簿から選ぶ（`{ entryId }`） |
| POST | `…/checkins/{checkinId}/dismiss` | 主催者・受付係 | ちがう人（`{ entryId }`） |
| POST | `…/checkins/{checkinId}/walk-in` | 主催者・受付係 | 当たらないチェックインを飛び入りの行にして当てる（名前と媒体を写す。201） |
| DELETE | `…/entries/{entryId}/match` | 主催者・受付係 | 手で当てたものを外す（同じアカウントの自動の当ては 409 `BOOKING_MATCH_NOT_MANUAL`） |
| POST | `…/entries/{entryId}/checkin` | 主催者・受付係 | 名簿から選んで手でチェックインし、その行に当てる（受付の `CheckinInput`。201） |
| POST | `…/walk-ins` | 主催者・受付係 | 名簿にいない人を手でチェックインし、飛び入りの行を足す（受付の `CheckinInput`。201） |
| PUT | `…/self-page` | 主催者 | 申込みページの受付を開く・閉じると見せる範囲（`{ accepting, visibility }`。使い方が自前でなければ 409 `BOOKING_SELF_PAGE_OFF`・組織に入れていないのに `members` は 400 `BOOKING_VISIBILITY_NEEDS_ORGANIZATION`。booking-003） |

- `…/setting` の答えは `{ mode, entryCount, accepting, visibility, started, inOrganization }`（後ろの4つは booking-003。`started` は始まりを過ぎたか）。使い方は `reception`・`roster`・`self_page`。
- 交流会がない・形の違う ID は 404（event の `NOT_FOUND`）、役目が違えば 403（event の `FORBIDDEN`。部員とほかの人も）。使い方が受付だけなら、`…/setting` のほかは 409 `BOOKING_ROSTER_OFF`（名簿を使う・自前で申込みを受けるのどちらでも名簿の窓口は動く）。
- 行・チェックインは道の交流会のものだけを読む（ほかの交流会のものは 404 `BOOKING_ENTRY_NOT_FOUND`・`BOOKING_CHECKIN_NOT_FOUND`）。取り消しの行・もう当たった行に当てると 409 `BOOKING_ENTRY_NOT_MATCHABLE`、もう当たったチェックインは 409 `BOOKING_CHECKIN_ALREADY_MATCHED`。
- 名簿を書く窓口（取り込み・まとめる・当てる・飛び入り・名簿から選んで手でチェックイン）は、`booking_setting` の行を `FOR UPDATE` で押さえたトランザクションの中で決め直す（同時に押しても二重にならない）。飛び入りと名簿から選んで手でチェックインは、reception の `createManualCheckin` に同じトランザクションを渡す。
- 入力の形・選択肢（code・言葉・並び）・エラーの文言・管理の画面の道は `packages/contracts/src/booking/`。

### 知らせの窓口（booking-002。道の頭は `/api/v1/booking`）

`{holder}` は `personal`（今の利用者の個人の設定）か `organizations/{organizationId}`（組織の管理者だけ。要求のたびに suite の `findMembership` で引き、ほかは 403 `BOOKING_NOTIFY_FORBIDDEN`）。

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `/notify-settings/{holder}` | 本人・組織の管理者 | 設定の画面の答え（持ち主・今の送り方・LINE の値〈末尾・Webhook の URL・紐づいた人数・今月 LINE で送った数〉・あいさつの見本・送り主の名前と返信先・自分が紐づいているか。個人のときは自分が管理者の組織の一覧） |
| PUT | `/notify-settings/{holder}/line` | 同じ | LINE の値を入れる・入れ直す（初めは3つとも、入れ直しは1つ以上。チャネル ID を変えるときは3つとも要り、前の紐づけと札を消す）。アクセストークンはボット情報で確かめ（401 は 400 `BOOKING_LINE_TOKEN_INVALID`・届かないと 502 `BOOKING_LINE_UNREACHABLE`）、ベーシック ID を持つ。秘密の箱がなければ 503 `BOOKING_NOTIFY_UNAVAILABLE` |
| DELETE | `/notify-settings/{holder}/line` | 同じ | LINE の値と紐づけ・札を消す（返信先は残る） |
| PUT | `/notify-settings/{holder}/mail` | 同じ | 返信先を変える（`{ replyToEmail }`。null で消す） |
| POST | `/notify-settings/{holder}/test` | 同じ | 自分に確かめのメッセージを送る（紐づいていなければ `not_linked`。許可リストにないときは本人の ID を返す。LINE の値がなければ 409 `BOOKING_LINE_NOT_SET`） |
| POST | `/webhooks/line/{channelId}` | LINE（ログインなし） | 署名（`x-line-signature`）を確かめ、友だち追加にあいさつ（札つきのリンク）を返事で送り、ブロックで紐づけと札を消す。署名・形が合わない・64KB を超える → 本文のない 400。知らない設定 → 404 |
| GET・POST | `/line-links/{linkToken}` | ログインした人 | 札の中身（持ち主の名前・使える・使った・期限切れ・自分が紐づいているか）／紐づける（使った 409 `BOOKING_LINK_USED`・期限切れ 410 `BOOKING_LINK_EXPIRED`・知らない 404 `BOOKING_LINK_INVALID`） |
| GET・PUT・DELETE | `/me/contact` | ログインした人（本人） | 連絡のメールアドレスを読む・入れる（小文字にそろえる）・消す |
| GET | `/dev/notify-outbox` | ログインした人 | 試験用のログインが入で偽の送り手のときだけ、偽の送り手が覚えたもの（手元と E2E であいさつのリンクを読む）。ほかは 404 |

### 自前の申込みの窓口（booking-003。道の頭は `/api/v1/booking`）

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `/events/{eventId}/page` | だれでも（ログインは任意。account の `findSessionViewer`） | 申込みページ（交流会の名前・日時・会場・参加費・主催〈組織の名前か持ち主の表示名〉・受付の状態〈`open`・`closed`・`started`〉・見せる範囲・カレンダーのリンク・友だち追加の URL〈ベーシック ID があるとき〉。ログインしていれば名前の初めの値・自分の申込み・案内の同意・紐づけ・連絡のメールがあるか）。使い方が自前でない・ない交流会は 404 `BOOKING_PAGE_NOT_FOUND` |
| POST | `/events/{eventId}/apply` | ログインした人 | 申し込む（`{ name, consent? }`。新しく・取り消しから戻したら 201、もう確定なら 200 で何もしない）。受付中でなければ 409 `BOOKING_PAGE_CLOSED`。確定したら `sendNotice`（確定・申込みページとカレンダーのリンク） |
| GET | `/events/{eventId}/calendar` | だれでも | `.ics`（添付。終わりは始まりの2時間後） |
| POST | `/events/{eventId}/email-requests` | だれでも | LINE を使わずに申し込む：確認の待ちを作り確認のメールを送る（`{ name, email }`。答えはいつも 202。同じ交流会・同じアドレスは10分に1通・交流会ごとの待ちは200件まで〈超えたら 429 `BOOKING_EMAIL_REQUEST_LIMIT`〉） |
| GET・POST | `/entry-tokens/{entryToken}`・`…/confirm`・`…/cancel` | だれでも（札を知る本人） | 札のページ（`pending`〈確認の前〉・`entry`〈申込みがある〉）／確定する（2回押しても1行。すでにそのアドレスの申込みがあれば札を替える。確定したら `sendNotice`）／取り消す（始まりまで）。期限切れ 410 `BOOKING_ENTRY_TOKEN_EXPIRED`・知らない 404 `BOOKING_ENTRY_TOKEN_INVALID` |
| GET | `/me/entries` | ログインした人 | 自分の申込み（始まりの日が終わっていない会・始まりの近い順） |
| POST | `/me/entries/{entryId}/cancel` | ログインした人（本人の行だけ） | 取り消す（始まりを過ぎたら 409 `BOOKING_CANCEL_CLOSED`・ほかの人の行は 404） |
| GET | `/me/schedule` | ログインした人 | 部の予定（自分がメンバーの組織に入れた自前の会。部員だけの回も） |
| GET・DELETE | `/me/consents`・`/me/consents/{consentId}` | ログインした人（本人だけ） | 案内の同意の一覧・外す（ほかの人のものは 404 `BOOKING_CONSENT_NOT_FOUND`） |

- 部員だけの回（`visibility = members`）は、ページ・申込み・`.ics` が主催者と部員（event の `getEventRole`）のほかに 403 `BOOKING_PAGE_MEMBERS_ONLY`（中身を返さない）。メールで申し込む・確定するは誰でもの会だけ。
- 申し込む・確定するは、`booking_setting` の行を `FOR UPDATE` で押さえて受付中かを決め直す（同時に押しても1行）。
- GET は何も書かない（確定・取り消しは画面のボタンの POST だけ。メールの下見の仕組みが開いても確定しない）。
- 名前・メールアドレス・札はログに出さない。メールで申し込んだ人の連絡のメールは名簿・CSV・当てる画面の答えに出さない（答えは列を選んで作る）。

### 知らせを送る（`notify.ts` の `sendNotice`）

`sendNotice(deps, { entryId, kind, deadline?, waitlistPosition?, previous?, links? })`：

1. 当てはまる公式アカウント：交流会を組織に入れていれば組織の設定、なければ持ち主の個人の設定（event の `findEventOrganizationId`・`findEventOwnerAccountId`）
2. 申込みのアカウントがその公式アカウントと紐づいていれば LINE（push）
3. ほかで、メールで申し込んだ人の行の連絡のメール（`contact_email`。booking-003）か、本人の連絡のメールアドレスがあればメール（送り主の名前「<持ち主の名前>（kanaeru）」・返信先は設定のアドレス）
4. どちらもなければ送らずに `no_destination`

どの手段も送る道具の守りを通す（`off` は `off`・許可リストになければ `not_allowed`）。守りで止めたときと LINE が送れなかったときは、ほかの手段を試さない。結果を `booking_notice` に記録し、ログには申込みの ID・種類・手段・結果だけを出す。文面は `notice-templates.ts`（交流会の名前・日時〈日本時間〉・場所・自分の状態・渡されたリンク。5000文字まで）。

### 当ての決め方（読むとき。`matching.ts`）

1. 行の `checkin_id`（手で当てた・飛び入り）
2. 行のアカウント = チェックインのアカウント（自動。自前のページで LINE ログインして申し込んだ人に効く。FR-B100）
3. 残りのチェックインに、当たっていない確定の行で、そろえた名前が同じで「ちがう人」にしていない行がちょうど1つ → 候補
4. ほかは名簿にいない（名簿から選ぶ・飛び入りにする）

取り消しの行は当てない。来なかった＝交流会の始まりの日（日本時間）の終わり（`endOfJstDate`）を過ぎ、確定で当たっていない行。受付の内訳の画面には出さない（受付は予約を知らない）。

### 取り込みの「すでにある」（`importing.ts`）

同じ交流会・入口が取り込み・同じ媒体の行（取り消しも数える）を、そろえた名前ごとに数え、その数までを「すでにある」として入れない。名前が空の行は入れない。入る行には、名簿（取り消しでない行）か同じ取り込みのほかの入る行に同じ名前があれば印を付ける。

## 3. ほかの領域が使うもの

API の入口（`apps/api/src/modules/booking/index.ts`）は `routes` と `withdrawal`（退会の確かめの中身だけ：組織に入れていない交流会の名簿の人数と、個人の公式アカウントの設定があること・自分の申込みと案内の同意の件数〈booking-003〉。消すのは外部キー）を出す。ほかの領域・ほかのアプリに出す関数はない（チェックインした人は reception の `listEventAttendees`・`hasCheckedIn`）。

booking が読むもの：event の `requireEventRole`・`getEventRole`・`getEventSummary`・`findEventOwnerAccountId`・`findEventOrganizationId`・`listOrganizationEvents`（booking-003）・`listPersonalEventIds`・`eventTable`、reception の `listEventAttendees`・`getCheckin`・`createManualCheckin`・`checkinTable`、account の `requireSession`・`currentAccount`・`findSessionViewer`（booking-003）・`findDisplayNames`・`accountTable`、suite の `findMembership`・`listMemberships`・`findOrganization`・`organizationTable`、共通の `platform/notify`（`verifyLineSignature`・`createNotifier`）と土台の `DomainRouteDeps.notifier`・`secretBox`。

約束（`@workspace/contracts/booking`）：選択肢 `BOOKING_MODES`・`ENTRY_KINDS`・`ENTRY_STATUSES`・`ATTENDANCES` と `*_LABELS`・`BOOKING_MODE_DESCRIPTIONS`、形 `BookingSetting`・`BookingSettingInput`・`Roster`・`RosterEntry`・`RosterEntryInput`・`RosterStatusInput`・`RosterMergeInput`・`RosterImportInput`・`RosterImportPreview`・`RosterImportResult`・`ImportMappingList`・`MatchBoard`・`MatchInput`、上限 `ENTRY_MEMO_MAX`・`ROSTER_IMPORT_ROWS_MAX`（500）・`IMPORT_HEADERS_MAX`・`IMPORT_HEADER_MAX`・`ROSTER_IMPORT_FILE_MAX_BYTES`（5MB）、`BOOKING_ERRORS`、管理の画面の道 `BOOKING_ROUTE_PATTERNS`・`bookingPaths`（`/admin/events/$eventId/roster`・`…/roster/import`・`…/roster/match`）。

約束（知らせ。booking-002）：選択肢 `NOTIFY_MODES`・`NOTICE_KINDS`・`NOTICE_METHODS`・`NOTICE_RESULTS` と `*_LABELS`、形 `LineChannelInput`・`MailSettingInput`・`NotifySettings`・`TestMessageResult`・`LineLinkPreview`・`LineLinkResult`・`ContactInput`・`ContactView`・`FakeOutbox`、`SECRET_TAIL_LENGTH`（4）・`LINE_LINK_TTL_DAYS`（7）・`EMAIL_MAX`、設定の画面の道 `BOOKING_SETTINGS_ROUTE_PATTERNS`・`bookingSettingsPaths`。紐づけの道は core の `participantPaths.lineLink`（AD-14）。

約束（自前の申込み。booking-003）：選択肢 `VISIBILITIES`・`PAGE_STATES` と `*_LABELS`・`usesRoster`、形 `SelfPageInput`・`ApplyInput`・`EmailApplyInput`・`EmailApplyAccepted`・`ApplyPage`・`ApplyViewer`・`ApplyEvent`・`ApplyResult`・`MyEntry`・`EntryTokenView`・`MyEntryList`・`MyEntryItem`・`MySchedule`・`ScheduleItem`・`ConsentList`・`CalendarLinks`、上限 `APPLY_NAME_MAX`（50。受付の名前と同じ）・`EMAIL_REQUEST_TTL_HOURS`（24）・`EMAIL_REQUEST_RESEND_MINUTES`（10）・`EMAIL_REQUESTS_PER_EVENT_MAX`（200）、カレンダー `googleCalendarUrl`・`eventEndsAt`・`calendarStamp`・`EVENT_DEFAULT_DURATION_MINUTES`（120）。参加者の道は core の `participantPaths.apply`・`entry`・`myBookings`（AD-14）。`apply.ts` は受付の約束を読まない（読むと申込みページの画面の束に受付の zod の形が入り、束の分け方が変わって画面の zod の設定〈jitless〉より先に形が作られ、CSP の eval の違反になる。research の「作りながら決めたこと」）。

画面の入口（`apps/web/src/features/booking/index.ts`）：`feature`（道とナビ・設定の画面の項目「予約の知らせ」・組織の画面の入口「予約の知らせの設定（LINE・メール）」）。event の `registerSetupSection({ id: "booking-mode" })` と reception の `registerReceptionSection({ id: "booking-roster" })` をここで1度だけ登録する。

テスト：API は `apps/api/test/helpers/booking.ts` の `bookingBase(eventId)`・`useRoster(app, cookie, eventId)`・`importNames(app, cookie, eventId, names, applicationSource?)`・`readRoster(app, cookie, eventId)`。知らせは `apps/api/test/helpers/booking-notify.ts` の `notifyConfig(notify?)`（鍵の束と送り方）・`saveLine`・`postWebhook`（署名つき）・`lineEvent`・`readOutbox`・`linkTokenOf`・`followAndLink`。自前の申込みは `apps/api/test/helpers/booking-apply.ts` の `openSelfPage`（自前にして受付を開く）・`anonymous`（ログインなしの要求）・`apply`・`entryTokenOf`。

## 4. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| 準備の画面（A4）の節 | 使い方（主催者だけ） | 選ぶカード（受付だけ・名簿を使う・自前で申込みを受ける）と「使い方を変える」。名簿に行がある交流会を受付だけに戻すときは確かめの枠（名簿は消さずに隠す・申込みページもなくなる）。自前のときは下に「申込みページ」の節（受付の状態と「受付を開く」／「受付を閉じる」・見せる範囲〈組織に入れていなければ部員だけを選べない〉・ページの URL〈ミニアプリの URL。LIFF ID のない手元は画面の源＋道〉とコピー。始まりを過ぎたら「自動で閉じました」） |
| 一覧画面（A3）の上の節 | 名簿（主催者・受付係） | 名簿を使う・自前で申込みを受ける交流会だけ「名簿に当てる」と「名簿を見る」。ほかは何も出さない |
| ナビ | 「名簿」 | 名簿を使う・自前で申込みを受ける交流会の中で、主催者・受付係にだけ出す。画面が読んだ交流会と使い方から決め、ナビのために問い合わせない（`nav-items.ts`） |
| `/admin/events/$eventId/roster` | A2 名簿（主催者・受付係） | 上の操作：「1人足す」（画面の中に欄を開く。名前・媒体・メモ）・「貼る・CSV で入れる」「書き出す」（主催者だけ）・「名簿に当てる」。人数の欄（確定・取り消し・来た・来なかった〈日が終わるまでは —〉・飛び入り・媒体ごと）・絞り込み（すべて・確定・取り消し・来なかった）。広い画面は表（名前・媒体・入口・状態・申し込んだ日時・来た）、狭い画面はカード。名前に「同じ名前があります」と「手で足した：（入れた人）」・メモ。主催者は行ごとに「取り消す」「戻す」と、同じ名前があれば「まとめる」（確かめの枠）。名簿を使わない交流会では案内（主催者には準備の画面への入口） |
| `/admin/events/$eventId/roster/import` | A3 名簿に入れる（主催者だけ） | タブ「名前をまとめて貼る」（1行に1人・媒体・「取り込む前に確かめる」）と「CSV を取り込む」（ファイル〈画面の中で読むだけ・UTF-8 か Shift_JIS・5MB と500行まで〉→ 名前の列 → 媒体）。同じ見出しの CSV は、持ち主が前に選んだ列と媒体を選んでおく。取り込む前の確かめ（入る・すでにある・名前が空の人数と行ごとの表・同じ名前の印）と「N人を取り込む」。入れたら名簿へ移り、知らせの帯 |
| `/admin/events/$eventId/roster/match` | S1 名簿に当てる（主催者・受付係） | 来た・確定・飛び入りの人数。当てを待つチェックインのカード（候補なら「名簿の候補：…」と「当てる」「ちがう人」、名簿にいなければ「名簿から選ぶ」〈名前で探す〉「飛び入りにする」）・さっきのチェックイン（名簿に当たった〈自動・手〉・飛び入り）・下の「手でチェックイン（名簿から選ぶ）」（名前で探して選ぶと、受付の欄〈名前と媒体を入れておく〉でチェックイン。「名簿にいない人（飛び入り）」）。5秒おきに読み直す（夜間の停止では止める） |
| `/settings/reception/notify` | A4 予約の知らせ（個人。設定の画面の下） | 今の送り方の帯・自分が管理者の組織の一覧（組織の設定への入口）・LINE 公式アカウントの節・メールの節 |
| `/settings/reception/notify/organizations/$organizationId` | A4 予約の知らせ（組織） | 組織の管理者だけ（ほかは「組織の管理者だけが変えられます」）。LINE の節：まだなければ3つの欄のフォーム、あれば末尾・ベーシック ID・紐づいた人・今月 LINE で送った数・「入れ直す」（空の欄は前のまま）・「公式アカウントの設定を消す」（確かめの枠）・Webhook の URL とコピー・LINE の画面での手順・あいさつの見本・「自分に確かめのメッセージを送る」（結果はボタンのそば）。メールの節：送り主の名前（変えられない）と返信先 |
| `/line-link/$linkToken` | 紐づけ（参加者が外から開く。外枠のナビなし） | ログイン（SessionGate）→ 持ち主の名前と「紐づける」→「紐づけました」。使った札は本人なら「もう紐づいています」、知らない・期限切れ・ほかの人が使った札は理由と、友だち追加し直すと新しいリンクが届くこと |

| `/e/$eventId` | 申込みページ（参加者が外から開く。外枠のナビなし。booking-003） | ログインなしで交流会の欄（日時・会場・参加費・主催）と受付の状態。受付中なら「LINE でログインして申し込む」（主のボタン）と「LINE を使わずに申し込む」（同じ画面の中で名前とメールアドレスの欄に切り替え、「確認のメールを送る」）。ログインしたら名前（初めの値つき）と案内のチェック（初めは外す。同意していれば文）と「申し込む」。申し込んだら「申し込みました」（確定・カレンダーに追加〈Google・.ics〉・公式 LINE の友だち追加〈設定があるとき〉・任意のメールアドレス・自分の申込みを見る・取り消す〈確かめの枠〉）。部員だけの回は「この会は見られません」（ログインしていなければログインの入口） |
| `/e/$eventId/entry/$entryToken` | 札のページ（メールで申し込んだ人。ログインなし） | 確認の前は「申込みを確定する」（開いただけでは確定しない）、確定のあとは状態・カレンダーに追加・取り消す。期限切れは申込みページへの入口、知らない札は「使えません」 |
| `/my-bookings` | 自分の申込み（参加者。ログインが要る。外枠のナビなし） | タブ「自分の申込み」（今後の回・状態・カレンダーに追加・取り消す〈確かめの枠〉）と「部の予定」（`?tab=schedule`。自分の組織の自前の会・受付の状態・部員だけ・自分の状態）。下の「知らせと案内」でメールアドレスを入れる・消す、案内を受け取る主催を外す |

- 参加者がほかの人の名前を見る画面はない。外へのリンク（カレンダー・友だち追加）は `rel="noopener noreferrer"`。

## 5. 置き場所

| 所 | ファイル |
|---|---|
| 約束 | `packages/contracts/src/booking/`（`options.ts`・`roster.ts`・`notify-options.ts`・`notify.ts`・`apply.ts`・`calendar.ts`・`errors.ts`・`paths.ts`・`index.ts`） |
| API | `apps/api/src/modules/booking/`（`schema.ts`・`repository.ts`・`importing.ts`・`matching.ts`・`views.ts`・`csv.ts`・`routes.ts`・`notify-repository.ts`・`notify-settings.ts`・`line-link.ts`・`notice-templates.ts`・`notify.ts`・`routes-notify.ts`・`routes-webhook.ts`・`tokens.ts`・`apply-repository.ts`・`apply.ts`・`calendar-ics.ts`・`routes-apply.ts`・`withdrawal.ts`・`index.ts`・テスト） |
| DB の変更 | `apps/api/drizzle/0015_booking.sql`・`0016_booking_notify.sql`・`0017_booking_apply.sql`・`0018_booking_waitlist.sql` |
| 画面 | `apps/web/src/features/booking/`（`api.ts`・`queries.ts`・`nav-items.ts`・`csv-read.ts`・`ModeSection.tsx`・`ReceptionRosterSection.tsx`・`RosterGate.tsx`・`RosterPage.tsx`・`ImportPage.tsx`・`MatchPage.tsx`・`notify-api.ts`・`NotifySettingsPage.tsx`・`LineLinkPage.tsx`・`apply-api.ts`・`apply-parts.tsx`・`links.ts`・`ApplyPage.tsx`・`EntryTokenPage.tsx`・`MyBookingsPage.tsx`・`SelfPageSection.tsx`・`routes.ts`・`index.ts`） |
| テストの手伝い | `apps/api/test/helpers/booking.ts`・`booking-notify.ts`・`booking-apply.ts` |
| 通しのテスト | `e2e/tests/booking.spec.ts`・`booking-notify.spec.ts`・`booking-apply.spec.ts` |
