# 予約（booking）の地図

2026-11-20 作成（booking-001。決めた理由は [specs/booking/001-roster/research.md](../../specs/booking/001-roster/research.md)）。2026-11-20 直した（booking-002：知らせの仕組み〈LINE 公式アカウントの設定・Webhook・紐づけ・参加者の連絡のメールアドレス・知らせの記録・`sendNotice`〉。理由は [specs/booking/002-notify/research.md](../../specs/booking/002-notify/research.md)）。

受付アプリの4つ目の領域（構成の決めごと AD-23）。交流会ごとの使い方（受付だけ・名簿を使う）と名簿（申込み）を持ち、名簿を手で足す・貼る・CSV で作る・取り消す・まとめる・書き出す窓口と、受付係がチェックインを名簿に当てる窓口・画面を出す。依存は booking → reception → event の一方向で、reception は booking を読まない。チェックインとの当ては booking が読むときに決める（AD-3・AD-5・AD-7・AD-19・AD-23）。

知らせ（AD-24）：組織と個人の LINE 公式アカウントの設定・友だち追加の Webhook と紐づけ・参加者の連絡のメールアドレス・知らせの記録を持ち、送る道具（守りつき）は `platform/notify`（[全体の形](../architecture.md) 2章）を使う。業務の関数 `sendNotice` はあるが、この版でアプリの中から送るのは設定の画面の確かめのメッセージと、友だち追加へのあいさつだけ（申込みの知らせは次の仕様から呼ぶ）。

この版で作っていないもの：自前の申込みページ・LINE ログインで申し込む・定員と媒体の枠・キャンセル待ちと打診・部員だけの回・メールで申し込む・本物のメールの送信のサービス・参加者がメールアドレスを入れる画面（PRD 受付アプリの予約 8.1 の6〜7番）。

## 1. 表

| 表 | 列 | 決まり |
|---|---|---|
| `booking_setting` | `event_id`（主キー）・`mode`・`created_at`・`updated_at` | 交流会ごとの使い方。行がなければ受付だけ。`mode` は `reception`（受付だけ）・`roster`（名簿を使う）の CHECK（`booking_setting_mode_check`）。「受付だけ」に戻しても行は消さない |
| `booking_entry` | `id`・`event_id`・`name`・`application_source`（媒体）・`entry_kind`（入口）・`status`（状態）・`applied_at`（申し込んだ日時）・`entered_by`（入れた人）・`memo`・`account_id`（本人の申込み。この版では空）・`checkin_id`（手で当てたチェックイン）・`created_at`・`updated_at` | 名簿の1行。媒体は受付の申し込みの媒体（`connpass`・`peatix`・`direct`・`other`）、入口は `manual`（手で足す）・`import`（取り込み）・`walk_in`（飛び入り）、状態は `confirmed`（確定）・`cancelled`（取り消し）の CHECK。`checkin_id` は空でない行で一意（`booking_entry_checkin_id_unique`）、`(event_id, account_id)` は `account_id` が空でない行で一意。索引 `booking_entry_event_id_applied_at_idx`・`booking_entry_entered_by_idx`・`booking_entry_account_id_idx` |
| `booking_dismissal` | `id`・`event_id`・`checkin_id`・`entry_id`・`dismissed_by`・`created_at` | 受付係が「ちがう人」にした組。`(checkin_id, entry_id)` で一意 |
| `booking_import_mapping` | `id`・`owner_account_id`・`header_key`（見出しの並びの JSON）・`name_column`・`application_source`・`created_at`・`updated_at` | 交流会の持ち主ごとの CSV の列の対応。`(owner_account_id, header_key)` で一意 |

