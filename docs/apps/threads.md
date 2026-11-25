# Threads の運用（threads）の地図

2026-11-20 作成（threads-001。めぐる〈`meguru-app`〉の Threads の運用アプリを移したもの。範囲は [PRD](../../_bmad-output/prd-threads/prd-threads.md)、決めた理由は [specs/threads/](../../specs/threads/) の各仕様）。同じ日に threads-002（接続と自動投稿）・threads-003（反応の分析）・threads-004（宣伝とリサーチ）・threads-005（操作の記録）・threads-006（アルゴリズムの分析）・threads-007（時間差のメンション）・threads-008（外部メディアの掲載文）・threads-009（戦略のガイドと AI との壁打ち。画面と約束だけ）・threads-010（OAuth の接続と Meta の Webhook。設定で切）を足した。threads-011 で、投稿の案・案を作るの振る舞いをめぐるにそろえた（まとめての承認はできるものだけ・消せるのは承認待ちと却下・承認済みも直せる・NG ワードをまとめて足す・ためたのを取り消す・投稿済みは50件ずつ）。threads-012 で、ほかの画面とサーバーの守りをめぐるにそろえた（運用アカウントのホームと入口・切り替え・接続の案内・戦略の進みと変更の守り・参考の投稿とキーワードを直す・宣伝のイベントの情報・反応の CSV の列と材料の版・連携の解除とデータの削除の守り・投稿できるかの確かめ・名前を入れて消す）。同じ日に threads-013（組織の上のチーム運用：組織に入れる・組織に見せる・担当・承認を任せる・このアカウントのチーム・運用状況・持ち主の退会での引き継ぎ。[specs/threads/013-team-operation](../../specs/threads/013-team-operation/spec.md)・[PRD 組織](../../_bmad-output/prd-kanaeru-org/prd-kanaeru-org.md)）を足した。2026-11-21 に threads-017（長い説明・プロンプトを「詳しく」で閉じる・戦略を区分のタブで1区分ずつ見せ、区分ごとに「AI と考える」）、threads-016（チーム運用をチームの単位にする：運用アカウントは組織の中のチームに入れる・チームに見せる・担当はチームの人・リーダーが担当を決め運用状況を見る。[specs/threads/016-team-scope](../../specs/threads/016-team-scope/spec.md)）を足した。同じ日に threads-018（画面の手直し：戦略の進みのカードを1行の数と「次におすすめ」に縮める・区分のタブ〈SectionTabs〉を戦略とチームの画面で共通にし、横に続きがある端をぼかす・残っていたブラウザそのままの開け閉めを「詳しく」〈Disclosure〉にそろえる）を足した。同じ日に threads-019（設定を上のタブ〈接続・自動投稿・投稿のルール・メンション・チーム・記録・アカウント〉で1区分ずつ見せる。見えない区分も描いたまま隠すので書きかけは消えない。ほかの画面のリンクの #threads-connection・#threads-schedule・#threads-core-rules などで、その区分を開く）を足した。同じ日に threads-020（チームを分かりやすくする：設定のチームを1枚のカード〈チーム名と「チームを変える」の枠・担当の行の横に「承認を任せる」・チームに見せる〉にまとめる。どのチームにも入っていなければ始め方へ案内する。運用状況を少ないタップで見る：チームの一覧に止まっている数の要約〈管理者とリーダーだけ。API の stoppedCount〉・チームの画面は管理者とリーダーなら運用状況を先頭にして、そこから開く）を足した。同じ日に threads-021（チームの入口：運用アカウントの一覧の API に入っているチームの名前〈placements〉を添え、切り替えのメニューとホームにチームの印を出す。チームの画面〈/threads/teams〉から組織とチームを作り、自分をリーダーで足し、運用アカウントを入れる〈suite の窓口をそのまま呼ぶ。途中で失敗したら続きから〉。管理者は一覧の「チームを足す」でチームを足せ、ほかのチームに入っている運用アカウントは既定では入れない。チームの画面に管理者向けの「人を招く・チームに分ける」）を足した。suite-002 で、トークンの欄に利用規約とプライバシーポリシーへのリンクを足した。

運用する Threads のアカウント（運用アカウント）ごとに、戦略・投稿のルールと NG ワード・プロンプトの設定を持ち、外の AI に貼るプロンプトを作り、貼り戻した答えを投稿の案にためて、承認・却下する（AI の段階1。アプリは外の AI に何も送らない。構成の決めごと AD-20）。Threads に長期のアクセストークンでつなぎ、承認した案を決めた時刻に自動で投稿する（threads-002）。投稿の反応を取りこんで好調・普通・低調を判定し、低調の傾向を次のプロンプトに入れる（threads-003）。宣伝（イベントの情報つき）・参考の投稿・リサーチのキーワードを持ち、プロンプトの材料にする（解説とキーワードの案は外の AI に貼るプロンプトで作る。threads-004）。操作を90日記録する（threads-005）。確定した投稿の反応から、伸びやすい時間帯・長さ・書き出しを読むたびに計算し、本文で変えられる傾向を次のプロンプトに入れる（内容の分類は外の AI に貼るプロンプトで付ける。threads-006）。投稿のあと決めた時間がたつと、その投稿への返信で決めた人にメンションする（threads-007）。宣伝のイベントから、5つのイベントの掲載サイトに貼る文を決まった計算で作る（threads-008）。設定で入にすると、アプリの Meta のアプリで Threads につなぎ（OAuth）、Meta の連携の解除・データの削除の知らせに応じる（threads-010）。

