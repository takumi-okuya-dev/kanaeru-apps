# 取り決め：コンテナ・環境の値・リポジトリの変数（core-002）

## 1. コンテナ（`Dockerfile`）

| 項目 | 値 |
|---|---|
| 組み立ての引数 | `VITE_LIFF_ID`（LIFF ID。公開してよい）・`APP_NAME`（既定 `kanaeru`） |
| 動かす人 | `node`（uid 1000）。アプリのファイルは root の持ち物 |
| 作業の場所 | `/app/apps/api` |
| ENTRYPOINT／CMD | `["node"]`／`["src/index.ts"]`（API。画面のファイルも返す） |
| db:migrate | 同じイメージで `node scripts/migrate.ts`（Cloud Run の job は `args = ["scripts/migrate.ts"]`）。読む設定は `DATABASE_URL` だけ。何度流しても同じ |
| 口 | 8080（`API_PORT`） |
| 画面のファイル | `/app/apps/web/dist`（`WEB_DIST_DIR`） |
| 含めないもの | 開発の依存・テスト・`.env`・文書・`infra/` |

## 2. 本番の環境の値（`infra/cloud_run.tf`。意味は `apps/api/src/kernel/config.ts`）

| 名前 | 値 | 出どころ |
|---|---|---|
| `APP_ENV` | `production` | 固定 |
| `APP_NAME` | `kanaeru` | 変数 `app_name` |
| `WEB_URL` | `https://kanaeru-<プロジェクト番号>.asia-northeast1.run.app` | 変数 `web_url`（空なら組み立て） |
| `API_HOST`／`API_PORT` | `0.0.0.0`／`8080` | 固定 |
| `WEB_DIST_DIR` | `/app/apps/web/dist` | 固定（Dockerfile と同じ） |
| `LOG_LEVEL` | `info` | 固定 |
| `TRUSTED_PROXY_HOPS` | `1` | 固定（AD-8） |
| `RATE_LIMIT_MAX` | `600` | 固定（AD-8） |
| `LINE_CHANNEL_IDS` | チャネルIDのカンマ区切り | 変数 `line_channel_ids` |
| `ORGANIZER_LINE_USER_ID` | 主催者の LINE のユーザーID | 変数 `organizer_line_user_id` |
| `OPEN_CHAT_URL` | オープンチャットの URL | 変数 `open_chat_url` |
| `DATABASE_URL` | `postgresql://kanaeru:<パスワード>@localhost/kanaeru?host=/cloudsql/<接続の名前>` | Secret Manager `kanaeru-database-url`（`latest`） |

書かないもの（コードの既定のまま）：`SAMPLE_DATA_ENABLED`（false）・`OPENAPI_DOC_ENABLED`（false）・`RATE_LIMIT_ENABLED`（true）・`LOG_PRETTY`（false）・DB の時間の上限。

## 3. GitHub のリポジトリの変数（`vars.*`。Secrets は使わない）

| 名前 | 例の形 | 出どころ |
|---|---|---|
| `GCP_PROJECT_ID` | `kanaeru-prod-xxxx` | `terraform output github_variables` |
| `GCP_REGION` | `asia-northeast1` | 同上 |
| `GCP_WIF_PROVIDER` | `projects/<番号>/locations/global/workloadIdentityPools/github/providers/github` | 同上 |
| `GCP_DEPLOYER_SA` | `kanaeru-deployer@<プロジェクトID>.iam.gserviceaccount.com` | 同上 |
| `LIFF_ID` | `1234567890-abcdefgh` | LINE のミニアプリのチャネル |

## 4. デプロイの入口（`deploy.yml`）

| 入口 | 条件 |
|---|---|
| `push` | `main`。`paths` に並べたファイルが変わったときだけ |
| `workflow_dispatch` | `main` から。入力 `skip_hour_check`（既定 false） |

GCP の資源の名前（固定）：サービス `kanaeru`・job `kanaeru-migrate`・置き場所 `<リージョン>-docker.pkg.dev/<プロジェクト>/kanaeru/app:<コミットの SHA>`。