| `booking_line_channel` | `id`・`holder_account_id`・`holder_organization_id`・`line_channel_id`・`channel_secret_ciphertext`・`channel_secret_iv`・`channel_secret_key_version`・`channel_secret_tail`・`access_token_ciphertext`・`access_token_iv`・`access_token_key_version`・`access_token_tail`・`basic_id`・`reply_to_email`・`created_at`・`updated_at` | LINE 公式アカウントの設定とメールの返信先（booking-002）。持ち主はアカウントか組織のどちらか1つ（`booking_line_channel_holder_check`）で、持ち主ごとに1行（部分の一意）。LINE の値の9つの列は、そろって空か、そろって入っている（`booking_line_channel_line_check`。返信先だけの行を許す）。鍵は秘密の箱で包み（ひもづけ `<id>:secret`・`<id>:token`）、画面には末尾4文字だけを出す |
| `booking_line_link` | `id`・`channel_id`・`line_user_id`・`account_id`・`created_at`・`updated_at` | 紐づけ。`line_user_id` は公式アカウントから見える ID（送り先。LINE ログインの `sub` ではない。CHECK `^U[0-9a-f]{32}$`）。`(channel_id, account_id)`・`(channel_id, line_user_id)` で一意 |
| `booking_line_link_token` | `id`・`channel_id`・`line_user_id`・`token_hash`（SHA-256。一意）・`expires_at`・`used_at`・`used_by_account_id`・`created_at` | 紐づけの札。7日・1回だけ。同じ人の使っていない札は、友だち追加し直したときとブロックで消す |
| `booking_contact` | `account_id`（主キー）・`email`・`created_at`・`updated_at` | 参加者の連絡のメールアドレス（予約の知らせのためだけ・任意・本人の窓口だけが読み書きする・主催者に見せない。254文字まで） |
| `booking_notice` | `id`・`entry_id`・`channel_id`・`kind`・`method`・`result`・`created_at` | 知らせの記録。種類 `confirmed`・`waitlisted`・`offered`・`offer_expired`・`changed`・`cancelled_event`・`test`、手段 `line`・`email`・`none`、結果 `sent`・`off`・`not_allowed`・`no_destination`・`failed`・`unavailable` の CHECK。申込みが空なのは確かめのメッセージ（`test`）だけ。本文・宛先・トークンは持たない |

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

- 使い方・入口・状態の値は今使うものだけを CHECK に入れている。「自前で申込みを受ける」（`self_page`）・入口の自前のページ・キャンセル待ち・打診中を足すときは、CHECK を広げる（今の行はどれも通るので1回の DB の変更でよい）。
- 名前は前後の空白を消して持つ。そろえた名前（`normalizeCheckinName`）は持たず、比べるときに作る。名前はログに出さない。
- 参加者のメールアドレスは持たない・返さない（PRD FR-B26）。

## 2. 窓口（どれもログイン必須。道の頭は `/api/v1/booking/events/{eventId}`）

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `…/setting` | 主催者・受付係 | 使い方と名簿の行の数（`{ mode, entryCount }`。行がなければ `reception`） |
| PUT | `…/setting` | 主催者 | 使い方を変える（`reception`・`roster`。ほかは 400） |
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

- 交流会がない・形の違う ID は 404（event の `NOT_FOUND`）、役目が違えば 403（event の `FORBIDDEN`。部員とほかの人も）。使い方が受付だけなら、`…/setting` のほかは 409 `BOOKING_ROSTER_OFF`。
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

### 知らせを送る（`notify.ts` の `sendNotice`）

`sendNotice(deps, { entryId, kind, deadline?, waitlistPosition?, previous?, links? })`：

1. 当てはまる公式アカウント：交流会を組織に入れていれば組織の設定、なければ持ち主の個人の設定（event の `findEventOrganizationId`・`findEventOwnerAccountId`）
2. 申込みのアカウントがその公式アカウントと紐づいていれば LINE（push）
3. ほかで、本人の連絡のメールアドレスがあればメール（送り主の名前「<持ち主の名前>（kanaeru）」・返信先は設定のアドレス）
4. どちらもなければ送らずに `no_destination`

どの手段も送る道具の守りを通す（`off` は `off`・許可リストになければ `not_allowed`）。守りで止めたときと LINE が送れなかったときは、ほかの手段を試さない。結果を `booking_notice` に記録し、ログには申込みの ID・種類・手段・結果だけを出す。文面は `notice-templates.ts`（交流会の名前・日時〈日本時間〉・場所・自分の状態・渡されたリンク。5000文字まで）。

### 当ての決め方（読むとき。`matching.ts`）

1. 行の `checkin_id`（手で当てた・飛び入り）
2. 行のアカウント = チェックインのアカウント（自動。自前のページの申込みから効く）
3. 残りのチェックインに、当たっていない確定の行で、そろえた名前が同じで「ちがう人」にしていない行がちょうど1つ → 候補
4. ほかは名簿にいない（名簿から選ぶ・飛び入りにする）

取り消しの行は当てない。来なかった＝交流会の始まりの日（日本時間）の終わり（`endOfJstDate`）を過ぎ、確定で当たっていない行。受付の内訳の画面には出さない（受付は予約を知らない）。

### 取り込みの「すでにある」（`importing.ts`）

同じ交流会・入口が取り込み・同じ媒体の行（取り消しも数える）を、そろえた名前ごとに数え、その数までを「すでにある」として入れない。名前が空の行は入れない。入る行には、名簿（取り消しでない行）か同じ取り込みのほかの入る行に同じ名前があれば印を付ける。

## 3. ほかの領域が使うもの

