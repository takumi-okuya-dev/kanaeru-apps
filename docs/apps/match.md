# 試合表（match）の地図

2026-11-22 作成（match-001：表とアプリの登録。決めた理由は [specs/match/001-tables/research.md](../../specs/match/001-tables/research.md)）。2026-11-22 直した（match-002：窓口・権限・90日の片付け・退会の手順・名簿・組み方・試合表・印刷。理由は [specs/match/002-roster/research.md](../../specs/match/002-roster/research.md)）。2026-11-22 直した（match-003：当日の組み直し・分け方を当日に変える・大きく映す・担当の受け渡しの見せ方。理由は [specs/match/003-day-of/research.md](../../specs/match/003-day-of/research.md)）。2026-11-22 直した（match-004：見るだけのページ・入口の QR・QR で受け付ける。理由は [specs/match/004-view-and-join/research.md](../../specs/match/004-view-and-join/research.md)）。2026-11-22 直した（match-005：ネットなしで開く・端末に残して送る・電波なしで渡す QR・参加者の QR を読む。理由は [specs/match/005-offline/research.md](../../specs/match/005-offline/research.md)）。2026-11-22 直した（match-006：受付の交流会から名簿を入れる・前に入れたレベル。理由は [specs/match/006-reception-import/research.md](../../specs/match/006-reception-import/research.md)）。2026-11-22 直した（match-007：名簿を入れた受付の交流会を試合表に持って出す・ホーム画面のアイコンと manifest。理由は [specs/match/007-event-link-and-icon/research.md](../../specs/match/007-event-link-and-icon/research.md)）。2026-11-22 直した（Codex の指摘の直し：ほかの道で開いた文書から試合表の道へ入るときに読み直す・見るだけのページの QR の取り込みの比べ方と読み直しの間）。2026-11-26 直した（match-009：試合の数を入れる・分け方を組み合わせる・ミニゲームのチーム分け・見込みをやめる。理由は [specs/match/009-game-settings/research.md](../../specs/match/009-game-settings/research.md)）。同じ日に直した（match-010：組み合わせを手で入れかえる。[specs/match/010-swap](../../specs/match/010-swap/spec.md)）。

試合表アプリ（key `match`）の1つの領域（構成の決めごと AD-25）。バドミントンのサークルの運営が、名簿からレベル別のダブルス・シングルスの試合表を作り、印刷し、当日に組み直して配る（[PRD](../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md)）。試合表は交流会に頼らない、持ち主の account の記録で、組織に入れられる（AD-19・AD-25）。組み合わせの計算は画面の側に置く（AD-29）。

この版で作っていないもの：ログインの前に試す（PRD FR-M26）。

## 1. アプリの登録

| 項目 | 値 |
|---|---|
| key・道の頭 | `match`・`/match`（運営の画面）・`/api/v1/match/…`（窓口） |
| 領域 | `match` の1つ |
| 使ってよいほかのアプリ | `reception`（受付の交流会から名簿を入れるとき。AD-23・AD-25） |
| 公開 | 台帳に行がない間は運営者だけに見える（AD-16） |
| LIFF | 試合表の道（`/match`・`/match/…`）は LIFF を始めない（AD-4 の例外。core-013）。この道の画面は `getLiff()` と、それを読む部品（account の `SessionGate` など）を使わない |
| ネットなし | 範囲 `/match/` の Service Worker（`/match/sw.js`。機能の印 `match.offline` が入のときだけ入れる。AD-27。8章） |
| カメラ | 試合表の道だけ Permissions-Policy で自分の源に許す（QR を読む。core-015） |
| ホーム画面 | manifest `/match/manifest.webmanifest`（名前「kanaeru 試合表」・短い名前「試合表」・始まり `/match/`・範囲 `/match`・standalone）とアイコン（`apps/web/public/match/`。9章）。見出しのリンクは運営の画面を開いている間だけ付ける（match-007） |

## 2. 表