- 公開：アプリ `threads`（`packages/contracts/src/core/apps.list.ts`。道の頭 `/threads`）として登録し、だれに見せるかはアプリの台帳（suite の `app_setting`。設定 → アプリの台帳）で決める（AD-16）。組み立てがすべての道に `requireApp` を付け、見えなければ 404。台帳に行がない間は運営者だけ。定期の仕事（`/api/v1/threads/jobs/…`）と Webhook（`/api/v1/threads/webhooks/…`）は、見る人がいないので、切のときだけ 404（`requireAppNotOff`）。画面の外枠のナビは、Threads の画面の中でだけ項目を出す。
- 持ち主：最上位の記録 `threads_account` が kanaeru の `account_id` を持つ（組織に入れても変わらない。AD-19）。組織に入れていない運用アカウントの読み書きは、今までどおり持ち主だけで、ほかの人には、ないのと同じ 404。
- チーム運用（threads-013）：持ち主は運用アカウントを suite の組織の1つに入れられる。誰が何をできるかは `access.ts` の1か所（関わり：持ち主 → 担当の人 → 組織の管理者 → 組織の人。操作のまとまり：`read_content`・`read_private`・`write_content`・`review`・`manage`・`activity`・`team_card`）で決め、すべての窓口が `route-helpers.ts` の `ownedAccount(deps, c, id, まとまり)`・`accountAccess(…)` を通す（まとまりを書かなければ持ち主だけ）。関わりがなければ 404、権限が足りなければ 403 `THREADS_TEAM_FORBIDDEN`。組織の役割は要求のたびに suite の `index.ts` から引く。どの関わりでも NG ワードの確かめと人の承認は省かない（承認を任された担当の人の承認も同じ確かめを通る）。
- 秘密：Threads のトークンは、土台が渡す秘密の箱（`deps.secretBox`。`packages/secret-box` の AES-256-GCM。鍵は設定 `TOKEN_ENCRYPTION_KEYS`）で、ひもづけを運用アカウントの ID にして包む。鍵の設定がなければ接続は 503。定期の仕事の合言葉（`JOB_TRIGGER_SECRET`）は `deps.isJobRequest` で確かめる（値は領域に来ない）。
- 外への出口：Threads の API は `deps.fetch` で、宛先は設定 `THREADS_API_BASE_URL`（既定は `https://graph.threads.net`）。
- OAuth と Meta の Webhook（threads-010）：機能の印 `threads.oauth`（既定は切）と、設定 `THREADS_APP_ID`・`THREADS_APP_SECRET` の両方があるときだけ。秘密の値は領域に来ず、土台が渡す道具 `deps.metaApp`（`kernel/meta-app.ts`：signed_request の確かめ・トークンの交換の値）を使う。Webhook の道（`/api/v1/threads/webhooks/…`）は、組み立ての csrf の確かめを通らない（クッキーを使わず、署名で確かめる）。

## 1. 表（どれも `ON DELETE CASCADE`。持ち主のアカウントを消すと全部消える）

