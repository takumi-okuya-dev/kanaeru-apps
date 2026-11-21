# 試合表（match）の地図

2026-11-22 作成（match-001：表とアプリの登録。決めた理由は [specs/match/001-tables/research.md](../../specs/match/001-tables/research.md)）。2026-11-22 直した（match-002：窓口・権限・90日の片付け・退会の手順・名簿・組み方・試合表・印刷。理由は [specs/match/002-roster/research.md](../../specs/match/002-roster/research.md)）。2026-11-22 直した（match-003：当日の組み直し・分け方を当日に変える・大きく映す・担当の受け渡しの見せ方。理由は [specs/match/003-day-of/research.md](../../specs/match/003-day-of/research.md)）。2026-11-22 直した（match-004：見るだけのページ・入口の QR・QR で受け付ける。理由は [specs/match/004-view-and-join/research.md](../../specs/match/004-view-and-join/research.md)）。

試合表アプリ（key `match`）の1つの領域（構成の決めごと AD-25）。バドミントンのサークルの運営が、名簿からレベル別のダブルス・シングルスの試合表を作り、印刷し、当日に組み直して配る（[PRD](../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md)）。試合表は交流会に頼らない、持ち主の account の記録で、組織に入れられる（AD-19・AD-25）。組み合わせの計算は画面の側に置く（AD-29）。

この版で作っていないもの：ネットなしで開く・電波なしで渡す QR・受付の交流会から名簿を入れる・前に入れたレベル・ログインの前に試す（PRD 7.1 の5〜6）。

## 1. アプリの登録

| 項目 | 値 |
|---|---|
| key・道の頭 | `match`・`/match`（運営の画面）・`/api/v1/match/…`（窓口） |
| 領域 | `match` の1つ |
| 使ってよいほかのアプリ | `reception`（受付の交流会から名簿を入れるとき。AD-23・AD-25） |
| 公開 | 台帳に行がない間は運営者だけに見える（AD-16） |
| LIFF | 試合表の道（`/match`・`/match/…`）は LIFF を始めない（AD-4 の例外。core-013）。この道の画面は `getLiff()` と、それを読む部品（account の `SessionGate` など）を使わない |

## 2. 表

| 表 | 列 | 決まり |
|---|---|---|
| `match_table` | `id`・`owner_account_id`・`name`・`play_date`・`content`・`version`・`editor_device_id`・`last_change_id`・`seed`・`view_token_hash`・`view_token_expires_at`・`join_token_hash`・`join_token_expires_at`・`join_closed_at`・`event_id`・`created_at`・`updated_at` | 試合表（最上位の記録）。中身（名簿〈呼び名・レベル・当日の印〉・組み合わせ・進み具合・設定）は1つの JSON（object の CHECK `match_table_content_check`）で、形は約束の zod で確かめてから書く。氏名・メールアドレスは持たない（Constitution II）。`version` は1以上（直すたびに上げる。AD-28）、`editor_device_id` は担当の端末（1〜64文字か空）、`last_change_id` は最後に受けた変更の ID（同じ変更の二重を止める）、`seed` はくじの種（AD-29）。名前は1〜60文字。札は SHA-256 だけを持ち、空でなければ一意（`match_table_view_token_hash_unique`・`match_table_join_token_hash_unique`。AD-26・AD-30）。索引 `(owner_account_id, play_date)`（90日を過ぎた試合表をまとめて消す）・`event_id` |
| `match_table_organization` | `match_table_id`（主キー）・`organization_id`・`owner_account_id`・`placed_at` | 試合表を組織に入れる（1つの組織まで。チームには入れない）。`(organization_id, owner_account_id)` は `organization_member` を指す複合の外部キー（`match_table_organization_member_fk`）。索引 `organization_id` |
| `match_level_memory` | `id`・`owner_account_id`・`organization_id`・`account_id`・`level`・`created_at`・`updated_at` | 前に入れたレベル（account のある人だけ）。相手は運営か組織のどちらか1つ（`match_level_memory_holder_check`）で、相手と人の組ごとに1行（部分の一意）。レベルは `advanced`・`intermediate`・`beginner`・`novice` の CHECK |
| `match_join` | `id`・`match_table_id`・`nickname`・`level`・`created_at`・`updated_at` | QR の受付（ログインなしで入れた呼び名とレベル。AD-30）。呼び名は1〜20文字。担当の端末が読んで名簿に足す（行は残し、名簿の人の ID は `joinPlayerId(id)`。試合表ごとに100行まで受ける）。索引 `(match_table_id, created_at)` |

