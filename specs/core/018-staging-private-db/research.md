# Research: ステージングを足し、Cloud SQL を内部の IP だけにする（core-018）

## R1. 環境の分け方：環境ごとの部品と、共通の資源

- **選んだ形**：環境ごとに変わるもの（DB と DB の利用者・秘密・身分・Cloud Run・定期の仕事）を `infra/modules/environment` にまとめ、`environments.tf` が本番とステージングで2回呼ぶ。プロジェクトに1つのもの（API・ネットワーク・Cloud SQL のサーバー・イメージの置き場・WIF・夜間の停止・予算）は呼ぶ側に置き、部品には値で渡す。
- **C（別のプロジェクト）に移すとき**：移した先で共通の資源を作り、同じ部品を呼ぶ。部品は Cloud SQL のサーバーの名前と内部の IP、ネットワーク、イメージの置き場、WIF のプールを値で受け取るので、部品の中は直さない。state も分ける（`versions.tf` の prefix は `kanaeru/project`）。
- **本番の資源の名前は今のまま**（`kanaeru`・`kanaeru-database-url`・`kanaeru-token-encryption-keys` など）。ステージングは頭を `kanaeru-stg` にする（身分の ID の30文字に収まる）。DB と利用者は `-` を使わない（`kanaeru_stg`）。
- **選ばなかった形**：
  - Terraform のワークスペースで環境を分ける：共通の資源（Cloud SQL のサーバー）を2つの state で取り合うことになる。
  - 環境ごとに別の Cloud SQL：月1,300円ほど増える（構成 C。利用者が増えてから）。

## R2. Cloud SQL を内部の IP だけにする：Direct VPC egress