| 表 | 列 | 決まり |
|---|---|---|
| `threads_account` | `id`・`account_id`（持ち主）・`name`・`prompt_post_count`・`post_length_target`・`short_length`・`medium_length`・`long_length`・`short_ratio`・`medium_ratio`・`long_ratio`・`core_rules`・`connection_status`・`threads_user_id`・`username`・`display_name`・`connection_generation`・`reconnect_hint`・`insights_denied_at`・`replies_denied_at`・`promotion_ratio_percent`・`profile_picture_url`・`last_opened_at`・`promotions_changed_at`・`research_changed_at`・`core_rules_changed_at`・`created_at`・`updated_at` | 名前は1〜50文字。件数は1〜50。割合の合計は100。持ち主ごとに10個まで（同時に作っても超えないよう、持ち主ごとの鍵をかける）。接続の状態は `not_connected`・`connected`・`needs_reconnect`（未接続なら Threads のユーザーとユーザー名は空。CHECK）。`threads_user_id` は一意（同じ Threads のアカウントは1つにだけつなぐ）。接続の世代は、つなぎ直し・延長・切断で1つ増え、書きこみの条件に使う。`last_opened_at` は最後に開いた日時（`/threads` の行き先）、`profile_picture_url` は Threads のプロフィールの画像（つないだとき・開いたときに読み直す）。`*_changed_at` はプロンプトの材料（宣伝・リサーチ・投稿のルール）を最後に変えた日時（消したときも。threads-012） |
| `threads_strategy` | `threads_account_id`（主キー）・テキストの欄26（空は `""`）・`tone_preset`・`version` | 最初の保存で作る。保存は読んだ版と同じときだけ（違えば 409 `THREADS_VERSION_CONFLICT`） |
| `threads_draft_batch` | `id`・`threads_account_id`・`client_request_id`・`draft_count`・`delimiter_found`・`strategy_updated_at`・`promotions_changed_at`・`research_changed_at`・`core_rules_changed_at`・`created_at` | (`threads_account_id`, `client_request_id`) は一意。同じ送り直しは前のまとまりを返す。ためたときのプロンプトの材料の版（戦略を保存した日時と、運用アカウントの `*_changed_at`）を写して持つ（反応の CSV に出す。前のまとまりは空。threads-012） |
| `threads_post_draft` | `id`・`threads_account_id`・`batch_id`・`position`・`body`・`status`・`version`・`reviewed_at`・`reject_reasons`・`reject_note`・`prioritized_at`・`carryover_attempt_id`・`published_at`・`threads_media_id`・`threads_permalink`・`permalink_checked_at`・`publish_failed_at`・`publish_error`・`published_slot_minute`・`published_carryover`・`published_prioritized`・`blocked_at`・`blocked_reason`・`blocked_words`・`last_review_request_id`・`body_edited_at` | 状態は `needs_review`・`approved`・`rejected`・`publishing`・`published`・`publish_failed`。承認・却下・投稿の日時と理由・投稿の順の列は、状態と食い違わないよう CHECK（`threads_post_draft_review_state_v2`）で縛る（却下は理由かメモが要る）。直前の確かめの記録は承認待ちのときだけ。承認待ちは運用アカウントごとに500件まで（ためるとき・戻すとき）、承認済み（投稿中を含む）は500件まで（承認・入れ直しのとき）。`last_review_request_id` は最後に状態を変えた承認・却下の操作の ID（送り直しを見分ける。直す・戻すで消す）、`body_edited_at` はためたあとに人が本文を直した日時（threads-011） |
| `threads_ng_word` | `id`・`threads_account_id`・`word`・`normalized`・`seq` | 照合の形（`normalizeNgWord`）で同じものは1つ。運用アカウントごとに200個まで。足すと、その語を含む承認済みの案を承認待ちに戻す（threads-011） |
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
| `threads_deletion_request` | `confirmation_code`（主キー。16進32文字）・`request_fingerprint`（一意）・`threads_user_id`・`status`（`pending`・`completed`・`failed`）・`attempts`・`received_at`・`last_attempted_at`・`completed_at` | Meta のデータの削除の要求。終わったら Threads のユーザーの ID を消す（CHECK）。止まったものは定期の仕事が15分ごとにやり直す。`threads_user_hash`（ユーザーの ID の SHA-256）は終わったあとも1日残し、その間の接続を止める（定期の仕事が消す。threads-012） |
| `threads_revocation` | `id`・`threads_user_hash`（SHA-256 の16進。CHECK）・`issued_at`・`received_at` | Meta の連携の解除の知らせ（threads-012）。つないでいる運用アカウントがなくても記録し、許可の画面から戻る途中の接続を止める。15分を過ぎたものは定期の仕事が消す |
| `threads_organization_account` | `threads_account_id`（主キー）・`organization_id`・`team_id`・`owner_account_id`・`shared`（チームに見せる。既定はオフ）・`placed_at` | チームに入れた運用アカウント（threads-013・threads-016。1つのチームにだけ）。`organization_member(organization_id, owner_account_id)`・`team(id, organization_id)`・`team_member(team_id, owner_account_id)` を CASCADE で指すので、持ち主が組織・チームから抜ける・チームや組織が消えると行が消え、個人の運用に戻る |
| `threads_assignment` | `threads_account_id`・`account_id`（主キーはこの組）・`organization_id`・`team_id`・`assigned_at`・`delegated`（承認を任せる）・`delegated_at`・`notice_seen_at` | 担当（threads-013・threads-016）。`threads_organization_account(threads_account_id, team_id)`・`organization_member(organization_id, account_id)`・`team_member(team_id, account_id)` を CASCADE で指す（運用アカウントがチームから外れる・別のチームに移る・担当の人が組織やチームから抜けると消える）。編集者からメンバーに下げても行は消えず、判定のたびに今の役割と `demoted_at` を比べて効かせない（付け直すと行を作り直す） |
| `threads_publish_attempt` | `id`・`threads_account_id`・`slot_at`・`slot_date`・`slot_minute`・`draft_id`・`is_carryover`・`state`・`skip_reason`・`retry_count`・`next_retry_at`・`container_id`・`publish_requested_at`・`last_error`・`lease_until`・`lease_token` | 1つの時刻での投稿の処理。(`threads_account_id`, `slot_at`) は一意（二重に投稿しない）。状態は `in_progress`・`retry_wait`・`succeeded`・`failed`・`carried_over`・`skipped`。30日より前は定期の仕事が消す |

- 投稿の本文・戦略・NG ワード・トークンはログに出さない（logger を使うのは接続と定期の仕事だけで、ID・数・エラーの種類だけを書く）。
- 操作の記録（threads-005）：書きこみの道の middleware（`route-helpers.ts` の `activityRecorder`）が、2xx で終わったあとに道の形から種類と操作を決めて書く。承認・却下（数と1件目の書き出し。送り直しで変えていなければ書かない）・まとめて消す・ためたのを取り消す・NG ワードを足す（数と語）・まとめてメンションを付ける（threads-011）と自動投稿（定期の仕事）は処理の中で書く。
- 案の状態を変える書きこみ（ためる・承認・却下・戻す・直す・消す・NG ワードを足す・投稿の取り出し）は、案の鍵（`threads_post_draft:<運用アカウント>`。`drafts.ts` の `lockAccountDrafts`）で1つずつにする（threads-011）。記録が書けなくても操作は失敗にしない。
- 選択肢の CHECK（口調・却下の理由・状態）は約束と同じ並びを文字で書き、`threads.test.ts` が食い違いを見張る。

## 2. 窓口（どれもログイン必須。道の頭は `/api/v1/threads/accounts`）