消し方：

| 外部キー | 消し方 |
|---|---|
| `match_table.owner_account_id` | `CASCADE`（持ち主のデータ。組織に入れた試合表は、退会の手順の match の段〈match-002〉が account を消す前に組織の管理者へ引き継ぐ） |
| `match_table.event_id` | `SET NULL`（交流会が消えても試合表は残る） |
| `match_table_organization.match_table_id` | `CASCADE` |
| `match_table_organization` の `(organization_id, owner_account_id)` | `CASCADE`（持ち主が組織を抜ける・外される・組織が消えると、試合表は持ち主の個人のものに戻る。AD-22） |
| `match_level_memory` の `owner_account_id`・`organization_id`・`account_id` | `CASCADE`（相手か本人が消えれば消える） |
| `match_join.match_table_id` | `CASCADE`（試合表と一緒に消える） |

## 3. 中身（`match_table.content`）

形の正本は `@workspace/contracts/match` の `MatchTableContent`（どの object も strict で、氏名などほかの欄を受けない）。

- `settings`：試合の形（`doubles`・`singles`）・レベルの分け方（`four`・`three`・`two`・`none`）・1試合の長さ（5〜90分）・試合の始まりと終わり（HH:MM）。
- `players`：名簿（150人まで）。ID（端末が作る英数字）・呼び名（1〜20文字）・レベル（空は「選ぶまで試合に入らない」）・当日の印（`present`・`late`・`absent`・`left`〈帰った〉。試合に入るのは `present` だけ）・呼び名を確かめてほしい印。
- `plan`：組（分け方の組。`MATCH_GROUPS`）ごとの試合（240行まで）。1試合は入る人の ID（ダブルスは4人・シングルスは2人）と、終わったか。任意の `offset` は行の数の差（当日に分け方・試合の形を変えたとき。行の数 = 設定から決まる試合の数〈60まで〉+ offset）。
- `archive`（任意）：前の分け方・試合の形で終わった試合（今の組に入れられなくなった終わった試合。組の key ごと。別々の2人か4人）。記録と、試合の数を均すために持つ。

## 4. 窓口

ログインなしの4つの道（下の表の後半）のほかは、ログインが要る（`requireSession`）。権限は `access.ts` の `requireTableAccess`（持ち主と、入れた組織の管理者・編集者。組織のメンバーは開けない）。

| 道 | 何をするか |
|---|---|
| `GET /api/v1/match/tables` | 開ける試合表の一覧（試合の日の新しい順）。先に今の利用者の、試合の日から90日を過ぎた試合表を消す |
| `POST /api/v1/match/tables` | 作る（名前・試合の日・任意で自分が入っている組織・端末の ID）。作った端末が担当の端末。くじの種はサーバーの乱数。先に90日を過ぎた試合表を消す |
| `GET /api/v1/match/organization-options` | 入れられる組織（自分が入っている組織） |
| `GET /api/v1/match/tables/{tableId}` | 読む（中身・版・くじの種・担当の端末） |
| `PUT /api/v1/match/tables/{tableId}` | 直す。担当の端末で、もとの版が今の版と同じときだけ受けて版を1つ上げる（違えば 409 `MATCH_NOT_EDITOR`・`MATCH_VERSION_CONFLICT`）。最後に受けた変更の ID と同じ送りは、書かずに今の試合表を返す。中身は約束で確かめるだけで、計算し直さない |
| `PUT /api/v1/match/tables/{tableId}/editor` | この端末を担当の端末にする（版は上げない） |
| `DELETE /api/v1/match/tables/{tableId}` | 消す |
| `PUT /api/v1/match/tables/{tableId}/view-link`・`…/join-link` | 見るだけ・受付の札を作り直す（192ビットの乱数。DB は SHA-256 だけ。札はこのときだけ返す。期限は試合の日と今日の遅いほうの日本時間の終わり。受付は締めた印を外す。`tokens.ts`・`routes-share.ts`） |
| `POST /api/v1/match/tables/{tableId}/join-link/close` | 受付を締める |
| `GET /api/v1/match/tables/{tableId}/joins`・`DELETE …/joins/{joinId}` | 受付の一覧（同じ名前の印・札の期限と締めた時刻）・受付の行を消す |
| `GET /api/v1/match/views/{viewToken}`・`…/version` | **ログインなし**。見るだけのページ（名前・日付・版・組ごとの呼び名の並びと終わったか。レベル・名簿の人の ID は出さない）と版の番号 |
| `GET`・`POST /api/v1/match/joins/{joinToken}` | **ログインなし**。受付のページ（名前・日付・選べるレベル）と受け付ける（呼び名とレベルだけ・strict・100人まで・409 `MATCH_JOIN_FULL`） |

