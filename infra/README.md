# infra（GCP の資源の Terraform）

- 作成日：2026-11-19（core-002）
- 直した日：2026-11-20（threads-002：`threads.tf` と9章。threads-015：9章の5に OAuth を入にする手順）・2026-11-21（booking-005：`booking.tf` と10章）・2026-11-22（core-018：ステージング〈構成 B〉・環境ごとの部品・Cloud SQL を内部の IP だけに。0・4〜7・9〜11章。core-019：GitHub の環境の承認・夜の緊急デプロイ。5・7章。0章に構成図へのリンク）
- 読む人：本番とステージングの置き場所を作る・直す人（主催者）。Terraform と GCP の考え方は [Terraformの学び](../docs/study/terraform.md)・[GCPの学び](../docs/study/gcp.md)。
- 決めごとの正本は[構成の決めごと](../_bmad-output/architecture-kanaeru/architecture-kanaeru.md) AD-8〜AD-11、デプロイの決まりは[開発の流れの決まり](../docs/rules/development-flow.md) 5章。なぜこの形にしたかは [specs/core/002-infra/research.md](../specs/core/002-infra/research.md)・[specs/core/018-staging-private-db/research.md](../specs/core/018-staging-private-db/research.md)。

## 0. 何があるか

構成図は[全体の形](../docs/architecture.md)の「置き場所の構成図（GCP）」（`docs/images/infra-architecture.svg`）。

| ファイル | 中身 |
|---|---|
| `versions.tf` | Terraform（1.11 以上）と google プロバイダ（`~> 8.12`）・state の置き場所（GCS）・provider |
| `variables.tf`・`terraform.tfvars.example` | 外から渡す値と、その見本 |
| `locals.tf`・`outputs.tf` | 名前などの共通の値・apply のあとに出す値 |
| `apis.tf` | 使う API の有効化 |
| `network.tf` | VPC・Cloud Run が出ていくサブネット（Direct VPC egress）・Cloud SQL を内部の IP で置くための道（プライベート サービス アクセス） |
| `cloud_sql.tf` | Cloud SQL のサーバー（ENTERPRISE・db-f1-micro・PostgreSQL 18・内部の IP だけ）。本番とステージングが、この中の別の DB を使う |
| `service_accounts.tf` | 共通の身分（夜間の停止・夜の緊急デプロイで DB を起こす `kanaeru-db-waker`）と権限 |
| `wif.tf` | GitHub Actions から鍵なしで入る仕組み（このリポジトリの `main` と `develop` だけ。名前と数字の ID の両方で絞る。どの身分になれるかはブランチで分ける） |
| `scheduler.tf` | 毎日0時に DB を止め、8時に動かす（日本時間。本番とステージングの両方が止まる） |
| `budget.tf` | 請求の予算（月2,000円・50%と100%でメール） |
| `environments.tf` | 本番（`kanaeru`。2台 × DB の接続5本）とステージング（`kanaeru-stg`。1台 × 3本。`staging` が null なら作らない）を、同じ部品で作る |
| `modules/environment/` | 環境ごとの部品：コンテナのイメージの置き場所（古いものを自動で消す）・DB と DB の利用者・秘密の値（DB の接続先・鍵の束・合言葉・Meta のアプリの秘密・知らせの許可リスト）・身分と権限（Cloud Run の身分・デプロイの身分）・Cloud Run のサービスと DB の変更を当てる job・共通の定期の仕事（`<name>-jobs-tick`。Threads か予約が入のときだけ） |
| `tests/plan.tftest.hcl` | GCP につながずに組み上がりを確かめる試し（`terraform test`。模擬のプロバイダを使う） |

Terraform は**手元から**流す（GitHub Actions からは流さない）。GitHub Actions が変えるのはイメージだけで、ほかの設定（台数・環境の値・権限）は Terraform だけが変える。

## 1. 道具を入れる（初めての1回）

```bash
brew tap hashicorp/tap && brew install hashicorp/tap/terraform   # 1.11 以上
# gcloud（Google Cloud CLI）は https://cloud.google.com/sdk/docs/install の手順で入れる
gcloud auth login
gcloud auth application-default login                             # 手元の Terraform が使う資格
```

