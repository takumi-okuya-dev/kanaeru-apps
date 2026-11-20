# Feature Specification: OAuth の接続と Meta の Webhook（threads-010）

**Feature Branch**: `feature/threads-001-core-port`（同じ作業場所で続けて作った。PR は分ける）

**Created**: 2026-11-20

**Status**: Draft（手元で実装と確かめまで済み。PR はまだ。本番は設定で切のまま）

**Input**: 主催者の指示「めぐるの Threads をすべて移す」（2026-11-20）。範囲は [PRD](../../../_bmad-output/prd-threads/prd-threads.md) の FR-17（設定で止める）。移す元はめぐるの `connection/threads-oauth.ts`・`threads-connect-routes.ts`・`revocation.ts`・`data-deletion.ts`・`data-deletion-routes.ts`・`threads-webhook-routes.ts`・`adapters/threads-api/signed-request.ts`・画面の `threads-complete.tsx`・`data-deletion.tsx`。

## Clarifications

### Session 2026-11-20

主催者が不在のため、AI が仮に決めた（【仮決め】）。

- Q: 止め方 → A: 機能の印 `threads.oauth`（設定 DOMAIN_FEATURES。既定は切）と、Meta のアプリの設定（`THREADS_APP_ID`・`THREADS_APP_SECRET`）の両方があるときだけ動く。どちらかがなければ、どの窓口も 404。トークンを貼る接続（threads-002）はそのまま【仮決め】
- Q: 秘密の値の渡し方 → A: 領域には値を渡さず、組み立てが道具（`kernel/meta-app.ts` の `MetaApp`：署名の確かめ・トークンの交換の値を作る）にして `DomainRouteDeps.metaApp` で渡す（秘密の箱・合言葉と同じ考え方）。共通の変更【仮決め】
- Q: OAuth の流れ → A: めぐるのまま、state は32バイトの乱数で、DB には SHA-256 だけ・10分・1回だけ。Threads からの戻り（callback）はログインなしで DB にも Threads にも触らず、state と code を画面の完了の画面へ渡すだけ。完了はログインした同じ人のときだけ（めぐるのセキュリティの点検の直し）。code → 短期 → 長期のトークンに替え、トークンを貼るときと同じ確かめと保存（`connectWithToken`）を通す【仮決め】
- Q: 「はじめてつなぐ」と「つなぎ直す」→ A: めぐるは mode を分けたが、kanaeru のトークンの接続と同じく、今の状態で決める【仮決め】
- Q: リダイレクトの URL → A: `<WEB_URL>/api/v1/threads/oauth/callback`（本番は API と画面が同じ源。AD-8）【仮決め】
- Q: Webhook の道と csrf → A: AD-15 のとおり `/api/v1/threads/webhooks/…` に置く。Meta はクッキーなしでフォームの形を送るので、組み立ての csrf の確かめ（フォームの形の他の源を止める）を、`/api/v1/<領域>/webhooks/…` の道だけ通さないようにした（領域が署名で確かめる）。共通の変更【仮決め】
- Q: 連携の解除 → A: めぐるのまま、知らせの時刻がユーザーが最後に認可した時刻より前なら当てない。時刻のない知らせは、持っているトークンでプロフィールを読み、認証のエラーのときだけ解く。解くと「接続し直しが要る」・世代を上げる・トークンを消す。めぐるの「進んでいる OAuth の流れと照らすための取り消しの記録（threads_revocations・鍵付きのハッシュ）」は持たない（ごく稀な重なりのため。残り）【仮決め】
- Q: データの削除で消すもの → A: めぐるのまま、その Threads のユーザーにつないだ運用アカウント（下の表は一緒に消える）。送り直しは signed_request 全体の SHA-256 でまとめ、終わったら Threads のユーザーの ID を消す。失敗・途中は定期の仕事が15分ごとにやり直す。めぐるの鍵付きのハッシュ（IDENTIFIER_HASH_KEY）は持たない（新しい秘密を増やさない）【仮決め】
- Q: 状況の画面 → A: `/threads/data-deletion/{確認のコード}`（ログインなし・ナビなし。確認のコードは推測できない乱数）
- Q: 本番 → A: 切のまま出す。入れるには Meta のアプリの審査・リダイレクトの URL と Webhook の登録・秘密の値の置き場所（Secret Manager）が要る（残り）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Threads の画面で許可するだけでつなぐ (Priority: P2)

**Acceptance Scenarios**:

1. **Given** 機能の印と Meta のアプリの設定がある, **When** 設定の「Meta のアプリでつなぐ」, **Then** Threads の許可の画面へ移り、許可すると設定に戻って「つなぎました」と接続済み
2. **Given** 許可しなかった, **Then** 「許可されなかったため、つないでいません」
3. **Given** ほかの人が state を踏ませた, **Then** 完了できない（400。区別しない）

### User Story 2 - Meta の連携の解除・データの削除に応じる (Priority: P2)

**Acceptance Scenarios**:

1. **Given** 署名の合わない知らせ, **Then** 中身のない 400
2. **Given** 認可のあとの連携の解除, **Then** 「接続し直しが要る」
3. **Given** データの削除の要求, **Then** 運用アカウントを消し、状況の URL と確認のコードを返す。状況の画面で「削除しました」

## Requirements *(mandatory)*

- **FR-1**: 機能の印が切・Meta のアプリの設定がないなら、どの窓口も 404。
- **FR-2**: トークン・code・state・signed_request の値はログに出さない。DB には state のハッシュだけ。
- **FR-3**: Webhook の本文は 8KB まで（署名を確かめる前に縛る）。

## 残り

- PR を分けて出す。DB の変更（`0016_threads_oauth.sql`）と共通の変更（設定・`kernel/meta-app.ts`・`DomainRouteDeps.metaApp`・組み立ての csrf）は、先に別の PR。
- 本番で入れる準備：Meta のアプリの審査、リダイレクトの URL と2つの Webhook の登録、`THREADS_APP_SECRET` を Secret Manager に置いて Cloud Run に渡す（infra）、`THREADS_APP_ID` と `DOMAIN_FEATURES` に `threads.oauth`。
- 進んでいる OAuth の流れと連携の解除の重なりの照らし合わせ（めぐるの threads_revocations）。
