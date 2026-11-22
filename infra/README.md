# infra（GCP の資源の Terraform）

- 作成日：2026-11-19（core-002）
- 直した日：2026-11-20（threads-002：`threads.tf` と9章。threads-015：9章の5に OAuth を入にする手順）・2026-11-21（booking-005：`booking.tf` と10章）
- 読む人：本番の置き場所を作る・直す人（主催者）。Terraform と GCP の考え方は [Terraformの学び](../docs/study/terraform.md)・[GCPの学び](../docs/study/gcp.md)。
- 決めごとの正本は[構成の決めごと](../_bmad-output/architecture-kanaeru/architecture-kanaeru.md) AD-8〜AD-11、デプロイの決まりは[開発の流れの決まり](../docs/rules/development-flow.md) 5章。なぜこの形にしたかは [specs/core/002-infra/research.md](../specs/core/002-infra/research.md)。

## 0. 何があるか

| ファイル | 中身 |
|---|---|
| `versions.tf` | Terraform（1.11 以上）と google プロバイダ（`~> 8.12`）・state の置き場所（GCS）・provider |
| `variables.tf`・`terraform.tfvars.example` | 外から渡す値と、その見本 |
| `locals.tf`・`outputs.tf` | 名前などの共通の値・apply のあとに出す値 |
| `apis.tf` | 使う API の有効化 |
| `artifact_registry.tf` | コンテナのイメージの置き場所（東京・古いものを自動で消す） |
| `cloud_sql.tf` | Cloud SQL（ENTERPRISE・db-f1-micro・PostgreSQL 18）・DB・利用者 |
| `secrets.tf` | DB の接続先（`DATABASE_URL`）の秘密。パスワードは Terraform の中で作り、state に残さない |
| `service_accounts.tf` | 身分（Cloud Run・デプロイ・夜間の停止）と権限 |
| `wif.tf` | GitHub Actions から鍵なしで入る仕組み（このリポジトリの `main` だけ。名前と数字の ID の両方で絞る） |
| `cloud_run.tf` | Cloud Run のサービス（画面と `/api`）と、DB の変更を当てる job |
| `scheduler.tf` | 毎日0時に DB を止め、8時に動かす（日本時間）。Threads か booking が入なら、5分ごとの共通の定期の仕事（`kanaeru-jobs-tick`。core-017） |
| `budget.tf` | 請求の予算（月2,000円・50%と100%でメール） |
| `threads.tf` | Threads の運用アプリ（`threads_enabled` が true のときだけ）：トークンを包む鍵の束と定期の仕事の合言葉の秘密・5分おきの定期の仕事。`threads_oauth_enabled` も true なら Meta のアプリの秘密の値の入れ物（9章）。鍵の束と合言葉は、予約（`booking_enabled`）が入でも作る |
| `booking.tf` | 予約（`booking_enabled` が true のときだけ）：知らせの許可リストの入れ物。鍵の束と合言葉は `threads.tf` のものを共に使う。定期の仕事は共通の `kanaeru-jobs-tick`（`scheduler.tf`）が動かす（10章） |

Terraform は**手元から**流す（GitHub Actions からは流さない）。GitHub Actions が変えるのはイメージだけで、ほかの設定（台数・環境の値・権限）は Terraform だけが変える。

## 1. 道具を入れる（初めての1回）

```bash
brew tap hashicorp/tap && brew install hashicorp/tap/terraform   # 1.11 以上
# gcloud（Google Cloud CLI）は https://cloud.google.com/sdk/docs/install の手順で入れる
gcloud auth login
gcloud auth application-default login                             # 手元の Terraform が使う資格
```

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

LINE Developers のコンソールで（どれも秘密ではない。AD-4・AD-5）：

| 値 | どこで見るか | 入れる先 |
|---|---|---|
| チャネルID（ミニアプリ・LINEログイン。すべて同じプロバイダーの下） | 各チャネルの「チャネル基本設定」 | `line_channel_ids`（カンマで並べる） |
| 主催者の LINE のユーザーID（`U` で始まる） | LINEログインのチャネルの「あなたのユーザーID」 | `organizer_line_user_id` |
| オープンチャットの URL | LINE アプリのオープンチャットの「共有」 | `open_chat_url` |
| LIFF ID | ミニアプリのチャネル | GitHub の変数 `LIFF_ID`（5章） |

