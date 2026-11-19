# Threads の運用（threads）の地図

2026-11-20 作成（threads-001。めぐる〈`meguru-app`〉の Threads の運用アプリを移したもの。範囲は [PRD](../../_bmad-output/prd-threads/prd-threads.md)、決めた理由は [specs/threads/](../../specs/threads/) の各仕様）。同じ日に threads-002（接続と自動投稿）・threads-003（反応の分析）・threads-004（宣伝とリサーチ）・threads-005（操作の記録）・threads-006（アルゴリズムの分析）・threads-007（時間差のメンション）・threads-008（外部メディアの掲載文）・threads-009（戦略のガイドと AI との壁打ち。画面と約束だけ）・threads-010（OAuth の接続と Meta の Webhook。設定で切）を足した。

運用する Threads のアカウント（運用アカウント）ごとに、戦略・投稿のルールと NG ワード・プロンプトの設定を持ち、外の AI に貼るプロンプトを作り、貼り戻した答えを投稿の案にためて、承認・却下する（AI の段階1。アプリは外の AI に何も送らない。構成の決めごと AD-20）。Threads に長期のアクセストークンでつなぎ、承認した案を決めた時刻に自動で投稿する（threads-002）。投稿の反応を取りこんで好調・普通・低調を判定し、低調の傾向を次のプロンプトに入れる（threads-003）。宣伝（イベントの情報つき）・参考の投稿・リサーチのキーワードを持ち、プロンプトの材料にする（解説とキーワードの案は外の AI に貼るプロンプトで作る。threads-004）。操作を90日記録する（threads-005）。確定した投稿の反応から、伸びやすい時間帯・長さ・書き出しを読むたびに計算し、本文で変えられる傾向を次のプロンプトに入れる（内容の分類は外の AI に貼るプロンプトで付ける。threads-006）。投稿のあと決めた時間がたつと、その投稿への返信で決めた人にメンションする（threads-007）。宣伝のイベントから、5つのイベントの掲載サイトに貼る文を決まった計算で作る（threads-008）。設定で入にすると、アプリの Meta のアプリで Threads につなぎ（OAuth）、Meta の連携の解除・データの削除の知らせに応じる（threads-010）。

- 公開：アプリ `threads`（`packages/contracts/src/core/apps.list.ts`。道の頭 `/threads`）として登録し、だれに見せるかはアプリの台帳（suite の `app_setting`。設定 → アプリの台帳）で決める（AD-16）。組み立てがすべての道に `requireApp` を付け、見えなければ 404。台帳に行がない間は運営者だけ。定期の仕事（`/api/v1/threads/jobs/…`）と Webhook（`/api/v1/threads/webhooks/…`）は、見る人がいないので、切のときだけ 404（`requireAppNotOff`）。画面の外枠のナビは、Threads の画面の中でだけ項目を出す。
- 持ち主：最上位の記録 `threads_account` が kanaeru の `account_id` を持ち、読み書きはどれも持ち主だけ。ほかの人の運用アカウントは、ないのと同じ 404（AD-19）。
- 秘密：Threads のトークンは、土台が渡す秘密の箱（`deps.secretBox`。`packages/secret-box` の AES-256-GCM。鍵は設定 `TOKEN_ENCRYPTION_KEYS`）で、ひもづけを運用アカウントの ID にして包む。鍵の設定がなければ接続は 503。定期の仕事の合言葉（`JOB_TRIGGER_SECRET`）は `deps.isJobRequest` で確かめる（値は領域に来ない）。
- 外への出口：Threads の API は `deps.fetch` で、宛先は設定 `THREADS_API_BASE_URL`（既定は `https://graph.threads.net`）。
- OAuth と Meta の Webhook（threads-010）：機能の印 `threads.oauth`（既定は切）と、設定 `THREADS_APP_ID`・`THREADS_APP_SECRET` の両方があるときだけ。秘密の値は領域に来ず、土台が渡す道具 `deps.metaApp`（`kernel/meta-app.ts`：signed_request の確かめ・トークンの交換の値）を使う。Webhook の道（`/api/v1/threads/webhooks/…`）は、組み立ての csrf の確かめを通らない（クッキーを使わず、署名で確かめる）。

