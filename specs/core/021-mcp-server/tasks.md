# Tasks: MCP で本人の記録を外の AI に渡す（接続・認可・読み取り）（core-021）

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 0: 確かめ（実装の前）

- [X] T001 この仕様（spec・plan・tasks）と checklists/requirements.md
- [X] T002 P1：公式の MCP 仕様で DCR と CIMD の扱いを確認し、plan.md R2 に書いた（2026-11-23。CIMD は SHOULD・DCR は MAY で非推奨。PKCE と RFC 8707 は認可のページで確かめる：T002b）
- [X] T002b 認可のページで PKCE・RFC 8707・`iss` を確かめた（2026-11-23。結果は plan.md「認可のページの確認」）
- [X] T060 「Muse」は Meta のパーソナル AI エージェントと確認（主催者の指示）。ほかに使う CLI の一覧は主催者に確かめる
- [X] T066 Muse は API で接続する（主催者の決め。MCP は使わない。2026-11-23）
- [ ] T003 P2：LINE ログインの Web チャネルで、外の AI のブラウザの流れが通るか（Admin と Tester）。結果を plan.md に書く
- [ ] T004 P3：db-f1-micro の接続の上限と、認可の表の増えの影響を見積もる
- [ ] T005 回数の制限の数と記録の保存期間を決め、spec Assumptions に書く

## Phase 1: 先に入れる PR（共通）

- [X] T010（2026-11-23 実装。PR1 `feature/core-021-pr1-platform-db` で試験は通過）`apps/api/src/platform/web/`：`isServerPath`（`/api`・`/.well-known` の下は画面に戻さない）を足し、API の守りで返す。`/api/mcp`・`/api/oauth` は `/api` の下なので追加の道の変更はない。テスト：`test/web.test.ts` の `/.well-known`。旧：`/api/mcp`・`/api/oauth/*`・`/.well-known/oauth-*` を道の頭に並べる（AD-21）。テスト：画面の CSP が `/api` の下に効かない
- [X] T011（2026-11-23 PR1。migration 0023 をローカルの DB に適用し、全体のテストが通過。旧：`oauth_client`・`oauth_code`・`oauth_grant`（範囲は配列）・`oauth_token`（`kind`・`grant_id`）・`mcp_tool_call`（`access`）・冪等キーの表。`pnpm db:generate` → SQL を読む → `pnpm db:migrate`。テスト：表の制約（ハッシュの列だけ・期限・一意）

## Phase 2: 認可（US1）

- [ ] T020 CIMD の取得・検証（`client_id` の URL・`redirect_uris`・取りに行く先の制限）。テスト：不正な URL・取れない・大きすぎる JSON を断る
- [ ] T062 事前登録のクライアント（運営者だけが発行。シークレットは Secret Manager。FR-035）
- [ ] T063 ツールの型に `sensitivity`（normal・sensitive）を足す。`sensitive` は毎回の確認で、常時許可の設定を作らない（FR-036）。テスト：常時許可の設定の入力は受けない
- [ ] T067 Muse 用の許可リスト（`connector-allowlist`）：道・分類・範囲の1行1項目。テスト：許可リストにない道は Bearer があっても `401`（FR-040）
- [ ] T068 `requireSession` の Bearer を許可リストの道だけに効かせる。テスト：許可リストの道で範囲がないと `403`、許可リストの外は `401`、クッキーの動きは変わらない（AD-12）
- [ ] T069 OpenAPI の注釈（`access`・`scope`）から、Muse 向けの説明文を生成する。テスト：許可リストの道ごとに説明文があり、`write` は含まれない（FR-041）
- [ ] T020b DCR（`/api/oauth/register`・RFC 7591）：登録の上限・期限・使われない登録を消す。テスト：上限を超えると断る、期限のあと消える（FR-009）
- [ ] T020c 戻り先の確かめ（完全一致＋ループバックの任意のポート。`http` の別のホストは断る）。テスト：`http://127.0.0.1:1455/callback` は通り、`http://example.com/callback` は断る（FR-033）
- [ ] T021 `/.well-known/oauth-protected-resource`・`/.well-known/oauth-authorization-server`（`client_id_metadata_document_supported` を含む）。テスト：RFC 9728・8414 の必須項目
- [ ] T022 `/api/oauth/authorize`：PKCE S256 必須・`state` 必須・LINE ログインへ。テスト：PKCE なし・`state` なしは通らない（SC-005）
- [ ] T023 `/api/oauth/token`：コードの1回使用・`resource` が `/api/mcp` でなければ断る・`iss` を返す。テスト：SC-002 の組（別の宛先・期限切れ・取り消し）
- [ ] T024 同意の画面の API と画面（範囲と接続の名前を表示）。テスト：断ると接続が発行されない（US1-3）
- [ ] T025 `requireSession` の Bearer 対応（クッキーは `/api/mcp` で受けない・`requireScope`）。テスト：AD-12 の既存のクッキーの道が変わらない