| 表 | 列 | 決まり |
|---|---|---|
| `match_table` | `id`・`owner_account_id`・`name`・`play_date`・`content`・`version`・`editor_device_id`・`last_change_id`・`seed`・`view_token_hash`・`view_token_expires_at`・`join_token_hash`・`join_token_expires_at`・`join_closed_at`・`event_id`・`created_at`・`updated_at` | 試合表（最上位の記録）。中身（名簿〈呼び名・レベル・当日の印〉・組み合わせ・進み具合・設定）は1つの JSON（object の CHECK `match_table_content_check`）で、形は約束の zod で確かめてから書く。氏名・メールアドレスは持たない（Constitution II）。`version` は1以上（直すたびに上げる。AD-28）、`editor_device_id` は担当の端末（1〜64文字か空）、`last_change_id` は最後に受けた変更の ID（同じ変更の二重を止める）、`seed` はくじの種（AD-29）。`event_id` は名簿を入れた受付の交流会（中身の写し `receptionEvent` の交流会を、入れてよいときだけつなぐ。match-007）。名前は1〜60文字。札は SHA-256 だけを持ち、空でなければ一意（`match_table_view_token_hash_unique`・`match_table_join_token_hash_unique`。AD-26・AD-30）。索引 `(owner_account_id, play_date)`（90日を過ぎた試合表をまとめて消す）・`event_id` |
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

- `settings`：試合の形（`doubles`・`singles`）・試合の数（1つの組。1〜60）・レベル別の分け方（`four`・`three`・`two` か `null`）・分けないか（`ungrouped`）・ミニゲームのコート数（1〜20 か `null`）。3つの分け方のどれか1つは要る（match-009）。前の形（分け方1つ `grouping`・1試合の長さ・試合の始まりと終わり）は、約束の `MatchSettings` が読むときに直す（試合の数 = 試合の時間 ÷ 1試合の長さを1〜60に収める）。DB の中身は書き換えず、次に保存したときに新しい形になる。端末に置いた写しと送っていない変更も、読むときに直す（`offline/store.ts`）。
- `players`：名簿（150人まで）。ID（端末が作る英数字）・呼び名（1〜20文字）・レベル（空は「選ぶまで試合に入らない」）・当日の印（`present`・`late`・`absent`・`left`〈帰った〉。試合に入るのは `present` だけ）・呼び名を確かめてほしい印・受付の交流会から入れた人の account（LINE でチェックイン・申込みした人だけ。前に入れたレベルを覚えるため。見るだけのページ・電波なしで渡す QR には出さない。match-006）。
- `plan`：組（分け方の組。`matchGroupsOf`：レベル別の組 +〈分けないなら〉全員の組 `all`。組の key は分け方をまたいで重ならない）ごとの試合（240行まで）。1試合は入る人の ID（ダブルスは4人・シングルスは2人）と、終わったか。任意の `offset` は行の数の差（当日に分け方・試合の形を変えたとき。行の数 = 設定から決まる試合の数〈60まで〉+ offset）。
- `archive`（任意）：前の分け方・試合の形で終わった試合（今の組に入れられなくなった終わった試合。組の key ごと。別々の2人か4人）。記録と、試合の数を均すために持つ。
- `mini`（任意）：ミニゲームのチーム分け（`teams`：チームごとの名簿の人の ID。チームの数 = コート数 × 2。コート1はチーム1と2…。同じ人は1つのチームまで。コート数があるときだけ持てる。match-009）。
- `receptionEvent`（任意）：名簿を入れた受付の交流会の写し（交流会の ID・入れたときの名前〈200文字まで〉と始まりの日時。match-007）。受付の交流会から入れると（置きかえても足しても）その交流会に置きかわり、フォームの貼り付け・CSV で置きかえると外れ、貼り付けで足しただけなら残る。交流会があとで消えても・見られなくなっても、運営の画面にこの写しを出す。見るだけのページ・電波なしで渡す QR には出さない（AD-26）。

## 4. 窓口

ログインなしの5つの道（下の表の後半）のほかは、ログインが要る（`requireSession`）。権限は `access.ts` の `requireTableAccess`（持ち主と、入れた組織の管理者・編集者。組織のメンバーは開けない）。