API の入口（`apps/api/src/modules/booking/index.ts`）は `routes` と `withdrawal`（退会の確かめの中身だけ：組織に入れていない交流会の名簿の人数と、個人の公式アカウントの設定があること。消すのは外部キー）を出す。ほかの領域・ほかのアプリに出す関数はない（チェックインした人は reception の `listEventAttendees`・`hasCheckedIn`）。

booking が読むもの：event の `requireEventRole`・`getEventSummary`・`findEventOwnerAccountId`・`findEventOrganizationId`・`listPersonalEventIds`・`eventTable`、reception の `listEventAttendees`・`getCheckin`・`createManualCheckin`・`checkinTable`、account の `requireSession`・`currentAccount`・`findDisplayNames`・`accountTable`、suite の `findMembership`・`listMemberships`・`findOrganization`・`organizationTable`、共通の `platform/notify`（`verifyLineSignature`・`createNotifier`）と土台の `DomainRouteDeps.notifier`・`secretBox`。

約束（`@workspace/contracts/booking`）：選択肢 `BOOKING_MODES`・`ENTRY_KINDS`・`ENTRY_STATUSES`・`ATTENDANCES` と `*_LABELS`・`BOOKING_MODE_DESCRIPTIONS`、形 `BookingSetting`・`BookingSettingInput`・`Roster`・`RosterEntry`・`RosterEntryInput`・`RosterStatusInput`・`RosterMergeInput`・`RosterImportInput`・`RosterImportPreview`・`RosterImportResult`・`ImportMappingList`・`MatchBoard`・`MatchInput`、上限 `ENTRY_MEMO_MAX`・`ROSTER_IMPORT_ROWS_MAX`（500）・`IMPORT_HEADERS_MAX`・`IMPORT_HEADER_MAX`・`ROSTER_IMPORT_FILE_MAX_BYTES`（5MB）、`BOOKING_ERRORS`、管理の画面の道 `BOOKING_ROUTE_PATTERNS`・`bookingPaths`（`/admin/events/$eventId/roster`・`…/roster/import`・`…/roster/match`）。

約束（知らせ。booking-002）：選択肢 `NOTIFY_MODES`・`NOTICE_KINDS`・`NOTICE_METHODS`・`NOTICE_RESULTS` と `*_LABELS`、形 `LineChannelInput`・`MailSettingInput`・`NotifySettings`・`TestMessageResult`・`LineLinkPreview`・`LineLinkResult`・`ContactInput`・`ContactView`・`FakeOutbox`、`SECRET_TAIL_LENGTH`（4）・`LINE_LINK_TTL_DAYS`（7）・`EMAIL_MAX`、設定の画面の道 `BOOKING_SETTINGS_ROUTE_PATTERNS`・`bookingSettingsPaths`。紐づけの道は core の `participantPaths.lineLink`（AD-14）。

画面の入口（`apps/web/src/features/booking/index.ts`）：`feature`（道とナビ・設定の画面の項目「予約の知らせ」・組織の画面の入口「予約の知らせの設定（LINE・メール）」）。event の `registerSetupSection({ id: "booking-mode" })` と reception の `registerReceptionSection({ id: "booking-roster" })` をここで1度だけ登録する。

テスト：API は `apps/api/test/helpers/booking.ts` の `bookingBase(eventId)`・`useRoster(app, cookie, eventId)`・`importNames(app, cookie, eventId, names, applicationSource?)`・`readRoster(app, cookie, eventId)`。知らせは `apps/api/test/helpers/booking-notify.ts` の `notifyConfig(notify?)`（鍵の束と送り方）・`saveLine`・`postWebhook`（署名つき）・`lineEvent`・`readOutbox`・`linkTokenOf`・`followAndLink`。