threads-013 で、表の列を足した：`threads_post_draft` の `created_by_account_id`・`updated_by_account_id`・`reviewed_by_account_id`、`threads_activity_log` の `actor_account_id`（どれも SET NULL。人の操作でいつも書き、名前は組織に入っている運用アカウントの画面だけに出す）、`threads_account` の `handed_over_at`・`handover_from_name`（退会での引き継ぎの知らせ。知らせたら名前を消す）。DB の変更は `0013_threads_team.sql`。

| 動き | 道 | すること |
|---|---|---|
| GET・POST | `/accounts` | 自分の運用アカウントの一覧（状態ごとの案の数つき）・作る（上限で 409 `THREADS_ACCOUNT_LIMIT`） |
| GET・PATCH・DELETE | `/accounts/{accountId}` | 読む・名前を直す・消す（本文の `confirmName` がアカウントの名前と合うときだけ。違えば 400 `THREADS_ACCOUNT_NAME_MISMATCH`。threads-012） |
| GET | `…/home` | ホームの材料の数（戦略の入れた数・宣伝の数と対象の数・参考の投稿とキーワードの数。threads-012） |
| POST | `…/open` | 開いたことを残す（`/threads` の行き先）。つないでいれば持っているトークンでプロフィール〈名前・ユーザー名・画像〉を読み直し、認証のエラーなら接続し直しが要る状態にする。読み直した運用アカウントを返す（threads-012） |
| GET・PUT | `…/strategy` | 戦略（まだなら空の値と版 0）・保存（版） |
| GET・PUT | `…/prompt-settings` | 作る件数と文字数 |
| GET | `…/prompt` | 外の AI に貼るプロンプト（戦略・投稿のルール・NG ワード・最近の案20件・却下の案10件・低調の投稿5件・1日の投稿の数・宣伝の対象・宣伝の割合・参考の投稿10件から作る。長ければ2つに分けた文も返す） |
| GET | `…/posting-rules` | 投稿のルールと NG ワード |
| PUT | `…/core-rules` | 投稿のルールを保存 |
| POST・DELETE | `…/ng-words`・`…/ng-words/{ngWordId}` | NG ワードをまとめて足す（`words`。もうある語は足さずに `duplicates` で返す。足した語を含む承認済みの案は承認待ちに戻し、数を `reopenedCount` で返す。上限を超えるなら何も足さず 409 `THREADS_NG_WORD_LIMIT`）・外す |
| POST | `…/draft-batches` | AI の答えを `@@@` の行で分けてためる（区切りがなければ1件。50件・1件2,000文字・全体50,000文字まで。欄 `text` の 400）。件数・区切りが見つかったか・Threads の上限を超える件数を返す。同じ `clientRequestId` の送り直しは、まだ承認待ちの案だけを返す |
| DELETE | `…/draft-batches/{batchId}` | ためた1回分を取り消す（そのまとまりの承認待ちの案だけを消し、消した数を返す。threads-011） |
| GET | `…/drafts?status=&before=` | 一覧の状態（承認待ち〈ためた新しいまとまりが先〉・承認済み〈投稿中を含み投稿の順〉・投稿済み〈新しい順に50件ずつ。続きは `before` に `nextCursor`〉・投稿に失敗・却下〈新しい500件〉）ごとの案、承認済みの予定の時刻、似ている度合いを比べる相手（承認待ち・承認済み・投稿中と、却下の新しい500件の ID・本文・状態） |
| PUT・DELETE | `…/drafts/{draftId}` | 承認待ち・承認済みの本文を直す（版。承認済みは承認待ちに戻る。投稿中は 409 `THREADS_PUBLISHING`）・消す（承認待ち・却下だけ。ほかは 409 `THREADS_DRAFT_STATE`） |
| POST | `…/drafts/delete` | 案をまとめて消す（承認待ちと却下だけ。ほかの状態・ない ID は無視し、消した数を返す。threads-011） |
| POST | `…/drafts/review` | 承認（承認待ち・投稿に失敗）・却下（承認待ち・承認済み・投稿に失敗）・承認待ちに戻す（承認済み・却下・投稿に失敗）。1件ずつ確かめ、できるものだけ変え、できなかったものを理由（`NOT_FOUND`・`STALE`・`PUBLISHING`・`NG_WORD`・`OVER_THREADS_LIMIT`・`POLICY_CONFIRM_REQUIRED`・`LIMIT`）つきで返す（threads-011）。規約に注意の案の承認は `confirmPolicyCaution` が要る。投稿に失敗の承認は、投稿の順の先頭に入れ直し、承認した日時は元のまま。同じ `requestId` の送り直しは、もう変わっていた案を変えたものとして返す |
| PUT | `…/drafts/{draftId}/priority` | 承認済みの案に「次に投稿する」を付ける・外す（版） |
| GET・POST・DELETE | `…/connection` | Threads への接続（トークンは返さない）・トークンを貼ってつなぐ（未接続ならはじめて、ほかは同じ Threads のアカウントでつなぎ直す。自分の別の運用アカウントがつないでいれば 409 `THREADS_ACCOUNT_REGISTERED`、ほかの人なら 409 `THREADS_ACCOUNT_TAKEN`。ユーザー名だけが同じ運用アカウントは、そのトークンで今の名前を読み直してから比べる。threads-012）・切る（投稿の途中は 409 `THREADS_PUBLISHING`） |
| POST | `…/threads-check` | Threads に投稿できる状態か（投稿の権限）と直近24時間の投稿の数（投稿はしない。threads-012） |
| POST | `…/connection/check` | 持っているトークンでプロフィールを取り直す（使えなければ「接続し直しが要る」） |
| GET・PUT | `…/posting-schedule` | 投稿の設定と決まり・保存（オンにするときは投稿の権限を確かめる。だめなら 409 `THREADS_NOT_READY`。版） |
| GET | `…/auto-post` | 自動投稿の状態・次の投稿・承認済みの残り・知らせ（未接続・接続し直し・上限・投稿に失敗・直前に戻した・承認済みがない） |
| POST | `…/auto-post/blocked-notice-seen` | 「直前に戻した」の知らせを閉じる |
| GET | `…/performance?tab=&before=` | 反応の画面（基準値・判定ごとの数・投稿ごとの反応。投稿した新しい順に50件ずつ。続きは `before` に `nextCursor`。threads-003・012） |
| PUT | `…/performance/{draftId}/feedback` | 低調で確定した投稿の改善のメモと「次のプロンプトに入れる」（版） |
| GET | `…/performance/export?kind=` | 反応の CSV（`posts`：投稿ごと37列・`snapshots`：取りこみごと13列。列と値の形はめぐると同じ。投稿ごとには、案をためたときの材料の版〈戦略の保存・宣伝・リサーチ・投稿のルールを最後に変えた日時〉が入る。BOM つき。threads-012） |
| GET・POST | `…/promotions` | 宣伝の一覧（宣伝の対象を先に）と割合・足す（上限で 409 `THREADS_ITEM_LIMIT`。threads-004） |
| PUT・DELETE | `…/promotions/{itemId}` | 宣伝を直す（版）・消す |
| PUT | `…/promotion-ratio` | 宣伝の投稿の割合（0〜100％） |
| GET・POST | `…/reference-posts` | 参考の投稿の一覧（短い ID・鮮度つき）・まとめて足す（20件まで。URL・6つの反応の数・投稿者・メモ・なぜ良いかも。threads-012） |
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
| POST | `…/drafts/mentions` | 選んだ承認待ちの案に、「いつも付ける」の人（今は選べない人を除いて5人まで）で時間差のメンションをまとめて付ける（付けられない案は `NOT_FOUND`・`STALE`・`NO_PEOPLE` で返す。threads-011） |
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
| POST | `/api/v1/threads/jobs/tick` | 定期の仕事を1回行う（手で流すときとテストの入口。`Authorization: Bearer <JOB_TRIGGER_SECRET>` と JSON の本文 `{}` で呼ぶ。合わなければ 404）。ふだんは `index.ts` の `scheduledJob`（5分おき・8時〜23時台）として、共通の窓口 `POST /api/v1/jobs/tick` が同じ仕事を動かす（Cloud Scheduler の仕事は共通の1つ。core-017・threads-022）。続きの処理 → 来ている時刻の投稿（1回4件まで）→ 時間差のメンションの返信（1回10件まで。threads-007）→ URL の取り直し → トークンの確かめ直しと延長 → 反応の取りこみと判定 → 片付け（90日を過ぎた操作の記録・止まった Meta のデータの削除のやり直し・切れた OAuth の state・15分を過ぎた連携の解除の知らせ・終わって24時間を過ぎた削除のハッシュも。threads-012）。トークンの延長は、接続し直しが要るものもトークンが残っていれば1日に1回試し、延ばせたら接続済みに戻す（threads-012） |