| 道 | 何をするか |
|---|---|
| `GET /api/v1/match/tables` | 開ける試合表の一覧（試合の日の新しい順。行ごとに名簿を入れた受付の交流会 `receptionEvent`）。先に今の利用者の、試合の日から90日を過ぎた試合表を消す |
| `POST /api/v1/match/tables` | 作る（名前・試合の日・任意で自分が入っている組織・端末の ID）。作った端末が担当の端末。くじの種はサーバーの乱数。先に90日を過ぎた試合表を消す |
| `GET /api/v1/match/organization-options` | 入れられる組織（自分が入っている組織） |
| `GET /api/v1/match/tables/{tableId}` | 読む（中身・版・くじの種・担当の端末・名簿を入れた受付の交流会 `receptionEvent`） |
| `PUT /api/v1/match/tables/{tableId}` | 直す。担当の端末で、もとの版が今の版と同じときだけ受けて版を1つ上げる（違えば 409 `MATCH_NOT_EDITOR`・`MATCH_VERSION_CONFLICT`）。最後に受けた変更の ID と同じ送りは、書かずに今の試合表を返す。中身は約束で確かめるだけで、計算し直さない。中身の写し `receptionEvent` の交流会が変わったら `event_id` をつなぎ直す（下の「名簿を入れた受付の交流会」） |
| `GET /api/v1/match/tables/{tableId}/reception-events/{eventId}` | 受付の交流会から入れられる人（match-006。`routes-reception.ts`）。チェックインした人（reception の `listEventAttendees`）と確定した申込みの名簿（booking の `listApplicantRoster`）の名前・account・覚えているレベル。名前は呼び名を作るためだけに返す。選べるのは event の判定で自分が主催者の交流会のうち、試合表と同じ組織のもの（どちらも組織に入れていなければ持ち主が同じもの。組織ごとに閉じる。AD-23）だけで、ない・主催者でない・持ち主が違う・受付アプリが見えないときは同じ 404 `MATCH_EVENT_NOT_FOUND`。試合表の権限も確かめる |
| `PUT /api/v1/match/tables/{tableId}/editor` | この端末を担当の端末にする（版は上げない） |
| `DELETE /api/v1/match/tables/{tableId}` | 消す |
| `PUT /api/v1/match/tables/{tableId}/view-link`・`…/join-link` | 見るだけ・受付の札を作り直す（192ビットの乱数。DB は SHA-256 だけ。札はこのときだけ返す。期限は試合の日と今日の遅いほうの日本時間の終わり。受付は締めた印を外す。`tokens.ts`・`routes-share.ts`） |
| `POST /api/v1/match/tables/{tableId}/join-link/close` | 受付を締める |
| `GET /api/v1/match/tables/{tableId}/joins`・`DELETE …/joins/{joinId}` | 受付の一覧（同じ名前の印・札の期限と締めた時刻）・受付の行を消す |
| `GET /api/v1/match/views/{viewToken}`・`…/version` | **ログインなし**。見るだけのページ（名前・日付・版・組ごとの呼び名の並びと終わったか・ミニゲームのチームの呼び名 `teams`〈match-009〉。レベル・名簿の人の ID は出さない）と版の番号 |
| `GET /api/v1/match/offline` | **ログインなし**。ネットなしで開く仕組みを使うか（機能の印 `match.offline`。`{ enabled }`。アプリが見えなければ 404。match-005） |
| `GET`・`POST /api/v1/match/joins/{joinToken}` | **ログインなし**。受付のページ（名前・日付・選べるレベル）と受け付ける（呼び名とレベルだけ・strict・100人まで・409 `MATCH_JOIN_FULL`） |

ログインなしの道の答えは `Cache-Control: no-store`・`X-Robots-Tag: noindex, nofollow`。期限切れ・締めた・作り直した・ない札は同じ 404（`MATCH_VIEW_NOT_FOUND`・`MATCH_JOIN_NOT_FOUND`）。受け付ける POST は組み立ての IP ごとの回数の制限が効く。試合表を読む答えの `links` は札の状態（期限・締めた時刻・札の SHA-256 の頭8文字〈端末に置いた札が今の札かを見分ける〉）だけ。

前に入れたレベル（`level-memory.ts`。AD-25。match-006）：中身を直す `PUT` で、account のある人のレベルが入った・前と変わったら、`match_level_memory` に書く（同じトランザクション）。覚えている持ち主は試合表を入れた組織、入れていなければ試合表の持ち主。名簿に残った account が消えていたら、その人だけ飛ばす（外部キーの違反を区切り〈savepoint〉で捨てる。保存は止めない）。受付の交流会から入れるときに読む。CSV・貼り付け・手で入れた人・QR の受付の人は覚えない。

名簿を入れた受付の交流会（`reception-link.ts`。match-007）：中身を直す `PUT` で、写しの交流会が前の中身の写しと変わったら（入れた・入れ直した・外した。ふだんの直しでは確かめない）、入れてよい交流会（受付の交流会から入れる窓口と同じ `canImportEvent`：受付アプリが見え・交流会の主催者で・持ち主が同じ）のときだけ `event_id` につなぎ、ほかは外す（送りは止めない）。一覧と試合表の答えの `receptionEvent` は、写しの名前と日時と、受付アプリで開けるか（`canOpen`：つないだ交流会が写しと同じで、今の利用者がその主催者か受付係で、受付アプリが見えるとき）。交流会が消えたら `event_id` は外部キーで空になり、`canOpen` は false（画面は「交流会は見られません」）。交流会のことは event・suite の `index.ts` からだけ読む。