ログインなしの道の答えは `Cache-Control: no-store`・`X-Robots-Tag: noindex, nofollow`。期限切れ・締めた・作り直した・ない札は同じ 404（`MATCH_VIEW_NOT_FOUND`・`MATCH_JOIN_NOT_FOUND`）。受け付ける POST は組み立ての IP ごとの回数の制限が効く。試合表を読む答えの `links` は札の状態（期限・締めた時刻）だけ。

退会の手順（`withdrawal.ts`）：account を消すトランザクションの中で、組織に入れた試合表を組織の今の管理者に引き継ぐ（持ち主を替える）。組織に入れていない試合表は外部キーで消える。確かめの中身に、引き継がれる試合表と消える試合表を分けて出す。

## 5. 画面

`apps/web/src/features/match/`。試合表の道は LIFF を始めないので、ログインは窓口の 401 で知り（`MatchGate`）、`/settings/account` でログインしてもらう。ナビの項目は試合表の画面の中だけ（`useNavItems`：試合表の一覧・名簿と設定・試合表・印刷・見るだけのページ・QR で受け付ける）。大きく映す画面・見るだけのページ・受付のページはナビのない外枠（`"bare"`）。見るだけのページと受付のページはログインを確かめない（`MatchGate` を使わない）。

| 道 | 画面 |
|---|---|
| `/match` | 試合表の一覧（M0） |
| `/match/new` | 試合表を作る（M0。名前・試合の日・組織） |
| `/match/tables/$tableId` | 名簿と設定（M1）。フォームから貼り付ける（タブ区切りの表）・CSV を読む・1人足す。読むのは氏名・レベル・タイムスタンプだけ（`roster-read.ts`。同じ氏名は新しいほう・呼び名は姓、同じ姓は名の字を足す・空白のない氏名に印）。氏名は保存せず、画面を開いている間だけ出す。呼び名・レベル・当日の印・設定を直す。「試合表を作る」（「組み直す」） |
| `/match/tables/$tableId/board` | 試合表（M2・M6）。組のタブ（`GroupTabs.tsx`）・名前だけの行（見出しなし・左に番号・名前の列の間に縦線）・行のチェックで進める（チェックのない最初が今、その次が次）・別の組み合わせにする。担当の端末は「人を選んで直す」（来なかった・来た・帰る → その人の組だけを組み直す。`day-of.ts`）と「レベルの分け方」（当日に分け方・試合の形を変える。何が変わるかを先に出す。`regroup.ts`）。組み直したら上に帯。前の分け方で終わった試合は下に畳んで出す |
| `/match/tables/$tableId/view-link` | 見るだけのページのリンクと QR（作る・作り直す・コピー・期限）。札は作った端末の localStorage にだけ置く（`link-store.ts`）。ほかの端末で出すときは作り直す |
| `/match/tables/$tableId/join` | QR で受け付ける（M7）。受付の QR とリンク・受け付けた人（5秒おきに読み直す。同じ名前の印・消す）・受付を締める・この名簿で試合表を作る。担当の端末は受け付けた人を名簿に入れる（`use-joins.ts`・`joins.ts`。名簿と設定の画面も開いたときに入れる） |
| `/match/view/$viewToken` | 見るだけのページ（P1。ログインなし）。組のタブ・呼び名だけの表・今と次・自分の名前の印（端末に置く）・最後に読んだ表とその時刻（端末に置き、読めないときに出す）・30秒おきに版の番号を確かめる・`noindex`（`no-index.ts`）・「kanaeru で作った試合表・自分のサークルでも使う」 |
| `/match/join/$joinToken` | 受付のページ（P2・P3。ログインなし）。名前とレベルだけ・受付できました・電波がないときの案内・締め切り |
| `/match/tables/$tableId/big` | 大きく映す（M3）。組のタブと、今の試合と次の試合だけを大きな字（名前は SVG で描き、画面の幅に合わせる）で出す。担当でない端末は、つながっている間30秒おきに読み直す |
| `/match/tables/$tableId/print` | 印刷（M5・R1）。刷る組・紙（A5〜A2・B5〜B3）と向き・組ごとに1枚の版（SVG。紙1枚にちょうど収まるよう字の大きさを合わせる。`print-layout.ts`・`print.css`）。見るだけのリンクがこの端末にあれば、版の右上に QR（`qr.tsx`）と、入口に貼る1枚（R2。A4 縦）。下に「kanaeru で作った試合表」 |