直したあとは、GCP につながずに `cd infra && terraform init -backend=false && terraform validate && terraform test` で確かめられる（`tests/plan.tftest.hcl`）。

## 2. プロジェクトと請求（初めての1回・手で）

AD-9 で手で作ってよいのは、プロジェクトと state のバケットの2つだけ。

1. [コンソール](https://console.cloud.google.com/)でプロジェクトを作る（プロジェクトIDはあとで変えられない）。
2. 請求先アカウントにひもづける（「お支払い」→「リンク」）。通貨が円か確かめる（違えば `budget_currency` を合わせる）。
3. Terraform が最初に要る2つの API を手で有効にする：

   ```bash
   gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com --project=<プロジェクトID>
   ```

4. 請求先アカウントのID（`XXXXXX-XXXXXX-XXXXXX`）を控える：`gcloud billing accounts list`。

## 3. state のバケット（初めての1回・手で）

```bash
gcloud storage buckets create gs://<バケットの名前> \
  --project=<プロジェクトID> --location=asia-northeast1 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://<バケットの名前> --versioning
```

- バケットの名前は世界で1つ（例：`<プロジェクトID>-tfstate`）。コミットしない（init のときに渡す）。
- state には秘密の値が入りうる（この構成では DB のパスワードは入れないが、念のため）。読めるのはプロジェクトのオーナーだけにする。

## 4. LINE の値を集める

LINE Developers のコンソールで（どれも秘密ではない。AD-4・AD-5）。値は環境ごとに `terraform.tfvars` の `production = { … }`・`staging = { … }` の中に入れる。LIFF の URL は1つの LIFF アプリに1つなので、**ステージング用の LINE ミニアプリのチャネル（LIFF）を、同じプロバイダーの下に別に作る**：

| 値 | どこで見るか | 入れる先 |
|---|---|---|
| チャネルID（ミニアプリ・LINEログイン。すべて同じプロバイダーの下） | 各チャネルの「チャネル基本設定」 | 環境ごとの `line_channel_ids`（カンマで並べる） |
| 主催者の LINE のユーザーID（`U` で始まる） | LINEログインのチャネルの「あなたのユーザーID」 | 環境ごとの `organizer_line_user_id`（同じプロバイダーなら同じ値） |
| オープンチャットの URL | LINE アプリのオープンチャットの「共有」 | 環境ごとの `open_chat_url` |
| LIFF ID | 環境ごとのミニアプリのチャネル | GitHub の環境（`production`・`staging`）の変数 `LIFF_ID`（5章） |

ミニアプリのエンドポイント URL は、apply のあとの `terraform output production`・`terraform output staging` の `web_url` にする（ほかの URL から開くと、書く操作が源の確かめで 403 になる）。独自ドメインにするときは、LINE や Meta に URL を登録する前に決め、環境ごとの `web_url` に入れる。

GitHub のリポジトリの値（どれも秘密ではない）も集める。WIF（GitHub Actions から入る仕組み）は、付け直せる名前だけでなく、変わらない数字の ID でも入れる相手を絞る（名前を付け直したり、消したあとに別の人が同じ名前を取ったりしても、入れない）：

| 値 | どう見るか | 入れる先 |
|---|---|---|
| リポジトリの名前（`owner/repo`） | GitHub の画面 | `github_repository` |
| リポジトリの数字の ID | `gh api repos/<owner>/<repo> --jq .id`（`gh` がなければ `curl -s https://api.github.com/repos/<owner>/<repo>` の `id`。非公開のリポジトリは `gh auth login` のあとの `gh` で） | `github_repository_id` |
| 持ち主（人か組織）の数字の ID | `gh api repos/<owner>/<repo> --jq .owner.id`（上の `owner.id`） | `github_repository_owner_id` |

リポジトリを別の持ち主に移したり、作り直したりしたら、ID が変わるので、値を直して apply する（そのままだとデプロイが GCP に入れない）。

## 5. 作る（init → plan → 読む → apply）

DB が動いている**昼（8時〜24時）**に流す（夜は DB の中の物を読むところで落ちることがある）。

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # 値を入れる（コミットしない）
terraform init -backend-config="bucket=<バケットの名前>"
terraform plan -out=tfplan
# 読む：最後の行の destroy が 0 か。Cloud SQL に -/+（作り直し）がないか
terraform apply tfplan
terraform output github_repository_variables
terraform output production
terraform output staging
```

最初の apply では、Cloud Run は仮のイメージ（hello）で立ち上がる。本物は GitHub Actions が出す。

GitHub に変数を入れる（どれも Secrets ではなく Variables）：

1. リポジトリの変数（Settings → Secrets and variables → Actions → Variables）：

   | 名前 | 値 |
   |---|---|
   | `GCP_PROJECT_ID` | `terraform output github_repository_variables` の値 |
   | `GCP_REGION` | 同上（`asia-northeast1`） |
   | `GCP_WIF_PROVIDER` | 同上（`projects/<番号>/locations/global/workloadIdentityPools/github/providers/github`） |
   | `SQL_INSTANCE` | 同上（`kanaeru-db`。夜に緊急で出すとき、デプロイの流れが DB を一時的に起こして止め直す） |
   | `GCP_DB_WAKER_SA` | 同上（`kanaeru-db-waker@…`。DB を起こす・止める身分。`main` からだけなりすませる） |

2. 環境（Settings → Environments で `production` と `staging` を作り、それぞれの Environment variables）：

   | 名前 | 値 |
   |---|---|
   | `GCP_DEPLOYER_SA` | `terraform output production`（`staging`）の `github_environment_variables` の値（`kanaeru-deployer@…`・`kanaeru-stg-deployer@…`） |
   | `CLOUD_RUN_SERVICE` | 同上（`kanaeru`・`kanaeru-stg`） |
   | `MIGRATE_JOB` | 同上（`kanaeru-migrate`・`kanaeru-stg-migrate`） |
   | `IMAGE_REPOSITORY` | 同上（環境ごとのイメージの置き場所。`asia-northeast1-docker.pkg.dev/<プロジェクトID>/kanaeru/app`・`…/kanaeru-stg/app`） |
   | `APP_NAME` | 同上（環境ごとの `app_name`。画面の題に埋める名前で、Cloud Run の `APP_NAME` とそろえる。空だとデプロイは止まる） |
   | `LIFF_ID` | その環境の LINE のミニアプリの LIFF ID（空だとデプロイは止まる） |

3. 環境の守り（Settings → Environments の各環境）：
   - `production`：**Required reviewers** に自分を入れる（`main` のマージでは、ステージングに出たあと、ここで承認するまで本番に出ない）。**Deployment branches** は `main` だけ。
   - `staging`：**Deployment branches** は `main` と `develop`（`main` のマージでも、本番の前にステージングに出すため）。

そのあと、日本時間の8時15分〜23時に（デプロイはこの間に始まったときだけ進む）、GitHub の Actions で `deploy` を流す。`develop` で流す（またはマージする）とステージングに、`main` で流す（または `develop`→`main` のリリースの PR をマージする）と、ステージングに出たあと承認で本番に出る（[開発の流れの決まり](../docs/rules/development-flow.md) 5章の3つのモード）。

## 6. ふだんの直し

- 設定（環境の値・台数など）を変える：`*.tf` を直す PR → マージのあと手元で `plan` → 読む → `apply`。
- DB のパスワードを替える：その環境の `db_password_version`（`production` か `staging` の中）を1つ上げて apply（DB と Secret Manager に同じ新しい値が書かれる）。続けて `gcloud run services update <kanaeru か kanaeru-stg> --region=asia-northeast1 --update-labels=rotated=<日付>` で新しい版に切り替える（動いている台は古いパスワードを持っているため）。
- DB のパスワードが食い違ったとき（API が `password authentication failed` で DB につなげない）：`db_password_version` を1つ上げて apply し、上と同じく新しい版に切り替える。
  - パスワードは、版（`db_password_version`）が変わったとき（と最初に作るとき）だけ書かれる。2つの資源（Secret Manager の版・DB の利用者）は同じ `db_password_version` を見ているので、上げると**両方に同じ新しい値**が書かれる。
  - 書く順番は「Secret Manager の版 → それを読み直して DB の利用者」（`modules/environment/secrets.tf` の頭）。apply が途中で落ちても、もう一度 apply すれば、DB の利用者は Secret Manager にある値で書かれてそろう。版を上げるのは、画面で手で直したなど、それでもそろわないときだけ。
- 手元から DB の中を見たいとき：Cloud SQL は内部の IP だけなので、外からはつなげない。`cloud_sql.tf` の `ipv4_enabled` を一時的に `true` にして apply し、[Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy) でつなぐ。各 DB につなげるのはその環境の利用者（`kanaeru`・`kanaeru_stg`。パスワードは Secret Manager の `<name>-database-url` の中）だけ（11章）。見終わったら `false` に戻して apply する（公開の IP を持つ間は、止めている時間に IP の料金がかかる）。
- 何も直していないのに plan に差が出たら、apply しない。理由（画面で手で直した・GitHub Actions が変えた）を先に調べる。

## 7. 夜間の停止と交流会

- 毎日0時に止まり、8時に動く（`kanaeru-db-stop`・`kanaeru-db-start`）。止まっている間、本番もステージングも API は DB に届かない（同じサーバーのため）。
- 交流会が0時を越える日は、その日のうちに止める仕事を止め、翌朝に戻す（Terraform はこの変更を戻さない）：

  ```bash
  gcloud scheduler jobs pause  kanaeru-db-stop --location=asia-northeast1
  gcloud scheduler jobs resume kanaeru-db-stop --location=asia-northeast1   # 翌日
  ```

- 初めて作ったあと、一度だけ手で動かして確かめる：`gcloud scheduler jobs run kanaeru-db-start --location=asia-northeast1`。
- 夜（0時10分〜7時45分）に緊急で出すとき：GitHub の Actions で `deploy` を `main` で手で流し（Run workflow）、`wake_db` を入にする。流れが DB を起こし（動き出すまで数分）、ステージングに出す → 承認 → 本番に出す。DB が動き出してから `keep_awake_minutes`（既定60分・15〜90分）たつと、成功しても失敗しても（流れを取り消しても）DB を止め直す（7時45分を過ぎていたら止めない。前から動いていたときは、起こしも止めもしない）。その時間の中で、ステージングでの確かめ・承認・本番のデプロイを済ませる（[本番に出す手順](../docs/release-guide.md) 4-3）。DB を起こす・止めるのは、`main` からだけなりすませる `kanaeru-db-waker`（夜間の停止と同じ役割 `kanaeruSqlActivation`。この役割は台の設定も直せるので、デプロイの身分には付けない）。
- 共通の定期の仕事（環境ごとに1つ：本番 `kanaeru-jobs-tick`・ステージング `kanaeru-stg-jobs-tick`。その環境で Threads か booking が入のときだけ）は、日本時間 8時〜23時台の5分ごとに、その環境の `POST /api/v1/jobs/tick` を呼び、その回に当たる領域の仕事（各領域の `scheduledJob`）を動かす。DB の夜間の停止の間は動かさない。止めたいときは `gcloud scheduler jobs pause <仕事の名前> --location=asia-northeast1`（その環境のすべての領域の定期の仕事が止まる）。Cloud Scheduler の無料の枠は請求先アカウントごとに3つで、DB の停止・起動と、両方の環境の共通の仕事で4つになる（4つ目は月0.10ドル）。

## 8. 消さないための仕組み

Cloud SQL は `prevent_destroy`・`deletion_protection`・`deletion_protection_enabled` の3段で守っている。`terraform destroy` は使わない。データの最後の守りは毎日のバックアップ（12時・7日分）。

## 9. Threads の運用アプリを入にする（threads-002）

本番は切（`threads_enabled = false`）のまま出す。入にするときは、次の順で行う（鍵の値を state とリポジトリに残さないため、鍵の束だけは手で入れる）。

- 変数は環境ごと（`terraform.tfvars` の `production = { … }`・`staging = { … }` の中）に書く。秘密と資源の名前の頭 `kanaeru-` は、ステージングでは `kanaeru-stg-` になる（例：`kanaeru-stg-token-encryption-keys`）。鍵の束は環境ごとに別の値を作る。
- ステージングでは、**試し用の Threads のアカウントだけをつなぐ**（本番とステージングの両方で同じアカウントをつなぐと、予約した投稿が両方から出る）。

1. `threads_enabled = true` にして apply する（秘密の入れ物・合言葉・定期の仕事ができる。Cloud Run の設定 `TOKEN_ENCRYPTION_KEY_VERSION`・`TOKEN_ENCRYPTION_KEYS`・`JOB_TRIGGER_SECRET` も足される）。だれに見せるかは、アプリの台帳（設定 → アプリの台帳）で決める（はじめは運営者だけ。定期の仕事は、切でなければ動く）。
   - 鍵の束に版がないと Cloud Run の新しい版が立ち上がらないので、apply の前に入れ物だけ先に作る：`terraform apply -target='module.production.google_secret_manager_secret.token_keys'`（ステージングは `module.staging[0]…`）→ 2 → 全体の apply。
2. 鍵の束を作って版を足す（手元で作り、ファイルや履歴に残さない）：

   ```bash
   printf '{"1":"%s"}' "$(openssl rand -base64 32)" | \
     gcloud secrets versions add kanaeru-token-encryption-keys --data-file=-
   ```

3. 鍵を替えるとき：今の鍵を残したまま新しい版を足した JSON（`{"1":"<古い鍵>","2":"<新しい鍵>"}`）を新しい版として足し、`threads_token_key_version = 2` にして apply する。古い鍵で包んだトークンも開ける（新しく包むときだけ新しい鍵を使う）。古い鍵は、すべてのトークンが延長で包み直された（最長60日）あとに外す。
4. 定期の仕事は、共通の定期の仕事（`kanaeru-jobs-tick`。7章）が日本時間 8時〜23時台の5分ごとに動かす。DB の夜間の停止（7章）の間は動かさない。Threads だけを止めたいときは、アプリの台帳で Threads を「切」にする（共通の仕事を止めると、ほかの領域の定期の仕事も止まる）。
5. OAuth の接続と Meta の Webhook（threads-010。機能の印 `threads.oauth`）を入にするとき（既定は切。それまでは、トークンを貼り付けてつなぐ）：
   1. Meta の開発者の画面で、Threads の API を使うアプリを作り、審査を通す。アプリの設定に次を登録する（`<WEB_URL>` は本番の画面の源）：
      - リダイレクトの URL：`<WEB_URL>/api/v1/threads/oauth/callback`
      - 連携の解除の Webhook：`<WEB_URL>/api/v1/threads/webhooks/uninstall`
      - データの削除の Webhook：`<WEB_URL>/api/v1/threads/webhooks/data-deletion`
   2. `threads_app_id = "<アプリの ID（数字）>"` を入れて apply する（`threads_enabled = true` も要る。秘密の値の入れ物と読む権限だけができ、Cloud Run は変わらない）
   3. 秘密の値（App Secret）の版を足す（手元で入れ、ファイルや履歴に残さない）：

      ```bash
      read -rs THREADS_APP_SECRET && printf '%s' "$THREADS_APP_SECRET" | \
        gcloud secrets versions add kanaeru-threads-app-secret --data-file=- && unset THREADS_APP_SECRET
      ```

   4. `threads_oauth_enabled = true` にして apply する（Cloud Run に `THREADS_APP_ID`・`THREADS_APP_SECRET`・`DOMAIN_FEATURES=threads.oauth` が足される）。設定の「Threads への接続」に「Meta のアプリでつなぐ」が出る
   5. 止めたいときは `threads_oauth_enabled = false` にして apply する（OAuth と Webhook の窓口は 404 になり、貼り付けた接続はそのまま使える。秘密の値は残るので、入に戻すときは 4 だけでよい）

## 10. 予約の知らせと定期の仕事を入にする（booking-005）

予約（booking-002〜004）の知らせは、組織・個人の LINE 公式アカウントから送る（AD-24）。本番は切（`booking_enabled = false`・`booking_notify_mode = "off"`）のまま出す。本番は「送らない → 自分たちだけに送る → 送る」の順に広げる。変数は9章と同じく環境ごとに書く。**ステージングの送り方は `off` か `allowlist` だけ**（`on` にすると plan で止まる。本物の参加者に送らないため）。

1. 前に済ませること：予約の PR（#38〜#48）と、予約の定期の仕事を共通の窓口に移した PR（#80。booking-007）・共通の窓口の PR（#78。core-017）がマージされ、本番に出ていること（共通の窓口がないうちに定期の仕事を作ると5分ごとに 404 になり、#80 がないと予約の定期の仕事は動かない）。
2. `booking_enabled = true` にして apply する（許可リストの入れ物・共通の定期の仕事 `kanaeru-jobs-tick`〈Threads を入にしていればもうある〉ができ、Cloud Run に `NOTIFY_MODE=off`・`TOKEN_ENCRYPTION_KEY_VERSION`・`TOKEN_ENCRYPTION_KEYS`・`JOB_TRIGGER_SECRET` が足される）。
   - Threads を入にしていない（鍵の束に版がない）ときは、9章の1・2と同じく、入れ物だけ先に作って版を足してから全体を apply する（9章の1の `-target`）。秘密の名前は Threads と共通（`<name>-token-encryption-keys`）。
   - `off` の間は、何も送らない（友だち追加のあいさつも送らない）。LINE 公式アカウントの設定・Webhook・紐づけは使える。
3. 組織（または個人）の設定で LINE 公式アカウントをつなぐ。保存すると設定の画面に Webhook の URL（`<WEB_URL>/api/v1/booking/webhooks/line/<設定の ID>`）が出るので、LINE Developers のコンソールの Webhook の URL に入れる。
4. 自分たちだけに送って確かめる：許可リストの版を足し（手元で入れ、ファイルや履歴に残さない）、`booking_notify_mode = "allowlist"` にして apply する。許可リストは LINE のユーザー ID（`U` と16進の32文字）かメールアドレスを、カンマで並べる。

   ```bash
   read -rs NOTIFY_ALLOWLIST && printf '%s' "$NOTIFY_ALLOWLIST" | \
     gcloud secrets versions add kanaeru-notify-allowlist --data-file=- && unset NOTIFY_ALLOWLIST
   ```

   - 許可リストを変えたら、版を足したあと `gcloud run services update <kanaeru か kanaeru-stg> --region=asia-northeast1 --update-labels=rotated=<日付>` で新しい版に切り替える（動いている台は古い値を持っているため。6章のパスワードと同じ）。
5. 広げる：`booking_notify_mode = "on"` にして apply する。止めたいときは `"off"` に戻して apply する（送るのが止まるだけで、申込み・名簿・紐づけは残る）。
6. 予約の定期の仕事は、その環境の共通の定期の仕事（`<name>-jobs-tick`。7章）が日本時間 9時〜23時台の10分ごとに動かす（予約だけの Cloud Scheduler の仕事はない。booking-007）。予約だけを止めるスイッチはないので、止めたいときは `gcloud scheduler jobs pause <name>-jobs-tick --location=asia-northeast1`（Threads の定期の仕事も止まる）。止めても、打診の期限は書く窓口と読む窓口で守られる。
7. 鍵の束を替えるとき（9章の3）：予約の LINE 公式アカウントのトークンは自動で包み直されない（主催者が設定を保存し直したときだけ）。古い鍵は、予約の設定がすべて新しい版で保存し直されるまで外さない。
8. メールの知らせ（LINE を使わずに申し込む人への確認・知らせ）は、送る仕組み（メールの送信サービス）をまだつないでいない。`on` にしても、メールは「送れない」として記録され、LINE の知らせだけが届く。

## 11. ステージング（構成 B）と、別のプロジェクトへの移し方（core-018）

- ステージング（`kanaeru-stg`）は、本番と同じプロジェクト・同じ Cloud SQL のサーバーの中の別の DB（`kanaeru_stg`）を使う。料金はほぼ増えない（Cloud Run は無料の枠の中。Cloud SQL は共有。Cloud Scheduler の4つ目が月0.10ドル）。
- ステージングは `develop` のマージと、`main` のマージ（本番の前に同じ中身を出す）で出る。`terraform.tfvars` の `staging` を `null` にすると作らない。
- **DB は権限でも分ける**：DB の変更を当てる job（`apps/api/scripts/migrate.ts`）が、当てる前に毎回、その DB につなげるのはその環境の利用者だけにし、DB と public スキーマの持ち主をその利用者にする（`apps/api/scripts/lib/isolate-database.ts`）。同じサーバーなので、これがないとステージングの利用者が本番の DB につなげてしまう。
- **イメージの置き場所も環境ごと**：押し込めるのはその環境のデプロイの身分だけで、Cloud Run には digest（中身の指紋）で渡す（ステージングの身分が本番のイメージを上書きできない）。
- **ステージングを消すとき**：DB が動いている昼（8時15分〜23時）に行う。先に `staging` の中に `deletion_protection = false` を入れて apply し（Cloud Run のサービスを消せるようにする）、そのあと `staging = null` で apply する。Terraform は Cloud Run → DB → DB の利用者の順に消す。DB を消すところで落ちたら（古い台の接続が残っている・持ち主がその環境の利用者なので API から消せない、など）、少し待ってもう一度 apply する。それでも落ちるときは、手元から一時的につなぎ（6章）、`kanaeru_stg` として DB `postgres` に入って `DROP DATABASE kanaeru_stg;` を流してから、もう一度 apply する。
- **初めて apply したあと**：本番とステージングの両方で、初めてのデプロイ（`main` と `develop` の `deploy`）を一度ずつ流す。apply の直後の DB の変更を当てる job は、まだ仮のイメージ（Google の見本）なので、`gcloud run jobs execute` だけでは権限は分かれない。デプロイが本物のイメージで job を動かしたとき、はじめて DB が権限で分かれる。それまでは、片方の環境だけを長く使わない。
- **権限で分かれているかの確かめ（両方の環境の初めてのデプロイが成功したあとに一度）**：手元から一時的につなぎ（6章）、`kanaeru_stg` として次がどれも断られることを確かめる：DB `kanaeru` につなぐ・`BEGIN; GRANT kanaeru TO kanaeru_stg; ROLLBACK;`・`BEGIN; ALTER ROLE kanaeru PASSWORD 'x'; ROLLBACK;`。どれかが通ったら、Cloud SQL では同じサーバーのまま分けられないので、ステージングの利用者を cloudsqlsuperuser に入れない形にするか、構成 C（別のプロジェクト）に移す（[specs/core/018-staging-private-db/research.md](../specs/core/018-staging-private-db/research.md) R7）。
  - 2026-11-26 に確かめたところ、つなぐことは断られたが、`GRANT` と `ALTER ROLE` は通った（Cloud SQL の API で作った利用者は cloudsqlsuperuser の一員になるため）。そこで、DB の変更を当てる job の初めの手順（`isolate-database.ts`）で、その環境の利用者を cloudsqlsuperuser から外すようにした（外せなければ job が止まる。外すと戻せず、戻すには利用者を作り直す）。外したあとの確かめでは、`GRANT` と `ALTER ROLE` も断られることを見る。
  - 手元から一時的につながなくても、ステージングのイメージ・身分・ネットワークで動く一時の Cloud Run の job（`node -e` で `pg` を使い、`BEGIN … ROLLBACK` で試す）で確かめられる。終わったら job を消す。
- **データを書き出す・移すとき**：Cloud SQL の書き出し（`gcloud sql export sql`）は持ち主が cloudsqlsuperuser の DB を前提にするので、権限で分けたあとは使えない見込み。手元から一時的につなぎ（6章）、その環境の利用者で `pg_dump`・`pg_restore` する。毎日のバックアップ（ディスクの写し）は影響を受けない。
- 気をつけること：
  - DB の接続の数：本番 2台 × 5本・ステージング 1台 × 3本と DB の変更を当てる job で、db-f1-micro の上限（25本。管理用の分を引いて22本）に収める（`environments.tf`）。台数や接続を増やすときは、合計を確かめる。
  - ステージングで重い処理（大きな CSV の取り込みなど）をすると、同じサーバーの本番が少し遅くなることがある。
  - Threads は試し用のアカウントだけ（9章）。予約の知らせは `off` か `allowlist` だけ（10章）。
  - LINE のミニアプリ（LIFF）は環境ごとに別（4章）。Meta のアプリの戻り先 URL も、環境ごとに登録する。
- 別のプロジェクトに分けるとき（構成 C）：移した先のプロジェクトで、共通の資源（`network.tf`・`cloud_sql.tf`・`wif.tf` にあたるもの）を作り、同じ部品 `modules/environment` を呼ぶ（state も別にする）。そのあと、上の「ステージングを消すとき」の手順で、この state から `module.staging` を外す。データを移すときは、ステージングの DB を書き出して入れ直す。