退会の手順（`withdrawal.ts`）：account を消すトランザクションの中で、組織に入れた試合表を組織の今の管理者に引き継ぐ（持ち主を替える）。組織に入れていない試合表は外部キーで消える。確かめの中身に、引き継がれる試合表と消える試合表を分けて出す。

## 5. 画面

`apps/web/src/features/match/`。試合表の道は LIFF を始めないので、ログインは窓口の 401 で知り（`MatchGate`）、`/settings/account` でログインしてもらう。ナビの項目は試合表の画面の中だけ（`useNavItems`：試合表の一覧・名簿と設定・試合表・印刷・見るだけのページ・QR で受け付ける）。**試合表の画面の中なら、一覧・作るの画面でも、いつも出す**（core-022）：試合表の中ではその試合表へ進み、一覧・作るでは直前に開いた試合表へ進む（`last-table.ts`：端末の localStorage の `kanaeru.match.last-table`。`kanaeru.match.` の頭なので、今の利用者が替わったときの写しの片付けが消す）。記録がなければ5つの項目は薄く出て（`NavItem.disabled`）、押すと「先に試合表を選んでください」と案内して一覧へ進む。大きく映す画面・見るだけのページ・受付のページはナビのない外枠（`"bare"`）。見るだけのページと受付のページはログインを確かめない（`MatchGate` を使わない）。ほかの道（すべてのアプリなど）で開いた文書から画面の中で試合表の道へ入るときは、同じ URL でページを読み直す（カメラを許す Permissions-Policy と Service Worker は文書ごとに決まるため。今の文書の道は Navigation Timing で見る。`document-boundary.ts`。試合表の道の中の行き来は読み直さない）。