## 1. 表（どれも `ON DELETE CASCADE`。持ち主のアカウントを消すと全部消える）

| 表 | 列 | 決まり |
|---|---|---|
| `threads_account` | `id`・`account_id`（持ち主）・`name`・`prompt_post_count`・`post_length_target`・`short_length`・`medium_length`・`long_length`・`short_ratio`・`medium_ratio`・`long_ratio`・`core_rules`・`connection_status`・`threads_user_id`・`username`・`display_name`・`connection_generation`・`reconnect_hint`・`insights_denied_at`・`replies_denied_at`・`promotion_ratio_percent`・`created_at`・`updated_at` | 名前は1〜50文字。件数は1〜50。割合の合計は100。持ち主ごとに10個まで（同時に作っても超えないよう、持ち主ごとの鍵をかける）。接続の状態は `not_connected`・`connected`・`needs_reconnect`（未接続なら Threads のユーザーとユーザー名は空。CHECK）。`threads_user_id` は一意（同じ Threads のアカウントは1つにだけつなぐ）。接続の世代は、つなぎ直し・延長・切断で1つ増え、書きこみの条件に使う |
| `threads_strategy` | `threads_account_id`（主キー）・テキストの欄26（空は `""`）・`tone_preset`・`version` | 最初の保存で作る。保存は読んだ版と同じときだけ（違えば 409 `THREADS_VERSION_CONFLICT`） |
| `threads_draft_batch` | `id`・`threads_account_id`・`client_request_id`・`draft_count`・`delimiter_found`・`created_at` | (`threads_account_id`, `client_request_id`) は一意。同じ送り直しは前のまとまりを返す |
| `threads_post_draft` | `id`・`threads_account_id`・`batch_id`・`position`・`body`・`status`・`version`・`reviewed_at`・`reject_reasons`・`reject_note`・`prioritized_at`・`carryover_attempt_id`・`published_at`・`threads_media_id`・`threads_permalink`・`permalink_checked_at`・`publish_failed_at`・`publish_error`・`published_slot_minute`・`published_carryover`・`published_prioritized`・`blocked_at`・`blocked_reason`・`blocked_words` | 状態は `needs_review`・`approved`・`rejected`・`publishing`・`published`・`publish_failed`。承認・却下・投稿の日時と理由・投稿の順の列は、状態と食い違わないよう CHECK（`threads_post_draft_review_state_v2`）で縛る（却下は理由かメモが要る）。直前の確かめの記録は承認待ちのときだけ。承認待ちは運用アカウントごとに500件まで |
| `threads_ng_word` | `id`・`threads_account_id`・`word`・`normalized`・`seq` | 照合の形（`normalizeNgWord`）で同じものは1つ。運用アカウントごとに200個まで |
| `threads_connection` | `threads_account_id`（主キー）・`access_token_ciphertext`・`access_token_iv`・`key_version`・`scopes`・`expires_at`・`issued_at`・`authorized_at`・`recheck_at` | トークンは包んだ形だけ（平文を持たない）。期限を確かめられなかったトークンは `recheck_at`（2時間後）に確かめ直す |
| `threads_token_check_failure` | `id`・`account_id`（確かめた kanaeru のアカウント）・`failed_at`・`reason` | トークンの確かめの失敗（`pending` は確かめの途中の予約）。10分に5回で10分待たせる。1日より前は定期の仕事が消す |
| `threads_posting_schedule` | `threads_account_id`（主キー）・`enabled`・`slot_minutes`・`jitter`・`effective_from`・`paused_until`・`blocked_notice_seen_at`・`version` | 時刻は0時からの分（10個まで。選べる幅 8:30〜23:00 は約束で確かめる）。`effective_from` より前の予定は投稿しない。上限で止めたら `paused_until`（次の日の0時） |
| `threads_post_metric` | `draft_id`（主キー）・`threads_account_id`・`state`・`views`・`likes`・`replies`・`reposts`・`quotes`・`shares`・`last_fetched_at`・`last_elapsed_minutes`・`last_kind`・`confirmed_at`・`unmeasurable_reason`・`judgment`・`judgment_ratio`・`judgment_baseline`・`judged_at`・`feedback_memo`・`include_in_prompt`・`feedback_version`・`feedback_updated_at` | 投稿済みの案ごとの反応の今の値（threads-003）。状態は `updating`・`confirmed`・`late_confirmed`・`unmeasurable`。確定・計れないの行は定期の仕事が上書きしない。判定は確定したときに1回だけ。メモは200文字まで（版） |
| `threads_post_metric_snapshot` | `id`・`draft_id`・`threads_account_id`・`kind`（`h24`・`d3`・`d7`・`late`）・`method`（`slot`・`daily`）・`fetched_at`・`elapsed_minutes`・6つの数 | 取りこみの記録（上書きしない）。(`draft_id`, `kind`) は一意 |
| `threads_follower_snapshot` | `threads_account_id`・`snapshot_date`（主キーは2つの組）・`followers_count`・`captured_at` | 1日（日本時間）1行 |
| `threads_promotion` | `id`・`threads_account_id`・`title`・`content`・`target_location`・`target_persona`・`target_age_range`・`cta`・`linked_url`・`priority`・`status`（`active`・`paused`・`ended`）・`valid_until`・`event`（jsonb。イベントの情報）・`version` | 宣伝（threads-004）。運用アカウントごとに50まで。宣伝中で期限内のものがプロンプトに入る |
| `threads_reference_post` | `id`・`threads_account_id`・`body`・`keyword`・`post_url`・`why_good`・`platform`・`posted_date_mode`・`posted_date`・`metric_*`（6つ）・`author`・`memo`・`version` | 参考の投稿。200まで。投稿日は「日付」のときだけ（CHECK） |
| `threads_research_keyword` | `id`・`threads_account_id`・`keyword`・`keyword_normalized`・`purpose`・`version` | リサーチのキーワード。100まで。照合の形で同じものは1つ |
| `threads_activity_log` | `id`・`threads_account_id`・`kind`（`review`・`draft`・`content`・`settings`・`autopost`）・`action`・`item_count`・`summary`・`created_at` | 操作の記録（threads-005）。書き出しは30文字まで。90日を過ぎたものは定期の仕事が消す |
| `threads_analysis_setting` | `threads_account_id`（主キー）・`trends_in_prompt`・`themes`（jsonb。`[{ id, name }]`）・`version` | 分析の設定（threads-006）。最初の保存で作る（読んでないときは版 0）。テーマは10個まで（CHECK） |
| `threads_post_classification` | `draft_id`（主キー）・`threads_account_id`・`opening_type`・`theme_id`・`source`（`ai`・`manual`） | 投稿の内容の分類。書き出しの型は約束の `OPENING_TYPES` と同じ（CHECK）。テーマを消すとその分類のテーマは null に戻す |
| `threads_mention_setting` | `threads_account_id`（主キー）・`message`・`delay_minutes`・`version` | 時間差のメンションのひとこと（100文字まで）と時間差（10分〜1日の7つ。CHECK）。threads-007 |
| `threads_mention_person` | `id`・`threads_account_id`・`username`・`label`・`always` | メンションする人（持ち主が入れた Threads のユーザー名と呼び名）。(`threads_account_id`, `username`) は一意。ユーザー名の形は CHECK。20人まで |
| `threads_post_mention` | `draft_id`（主キー）・`threads_account_id`・`usernames`（1〜5人）・`text`・`delay_minutes`・`send_after`・`state`（`pending`・`sent`・`canceled`・`failed`）・`failure_reason`・`container_id`・`publish_requested_at`・`reply_media_id`・`sent_at`・`attempts`・`next_attempt_at`・`lease_token`・`lease_until` | 案の時間差のメンション（案に0か1行）。返信の時刻は「押した時刻」か「投稿の時刻＋時間差」。失敗は理由つき・済みは日時つき（CHECK） |
| `threads_promotion_listing` | `promotion_id`・`media`（主キーは2つの組）・`threads_account_id`・`status`（`not_started`・`drafting`・`posted`・`stopped`）・`posted_url`・`fields`（jsonb）・`fixes`（jsonb）・`image_style`・`source_version`・`generated_at`・`version` | 宣伝×媒体の掲載文（threads-008。宣伝を消すと消える）。媒体は `kokuchpro`・`peatix`・`tsunagate`・`jmty`・`youtrust`（CHECK）。掲載 URL は http(s)（CHECK） |
| `threads_media_default` | `threads_account_id`・`media`（主キーは2つの組）・`values`（jsonb）・`version` | 媒体ごとの既定値（事務局名・連絡先など。既定値にできる欄だけ） |
| `threads_oauth_state` | `state_hash`（主キー。SHA-256）・`account_id`（始めた kanaeru のアカウント）・`threads_account_id`・`expires_at`・`created_at` | OAuth の state（threads-010。10分・1回だけ。完了は同じ人だけ）。切れたものは定期の仕事が消す |
| `threads_deletion_request` | `confirmation_code`（主キー。16進32文字）・`request_fingerprint`（一意）・`threads_user_id`・`status`（`pending`・`completed`・`failed`）・`attempts`・`received_at`・`last_attempted_at`・`completed_at` | Meta のデータの削除の要求。終わったら Threads のユーザーの ID を消す（CHECK）。止まったものは定期の仕事が15分ごとにやり直す |
| `threads_publish_attempt` | `id`・`threads_account_id`・`slot_at`・`slot_date`・`slot_minute`・`draft_id`・`is_carryover`・`state`・`skip_reason`・`retry_count`・`next_retry_at`・`container_id`・`publish_requested_at`・`last_error`・`lease_until`・`lease_token` | 1つの時刻での投稿の処理。(`threads_account_id`, `slot_at`) は一意（二重に投稿しない）。状態は `in_progress`・`retry_wait`・`succeeded`・`failed`・`carried_over`・`skipped`。30日より前は定期の仕事が消す |