- 似ている度合いは画面で計算する（めぐると同じ。文字の並びの近さで、意味の近さではない）。出すのは承認待ちの案だけ。
- 入力の形・上限・エラーの文言と、業務の計算（`splitDrafts`・`computeSimilarities`・`buildPrompt`・`checkPublishable`・`checkStrategy`・`buildDeepenPrompt`・`parseSparringAnswer`・`analyzePosts`・`buildListing`・`checkListing`・`workSteps`・`trendsForPrompt`・`classifyPrompt`・`parseClassifyAnswer`・`threadsLength`・`validatePostingSchedule`・`plannedSlotTime`・`findDueSlot`・`projectSchedule`・`compareQueueOrder`・`cleanToken`）は `packages/contracts/src/threads/`（めぐるの `packages/shared` から写したもの）。
- 反応の決まり（threads-003）：投稿から24時間・3日・7日（前後1時間）に取りこみ、7日で確定（8日を過ぎたら遅れて確定）。幅を過ぎた時点（夜間など）は、あとの回で「過ぎた時点のうち最も新しい1つ」を補う。判定は確定の新しい30件の閲覧の中央値を基準に、2倍以上で好調・0.5倍以下で低調（5件に足りなければしない）。フォロワーの数は1日1回。
- 自動投稿の決まり（threads-002）：時刻は日本時間の 8:30〜23:00（DB の夜間の停止のため。AD-10）・10個まで・ずらすなら30分以上あけて前後10分でずらす。順は「持ち越し → 次に投稿する → 承認した古い順」。取り出しのときに NG ワードと Threads の上限で確かめ直し、当たれば承認待ちに戻す。一時的な失敗は5・10・15分後にやり直し、だめなら次の時刻に1回だけ持ち越し、それもだめなら投稿に失敗。認証のエラーは「接続し直しが要る」、上限は次の日の0時まで止める。公開を送る前にコンテナーの ID と送った日時を保存し、結果がわからなければ投稿の一覧と照らし合わせる（二重に投稿しない）。投稿に失敗したら、まだ出していない時間差のメンションは「出せませんでした（投稿されませんでした）」にする（threads-011）。
- 時間差のメンションの決まり（threads-007）：返信は承認した文のまま出し、出す直前に NG ワードと「同じ人は24時間に1回」を確かめる。公開と同じく借りと送った日時で二重に出さない。夜間（0時〜8時）は定期の仕事が動かないので、夜間に来た返信は8時からの回で出し、返信の時刻から24時間を過ぎたら出さない。一時的な失敗は5・10分後にやり直し、3回で「出せませんでした」。返信が 403 なら返信の権限がない印を付ける。