ミニアプリのエンドポイント URL は、apply のあとの `terraform output web_url` にする（ほかの URL から開くと、書く操作が源の確かめで 403 になる）。

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
terraform output github_variables
```

最初の apply では、Cloud Run は仮のイメージ（hello）で立ち上がる。本物は GitHub Actions が出す。

GitHub のリポジトリの **Variables**（Settings → Secrets and variables → Actions → Variables。Secrets ではない）に入れる：

| 名前 | 値 |
|---|---|
| `GCP_PROJECT_ID` | `terraform output github_variables` の値 |
| `GCP_REGION` | 同上（`asia-northeast1`） |
| `GCP_WIF_PROVIDER` | 同上（`projects/<番号>/locations/global/workloadIdentityPools/github/providers/github`） |
| `GCP_DEPLOYER_SA` | 同上（`kanaeru-deployer@<プロジェクトID>.iam.gserviceaccount.com`） |
| `LIFF_ID` | LINE のミニアプリの LIFF ID（空だとデプロイは止まる） |
| `APP_NAME`（任意） | 同上（`app_name`。既定の `kanaeru` のままなら入れなくてよい）。画面の題に埋める名前で、Cloud Run の `APP_NAME` とそろえる |

そのあと、日本時間の8時15分〜23時に（デプロイはこの間に始まったときだけ進む）、GitHub の Actions で `deploy` を `main` から手で流す（Run workflow）か、`develop`→`main` のリリースの PR をマージする。

## 6. ふだんの直し

- 設定（環境の値・台数など）を変える：`*.tf` を直す PR → マージのあと手元で `plan` → 読む → `apply`。
- DB のパスワードを替える：`db_password_version` を1つ上げて apply（DB と Secret Manager に同じ新しい値が書かれる）。続けて `gcloud run services update kanaeru --region=asia-northeast1 --update-labels=rotated=<日付>` で新しい版に切り替える（動いている台は古いパスワードを持っているため）。
- DB のパスワードが食い違ったとき（API が `password authentication failed` で DB につなげない）：`db_password_version` を1つ上げて apply し、上と同じく新しい版に切り替える。
  - パスワードは、版（`db_password_version`）が変わったとき（と最初に作るとき）だけ書かれる。2つの資源（Secret Manager の版・DB の利用者）は同じ `db_password_version` を見ているので、上げると**両方に同じ新しい値**が書かれる。
  - 書く順番は「Secret Manager の版 → それを読み直して DB の利用者」（`secrets.tf` の頭）。apply が途中で落ちても、もう一度 apply すれば、DB の利用者は Secret Manager にある値で書かれてそろう。版を上げるのは、画面で手で直したなど、それでもそろわないときだけ。
- 何も直していないのに plan に差が出たら、apply しない。理由（画面で手で直した・GitHub Actions が変えた）を先に調べる。

## 7. 夜間の停止と交流会

- 毎日0時に止まり、8時に動く（`kanaeru-db-stop`・`kanaeru-db-start`）。止まっている間、API は DB に届かない。
- 交流会が0時を越える日は、その日のうちに止める仕事を止め、翌朝に戻す（Terraform はこの変更を戻さない）：

  ```bash
  gcloud scheduler jobs pause  kanaeru-db-stop --location=asia-northeast1
  gcloud scheduler jobs resume kanaeru-db-stop --location=asia-northeast1   # 翌日
  ```

- 初めて作ったあと、一度だけ手で動かして確かめる：`gcloud scheduler jobs run kanaeru-db-start --location=asia-northeast1`。
- 共通の定期の仕事（`kanaeru-jobs-tick`。Threads か booking が入のときだけ）は、日本時間 8時〜23時台の5分ごとに `POST /api/v1/jobs/tick` を呼び、その回に当たる領域の仕事（各領域の `scheduledJob`）を動かす。DB の夜間の停止の間は動かさない。止めたいときは `gcloud scheduler jobs pause kanaeru-jobs-tick --location=asia-northeast1`（すべての領域の定期の仕事が止まる）。Cloud Scheduler の仕事は、DB の停止・起動と合わせて3つ（請求先アカウントごとの無料の枠）に収める。

## 8. 消さないための仕組み

Cloud SQL は `prevent_destroy`・`deletion_protection`・`deletion_protection_enabled` の3段で守っている。`terraform destroy` は使わない。データの最後の守りは毎日のバックアップ（12時・7日分）。

## 9. Threads の運用アプリを入にする（threads-002）

本番は切（`threads_enabled = false`）のまま出す。入にするときは、次の順で行う（鍵の値を state とリポジトリに残さないため、鍵の束だけは手で入れる）。

1. `threads_enabled = true` にして apply する（秘密の入れ物・合言葉・定期の仕事ができる。Cloud Run の設定 `TOKEN_ENCRYPTION_KEY_VERSION`・`TOKEN_ENCRYPTION_KEYS`・`JOB_TRIGGER_SECRET` も足される）。だれに見せるかは、アプリの台帳（設定 → アプリの台帳）で決める（はじめは運営者だけ。定期の仕事は、切でなければ動く）。
   - 鍵の束に版がないと Cloud Run の新しい版が立ち上がらないので、apply の前に入れ物だけ先に作る：`terraform apply -target=google_secret_manager_secret.threads_token_keys` → 2 → 全体の apply。
2. 鍵の束を作って版を足す（手元で作り、ファイルや履歴に残さない）：

   ```bash
   printf '{"1":"%s"}' "$(openssl rand -base64 32)" | \
     gcloud secrets versions add kanaeru-token-encryption-keys --data-file=-
   ```

3. 鍵を替えるとき：今の鍵を残したまま新しい版を足した JSON（`{"1":"<古い鍵>","2":"<新しい鍵>"}`）を新しい版として足し、`threads_token_key_version = 2` にして apply する。古い鍵で包んだトークンも開ける（新しく包むときだけ新しい鍵を使う）。古い鍵は、すべてのトークンが延長で包み直された（最長60日）あとに外す。
4. 定期の仕事（`kanaeru-threads-tick`）は日本時間 8時〜23時台の5分おき。DB の夜間の停止（7章）の間は動かさない。止めたいときは `gcloud scheduler jobs pause kanaeru-threads-tick --location=asia-northeast1`。
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

予約（booking-002〜004）の知らせは、組織・個人の LINE 公式アカウントから送る（AD-24）。本番は切（`booking_enabled = false`・`booking_notify_mode = "off"`）のまま出す。ステージングがないので、「送らない → 自分たちだけに送る → 送る」の順に広げる。

1. 前に済ませること：予約の PR（#38〜#48）と、予約の定期の仕事を共通の窓口に移した PR（#80。booking-007）・共通の窓口の PR（#78。core-017）がマージされ、本番に出ていること（共通の窓口がないうちに定期の仕事を作ると5分ごとに 404 になり、#80 がないと予約の定期の仕事は動かない）。
2. `booking_enabled = true` にして apply する（許可リストの入れ物・共通の定期の仕事 `kanaeru-jobs-tick`〈Threads を入にしていればもうある〉ができ、Cloud Run に `NOTIFY_MODE=off`・`TOKEN_ENCRYPTION_KEY_VERSION`・`TOKEN_ENCRYPTION_KEYS`・`JOB_TRIGGER_SECRET` が足される）。
   - Threads を入にしていない（鍵の束に版がない）ときは、9章の1・2と同じく、入れ物だけ先に作って版を足してから全体を apply する：`terraform apply -target=google_secret_manager_secret.threads_token_keys` → 9章の2 → 全体の apply。秘密の名前は Threads のときのまま（`kanaeru-token-encryption-keys`）。
   - `off` の間は、何も送らない（友だち追加のあいさつも送らない）。LINE 公式アカウントの設定・Webhook・紐づけは使える。
3. 組織（または個人）の設定で LINE 公式アカウントをつなぐ。保存すると設定の画面に Webhook の URL（`<WEB_URL>/api/v1/booking/webhooks/line/<設定の ID>`）が出るので、LINE Developers のコンソールの Webhook の URL に入れる。
4. 自分たちだけに送って確かめる：許可リストの版を足し（手元で入れ、ファイルや履歴に残さない）、`booking_notify_mode = "allowlist"` にして apply する。許可リストは LINE のユーザー ID（`U` と16進の32文字）かメールアドレスを、カンマで並べる。

   ```bash
   read -rs NOTIFY_ALLOWLIST && printf '%s' "$NOTIFY_ALLOWLIST" | \
     gcloud secrets versions add kanaeru-notify-allowlist --data-file=- && unset NOTIFY_ALLOWLIST
   ```

   - 許可リストを変えたら、版を足したあと `gcloud run services update kanaeru --region=asia-northeast1 --update-labels=rotated=<日付>` で新しい版に切り替える（動いている台は古い値を持っているため。6章のパスワードと同じ）。
5. 広げる：`booking_notify_mode = "on"` にして apply する。止めたいときは `"off"` に戻して apply する（送るのが止まるだけで、申込み・名簿・紐づけは残る）。
6. 予約の定期の仕事は、共通の定期の仕事（`kanaeru-jobs-tick`。7章）が日本時間 9時〜23時台の10分ごとに動かす（予約だけの Cloud Scheduler の仕事はない。booking-007）。予約だけを止めるスイッチはないので、止めたいときは `gcloud scheduler jobs pause kanaeru-jobs-tick --location=asia-northeast1`（Threads の定期の仕事も止まる）。止めても、打診の期限は書く窓口と読む窓口で守られる。
7. 鍵の束を替えるとき（9章の3）：予約の LINE 公式アカウントのトークンは自動で包み直されない（主催者が設定を保存し直したときだけ）。古い鍵は、予約の設定がすべて新しい版で保存し直されるまで外さない。
8. メールの知らせ（LINE を使わずに申し込む人への確認・知らせ）は、送る仕組み（メールの送信サービス）をまだつないでいない。`on` にしても、メールは「送れない」として記録され、LINE の知らせだけが届く。