- 投稿の本文・戦略・NG ワード・トークンはログに出さない（logger を使うのは接続と定期の仕事だけで、ID・数・エラーの種類だけを書く）。
- 操作の記録（threads-005）：書きこみの道の middleware（`route-helpers.ts` の `activityRecorder`）が、2xx で終わったあとに道の形から種類と操作を決めて書く。承認・却下（数と1件目の書き出し）と自動投稿（定期の仕事）は処理の中で書く。記録が書けなくても操作は失敗にしない。
- 選択肢の CHECK（口調・却下の理由・状態）は約束と同じ並びを文字で書き、`threads.test.ts` が食い違いを見張る。

## 2. 窓口（どれもログイン必須。道の頭は `/api/v1/threads/accounts`）

| 動き | 道 | すること |
|---|---|---|
| GET・POST | `/accounts` | 自分の運用アカウントの一覧（状態ごとの案の数つき）・作る（上限で 409 `THREADS_ACCOUNT_LIMIT`） |
| GET・PATCH・DELETE | `/accounts/{accountId}` | 読む・名前を直す・消す |
| GET・PUT | `…/strategy` | 戦略（まだなら空の値と版 0）・保存（版） |
| GET・PUT | `…/prompt-settings` | 作る件数と文字数 |
| GET | `…/prompt` | 外の AI に貼るプロンプト（戦略・投稿のルール・NG ワード・最近の案20件・却下の案10件・低調の投稿5件・1日の投稿の数・宣伝の対象・宣伝の割合・参考の投稿10件から作る。長ければ2つに分けた文も返す） |
| GET | `…/posting-rules` | 投稿のルールと NG ワード |
| PUT | `…/core-rules` | 投稿のルールを保存 |
| POST・DELETE | `…/ng-words`・`…/ng-words/{ngWordId}` | NG ワードを足す（同じものは 409 `THREADS_NG_WORD_DUPLICATE`）・外す |
| POST | `…/draft-batches` | AI の答えを `@@@` の行で分けてためる（区切りがなければ1件。50件・1件2,000文字・全体50,000文字まで。欄 `text` の 400） |
| GET | `…/drafts?status=` | 一覧の状態（承認待ち・承認済み〈投稿中を含み投稿の順〉・投稿済み・投稿に失敗・却下）ごとの案、承認済みの予定の時刻、似ている度合いを比べる相手（承認待ち・承認済み・投稿中・投稿済みの本文） |
| PUT・DELETE | `…/drafts/{draftId}` | 承認待ちの本文を直す（版）・消す（投稿中は 409） |
| POST | `…/drafts/review` | 承認（承認待ち・投稿に失敗。NG ワードや Threads の上限で 409 `THREADS_DRAFT_NOT_APPROVABLE`）・却下（承認待ち・承認済み・投稿に失敗）・承認待ちに戻す（承認済み・却下・投稿に失敗）。投稿中・投稿済みは変えない。まとめて、1つでも合わなければどれも変えない |
| PUT | `…/drafts/{draftId}/priority` | 承認済みの案に「次に投稿する」を付ける・外す（版） |
| GET・POST・DELETE | `…/connection` | Threads への接続（トークンは返さない）・トークンを貼ってつなぐ（未接続ならはじめて、ほかは同じ Threads のアカウントでつなぎ直す）・切る（投稿の途中は 409 `THREADS_PUBLISHING`） |
| POST | `…/connection/check` | 持っているトークンでプロフィールを取り直す（使えなければ「接続し直しが要る」） |
| GET・PUT | `…/posting-schedule` | 投稿の設定と決まり・保存（オンにするときは投稿の権限を確かめる。だめなら 409 `THREADS_NOT_READY`。版） |
| GET | `…/auto-post` | 自動投稿の状態・次の投稿・承認済みの残り・知らせ（未接続・接続し直し・上限・投稿に失敗・直前に戻した・承認済みがない） |
| POST | `…/auto-post/blocked-notice-seen` | 「直前に戻した」の知らせを閉じる |
| GET | `…/performance?tab=` | 反応の画面（基準値・判定ごとの数・投稿ごとの反応。投稿した新しい順に最大200件。threads-003） |
| PUT | `…/performance/{draftId}/feedback` | 低調で確定した投稿の改善のメモと「次のプロンプトに入れる」（版） |
| GET | `…/performance/export?kind=` | 反応の CSV（`posts`：投稿ごと・`snapshots`：取りこみごと。BOM つき） |
| GET・POST | `…/promotions` | 宣伝の一覧（宣伝の対象を先に）と割合・足す（上限で 409 `THREADS_ITEM_LIMIT`。threads-004） |
| PUT・DELETE | `…/promotions/{itemId}` | 宣伝を直す（版）・消す |
| PUT | `…/promotion-ratio` | 宣伝の投稿の割合（0〜100％） |
| GET・POST | `…/reference-posts` | 参考の投稿の一覧（短い ID・鮮度つき）・まとめて足す（20件まで） |
| PUT・DELETE | `…/reference-posts/{itemId}` | 参考の投稿を直す（版）・消す |
| GET | `…/reference-posts/explain-prompt?id=` | 「なぜ良いか」の解説のプロンプト（id で1件、なしで解説がまだのものを10件まで） |
| POST | `…/reference-posts/explanations` | 貼り戻した解説を保存する（解説がまだのものだけ。ほかは飛ばした理由を返す） |
| GET・POST | `…/research-keywords` | キーワードの一覧・まとめて足す（20個まで。同じものがあれば 409 `THREADS_KEYWORD_DUPLICATE` で、どれも足さない） |
| PUT・DELETE | `…/research-keywords/{itemId}` | キーワードを直す（版）・消す |
| GET | `…/research-keywords/idea-prompt` | キーワードの案のプロンプト（戦略から作る） |
| GET | `…/analysis?scope=` | アルゴリズムの分析（threads-006。直近90日の確定した投稿の区切りごとの中央値・傾向〈次のプロンプトに入るかつき〉・おすすめに乗った目安・今の自動投稿の時刻・設定。読むたびに計算） |
| PUT | `…/analysis/settings` | 分析の設定（テーマ・傾向をプロンプトに入れるか）を保存（版。消したテーマの分類はテーマなしに） |
| GET・PUT | `…/analysis/classifications?mode=` | 分類する・直す投稿の一覧（まだ：新しい50件・分類済み：200件）・分類を保存（50件まで。期間の確定した投稿でないもの・知らないテーマは飛ばす） |
| GET・PUT | `…/mention-settings` | 時間差のメンションの設定（ひとこと・時間差・人・今は選べない人・返信の権限）・ひとことと時間差を保存（版。NG ワードは 400。threads-007） |
| POST・PUT・DELETE | `…/mention-people`・`…/mention-people/{personId}` | メンションする人を足す（形・自分・同じ人は 400）・呼び名といつも付けるを直す・消す（承認待ち・承認済みの案は文から外して承認待ちに、投稿済みの予定はやめる） |
| PUT・DELETE | `…/drafts/{draftId}/mention` | 案に時間差のメンションを付ける・直す（承認待ち・承認済みは時間差のあと〈承認済みは承認し直し〉、投稿済み7日以内は今から。今は選べない人は 409 `THREADS_MENTION_BLOCKED`）・外す・やめる（済み・送った途中は 409 `THREADS_MENTION_SENT`） |
| GET | `…/external-media` | 外部メディアの一覧（宣伝と媒体ごとの状況。開催日時の近い順。threads-008） |
| GET・PUT | `…/external-media/{promotionId}/{media}` | 掲載文（まだなら欄は null）と既定値・欄と状況と掲載 URL と画像の種類を保存（版。知らない欄・上限は 400。欄は行を外す決まりをもう一度通す） |
| POST | `…/external-media/{promotionId}/{media}/generate` | 掲載文を作る・作り直す（イベントの情報がなければ 400。未着手なら作成中に） |
| GET・PUT | `…/media-defaults`・`…/media-defaults/{media}` | 媒体の既定値・保存（既定値にできる欄だけ。版） |
| GET | `/api/v1/threads/oauth/availability` | OAuth の接続が使えるか（threads-010） |
| POST | `…/oauth/start` | アプリの Meta のアプリで接続を始め、認可の URL を返す（機能の印・設定がなければ 404） |
| GET | `/api/v1/threads/oauth/callback` | Threads からの戻り（ログインなし）。画面の `/threads/oauth/complete` へ state と code を渡すだけ |
| POST | `/api/v1/threads/oauth/complete` | 完了（ログインした同じ人だけ。code → 長期のトークン → トークンを貼るときと同じ確かめでつなぐ）。画面が移る先（`…/settings?oauth=`）を返す |
| POST | `/api/v1/threads/webhooks/uninstall`・`…/webhooks/data-deletion` | Meta の連携の解除・データの削除（フォームの signed_request。署名が違えば中身のない 400。本文は 8KB まで。ログインなし） |
| GET | `/api/v1/threads/data-deletion/{code}` | データの削除の状況（ログインなし。識別子は返さない） |
| GET | `…/activity?kind=` | 操作の記録（新しい順に100件。threads-005） |
| POST | `/api/v1/threads/jobs/tick` | 定期の仕事（Cloud Scheduler が5分おき・8時〜23時台に、`Authorization: Bearer <JOB_TRIGGER_SECRET>` と JSON の本文 `{}` で呼ぶ。合わなければ 404）。続きの処理 → 来ている時刻の投稿（1回4件まで）→ 時間差のメンションの返信（1回10件まで。threads-007）→ URL の取り直し → トークンの確かめ直しと延長 → 反応の取りこみと判定 → 片付け（90日を過ぎた操作の記録・止まった Meta のデータの削除のやり直し・切れた OAuth の state も） |