### チーム運用の窓口（threads-013。`routes-team.ts`）

| 動き | 道 | すること | 誰 |
|---|---|---|---|
| GET | `/api/v1/threads/accounts/{id}/access` | 今の利用者の関わりとできること（`can`。画面の出し分け） | 関わりのある人 |
| GET | `…/accounts/{id}/team` | このアカウントのチーム（組織 → 管理者 → 持ち主 → 担当の人〈任されている印〉）と、入れられる組織（持ち主だけ） | 持ち主・担当の人 |
| PUT | `…/accounts/{id}/team/placement`・`/team/shared`・`/team/delegations/{personId}` | チームに入れる・外す（`{ teamId \| null }`。持ち主が入っているチームだけ）・チームに見せる・承認を任せる | 持ち主だけ |
| GET | `/api/v1/threads/organizations` | 入っている組織と、見られるチームに入っている運用アカウントの数（管理者はすべて） | ログインした人 |
| GET | `/api/v1/threads/organizations/{id}` | Threads の組織の画面（見られるチームごとに、運用アカウントの名前・持ち主・見せる状態・接続・開き方。担当の表は決められるチームの分だけ） | 組織の人（管理者はすべてのチーム、ほかは入っているチームだけ。組織の人でなければ 404） |
| GET | `/api/v1/threads/teams` | 見られるチーム（入っているチームと、管理者の組織のすべてのチーム。運用アカウントと人の数・リーダーか）と、入っている組織の数・管理者の組織（threads-016） | ログインした人 |
| GET | `/api/v1/threads/teams/{teamId}` | チームの画面（運用アカウント・担当を決める表〈管理者とリーダー〉・運用状況を見られるか） | 組織の管理者とチームの人（ほかは 404） |
| GET | `/api/v1/threads/teams/{teamId}/status` | チームの運用状況（数と日付だけ） | 管理者とリーダー（チームの全部）・このチームで担当のある編集者（担当の分）。ほかは 403 |
| PUT | `…/organizations/{id}/assignments` | 担当を付け外しする（相手は運用アカウントのチームの人で、編集者か管理者で、持ち主でない人。ほかは 409 `THREADS_ASSIGNMENT_NOT_ALLOWED`） | 管理者と、そのチームのリーダー（ほかは 403） |
| GET | `…/organizations/{id}/status` | 運用状況（数と日付だけ。人ごと：最後に動いた日・この7日の動き・止まっている。運用アカウントごと：接続・最後に投稿した日・この7日の投稿・承認済み・承認待ち・伸び） | 管理者（すべて）・リーダー（リーダーのチームの運用アカウントと人。担当の分も足す）・担当のある編集者（担当の分と、その持ち主の行だけ）。ほかは 403 |
| GET・POST | `/api/v1/threads/team-notices`・`/team-notices/seen` | はじめの画面に1回だけ出す知らせ（担当が付いた・退会で引き継いだ） | ログインした人 |

担当の人ができるのは、読む・反応や設定を見る・案と戦略と材料を作る・直す・承認待ちの案を消す・プロンプトを作って貼り戻す（段階1）まで。承認・却下・戻す・承認済みと却下の案を消す・次に投稿する・メンションを付けるは「承認を任せる」のときだけ。設定を変える・接続・消す・組織の操作は持ち主だけ。組織の人（担当でない）は、見せているときだけ投稿の案（一覧）と戦略を読むだけ。`GET /accounts` は、自分の運用アカウントに加えて担当している運用アカウント（`assigned`。持ち主の表示名と組織の名前つき。上限に数えない）を返す。

持ち主の退会（`withdrawal.ts`。suite の段のあと）：組織に入れていた運用アカウントは、その組織の今の管理者に引き継ぐ（持ち主を替え、トークンを消して「接続し直しが要る」、自動投稿を切、メンションの待ちを取り消す、新しい持ち主の担当の行を消し、ほかの人の任せる・見せるをオフ、操作の記録に残す）。組織に入れていないものは、アカウントと一緒に CASCADE で消える。2回流しても同じ結果。

## 3. 画面（`/threads/…`。管理の外枠。ログインが要る）