| 道 | 画面 |
|---|---|
| `/match` | 試合表の一覧（M0）。受付の交流会から名簿を入れた試合表には「受付：{名前}（{日付}）から入れた」 |
| `/match/new` | 試合表を作る（M0。名前・試合の日・組織） |
| `/match/tables/$tableId` | 名簿と設定（M1）。題の下に名簿を入れた受付の交流会（`ReceptionEventNote.tsx`。開けるときは受付アプリの一覧画面へのリンク〈ページを読み直すふつうのリンク〉、開けないときは「交流会は見られません」。試合表の画面も同じ）。受付の交流会から（M0。`ReceptionImportDialog.tsx`：自分が主催者で試合表と同じ組織の交流会〈event の一覧 `GET /api/v1/events` の主催者の行〉を選び、チェックインした人か申込みの名簿を入れる。呼び名は貼り付けと同じ決まり・覚えたレベルを入れ、ない人は名簿で選ぶ・後ろに足すときは名簿にいる account の人を入れない。`reception-import.ts`）・フォームから貼り付ける（タブ区切りの表）・CSV を読む・1人足す。貼り付けと CSV は、名簿に入れる前に列の確かめ（`ColumnCheckDialog.tsx`。match-008）を出す：氏名・レベル・回答の日時の列を見出しから選んで見せ、選び直せる（氏名の列が見つからなければ1列目を使わず、選ぶまで入れない・列が1つの表はその列を氏名に・レベルの列は見出しか選択肢の言葉で推しはかる）・レベルの選択肢ごとの対応を見せて選び直せる（言葉を数字より先に読む・違うレベルの言葉が2つある選択肢や読めない選択肢は選ぶまで入れない）・先頭の3人と人数・入れられなかった理由は枠の中に出す。読むのは選んだ氏名・レベル・回答の日時だけ（`roster-read.ts`。同じ氏名は新しいほう〈「午前・午後」「AM・PM」・「月/日/年」の日時も直して比べる〉・呼び名は姓、同じ姓は名の字を足す・空白のない氏名に印）。氏名は保存せず、画面を開いている間だけ出す。名簿の表は「名簿の一覧（N人）」の開け閉め（`Disclosure`）の中で、開いたときは閉じている（取り込んだ直後だけ開く）。呼び名・レベル・当日の印・設定（試合の数・試合の形・分け方：「レベル別」の印と4つ・3つ・2つ／「分けない」の印／「ミニゲーム」の印とコート数）を直す。分け方ごとの組の人数と試合の数・ミニゲームのチームの数と1チームの人数を出す。「試合表を作る」（「組み直す」。組み合わせとチーム分けをまとめて作る `plan.ts` の `rebuild`） |
| `/match/tables/$tableId/board` | 試合表（M2・M6）。分け方が2つ以上なら分け方のタブ（`SetTabs.tsx`：レベル別・分けない・ミニゲーム）、レベル別の中で組が2つ以上なら組のタブ（`GroupTabs.tsx`）・ミニゲームはコートごとのチーム（`MiniTeams.tsx`。レベルと、来る人でない人の印・チームに入っていない人）と「チーム分けをやり直す」（担当の端末・今の来る人で分け直す）・名前だけの行（見出しなし・左に番号・名前の列の間に縦線）・行のチェックで進める（チェックのない最初が今、その次が次）・別の組み合わせにする。担当の端末は「人を選んで直す」（来なかった・来た・帰る → その人の組だけを組み直す。`day-of.ts`）と「分け方と試合の形」（当日にレベル別の分け方・分けない・ミニゲームのコート数・試合の形を変える。何が変わるかを先に出す。`regroup.ts`）。「組み合わせを直す」（match-010）：直す形では名前がボタンになり（`SwapName.tsx`）、パソコンはドラッグ、スマホとキーボードは2人を順に押して、同じ組のまだの試合の名前どうしを入れかえる（終わった試合は動かさない・同じ試合に同じ人が2回入るときは入れかえない）。ミニゲームはチームの人どうしの入れかえと、ほかのチームへの移し（空のチームは作らない）。計算は `swap.ts`。あとで組み直すと、まだの試合の直しは消える。組み直したら上に帯。前の分け方で終わった試合は下に畳んで出す |
| `/match/tables/$tableId/view-link` | 見るだけのページのリンクと QR（作る・作り直す・コピー・期限）。札は作った端末の localStorage にだけ置く（`link-store.ts`）。ほかの端末で出すときは作り直す |
| `/match/tables/$tableId/join` | QR で受け付ける（M7）。上から順に1列で、枠に分ける：受付の状態（期限）と QR・リンク・コピー・締める → 受け付けた人 → 電波がなくて受付できなかった人 → この名簿で試合表を作る。受付の QR とリンク・受け付けた人（5秒おきに読み直す。同じ名前の印・消す）・受付を締める・この名簿で試合表を作る。担当の端末は受け付けた人を名簿に入れる（`use-joins.ts`・`joins.ts`。名簿と設定の画面も開いたときに入れる）。「参加者の QR を読む」（P3 の QR をカメラか写真で読んで名簿に入れる。`JoinQrReader.tsx`） |
| `/match/view/$viewToken` | 見るだけのページ（P1。ログインなし）。分け方のタブと組のタブ・呼び名だけの表・ミニゲームのチームの呼び名・今と次・自分の名前の印（端末に置く）・最後に読んだ表とその時刻（端末に置き、読めないときに出す。今の試合の見込みは match-009 でやめた）・「QR を読む」（M4 の QR を読み、同じ試合表で今より新しい版のときだけ取り込む。サーバーから読んだ表があれば、版が大きく、かつ QR を作った分〈QR の時刻は分に丸めてある〉がサーバーの最後の保存より前でないときだけ取り込んで出し、出さないときは取り込んだと出さない。`view-import.ts`）・30秒おきに版の番号を確かめる（表を読めない〈通信の誤り〉間は、30秒おきと電波が戻った知らせのときだけ読み直す）・`noindex`（`no-index.ts`）・「kanaeru で作った試合表・自分のサークルでも使う」 |
| `/match/join/$joinToken` | 受付のページ（P2・P3。ログインなし）。名前とレベルだけ・受付できました・締め切り。電波がなくて送れないときは、名前とレベルの QR を出し（運営に見せる）、つながったら自動で送る |
| `/match/tables/$tableId/big` | 大きく映す（M3）。分け方のタブと組のタブと、今の試合と次の試合だけを大きな字（名前は SVG で描き、画面の幅に合わせる）で出す。ミニゲームはコートごとのチームの呼び名を大きな字で。担当でない端末は、つながっている間30秒おきに読み直す |
| `/match/tables/$tableId/print` | 印刷（M5・R1）。刷る組・紙（A5〜A2・B5〜B3）と向き・組ごとに1枚の版と、ミニゲームのコートとチームの一覧の1枚（`layoutTeamsSheet`。match-009）（SVG。紙1枚にちょうど収まるよう字の大きさを合わせる。名前の字は行の高さの45%・12mm まで、題は16mm まで。`print-layout.ts`・`print.css`）。見るだけのリンクがこの端末にあれば、版の右上に QR（`qr.tsx`）と、入口に貼る1枚（R2。A4 縦）。下に「kanaeru で作った試合表」 |