- 似ている度合いは画面で計算する（めぐると同じ。文字の並びの近さで、意味の近さではない）。
- 入力の形・上限・エラーの文言と、業務の計算（`splitDrafts`・`computeSimilarities`・`buildPrompt`・`checkPublishable`・`checkStrategy`・`buildDeepenPrompt`・`parseSparringAnswer`・`analyzePosts`・`buildListing`・`checkListing`・`workSteps`・`trendsForPrompt`・`classifyPrompt`・`parseClassifyAnswer`・`threadsLength`・`validatePostingSchedule`・`plannedSlotTime`・`findDueSlot`・`projectSchedule`・`compareQueueOrder`・`cleanToken`）は `packages/contracts/src/threads/`（めぐるの `packages/shared` から写したもの）。
- 反応の決まり（threads-003）：投稿から24時間・3日・7日（前後1時間）に取りこみ、7日で確定（8日を過ぎたら遅れて確定）。幅を過ぎた時点（夜間など）は、あとの回で「過ぎた時点のうち最も新しい1つ」を補う。判定は確定の新しい30件の閲覧の中央値を基準に、2倍以上で好調・0.5倍以下で低調（5件に足りなければしない）。フォロワーの数は1日1回。
- 自動投稿の決まり（threads-002）：時刻は日本時間の 8:30〜23:00（DB の夜間の停止のため。AD-10）・10個まで・ずらすなら30分以上あけて前後10分でずらす。順は「持ち越し → 次に投稿する → 承認した古い順」。取り出しのときに NG ワードと Threads の上限で確かめ直し、当たれば承認待ちに戻す。一時的な失敗は5・10・15分後にやり直し、だめなら次の時刻に1回だけ持ち越し、それもだめなら投稿に失敗。認証のエラーは「接続し直しが要る」、上限は次の日の0時まで止める。公開を送る前にコンテナーの ID と送った日時を保存し、結果がわからなければ投稿の一覧と照らし合わせる（二重に投稿しない）。
- 時間差のメンションの決まり（threads-007）：返信は承認した文のまま出し、出す直前に NG ワードと「同じ人は24時間に1回」を確かめる。公開と同じく借りと送った日時で二重に出さない。夜間（0時〜8時）は定期の仕事が動かないので、夜間に来た返信は8時からの回で出し、返信の時刻から24時間を過ぎたら出さない。一時的な失敗は5・10分後にやり直し、3回で「出せませんでした」。返信が 403 なら返信の権限がない印を付ける。