直すたびに、担当の端末が中身をまるごと、もとの版と変更の ID を付けて古い順に送る（`table-editor.ts`。端末の ID は `device.ts` の localStorage）。送れなかったら残りを止めて読み直す。担当でない端末には、今の担当（端末の ID の終わりの4文字）と「この端末で直す」（つながっているときだけ・確かめてから。`TableFrame.tsx`）を出す。

## 6. 組み方

`pairing.ts` の `planGames`（状態を持たない関数・くじの種を引数で受け取る。説明は docstring）と `plan.ts` の `buildPlan`（組ごとに、最後にチェックした試合までを残して続きを組む。組ごとに `deriveSeed` で別のくじ）。流れと守る順は [addendum.md](../../_bmad-output/prd-kanaeru-match/addendum.md) の1〜2章：周（出た数がいちばん少ない人が入れ物）→ 周の残りから「（分けないときだけ）レベルの差の超え → 同じ試合に入った回数の2乗の合計 → 直前の試合に出た人の数 → くじ」で選ぶ。組めるのは当日の印が「来る」でレベルのある人だけ。

当日（match-003）：
- `plan.ts` の `replanGroup`：1つの組だけを、最後にチェックした試合までと今の試合（入る人がみな出られるなら）を残して組み直す。`day-of.ts` の `markAttendance` が当日の印を直してから呼ぶ。
- `regroup.ts` の `changeSettings`：分け方・試合の形を変えたら、変わらない組はそのまま、終わった試合は新しい組に移せれば交互に移し、移せなければ `archive` に残す。新しい組の行の数は「移した試合 + 残りの時間の試合」（進んだ試合の数は、いちばん進んだ組で見る）で、差を `offset` に持つ。人が足りずに試合のなかった組を当日に組むときも、進んだ分だけ減らす。
- `buildPlan` は `archive` の試合も数に入れ、行の数は「設定から決まる試合の数 + offset」。

## 7. テスト

- 表：`apps/api/src/modules/match/schema.test.ts`（CHECK・一意・消し方を表に直に書いて確かめる）。
- 窓口：`routes.test.ts`（作る・一覧・読む・直す・担当・消す・権限・入力の誤り・90日・見えないアプリ）・`routes-share.test.ts`（見るだけ・受付：レベルが出ない・no-store と noindex・期限切れと作り直した札・strict・締めた受付・100人・同じ名前）・`withdrawal.test.ts`。手伝いは `apps/api/test/helpers/match.ts`（`showMatchApp`・`createTable`・`updateTable`）。
- 約束：`packages/contracts/src/match/*.test.ts`。
- 組み方：`apps/web/src/features/match/pairing.test.ts`・`day-of.test.ts`・`regroup.test.ts`（fast-check の property-based）。名簿の読み方 `roster-read.test.ts`・印刷の大きさ `print-layout.test.ts`・受付を名簿に入れる `joins.test.ts`。
- E2E：`e2e/tests/match.spec.ts`（未ログイン・作る → 貼る → 設定 → 作る → チェック → 印刷 → シングルス／当日：人を選んで直す → 分け方を変える → 大きく映す → 別の端末で担当を受け取る／見せる・受け付ける：リンクと QR → 印刷の QR → ログインなしで受け付ける → 見るだけのページ → 名簿に入る → 締める。両方の幅で axe・横のスクロール・CSP）。