直すたびに、担当の端末が中身をまるごと、もとの版と変更の ID を付けて端末（IndexedDB）に置き、古い順に送る（`table-editor.ts`・`offline/outbox.ts`。端末の ID は `device.ts` の localStorage で、IndexedDB にも写す）。端末に置いた写し（IndexedDB の試合表の中身・一覧・送っていない変更と、localStorage の `kanaeru.match.` で始まる値〈共有のリンクの札・見るだけのページの写しと選んだ名前〉）は、ログアウト・退会と、写しを置いた人（localStorage の `kanaeru.match.owner`）と違う人（わからないときを含む）のログインで消す（`offline/account-reset.ts`。account の知らせ `lib/account-events.ts` を受ける。localStorage は IndexedDB を待たずに先に消す。端末の ID は残す）。電波がない・届かないときは端末に残し、つながったら送る。409 などで送れなければ止めて端末に残し、「捨てる」「上書きする」を選んでもらう（8章）。試合表の画面には「電波なしで渡す」（M4。`HandoffDialog.tsx`）。担当でない端末には、今の担当（端末の ID の終わりの4文字）と「この端末で直す」（つながっているときだけ・確かめてから。`TableFrame.tsx`）を出す。

## 6. 組み方（とネットなしは 8章）

`pairing.ts` の `planGames`（状態を持たない関数・くじの種を引数で受け取る。説明は docstring）と `plan.ts` の `buildPlan`（組ごとに、最後にチェックした試合までを残して続きを組む。組ごとに `deriveSeed` で別のくじ）。流れと守る順は [addendum.md](../../_bmad-output/prd-kanaeru-match/addendum.md) の1〜2章：周（出た数がいちばん少ない人が入れ物）→ 周の残りから「（分けないときだけ）レベルの差の超え → 同じ試合に入った回数の2乗の合計 → 直前の試合に出た人の数 → くじ」で選ぶ。組めるのは当日の印が「来る」でレベルのある人だけ。

当日（match-003）：
- `plan.ts` の `replanGroup`：1つの組だけを、最後にチェックした試合までと今の試合（入る人がみな出られるなら）を残して組み直す。`day-of.ts` の `markAttendance` が当日の印を直してから呼ぶ。
- `regroup.ts` の `changeSettings`：分け方（組の並び `matchGroupsOf`）・試合の形を変えたら、変わらない組はそのまま、終わった試合は新しい組に移せれば交互に移し、移せなければ `archive` に残す。新しい組の行の数は「移した試合 + 残りの時間の試合」（進んだ試合の数は、同じ分け方の組と、なくなる分け方の組のうち、いちばん進んだ組で見る。分けないを足すだけなら、足した組は進んでいない。match-009）で、差を `offset` に持つ。人が足りずに試合のなかった組を当日に組むときも、同じ分け方の組が進んだ分だけ減らす（`setElapsed`）。ミニゲームを外す・コート数を変えるとチーム分けを消す（組み直すときに分け直す）。
- `buildPlan` は `archive` の試合も数に入れ、行の数は「設定の試合の数 + offset」。分けない組（`all`）は、どの分け方と一緒でも1試合の中のレベルの差の上限を守る。

ミニゲーム（match-009。`mini-game.ts` の `planTeams`・`buildMini`。説明は docstring）：来る人でレベルのある人を、点（上級4・中級3・初級2・入門1）の順に蛇の順でコート数×2 のチームに配り、2人の入れかえで点の合計の差（同じなら二乗の和）が小さくなる入れかえがなくなるまで続ける（人数の差は1人まで）。くじの種は `deriveSeed(seed, "mini")`。当日の印を変えてもチームは変えない（「チーム分けをやり直す」で今の来る人で分け直す）。

## 7. テスト

