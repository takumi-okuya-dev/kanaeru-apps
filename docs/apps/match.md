# 試合表（match）の地図

2026-11-22 作成（match-001：表とアプリの登録。決めた理由は [specs/match/001-tables/research.md](../../specs/match/001-tables/research.md)）。

試合表アプリ（key `match`）の1つの領域（構成の決めごと AD-25）。バドミントンのサークルの運営が、名簿からレベル別のダブルス・シングルスの試合表を作り、印刷し、当日に組み直して配る（[PRD](../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md)）。試合表は交流会に頼らない、持ち主の account の記録で、組織に入れられる（AD-19・AD-25）。組み合わせの計算は画面の側に置く（AD-29）。

この版（match-001）で入っているのは、表とアプリの登録と、`/match` の仮の画面だけ。窓口・画面・組み方は match-002 で足す。

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
| `match_join` | `id`・`match_table_id`・`nickname`・`level`・`created_at`・`updated_at` | QR の受付（ログインなしで入れた呼び名とレベル。AD-30）。呼び名は1〜20文字。担当の端末が読んで名簿に足す。索引 `(match_table_id, created_at)` |

消し方：

| 外部キー | 消し方 |
|---|---|
| `match_table.owner_account_id` | `CASCADE`（持ち主のデータ。組織に入れた試合表は、退会の手順の match の段〈match-002〉が account を消す前に組織の管理者へ引き継ぐ） |
| `match_table.event_id` | `SET NULL`（交流会が消えても試合表は残る） |
| `match_table_organization.match_table_id` | `CASCADE` |
| `match_table_organization` の `(organization_id, owner_account_id)` | `CASCADE`（持ち主が組織を抜ける・外される・組織が消えると、試合表は持ち主の個人のものに戻る。AD-22） |
| `match_level_memory` の `owner_account_id`・`organization_id`・`account_id` | `CASCADE`（相手か本人が消えれば消える） |
| `match_join.match_table_id` | `CASCADE`（試合表と一緒に消える） |

## 3. 画面

| 道 | 画面 |
|---|---|
| `/match` | 試合表の一覧（match-001 は準備中の案内だけ） |

## 4. テスト

- 表：`apps/api/src/modules/match/schema.test.ts`（CHECK・一意・消し方を表に直に書いて確かめる）。
