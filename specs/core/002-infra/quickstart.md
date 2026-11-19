# Quickstart：インフラとデプロイの確かめ（core-002）

## 1. 手元で確かめる（GCP なしでできる。2026-11-19 に流した）

リポジトリのルートで。terraform と actionlint は入れずに Docker で流す。

```bash
# Terraform の書式と整合（google 8.12.0 の引数の名前まで確かめる）
docker run --rm -v "$PWD/infra":/w -w /w hashicorp/terraform:1.17.2 fmt -check -recursive
docker run --rm -v "$PWD/infra":/w -w /w hashicorp/terraform:1.17.2 init -backend=false -input=false
docker run --rm -v "$PWD/infra":/w -w /w hashicorp/terraform:1.17.2 validate
rm -rf infra/.terraform

# workflow の lint
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.12 -no-color

# CI の設定の守り（deploy.yml の権限・順番・時間帯）
pnpm exec vitest run --project security

# コンテナを作る
docker build --build-arg VITE_LIFF_ID=0000000000-test -t kanaeru-local .
```

期待：fmt・validate・actionlint はエラーなし、security のテストは全部通る、コンテナは 300 MB ほど。

### Cloud SQL の接続の形で migrate と API を動かす

Cloud Run の `/cloudsql/<接続の名前>` と同じ形の Unix ソケットだけを開いた PostgreSQL に当てる（値はすべて手元だけの仮のもの）。

```bash
SOCK='/cloudsql/proj-1:asia-northeast1:kanaeru-db'
docker volume create cloudsql-test
docker run -d --name pg-test -v cloudsql-test:/cloudsql \
  -e POSTGRES_USER=kanaeru -e POSTGRES_PASSWORD=localonly -e POSTGRES_DB=kanaeru \
  --entrypoint sh postgres:18 -c "mkdir -p '$SOCK' && chown postgres '$SOCK' && chmod 755 /cloudsql '$SOCK' && \
  exec docker-entrypoint.sh postgres -c unix_socket_directories='/var/run/postgresql,$SOCK' -c listen_addresses=''"
URL="postgresql://kanaeru:localonly@localhost/kanaeru?host=$SOCK"
docker run --rm -v cloudsql-test:/cloudsql -e DATABASE_URL="$URL" kanaeru-local scripts/migrate.ts   # 2回流しても同じ
docker run -d --name api-test -p 127.0.0.1:18080:8080 -v cloudsql-test:/cloudsql \
  -e APP_ENV=production -e APP_NAME=kanaeru -e WEB_URL=https://kanaeru-1.asia-northeast1.run.app \
  -e DATABASE_URL="$URL" -e TRUSTED_PROXY_HOPS=1 -e RATE_LIMIT_MAX=600 kanaeru-local
curl -i http://127.0.0.1:18080/api/v1/health    # 200
docker rm -f api-test pg-test && docker volume rm cloudsql-test
```

期待：「DB の変更を当てました。」が2回出る・`/api/v1/health` が 200・`docker exec api-test id` が uid 1000。

## 2. 本番で確かめる（作ったあと）

| 何を | どう | 期待 |
|---|---|---|
| 2回目の plan | `terraform plan` | `No changes.`（夜は DB の状態の差が出ないこと） |
| 夜間の停止 | `gcloud scheduler jobs run kanaeru-db-stop --location=asia-northeast1` → `gcloud sql instances describe kanaeru-db --format='value(settings.activationPolicy,state)'` | `NEVER`。`kanaeru-db-start` で `ALWAYS`・`RUNNABLE` |
| 秘密が state にない | `terraform state pull \| grep -c <パスワードの一部>` | 0 |
| デプロイ | Actions の deploy を main から手で流す | migrate の job が成功 → 新しい版 → health が 200 |
| 夜のデプロイ | 23時〜翌8時15分に流す | 最初の一歩で理由を出して止まる |
| 文書だけのマージ | `docs/` だけを変えて main に入れる | deploy が動かない |
| 予算 | 請求の画面の「予算とアラート」 | `kanaeru-monthly`・2,000円・50%・100% |

## 3. 手で行う残り（開発者）

1. GCP のプロジェクトを作り、請求先アカウントにひもづける（`infra/README.md` 2）。
2. state のバケットを作る（同 3）。
3. LINE：同じプロバイダーの下にミニアプリと LINE ログインのチャネルを作り、チャネルID・主催者のユーザーID・LIFF ID・オープンチャットの URL を集める（同 4）。ミニアプリのエンドポイント URL は `terraform output web_url`。
4. `terraform.tfvars` を書き、昼に `init`・`plan`・`apply`（同 5）。
5. GitHub のリポジトリの変数を5つ（と、`app_name` を変えたときは `APP_NAME`）入れる（同 5。[contracts](./contracts/deploy-interface.md) 3）。
6. 最初のデプロイ（手で流す）と、2章の確かめ。
7. 構成の決めごと AD-9・Stack の「Direct WIF」を「WIF（サービスアカウントのなりすまし。鍵なし）」に直す（[research.md](./research.md) R-2）。

## 4. 全体の形（docs/architecture.md）に足す文

`docs/architecture.md` は別のセッション（画面のファイルを返す・notes を消す）も直すので、この PR では触らない。両方が入ったあと、1章の「ログインと置き場所（インフラ）はまだない。…」を次に置きかえる。

> 本番は GCP 東京の Cloud Run を1つ（`Dockerfile` の1つのコンテナが画面の組み立てたファイルと `/api` を返す。最大2台）と Cloud SQL for PostgreSQL 18 を1つ（ENTERPRISE・db-f1-micro。毎日0時〜8時は止まる）。資源はすべて `infra/` の Terraform（手元から流す。手順は [infra/README.md](../infra/README.md)）。`main` へのマージで `.github/workflows/deploy.yml` が、コンテナを作る → 同じコンテナで DB の変更（Cloud Run の job `kanaeru-migrate`。`apps/api/scripts/migrate.ts`）→ 新しい版 の順に出す（日本時間の8時15分〜23時に始まったときだけ）。GitHub Actions は WIF でデプロイ用のサービスアカウントになりすまして入る（鍵なし）。DB の接続先は Secret Manager から渡す（core-002）。

表の行（1章）にも足す：

> | `infra`・`Dockerfile` | 本番の置き場所（GCP の資源の Terraform）と、本番のコンテナ（core-002） |