## 3. 画面（`/threads/…`。管理の外枠。ログインが要る）

| 道 | 画面 |
|---|---|
| `/threads` | 運用アカウントの一覧と「アカウントを作る」 |
| `/threads/accounts/$accountId/stock` | 自動投稿のまとまり（次の投稿・承認済みの残り・知らせ）と投稿の案（状態をチップで選ぶ〈承認待ち・承認済み・投稿済み・投稿に失敗・却下〉・承認・却下の枠・直す枠・消す確かめ・時間差のメンション（カードの中で人を選び、返信の文を確かめて付ける・投稿済みに今から返信する・状態と出せなかった理由）・まとめて承認と却下・次に投稿する・予定の時刻・Threads で見る・似ている度合い・NG ワード・規約に注意） |
| `/threads/accounts/$accountId/create` | 案を作る（件数と文字数・プロンプトを作ってコピー・AI の答えを貼ってためる） |
| `/threads/accounts/$accountId/strategy` | 戦略（区分ごとの欄・口調のチップ。threads-009：上に「AI と考える」〈十分に書けた数・全体の見直しと活動の軸のプロンプト・壁打ち〈区分を選んでプロンプト・答えを貼って候補を選んで入れる〉〉、項目ごとに入力の量の印・考えるヒント・「AI と深める」の枠） |
| `/threads/accounts/$accountId/research` | 宣伝とリサーチ（宣伝の割合・宣伝の一覧と足す・直す枠〈イベントの情報〉・参考の投稿と解説のプロンプト・貼り戻し・キーワードと案のプロンプト・貼り戻し） |
| `/threads/accounts/$accountId/performance` | 反応（基準値・判定のチップ・投稿ごとの6つの数と判定・低調の傾向のメモ・CSV の書き出し） |
| `/threads/accounts/$accountId/analysis` | 分析（材料と見方・範囲のチップ・伸びた傾向〈次のプロンプトに入る・時刻の見直しの参考に〉・区切りごとの反応・おすすめに乗った目安・内容の分類〈プロンプトをコピー・答えを貼る〉・分類を手で直す枠・分析の設定〈テーマ・プロンプトに入れるか〉） |
| `/threads/accounts/$accountId/media` | 外部メディア（宣伝ごとの5つの媒体の状況と「掲載文を開く」・媒体ごとの既定値） |
| `/threads/accounts/$accountId/media/$promotionId/$media` | 掲載文（ルールのチェック・入力〈区切りごとの欄・コピー・保存・まとめてコピー・自動で直した内容〉・作業の手順・外の AI〈画像と言い回しのプロンプト・答えを欄に入れる〉・掲載の状況と URL・作り直す確かめ） |
| `/threads/oauth/complete` | Threads の許可の画面から戻った人を受け止め、接続を済ませて設定へ戻す（threads-010） |
| `/threads/data-deletion/$code` | Meta のデータの削除の状況（ログインなし・ナビなし。threads-010） |
| `/threads/accounts/$accountId/settings` | 名前・Threads への接続（Meta のアプリでつなぐ〈threads-010。使えるときだけ〉・トークンを貼る・確かめる・切る）・自動投稿（オン・時刻・ずらす）・時間差のメンション（ひとこと・時間差・メンションする人）・投稿のルール・NG ワード・操作の記録（種類のチップ）・アカウントを消す |