| 道 | 画面 |
|---|---|
| `/threads` | 入口（中身なし）。最後に開いた運用アカウントのホームへ、どれも開いていなければ一覧へ移る（threads-012） |
| `/threads/accounts` | 運用アカウントの一覧（@ユーザー名か未接続・要再接続・承認待ち・承認済みの数。名前からホームへ）と「アカウントを作る」（作ったらホームへ。登録済み n/上限件） |
| `/threads/accounts/$accountId` | ホーム（threads-012）：はじめに読んでほしいこと（閉じたことはこの端末に覚える）・未接続の帯・接続し直しの知らせ・次にやること（約束の `homeNextStep`）・材料の3枚のカード |
| `/threads/guide/threads-token` | トークンの作り方の詳しい手順（設定から新しいタブで開く。threads-012） |
| `/threads/accounts/$accountId/stock` | 自動投稿のまとまり（次の投稿・承認済みの残り・知らせ）と投稿の案（状態をチップで選ぶ〈承認待ち・承認済み・投稿済み・投稿に失敗・却下。選んだ状態は `?tab=`〉・承認・却下の枠〈似ている案・規約に注意の理由をはじめから選ぶ〉・直す枠〈承認済みも。文字数・NG ワード・規約に注意を直しながら出す〉・消す確かめ・時間差のメンション（カードの中で人を選び、返信の文を確かめて付ける・投稿済みに今から返信する・状態と出せなかった理由）・次に投稿する・予定の時刻・Threads で見る。threads-011：承認待ちはためたまとまりごとに「○にためたN件」と「このN件を選ぶ」・「承認できるものを選ぶ（N件）」・選んで承認〈責任と内訳の確かめの枠〉・却下・消す・まとめてメンション、承認済みは選んで承認待ちに戻す・却下、却下は選んで承認待ちに戻す・消す。結果は「N件を承認しました。M件は承認できませんでした（理由ごとの件数）」。規約に注意の案の承認は確かめの枠。承認待ちには似ている度合い〈押すと似ている案3件・押すとその案へ移る〉。本文の NG ワード・規約に注意の所に印。ためた・承認・却下・直した・投稿の日時。承認待ちの上限・却下の新しい500件の知らせ。投稿済みは「もっと見る」） |
| `/threads/accounts/$accountId/create` | 案を作る（件数と文字数〈作る件数の短文・中文・長文の内訳・はじめの値に戻す〉・開くとプロンプトを作る・プロンプトに入っている情報〈戦略の項目ごとの判定・ほかの材料の数と直す画面〉・コピー・AI の答えを貼ってためる〈ためたあとは画面に残り、件数・区切りなし・上限を超える件数・投稿の案で確かめる・取り消す〈貼った文を欄に戻す〉。貼った文があるまま離れると確かめる。承認待ちが上限ならためられない〉。threads-011） |
| `/threads/accounts/$accountId/strategy` | 戦略（区分ごとの欄・口調のチップ。threads-009：上に「AI と考える」〈十分に書けた数・全体の見直しと活動の軸のプロンプト・壁打ち〈区分を選んでプロンプト・答えを貼って候補を選んで入れる〉〉、項目ごとに入力の量の印・考えるヒント・「AI と深める」の枠。threads-012：進みのカード〈十分・短め・目的 n/5問・次におすすめ・区分へ移るチップ・最後に保存した日時〉・活動の軸の「5問から AI と整理する」・欄ごとの文字数・壁打ちのすべて選ぶ／外す・離れる前の確かめと変更を捨てる・ほかで先に保存されたら読みこみ直す／上書き・`#field-<キー>` で項目へ移る） |
| `/threads/accounts/$accountId/research` | 宣伝とリサーチ（宣伝の割合・宣伝の一覧と足す・直す枠〈イベントの情報〉・参考の投稿と解説のプロンプト・貼り戻し・キーワードと案のプロンプト・貼り戻し。threads-012：宣伝のイベントの情報〈都道府県・住所・建物・参加費のメモ・キャンセル・対象・主催〉・カードから一時停止／宣伝中に戻す／終了・対象と対象外・上限の知らせ、参考の投稿を何件かためて足す枠と直す枠〈「なぜ良いか：未入力」からも〉・解説を1件ずつ外す・もっと見る、キーワードを直す枠・Threads で検索、読み物） |
| `/threads/accounts/$accountId/performance` | 反応（基準値〈小数1けた〉・判定のチップ・投稿ごとの6つの数と判定・低調の傾向のメモ〈離れたときに保存〉・CSV の書き出し・「さらに表示する」・権限がない知らせに「つなぎ直す」。threads-012） |
| `/threads/accounts/$accountId/analysis` | 分析（材料と見方・範囲のチップ・伸びた傾向〈次のプロンプトに入る・時刻の見直しの参考に〉・区切りごとの反応・おすすめに乗った目安・内容の分類〈プロンプトをコピー・答えを貼る〉・分類を手で直す枠・分析の設定〈テーマ・プロンプトに入れるか〉） |
| `/threads/accounts/$accountId/media` | 外部メディア（宣伝ごとの5つの媒体の状況と「掲載文を開く」・媒体ごとの既定値） |
| `/threads/accounts/$accountId/media/$promotionId/$media` | 掲載文（ルールのチェック・入力〈区切りごとの欄・コピー・保存・まとめてコピー・自動で直した内容〉・作業の手順・外の AI〈画像と言い回しのプロンプト・答えを欄に入れる〉・掲載の状況と URL・作り直す確かめ） |
| `/threads/oauth/complete` | Threads の許可の画面から戻った人を受け止め、接続を済ませて設定へ戻す（threads-010） |
| `/threads/data-deletion/$code` | Meta のデータの削除の状況（ログインなし・ナビなし。threads-010） |
| `/threads/accounts/$accountId/settings` | 名前・Threads への接続（Meta のアプリでつなぐ〈threads-010。使えるときだけ〉・トークンを貼る・確かめる・切る）・自動投稿（オン・時刻・ずらす）・時間差のメンション（ひとこと・時間差・メンションする人）・投稿のルール・NG ワード（改行・「、」でまとめて足す・もうある語の知らせ・N／200語。threads-011）・操作の記録（種類のチップ）・アカウントを消す（名前をそのまま入れる。threads-012）。threads-012：トークンの5つの手順と隠す欄・Meta のアプリで許可する前の案内と切り替えの手順・投稿できるかの確かめ〈直近24時間の投稿 n/250件〉・時刻を保存したあとの文・規約への備えの枠。トークンの注意の文のあとに、利用規約とプライバシーポリシーへのリンク（suite の `LegalLink`。新しいタブ。suite-002） |