## 4. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| 準備の画面（A4）の節 | 使い方（主催者だけ） | 選ぶカード（受付だけ・名簿を使う）と「使い方を変える」。名簿に行がある交流会を受付だけに戻すときは確かめの枠（名簿は消さずに隠す）。「自前で申込みを受ける」は次の版で選べると書く |
| 一覧画面（A3）の上の節 | 名簿（主催者・受付係） | 名簿を使う交流会だけ「名簿に当てる」と「名簿を見る」。ほかは何も出さない |
| ナビ | 「名簿」 | 名簿を使う交流会の中で、主催者・受付係にだけ出す。画面が読んだ交流会と使い方から決め、ナビのために問い合わせない（`nav-items.ts`） |
| `/admin/events/$eventId/roster` | A2 名簿（主催者・受付係） | 上の操作：「1人足す」（画面の中に欄を開く。名前・媒体・メモ）・「貼る・CSV で入れる」「書き出す」（主催者だけ）・「名簿に当てる」。人数の欄（確定・取り消し・来た・来なかった〈日が終わるまでは —〉・飛び入り・媒体ごと）・絞り込み（すべて・確定・取り消し・来なかった）。広い画面は表（名前・媒体・入口・状態・申し込んだ日時・来た）、狭い画面はカード。名前に「同じ名前があります」と「手で足した：（入れた人）」・メモ。主催者は行ごとに「取り消す」「戻す」と、同じ名前があれば「まとめる」（確かめの枠）。名簿を使わない交流会では案内（主催者には準備の画面への入口） |
| `/admin/events/$eventId/roster/import` | A3 名簿に入れる（主催者だけ） | タブ「名前をまとめて貼る」（1行に1人・媒体・「取り込む前に確かめる」）と「CSV を取り込む」（ファイル〈画面の中で読むだけ・UTF-8 か Shift_JIS・5MB と500行まで〉→ 名前の列 → 媒体）。同じ見出しの CSV は、持ち主が前に選んだ列と媒体を選んでおく。取り込む前の確かめ（入る・すでにある・名前が空の人数と行ごとの表・同じ名前の印）と「N人を取り込む」。入れたら名簿へ移り、知らせの帯 |
| `/admin/events/$eventId/roster/match` | S1 名簿に当てる（主催者・受付係） | 来た・確定・飛び入りの人数。当てを待つチェックインのカード（候補なら「名簿の候補：…」と「当てる」「ちがう人」、名簿にいなければ「名簿から選ぶ」〈名前で探す〉「飛び入りにする」）・さっきのチェックイン（名簿に当たった〈自動・手〉・飛び入り）・下の「手でチェックイン（名簿から選ぶ）」（名前で探して選ぶと、受付の欄〈名前と媒体を入れておく〉でチェックイン。「名簿にいない人（飛び入り）」）。5秒おきに読み直す（夜間の停止では止める） |
| `/settings/reception/notify` | A4 予約の知らせ（個人。設定の画面の下） | 今の送り方の帯・自分が管理者の組織の一覧（組織の設定への入口）・LINE 公式アカウントの節・メールの節 |
| `/settings/reception/notify/organizations/$organizationId` | A4 予約の知らせ（組織） | 組織の管理者だけ（ほかは「組織の管理者だけが変えられます」）。LINE の節：まだなければ3つの欄のフォーム、あれば末尾・ベーシック ID・紐づいた人・今月 LINE で送った数・「入れ直す」（空の欄は前のまま）・「公式アカウントの設定を消す」（確かめの枠）・Webhook の URL とコピー・LINE の画面での手順・あいさつの見本・「自分に確かめのメッセージを送る」（結果はボタンのそば）。メールの節：送り主の名前（変えられない）と返信先 |
| `/line-link/$linkToken` | 紐づけ（参加者が外から開く。外枠のナビなし） | ログイン（SessionGate）→ 持ち主の名前と「紐づける」→「紐づけました」。使った札は本人なら「もう紐づいています」、知らない・期限切れ・ほかの人が使った札は理由と、友だち追加し直すと新しいリンクが届くこと |

- 参加者がほかの人の名前を見る画面は足していない。

## 5. 置き場所

| 所 | ファイル |
|---|---|
| 約束 | `packages/contracts/src/booking/`（`options.ts`・`roster.ts`・`notify-options.ts`・`notify.ts`・`errors.ts`・`paths.ts`・`index.ts`） |
| API | `apps/api/src/modules/booking/`（`schema.ts`・`repository.ts`・`importing.ts`・`matching.ts`・`views.ts`・`csv.ts`・`routes.ts`・`notify-repository.ts`・`notify-settings.ts`・`line-link.ts`・`notice-templates.ts`・`notify.ts`・`routes-notify.ts`・`routes-webhook.ts`・`withdrawal.ts`・`index.ts`・テスト） |
| DB の変更 | `apps/api/drizzle/0015_booking.sql`・`0016_booking_notify.sql` |
| 画面 | `apps/web/src/features/booking/`（`api.ts`・`queries.ts`・`nav-items.ts`・`csv-read.ts`・`ModeSection.tsx`・`ReceptionRosterSection.tsx`・`RosterGate.tsx`・`RosterPage.tsx`・`ImportPage.tsx`・`MatchPage.tsx`・`notify-api.ts`・`NotifySettingsPage.tsx`・`LineLinkPage.tsx`・`routes.ts`・`index.ts`） |
| テストの手伝い | `apps/api/test/helpers/booking.ts`・`booking-notify.ts` |
| 通しのテスト | `e2e/tests/booking.spec.ts`・`booking-notify.spec.ts` |
