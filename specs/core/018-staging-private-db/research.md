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
- `deploy.yml` は GitHub の環境（`production`・`staging`）の変数で、サービスと job の名前・デプロイの身分・LIFF ID・APP_NAME を使い分ける。共に使う値（プロジェクト・リージョン・WIF）はリポジトリの変数。
- イメージは `kanaeru/app-<環境>:<コミット>`。Artifact Registry の「新しい10個を残す」はイメージの名前（パッケージ）ごとに数える（[掃除の決まり](https://cloud.google.com/artifact-registry/docs/repositories/cleanup-policy)）ので、ステージングに何度出しても本番の動いている版は消えない。LIFF ID を組み立てに埋めるので、中身も環境で違う。