## Phase 3: 読むツール（US2）

- [ ] T030 `platform/mcp`：`/api/mcp`（SDK 2.x・Streamable HTTP）・`Origin` の確かめ・トークンごとの回数の制限
- [ ] T031 ツールの一覧（`merge=union`）と、各領域の `index.ts` からの登録。最初のツールは本人の記録を読む1つ（対象は FR-022 の決め）
- [ ] T032 ツールは `app.request` で画面と同じ窓口を呼ぶ（AD-20）。テスト：領域の関数を直接呼んでいないこと（import の確かめ）
- [ ] T033 2人分のデータでの確かめ：ほかの人の名前・記録が1件も出ない（SC-003）。ほかの人の id は `404`
- [ ] T034 アプリが切のとき `404`、範囲が足りないとき `403`（US2-3・4）
- [ ] T035 `mcp_tool_call` の記録（名前・アカウント・時刻・`access`・結果の種類だけ）。テスト：引数と返した中身が残らない（FR-018・FR-029）
- [ ] T036 ツールの型（`access`・`requiredScope`・`idempotent`・`confirmation`）と、起動のときの食い違いの検査。テスト：書くのに `:read` だけのツールは起動が失敗する（FR-025）
- [ ] T037 試験用の書くツールを、テストの中だけに登録（本番の一覧には入れない）。テスト：読むだけのトークンは `403` で窓口に届かない（SC-007）
- [ ] T038 回数の制限を read と write の2つの枠に分ける（FR-030）。テスト：read の枠を使い切っても write の枠は残る

## Phase 4: 接続の管理（US3）

- [ ] T040 接続の一覧と取り消し（API と設定の画面）。テスト：取り消し後の次の呼び出しが `401`（SC-004）
- [ ] T043 同意の範囲を後から減らす（read と write を別々に）。減らした同意のトークンは次の呼び出しから使えない（FR-031）。テスト：write を外したあと write の呼び出しが `403`
- [ ] T041 退会で全部の接続を取り消す（account の退会の手順に加える）。テスト：退会後に `401`
- [ ] T042 夜間の停止（AD-10）：ツールと認可が `503 DB_UNAVAILABLE`

## Phase 5: 確かめ

- [ ] T050 テストの MCP クライアントで、認可からツール呼び出しまで通す（SC-001）。`pnpm check` を通す
- [ ] T051 ステージングで、Admin と Tester のアカウントから接続の流れを実機で確かめる（P2）
- [ ] T052 ログに、トークン・コード・IDトークン・クッキー・記録の本文が出ないことを確かめる（FR-019）
- [ ] T053 公開の前：独自ドメインを取り、`issuer` と戻り先を入れ替える（FR-024【仮決め】）。LINE チャネルを「公開」にする

## Phase D: デバイス認可（画面のない CLI。最初の版の外）

- [ ] D001 デバイス認可の発行の口（RFC 8628）と、認可サーバーのメタデータへの掲載（FR-034）
- [ ] D002 確認の画面（短いコードを入れて LINE ログイン）。テスト：期限切れ・拒否・ポーリングの答え（待つ・拒否・期限切れ・成功）

## Phase M: Muse のコネクタの審査（この仕様の外の運用。主催者の判断）

- [ ] M001 事業者の確認・データ処理の質問票・プライバシーポリシー（[muse.ai/privacy](https://muse.ai/privacy) を参考に kanaeru 版を作る）
- [ ] M002 審査の間ずっと使えるテスト用の利用者（T064）と、許可リストの道の説明文（読み・書き・sensitive の分類。T069 から生成）
- [ ] M003 セキュリティの事故の連絡の窓口と、48時間以内の連絡の手順（FR-039）
- [ ] M004 申請（platform.muse.ai）と、審査（リスク評価・ツールごと・エンドツーエンドの QA）
- [ ] T064 テスト用の利用者（M002 のため）。本番の利用者のデータを使わない（Constitution II）

## Phase W: 書き込みの追加（この仕様の外。別の仕様で作る）

- [ ] W001 書く操作の仕様（どの記録を・どう書くか。他人の記録は書かない）を `/speckit-specify` で別に作る
- [ ] W002 アプリの定義に write の一覧を足す（core-005 の台帳）
- [ ] W003 書くツールを `platform/mcp` の一覧に登録（窓口は既存の HTTP の道を呼ぶ。AD-20）
- [ ] W004 `confirmation: required` の2段階（差分→確認の値）を実装し、試験する（FR-027）
- [ ] W005 冪等キーを実装し、再送のふるまいを試験する（FR-028）
- [ ] W006 同意の画面に write の選択を出す（FR-014・分けて書く）

## 注

- 各フェーズは別の PR。`develop` に向けて DB の変更の PR は同時に1本だけ（AD-17）。
- 書くツールは、この仕様の外（spec Out of Scope）。DCR とループバックは最初の版に入る（FR-009・FR-033）。
- コミット・push・PR は主催者の指示があってから（CLAUDE.md の決まり）。
