# infra（GCP の資源の Terraform）

- 作成日：2026-11-19（core-002）
- 直した日：—
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
| `wif.tf` | GitHub Actions から鍵なしで入る仕組み（このリポジトリの `main` だけ） |
| `cloud_run.tf` | Cloud Run のサービス（画面と `/api`）と、DB の変更を当てる job |
| `scheduler.tf` | 毎日0時に DB を止め、8時に動かす（日本時間） |
| `budget.tf` | 請求の予算（月2,000円・50%と100%でメール） |

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
| `LIFF_ID` | LINE のミニアプリの LIFF ID |

そのあと、GitHub の Actions で `deploy` を `main` から手で流す（Run workflow）か、`develop`→`main` のリリースの PR をマージする。

## 6. ふだんの直し

- 設定（環境の値・台数など）を変える：`*.tf` を直す PR → マージのあと手元で `plan` → 読む → `apply`。
- DB のパスワードを替える：`db_password_version` を1つ上げて apply（DB と Secret Manager に同じ新しい値が書かれる）。続けて `gcloud run services update kanaeru --region=asia-northeast1 --update-labels=rotated=<日付>` で新しい版に切り替える（動いている台は古いパスワードを持っているため）。
- 何も直していないのに plan に差が出たら、apply しない。理由（画面で手で直した・GitHub Actions が変えた）を先に調べる。

## 7. 夜間の停止と交流会

- 毎日0時に止まり、8時に動く（`kanaeru-db-stop`・`kanaeru-db-start`）。止まっている間、API は DB に届かない。
- 交流会が0時を越える日は、その日のうちに止める仕事を止め、翌朝に戻す（Terraform はこの変更を戻さない）：

  ```bash
  gcloud scheduler jobs pause  kanaeru-db-stop --location=asia-northeast1
  gcloud scheduler jobs resume kanaeru-db-stop --location=asia-northeast1   # 翌日
  ```

- 初めて作ったあと、一度だけ手で動かして確かめる：`gcloud scheduler jobs run kanaeru-db-start --location=asia-northeast1`。

## 8. 消さないための仕組み

Cloud SQL は `prevent_destroy`・`deletion_protection`・`deletion_protection_enabled` の3段で守っている。`terraform destroy` は使わない。データの最後の守りは毎日のバックアップ（12時・7日分）。