- 表：`apps/api/src/modules/match/schema.test.ts`（CHECK・一意・消し方を表に直に書いて確かめる）。
- 窓口：`routes.test.ts`（作る・一覧・読む・直す・担当・消す・権限・入力の誤り・90日・見えないアプリ）・`routes-share.test.ts`（見るだけ・受付：レベルが出ない・no-store と noindex・期限切れと作り直した札・strict・締めた受付・100人・同じ名前）・`withdrawal.test.ts`・`reception-import.test.ts`（受付の交流会から入れる：チェックインと申込みの名簿・権限〈受付係・部員・ほかの人は 404・試合表の権限・受付アプリが見えない〉・前に入れたレベル〈組織か持ち主ごと・消えた account は飛ばす・見るだけのページに出さない〉）。手伝いは `apps/api/test/helpers/match.ts`（`showMatchApp`・`createTable`・`updateTable`）。
- 約束：`packages/contracts/src/match/*.test.ts`。
- 組み方：`apps/web/src/features/match/pairing.test.ts`・`day-of.test.ts`・`regroup.test.ts`（fast-check の property-based。分け方の組み合わせとミニゲームの消し方を含む）・`mini-game.test.ts`（チームの数・人数の差・どの2人を入れかえても差が小さくならない）・`swap.test.ts`（手の入れかえ：約束の形・終わった試合とほかの組は変わらない・ミニゲームの移し）。名簿の読み方 `roster-read.test.ts`・受付の交流会から入れる `reception-import.test.ts`・印刷の大きさ `print-layout.test.ts`・受付を名簿に入れる `joins.test.ts`。
- ネットなし：`offline/outbox.test.ts`（もとの版のつなぎ方・古い順・電波がないときは残す・同じ変更の ID で送り直す・409 は止めて残す・捨てる・上書き・開き直し）・`handoff.test.ts`（Base45・試合表の QR の行き来〈property-based〉・大きさ・本物の模様を jsQR で読む・版の比べ方・受付の QR・前の形〈形の印1・2〉を読む・チーム）・`offline/store.test.ts`（前の形の写しを直して読む）・`view-import.test.ts`（同じ分にサーバーで保存した直後の QR・取り込んだと出すのは出すときだけ・電波なしで直すたびに渡す版が上がる）・`ViewPage.test.tsx`（届かない間に読み直し続けない・30秒おき・電波が戻ったら1回）・`document-boundary.test.ts`（ほかの道で開いた文書から入るときだけ読み直す）。組み立ての plugin は `apps/web/scoped-service-worker.test.ts`。
- 名簿を入れた受付の交流会：`reception-link.test.ts`（API：つなぐ・入れ直すと置きかわる・入れてよくなければつながない・交流会が消えても写しを出す・開けるかは見る人ごと・見るだけのページに出さない）・画面の `reception-link.test.ts`（写しの置き方・文・開けるかの見え方・電波なしで渡す QR に入らない）。ホーム画面：`home-screen.test.tsx`（manifest の中身・PNG の大きさ・Service Worker が持つ一覧・見出しのリンクは開いている間だけ）。
- E2E：`e2e/tests/match-home-screen.spec.ts`（manifest とアイコン・運営の画面にだけリンクが付き、ほかのアプリの道と見るだけのページには付かない・電波がなくても読める）・`e2e/tests/match-reception.spec.ts`（受付の交流会からチェックインした人を入れる → 題の下と一覧に「受付：… から入れた」 → レベルを選ぶ → 次の試合表で覚えたレベルが入る → 申込みの名簿を後ろに足す）・`e2e/tests/match-offline.spec.ts`（Service Worker の範囲は `/match/` だけ・ほかの道は受け持たない・電波なしで開いて直し、つながったら送る・電波なしで渡す QR を見るだけのページが写真から読む・参加者の QR を M7 が読む）・`e2e/tests/match.spec.ts`（未ログイン・すべてのアプリから移るとカメラを許す文書を読み直す・作る → 貼る → 設定 → 作る → チェック → 印刷 → シングルス／試合の数と分け方の組み合わせ → 分け方のタブ → ミニゲーム → 帰った人とやり直す → ミニゲームの印刷（match-009）／組み合わせを直す：2人を順に押す・同じ試合に2回は入れかえない・パソコンはドラッグ・ミニゲームの移し（match-010）／当日：人を選んで直す → 分け方を変える → 大きく映す → 別の端末で担当を受け取る／見せる・受け付ける：リンクと QR → 印刷の QR → ログインなしで受け付ける → 見るだけのページ → 名簿に入る → 締める。両方の幅で axe・横のスクロール・CSP）。

## 8. ネットなし（AD-27・AD-28・AD-30。match-005）