- Cloud SQL はプライベート サービス アクセス（`google_compute_global_address`〈VPC_PEERING〉＋ `google_service_networking_connection`）で内部の IP を持ち、`ipv4_enabled = false` にする。
- Cloud Run の組み込みの Cloud SQL の接続（Unix ソケット・Cloud SQL Auth Proxy）は公開の IP の道。内部の IP のときは、VPC に出て内部の IP に TCP（5432）でつなぐ（[Cloud SQL：Cloud Run からつなぐ](https://cloud.google.com/sql/docs/postgres/connect-run)）。そのため `cloud_sql_instance` のボリュームと `roles/cloudsql.client` を外した。
- VPC への出口は Direct VPC egress（`vpc_access.network_interfaces`・`egress = "PRIVATE_RANGES_ONLY"`）。Serverless VPC Access コネクタは裏のサーバーが最低2台動き、東京の e2-micro で月 約15.7ドルかかるので使わない（[Cloud Run と VPC](https://cloud.google.com/run/docs/configuring/connecting-vpc)：Direct VPC egress は通信代だけ）。
- 注意：Direct VPC egress は、台が立ち上がるとき、つながるまで1分以上かかることがある（[Direct VPC egress の制限](https://cloud.google.com/run/docs/configuring/vpc-direct-vpc)）。DB につながらない間は `503`（`DB_UNAVAILABLE`）で答え、次の要求でつなぎ直す。昼は定期の仕事（5分ごと）が台を温めるので、利用者が当たる場面は少ない。起動の確かめ（probe）で DB を待つ形は、夜に DB を止めると台が立ち上がらなくなるので採らない（AD-10）。
- DB の変更を当てる job（`apps/api/scripts/migrate.ts`）は、当てる前に DB につながるまで最大3分・5秒おきに確かめ直す（`scripts/lib/wait-until-ready.ts`）。job はやり直さない（`max_retries = 0`）ので、立ち上がりの待ちでデプロイが止まらないようにする（PR #82 の Codex の指摘 P1）。夜間の停止中は3分待って失敗する（デプロイの時間帯の確かめで、その時間には始まらない）。
- 手元から本番の DB を見るときは、一時的に `ipv4_enabled = true` にして Cloud SQL Auth Proxy でつなぐ（`infra/README.md` 6章）。

## R3. 暗号：sslmode=no-verify

- Cloud SQL は暗号のない接続を断る（`ssl_mode = "ENCRYPTED_ONLY"`）。
- 今の pg（pg-connection-string 2.14）は `sslmode=require` を `verify-full` と同じに扱い、サーバーの証明書の名前を確かめる。内部の IP で名前が合わないので落ちる。
- `sslmode=no-verify`：暗号はかけ、証明書は確かめない。道は VPC の中（ピアリング）だけなので、間に入られる危険は小さい。サーバーの CA の証明書を Cloud Run に渡して確かめる形は、証明書の名前（内部の IP ではない）を合わせる工夫と、証明書の入れ替えの手間が増えるので、今はしない。

## R4. 定期の仕事を両方の環境で動かすときの手当て

| 懸念 | 手当て |
|---|---|
| 同じ Threads のアカウントを両方でつなぐと、予約した投稿が両方から出る | ステージングは試し用のアカウントだけ（`infra/README.md` 9章） |
| ステージングから本物の参加者に知らせが届く | ステージングの `booking_notify_mode` は `off` か `allowlist` だけ（`on` は plan で止める） |
| DB の接続の数（db-f1-micro は25） | 本番 2台 × 5・ステージング 1台 × 3（＋DB の変更を当てる job）＝ 15本前後 |
| Cloud Scheduler の無料は3つ | DB の停止・起動と、環境ごとの共通の仕事で4つ（月0.10ドル）。主催者が受け入れた |
| LIFF の URL は1つの LIFF アプリに1つ | ステージング用の LINE ミニアプリのチャネルを別に作る（`infra/README.md` 4章） |

- 共通の定期の仕事は、Cloud Run の決まった形の URL を呼ぶ（独自ドメインの前の中継を通さない）。

## R5. デプロイの身分と GitHub の環境

- WIF のプロバイダは、このリポジトリ（名前と数字の ID）の `main` と `develop` だけを受け入れる。なりすましの権限は `attribute.ref` で分ける（本番の身分は `refs/heads/main`、ステージングは `refs/heads/develop`）。
- デプロイの身分の書く権限は、その環境の Cloud Run のサービスと job の単位（`roles/run.developer`）で付け、操作の進み具合を読むためにプロジェクトの単位で `roles/run.viewer` を付ける。初めてのデプロイで、権限が足りるかを確かめる（足りなければ、この research に書き足して直す）。
- `deploy.yml` は GitHub の環境（`production`・`staging`）の変数で、サービスと job の名前・デプロイの身分・イメージの置き場所・LIFF ID・APP_NAME を使い分ける。共に使う値（プロジェクト・リージョン・WIF）はリポジトリの変数。
- イメージは環境ごとの置き場所（`kanaeru/app`・`kanaeru-stg/app`）に押し込み、Cloud Run には digest で渡す（R6）。Artifact Registry の「新しい10個を残す」は置き場所の中のイメージの名前ごとに数える（[掃除の決まり](https://cloud.google.com/artifact-registry/docs/repositories/cleanup-policy)）ので、ステージングに何度出しても本番の動いている版は消えない。LIFF ID を組み立てに埋めるので、中身も環境で違う。

## R6. 別の Claude の独立のレビュー（Codex の上限に達したため）で見つかったことと直し方

| 指摘 | 直し方 |
|---|---|
| P1：本番とステージングの DB が権限で分かれていない。PostgreSQL の既定では、だれ（PUBLIC）でもほかの DB につなげ、Cloud SQL の API で作った DB の持ち主は cloudsqlsuperuser。ステージングの利用者が本番の DB の public スキーマの持ち主として表を消せる | DB の変更を当てる job が、当てる前に毎回、`REVOKE CONNECT, TEMPORARY … FROM PUBLIC`・`GRANT … TO current_user`・`ALTER DATABASE … OWNER TO current_user`・`ALTER SCHEMA public OWNER TO current_user`・`REVOKE CREATE ON SCHEMA public FROM PUBLIC` を流す（`apps/api/scripts/lib/isolate-database.ts`）。Cloud SQL の API で作った利用者は CREATEDB を持ち cloudsqlsuperuser の一員なので、持ち主を替えられる。手元で、Cloud SQL と同じ形の権限の利用者を2つ作って、ほかの環境の DB につなげないこと・何度流しても同じことを確かめた |
| P1：イメージの置き場所が共通で、ステージングのデプロイの身分が本番のタグを上書きできる | 置き場所を環境ごと（`kanaeru`・`kanaeru-stg`）にし、書く権限はその環境のデプロイの身分だけにした。押し込んだあと digest を読み、Cloud Run には `…@sha256:…` で渡す |
| P2：デプロイのあとの確かめ（`/api/v1/health`）が、Direct VPC egress の立ち上がりで落ちうる | curl を最大4分（`--retry 20 --retry-delay 10 --retry-max-time 240`）待つ |
| P2：プライベート サービス アクセスの範囲を自動で選ぶと、Cloud Run のサブネットとぶつかりうる | 範囲を `10.20.0.0/20` と書いて決めた |
| P2：`staging = null` にすると、サービスの消す守りと、表を持った利用者で止まる | 変数 `deletion_protection`（環境ごと・既定 true）を足した。DB の利用者の `deletion_policy = "ABANDON"` は、R7 で消す順番を決めてやめた。手順は `infra/README.md` 11章 |
| P2：`APP_NAME` がないのに確かめを通る | 既定の値を外し、変数の確かめに入れた |
| P2：待っても直らない誤り（パスワード違い・DB がない）でも3分待つ | `28P01`・`28000`・`3D000` は待たずに止める |
| P2：古いファイル（`infra/cloud_run.tf`）を指すコメント | `Dockerfile`・`.env.example`・`kernel/db.ts` を直した |
| P2：deploy.yml の守りのテストに、変数とイメージの置き場所の確かめがない | `tests/security/ci-config.test.ts` に足した |

## R7. 2回目の独立のレビューで残った前提と手当て

- **P1（要確認）**：Cloud SQL は PostgreSQL に手を入れていて、cloudsqlsuperuser が PG16 以降の CREATEROLE の決まり（作っていない役割の ADMIN を持たない）より多くのことができるかもしれない。もしステージングの利用者が `GRANT kanaeru TO kanaeru_stg` や `ALTER ROLE kanaeru PASSWORD` をできるなら、R6 の権限の分け方では防げない。手元の素の PostgreSQL 18 では、どちらも断られることを確かめた（独立のレビューでも、DB へのつなぎ・DB の削除と持ち主の変更・役割を足すこともすべて断られた）。初めての apply のあとに、本物の Cloud SQL で確かめる（`infra/README.md` 11章・tasks T009）。通ってしまったら、ステージングの利用者を cloudsqlsuperuser に入れない形（`google_sql_user` の `database_roles` で絞り、持ち主の変え方を別に考える）か、構成 C に早めに移る。
- **P2**：初めての DB の変更を当てるまでは、DB が権限で分かれていない → apply の直後に両方の環境の migrate を一度ずつ流す手順を書いた。Cloud SQL の書き出し・取り込みは使えない見込み → その環境の利用者で `pg_dump`・`pg_restore` する手順を書いた。環境を消す順番 → `google_sql_database` を利用者のあと・Cloud Run を DB のあとにし（消すときは Cloud Run → DB → 利用者）、利用者の ABANDON はやめた。digest → Artifact Registry の API ではなく、押し込んだあとの docker が持つ値（`RepoDigests`）を使う。

