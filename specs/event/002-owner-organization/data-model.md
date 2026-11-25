# Data Model: 交流会の持ち主と組織（event-002）

2026-11-20 作成。表の持ち主は event の領域（AD-3・AD-23）。

## 変える表

### `event`（列を足す）

| 列 | 型 | 決まり |
|---|---|---|
| `owner_account_id` | uuid（空を許す。あとで `NOT NULL`） | 持ち主（`account.id`）。`ON DELETE RESTRICT`（退会では event の段が先に引き継ぐ・消す。research R2）。索引 `event_owner_account_id_idx` |

- 作るときは作った人を入れる。替わるのは退会の引き継ぎだけ。
- 空の行は「前の版で運営者が作った交流会」。運営者が一覧を開いたときなどに埋める（research R1）。

## 足す表

### `event_organization`（交流会を組織に入れる）

| 列 | 型 | 決まり |
|---|---|---|
| `event_id` | uuid・主キー | `event.id` を指す。`ON DELETE RESTRICT`（AD-7。交流会を消すのは event の退会の段だけで、先にこの行を消す） |
| `organization_id` | uuid | 入れた組織 |
| `owner_account_id` | uuid | 入れた持ち主（`event.owner_account_id` と同じ値を書く） |
| `placed_at` | timestamptz | 入れた時刻（既定 now） |

- 複合の外部キー `(organization_id, owner_account_id)` → `organization_member(organization_id, account_id)`、`ON DELETE CASCADE`（`event_organization_member_fk`）。持ち主が組織を抜ける・外される・組織が消えると、この行が消え、交流会は持ち主の個人のものに戻る（threads の `threads_organization_account` と同じ。AD-22）。
- 索引 `event_organization_organization_id_idx`（組織の交流会を引く）。
- 1つの交流会は1つの組織まで（主キー）。

## DB の変更の分け方（[コードの書き方](../../../docs/rules/coding.md) 3）

| 回 | DB の変更 | アプリ |
|---|---|---|
| 1（この仕様の1つ目の PR） | `event.owner_account_id` を空を許して足す・`event_organization` を足す | 作るときに持ち主を書く。運営者が一覧を開くと、持ち主のない交流会を運営者のものにする。権限は前のまま |
| 2（この仕様の2つ目の PR） | なし | 権限を持ち主と組織で決める。組織に入れる・退会の段 |
| 3（あとの小さな PR） | 本番で空の行が0件と確かめてから `owner_account_id` を `NOT NULL` にする | 埋める処理を消す |

前の版のアプリ（1の前）は新しい列を知らないので、交流会を作ると持ち主が空になる。その交流会も運営者が作ったもの（前の版で作れたのは運営者だけ）なので、同じ処理で埋まる。

## 役目の判定（`resolveEventAccess`）

```text
交流会がない → なし（404）
持ち主が空 で 今の利用者が運営者 → 埋めてから持ち主として扱う（research R1）
持ち主 = 今の利用者 → 主催者
組織に入れていて、今の利用者がその組織の管理者・編集者 → 主催者
event_staff に今の利用者がいる → 受付係
組織に入れていて、今の利用者がその組織のメンバー → 部員
ほか → null（403）
```