| 仕組み | 置き場所 | 中身 |
|---|---|---|
| Service Worker | `offline/sw.js`（組み立てが `/match/sw.js` に書き出す。core-015） | 範囲 `/match/`。外枠（`/match/` で取った index.html）・入口と試合表の画面の束・CSS を持つ。画面を開く要求には持っている外枠をすぐ返す。API の答えは持たない・触らない。新しい版は待たせ、画面の「新しい版があります」（`offline/UpdatePrompt.tsx`）で入れ替える |
| 入れ方・外し方 | `offline/register.ts`・`offline/start.ts`（試合表のどの道も `beforeLoad` で呼ぶ） | `GET /api/v1/match/offline` が入なら入れ、切か 404 なら外して置き場所（`kanaeru-match-…`）を消す。届かなければ今のまま。本文も10分おきに確かめ、切なら自分を外す。壊れたときは `sw.js` の `SELF_UNREGISTER` を true にして出す |
| 端末の置き場所 | `offline/store.ts`（IndexedDB `kanaeru-match`。開けなければ画面を開いている間だけ） | `tables`（試合表ごとの最後の中身と置いた時刻）・`changes`（送っていない変更：変更の ID・もとの版・中身・くじの種・時刻）・`meta`（端末の ID・一覧） |
| 送りの列 | `offline/outbox.ts`・`offline/table-sync.ts` | 古い順に1つずつ送る。電波がない・5xx・429 は残して待つ（15秒おきとつながったとき）。401 は残してログインを待つ。409・400・403・404 は止めて残す（held）。試合表を読むと、送っていない変更を重ねて出す。読めなければ（通信の誤り・5xx）端末の中身を出す。403・404 なら端末の中身を消す |
| 見るだけのページ | `ViewPage.tsx`・`view-import.ts` | 最後に読んだ表（localStorage）・「QR を読む」（取り込むかの決め方と、出す表の選び方は `view-import.ts`） |
| 電波なしで渡す QR | `handoff.ts`・`HandoffDialog.tsx`・`QrScanner.tsx`・`qr-decode.ts` | 中身は版・見るだけの札の印・名前と日付・組ごとの呼び名の組み合わせと終わったか・ミニゲームのチームの呼び名（中身の形の印は 3・4。前の形〈印 1・2。1試合の長さあり・チームなし〉も読む。match-009。呼び名は番号で指す・deflate・Base45）。1枚 1000 文字（18 型）まで、入らなければ最大16枚のつづき。読むのは BarcodeDetector、なければ jsQR。写真からも読める |
| 受付の QR | `handoff.ts`・`JoinPage.tsx`・`JoinQrReader.tsx` | 受付の札の印・レベル・参加者の端末の乱数・呼び名。名簿の人の ID は `q` と乱数（2回読んでも1人） |

実機（iPhone の Safari・Android の Chrome）での確かめはまだ（構成の決めごと Open Questions 9・10）。

## 9. ホーム画面のアイコンと manifest（match-007）

| もの | 置き場所 | 中身 |
|---|---|---|
| アイコンの絵 | `apps/web/public/match/icon.svg`・`icon-maskable.svg` | 墨の地に白い表。名前の枠が4つずつ並んだ行のうち1行（いまの試合）を墨にし、2つ目と3つ目の間を広げて2人ずつの組を表す（競技を選ばない・文字なし）。maskable は同じ絵を 0.86 倍にして安全な円の中に収めたもの |
| PNG | `apple-touch-icon.png`（180）・`icon-192.png`・`icon-512.png`・`icon-maskable-192.png`・`icon-maskable-512.png` | SVG から `pnpm exec tsx e2e/scripts/render-match-icons.ts` で作る（Playwright の Chromium・等倍。SVG を直したときだけ手で流す） |
| manifest | `apps/web/public/match/manifest.webmanifest` | `id`・`start_url` は `/match/`（Service Worker の範囲の中なので、ホーム画面から電波なしでも開く）・`scope` は `/match`（画面の中のリンクの `/match`〈一覧〉も範囲に入れる）・`display: standalone`・`theme_color` は surface・`background_color` は background（tokens.css。`home-screen.test.tsx` が見張る） |
| 見出しのリンク | `use-home-screen.ts`（`MatchGate` が呼ぶ）・道は `home-screen.ts` | 運営の画面を開いている間だけ manifest・`apple-touch-icon`・`apple-mobile-web-app-title` を付け、離れたら外す。ほかのアプリの道と、見るだけ・受付のページ（参加者が開く）には付けない |
| Service Worker に持たせる | `vite.config.ts` の `scopedServiceWorker` の `publicFiles`（一覧は `home-screen.ts` の `MATCH_HOME_SCREEN_FILES`） | 束に入らない public のファイルを名指しして持つ（Service Worker を置いたフォルダの下のものだけ）。中身も版の印に入れる |