チーム運用の画面（threads-013・threads-016）：`/threads/teams`（見られるチームを組織ごとに。チームが1つだけで管理者でなければ、そのチームの画面を開く。どこにも入っていなければ「チームで運用する」の始め方）・`/threads/teams/$teamId`（チームの画面：「運用アカウント」「担当を決める」〈管理者とリーダー〉「運用状況」を切り替える。自分の運用アカウントの見せる切り替え）・`/threads/teams/$teamId/accounts/$accountId`（見せてもらう読むだけの画面：投稿の案と戦略）。設定の画面に「チーム」の区分（チームに入れる・見せる・承認を任せる）と「このアカウントのチーム」のカード、切り替えと一覧に「担当している運用アカウント」、一覧とホームに知らせ。ナビの「チーム」はいつも出す（運用アカウントの中では最後）。画面の出し分けは `GET …/access` の `can`（正は窓口）。

## 4. ほかの領域が使うもの

運用アカウントの画面では、ページの題の上（`ThreadsPage.tsx`）に運用アカウントの切り替えを出す（外枠には置かない。threads-012）。プロフィールの画像は、画面の CSP の `img-src` が許す Meta の画像の置き場所（`*.cdninstagram.com`・`*.fbcdn.net`。core-008）のものだけ出し、ないとき・読めないとき・ほかの置き場所のときは名前の頭文字の箱にする（`isAllowedPictureUrl`。threads-014）。持ち主でない人（担当の人・見せてもらう人）には、持ち主だけが変えられる入力欄（分析の設定・外部メディアの既定値）を出さず今の値と説明を出し、ホームの「次にやること」と接続の帯で Threads につなぐ手順を出さない（threads-014）。

API の入口（`apps/api/src/modules/threads/index.ts`）は `routes` と、退会の手順 `withdrawal`（組み立てが suite の段のあとに流す。AD-22）を出す。画面の入口は、組織の画面への入口と招待の確かめの説明を `feature.organization` で出す（suite-001 の仕組み）。画面の入口（`apps/web/src/features/threads/index.ts`）は `THREADS_QUERY_KEYS`（どれも `"threads"` で始まる）。外枠のナビの「投稿の案」には、画面が読んだ運用アカウントの承認待ちの数を添える（threads-011。ナビのために問い合わせを始めない）。

## 5. テスト

- 結合：`apps/api/src/modules/threads/threads.test.ts`（台帳で Threads を公開にしてから組み立てる。`apps/api/test/helpers/threads.ts` の `showThreadsApp` を `truncateAllTables` のあとに呼ぶ）・`metrics.test.ts`（反応の取りこみ・判定・画面・CSV）・`research.test.ts`（宣伝・参考の投稿・キーワード・プロンプト）・`analysis.test.ts`（分析・傾向とプロンプト・設定・分類）・`mention.test.ts`（時間差のメンション。偽の Threads で返信まで。まとめて付ける・投稿に失敗したとき）・`stock.test.ts`（threads-011：送り直し・規約に注意・上限・入れ直し・消せる状態・取り消す・NG ワードをまとめて足す・並び・投稿済みの50件ずつ）・`media.test.ts`（外部メディアの掲載文）・`oauth.test.ts`（OAuth と Meta の Webhook。偽の Threads の認可と交換）・`home.test.ts`（threads-012：ホーム・開いた記録・プロフィールの読み直し）・`connect-guidance.test.ts`（自分の別の運用アカウント・名前だけが同じとき）・`promotions.test.ts`（イベントの情報・状態の変更）・`autopost.test.ts`（偽の Threads の API〈`fake-threads.ts`〉を `buildApp` の `fetch` に渡す。定期の仕事は `runJob` を明日の時刻で直に呼ぶ）。
- チーム運用（threads-013）：`team.test.ts`（関わり × 操作の表・任せる・役割を下げる・抜ける・外す・組織を消す・運用状況の範囲と中身・退会の引き継ぎとやり直し）、通しの `e2e/tests/threads-team.spec.ts`。
- 業務の計算：`packages/contracts/src/threads/*.test.ts`（めぐるのテストを写したもの）。
- 通し：`e2e/tests/threads.spec.ts`・threads-012 の `threads-home`・`threads-research`・`threads-connect`・`threads-strategy`・`threads-promotions`・`threads-settings`・`threads-analysis-media`（始めに運営者として台帳で公開にし、終わりに切に戻す。E2E の設定 `e2e/env.ts` で `threads.oauth`・鍵の束・合言葉・偽の Threads の宛先を入れ、`e2e/playwright.config.ts` が偽の Threads〈`fake-threads-serve.ts`〉を立ち上げる）。
- 手元で試す：`pnpm --filter api exec tsx src/modules/threads/fake-threads-serve.ts`（口は 9790）を立ち上げ、`.env` に `THREADS_API_BASE_URL=http://127.0.0.1:9790` と鍵の束を入れる。トークンは `curl -X POST http://127.0.0.1:9790/__control/tokens -H 'content-type: application/json' -d '{"userId":"9001"}'` で作る。