## 4. ほかの領域が使うもの

API の入口（`apps/api/src/modules/threads/index.ts`）は `routes` だけを出す。画面の入口（`apps/web/src/features/threads/index.ts`）は `THREADS_QUERY_KEYS`（どれも `"threads"` で始まる）。

## 5. テスト

- 結合：`apps/api/src/modules/threads/threads.test.ts`（台帳で Threads を公開にしてから組み立てる。`apps/api/test/helpers/threads.ts` の `showThreadsApp` を `truncateAllTables` のあとに呼ぶ）・`metrics.test.ts`（反応の取りこみ・判定・画面・CSV）・`research.test.ts`（宣伝・参考の投稿・キーワード・プロンプト）・`analysis.test.ts`（分析・傾向とプロンプト・設定・分類）・`mention.test.ts`（時間差のメンション。偽の Threads で返信まで）・`media.test.ts`（外部メディアの掲載文）・`oauth.test.ts`（OAuth と Meta の Webhook。偽の Threads の認可と交換）・`autopost.test.ts`（偽の Threads の API〈`fake-threads.ts`〉を `buildApp` の `fetch` に渡す。定期の仕事は `runJob` を明日の時刻で直に呼ぶ）。
- 業務の計算：`packages/contracts/src/threads/*.test.ts`（めぐるのテストを写したもの）。
- 通し：`e2e/tests/threads.spec.ts`（始めに運営者として台帳で公開にし、終わりに切に戻す。E2E の設定 `e2e/env.ts` で `threads.oauth`・鍵の束・合言葉・偽の Threads の宛先を入れ、`e2e/playwright.config.ts` が偽の Threads〈`fake-threads-serve.ts`〉を立ち上げる）。
- 手元で試す：`pnpm --filter api exec tsx src/modules/threads/fake-threads-serve.ts`（口は 9790）を立ち上げ、`.env` に `THREADS_API_BASE_URL=http://127.0.0.1:9790` と鍵の束を入れる。トークンは `curl -X POST http://127.0.0.1:9790/__control/tokens -H 'content-type: application/json' -d '{"userId":"9001"}'` で作る。
