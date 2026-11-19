# Research: インフラとデプロイ（core-002）

- 作成日：2026-11-19
- 開発者が寝ている間にエージェントが決めたものは **【仮決め】** と書いた。起きたら読んで、違えば直す。
- 版と引数は 2026-11-19 に確かめた：Terraform 1.17.2（Docker の `hashicorp/terraform:1.17.2`）・google プロバイダ 8.12.0・random 3.9.1・google-github-actions/auth v3.0.0・setup-gcloud v3.0.1・Node.js 26.13.1・pnpm 12.21.0。`terraform validate` が google 8.12.0 の引数の名前を全部確かめた。

## R-1 コンテナの形

- **Decision**：多段の Dockerfile（`base`〈pnpm を入れる〉→ `web`〈`pnpm --filter web build`〉／`api`〈`pnpm install --prod --filter "api..."`〉→ `runtime`）。土台は `node:26.13.1-trixie-slim` を指紋で固定。動かすのは `node`（uid 1000）で、ファイルは root の持ち物（書き換えられない）。`ENTRYPOINT ["node"]`・`CMD ["src/index.ts"]`・作業の場所は `/app/apps/api`。大きさは 294 MB（開発の依存を入れた案は 610 MB）。
- **Rationale**：TypeScript は `erasableSyntaxOnly` で書かれているので、Node.js 26 の型を取り除く仕組みでそのまま動く（組み立ての手順を足さずに済む）。`@workspace/contracts` は pnpm のリンクの先（`packages/contracts`）の本当の場所で読まれるので、`node_modules` の中の TypeScript を断る決まりに当たらない。手元の Docker で、本番の設定で API が立ち上がり `/api/v1/health` が 200 を返すことを確かめた。
- **Alternatives**：tsx で動かす（開発の依存が要る）・esbuild で1つにまとめる（手順が増え、pino の worker が壊れやすい）・distroless（Node 26 の版がまだ見つからない）。
- Node.js 26 には corepack がないので、pnpm は `npm install --global pnpm@12.21.0` で入れる。【仮決め】Dependabot が FROM を新しくできるよう、ARG を使わず2つの FROM に同じ値を書いた。

## R-2 GitHub Actions の入り方（構成の決めごとからの外れ）

- **Decision**：【仮決め】WIF（Workload Identity Federation）で入り、デプロイ用のサービスアカウント `kanaeru-deployer` になりすます（`auth` の `service_account`）。鍵（JSON）は作らない。プロバイダの条件で「このリポジトリ」かつ「`refs/heads/main`」だけを受け入れ、なりすましの権限（`roles/iam.workloadIdentityUser`）はこのリポジトリの `principalSet` にだけ付ける。
- **Rationale**：Google の「identity federation に対応するサービス」の頁に **「Cloud Run doesn't support Workload Identity Federation direct resource access. To allow access, use service account impersonation.」** とある（https://docs.cloud.google.com/iam/docs/federated-identity-supported-services ）。Direct WIF のままだと Cloud Run の更新ができない。依頼にあった「deployer のサービスアカウント」はこのために使う。
- **構成の決めごとの直し**：AD-9 と Stack の「Direct WIF」を「WIF（サービスアカウントのなりすまし。鍵なし）」に直す必要がある（spine は BMAD の文書なので、この PR では直さず、開発者に伝える）。
- **Alternatives**：Artifact Registry だけ Direct WIF にして2回入る（手順が増えるだけで得がない）・サービスアカウントの鍵（漏れたら終わり。不採用）。
- `deployer` の役割：Artifact Registry の書き込み（この置き場所だけ）・`roles/run.developer`（プロジェクト）・`kanaeru-run` への `roles/iam.serviceAccountUser`（この1つだけ）。【仮決め】`run.developer` はサービスと job ごとに付ける形もあるが、`jobs execute --wait` の実行の読み取りなどが資源ごとの権限で足りるか確かめきれないので、Cloud Run の公式の「CI からのデプロイ」の形（プロジェクトの単位）にした。

## R-3 DB のパスワードと秘密

- **Decision**：Terraform の `ephemeral "random_password"`（その場だけの値）で作り、まず `google_secret_manager_secret_version.secret_data_wo`（書くだけの欄）に書く。その版を `ephemeral "google_secret_manager_secret_version"`（google 8.12 にある、その場だけの読み取り）で読み直し、取り出したパスワードを `google_sql_user.password_wo` に書く。2つの `*_wo_version` は同じ変数 `db_password_version`。秘密には `DATABASE_URL` 丸ごと（`kanaeru-database-url`）を入れ、Cloud Run のサービスと job に `secret_key_ref`（`latest`）で渡す。
- **なぜ読み直すか（自分の点検で直した）**：ephemeral の値は plan・apply のたびに作り直され、`*_wo` は資源を作るときと `*_wo_version` が変わったときだけ書かれる。同じ ephemeral を2か所に直に書く形だと、apply が途中で落ちたとき（片方だけ書けた）に、次の apply では書けなかったほうにだけ**別の**値が書かれ、黙って食い違う。Secret Manager の版を正本にし、DB の利用者はそれを読んで書く形にすると、途中で落ちても次の apply で同じ値がそろう（版が作られる apply では、読み取りは版を作ったあとに開かれる）。それでもそろわないとき（手で直したなど）は `db_password_version` を上げれば、両方に新しい同じ値が書かれる（infra/README.md 6）。
- **Alternatives**：同じ ephemeral を2か所に直に書く（前の形。途中で落ちると食い違う）・`random_password` を ephemeral でない資源にする（値が state に残る。FR-006 に反する）・パスワードだけの秘密を別に置く（秘密が2つになり、DATABASE_URL の秘密も同じ順番の問題を持つ）。取り出しは `regex` に頼るが、パスワードは英大小・数字だけで、利用者の名前にも `:` はないので、形は崩れない。
- **Rationale**：値が state にも plan のファイルにも残らない（Terraform 1.10・1.11 の仕組み）。手で `gcloud secrets versions add` するより、DB の利用者と秘密が食い違わない。Cloud Run は環境の値の中で別の値を差しこめないので、パスワードだけを秘密にすると `DATABASE_URL` を組み立てられない。
- そのため `required_version = ">= 1.11"`（依頼の「1.9 以上」より上げた）。
- 秘密の複製は東京だけ（`user_managed`）。【仮決め】
- パスワードを替える手順は infra/README.md 6。

## R-4 本番の DATABASE_URL の形（確かめた）

- **Decision**：`postgresql://kanaeru:<パスワード>@localhost/kanaeru?host=/cloudsql/<PROJECT:REGION:INSTANCE>`。
- **Rationale**：手元で確かめた。宛先が空の形（`postgresql://u:p@/db?host=...`）は pg では読めるが、WHATWG の URL では読めず（`URL.canParse` が false）、`apps/api/src/kernel/config.ts` の確かめで起動が止まる。`localhost` を書いても、pg（pg-connection-string 2.14.1）は問い合わせの `host` を使い、ソケット（`/cloudsql/.../.s.PGSQL.5432`）につなぐ。Docker で、Unix ソケットだけを開いた PostgreSQL 18 に、この形で migrate（2回流しても同じ）と API の起動ができた。
- 記号のないパスワード（英大小・数字の32文字）にして、URL の %xx の扱いを避けた。

## R-5 DB の変更（db:migrate）を本番のコンテナで当てる

- **Decision**：【仮決め】`apps/api/scripts/migrate.ts` を足す（drizzle-orm の `migrate()` で `apps/api/drizzle/` を当てる。読む設定は `DATABASE_URL` だけ。1つの命令の時間の上限なし）。job は `args = ["scripts/migrate.ts"]`、`max_retries = 0`、時間切れ 600 秒。
- **Rationale**：`pnpm db:migrate` は drizzle-kit（開発の依存）と tsx を使うので、本番のコンテナが2倍の大きさになる。drizzle-kit の `migrate` も中で drizzle-orm の migrator を呼び、記録の表（`drizzle.__drizzle_migrations`）も同じなので、手元の `pnpm db:migrate` と混ぜて使える。DB は Terraform が作るので、`create-database.ts` は要らない。
- 共通のファイル（`apps/api/package.json` の scripts）は、別のセッションとぶつからないよう直していない。

## R-6 Cloud SQL

- `edition = "ENTERPRISE"`・`tier = "db-f1-micro"`・`POSTGRES_18`・`ZONAL`・`ipv4_enabled = true`（承認済みネットワークなし）・`ssl_mode = "ENCRYPTED_ONLY"`【仮決め：組み込みの接続はいつも暗号つきなので困らない】。
- バックアップ：`start_time = "03:00"`（UTC＝日本時間12時）・7つ。時点を選んだ戻し（PITR）は切【仮決め：WAL の保存の料金を避ける】。
- 保守の時間帯：月曜 04:00 UTC（日本時間13時）【仮決め：DB が動いていて交流会のない時間】。
- 保存の量：SSD 10 GB・自動で増やすのは 20 GB まで【仮決め】。
- 守り：`prevent_destroy`・`deletion_protection`・`deletion_protection_enabled`。`ignore_changes = [settings[0].activation_policy]`。
- DB（`kanaeru`）と利用者（`kanaeru`）も Terraform で作る（組み込みの利用者は `cloudsqlsuperuser`）。

## R-7 Cloud Run

- サービス `kanaeru`：最大2・最小0、CPU 1・メモリ 512Mi、`cpu_idle = true`・`startup_cpu_boost = true`、要求の時間切れ 60 秒【仮決め】、同時の要求は既定（80）。`invoker_iam_disabled = true`（誰でも開ける。組織のポリシーで `allUsers` が止められても通る）。probe は既定（TCP）。
- 環境の値：`APP_ENV=production`・`APP_NAME`・`WEB_URL`・`API_HOST=0.0.0.0`・`API_PORT=8080`・`WEB_DIST_DIR=/app/apps/web/dist`・`LOG_LEVEL=info`・`TRUSTED_PROXY_HOPS=1`・`RATE_LIMIT_MAX=600`・`LINE_CHANNEL_IDS`・`ORGANIZER_LINE_USER_ID`・`OPEN_CHAT_URL`・`DATABASE_URL`（秘密）。
- 【仮決め】`WEB_URL` は Cloud Run の決まった形の URL（`https://kanaeru-<プロジェクト番号>.asia-northeast1.run.app`。公式の形 `https://[TAG---]SERVICE_NAME-PROJECT_NUMBER.REGION.run.app`）を、サービスを作る前に Terraform が組み立てる。サービスにはもう1つの URL（`*.a.run.app`）もあるが、そちらから開くと書く操作が源の確かめで 403 になるので、LINE のエンドポイントは `terraform output web_url` に合わせる。独自のドメインにしたら変数 `web_url` で上書きする。
- イメージは仮（`us-docker.pkg.dev/cloudrun/container/hello`・`.../job`）で作り、`ignore_changes` で GitHub Actions に任せる。`client`・`client_version` も無視する（gcloud が書く印）。

## R-8 夜間の停止・予算・置き場所の掃除

- Scheduler：`kanaeru-db-stop`（`0 0 * * *`）・`kanaeru-db-start`（`0 8 * * *`）、`Asia/Tokyo`、`PATCH https://sqladmin.googleapis.com/v1/projects/P/instances/I` に `{"settings":{"activationPolicy":...}}`、OAuth のトークン、再試行3回、`ignore_changes = [paused]`。
- 【仮決め】Scheduler の身分の役割は `roles/cloudsql.editor` ではなく、`cloudsql.instances.get`・`cloudsql.instances.update` だけの自前の役割（`kanaeruSqlActivation`）。
- 予算：月2,000円・50%と100%・宛先は既定（請求先アカウントの管理者と利用者）。【仮決め】`credit_types_treatment = "EXCLUDE_ALL_CREDITS"`（新規の300ドルのクレジットで0円に見える間も、本当の費用で知らせる）。
- 【仮決め】Artifact Registry の掃除：新しい10個を残し、それ以外で30日より古いものを消す。前は「新しい5つ・7日」だったが、デプロイが db:migrate などで5回落ちる（押し込んだイメージは数に入る）と、動いている版のイメージが7日で消えうる。最小0台なので、台が0から立ち上がるたびにイメージを読み、消えていると立ち上がれないことがある（自分の点検で直した）。無料の枠（0.5 GB）は超えうるが、超えた分は 1 GB あたり月 0.1 ドルほどで、予算（月2,000円）の中で小さい。動いている版のイメージにタグを付けて残す形は、デプロイの手順と権限が増えるので採らない。

## R-9 デプロイの流れ（deploy.yml）

- 流れる時：`main` への push で、`paths` に並べたもの（`apps/**`・`packages/**`・`package.json`・`pnpm-lock.yaml`・`pnpm-workspace.yaml`・`.node-version`・`Dockerfile`・`.dockerignore`・`deploy.yml`。`**/*.md` は除く）が変わったときと、手での実行。【仮決め】除く一覧より、並べる一覧のほうが「出すものが変わるときだけ」に近い（tests・e2e・infra・docs が変わっても出さない）。
- 時間帯：GitHub Actions は時刻で止められないので、最初の一歩で日本時間（`TZ=Asia/Tokyo`）を見て、**8時15分〜23時に始まったときだけ**進める。始まる時刻だけを見るので両端に余裕を持たせた（自分の点検で直した。前は「8時より前なら止める」だけで、23時55分に始まると db:migrate が0時の停止のあとになり、8時すぐに始まると起動中の DB に当たっていた）：8時15分は、8時に起こした DB が動き出すまでの数分。23時は、仕事の上限（`timeout-minutes: 30`）を足しても0時より前に終わる時刻。【仮決め】手での実行に `skip_hour_check`（交流会で停止を止めた夜だけ）。
- 変数の確かめ：`LIFF_ID` が空（空白だけも）なら、コンテナを作る前に止める（空のまま組み立てると、画面は LINE につながない仮の LIFF の形で黙って出る）。画面の題の `APP_NAME` はリポジトリの変数（任意。既定 `kanaeru`）から組み立ての引数に渡し、Terraform の `app_name`（Cloud Run の `APP_NAME`）とそろえる。
- 順番：変数の確かめ → checkout → auth（WIF・なりすまし）→ setup-gcloud → `docker build`（`VITE_LIFF_ID`・`APP_NAME`）と push（タグはコミットの SHA）→ `gcloud run jobs update --image` → `gcloud run jobs execute --wait` → `gcloud run services update --image` → `/api/v1/health` の確かめ。
- `concurrency: deploy-production`・`cancel-in-progress: false`。権限はいちばん外が `contents: read`、仕事だけ `id-token: write` を足す（`tests/security/ci-config.test.ts` を直して、deploy.yml の仕事の塊だけ許す）。
- リポジトリの変数（Secrets ではない）：`GCP_PROJECT_ID`・`GCP_REGION`・`GCP_WIF_PROVIDER`・`GCP_DEPLOYER_SA`・`LIFF_ID`・`APP_NAME`（任意）。
- 【仮決め】GitHub の environment（承認つき）は使わない（1人で回すので、承認はリリースの PR のマージで足りる）。
- 【仮決め】Dependabot に docker（Node の大きな版は除く）と terraform を足した。

## R-10 Terraform を動かす場所・state

- 手元から（`gcloud auth application-default login`）。GitHub Actions からは流さない（apply の場所を1つにする。AD-9 の「手で作るもの」以外は Terraform が持つ）。
- backend は GCS（`prefix = "kanaeru/prod"`）。バケットの名前はコミットせず `terraform init -backend-config="bucket=..."` で渡す【仮決め】。
- `.terraform.lock.hcl` は linux・darwin の amd64・arm64 の4つの指紋を入れてコミットした。

## つなぎ目（core-001 の続きの共通の PR との約束）

別のセッションが `kernel/config.ts`・`app.ts`（画面のファイルを返す）・notes を消す作業をしている。こちらは次の名前と場所を前提にした。違う名前にしたら、`infra/cloud_run.tf` の `service_env` と `Dockerfile` を合わせる。

| つなぎ目 | この仕様が決めたこと | 向こうに要ること |
|---|---|---|
| 画面のファイルの場所 | コンテナの `/app/apps/web/dist`。環境の値 `WEB_DIST_DIR`（Dockerfile の ENV と Cloud Run の両方） | `app.ts` が `WEB_DIST_DIR`（なければ手元の既定）から返し、`/api` 以外は `index.html` に戻す |
| LIFF ID | 組み立てのときに環境の値 `VITE_LIFF_ID`（docker の build-arg） | 画面のコードは環境の値を読めない（lint）ので、`vite.config.ts` の `define` で埋める |
| LINE とオープンチャットの設定 | `LINE_CHANNEL_IDS`（カンマ区切り）・`ORGANIZER_LINE_USER_ID`・`OPEN_CHAT_URL` を Cloud Run に渡す | `kernel/config.ts` で読み、確かめる |
| API の口 | `API_HOST=0.0.0.0`・`API_PORT=8080`（Cloud Run の `PORT` は読まない） | 今の `config.ts` のまま |
| DB の接続先 | R-4 の形（`@localhost/...?host=/cloudsql/...`） | 今の `config.ts` のまま通る（確かめた） |
| 接続のプール | 最大2台 | AD-8 の「1台あたり5本まで」は `kernel/db.ts` の `pg.Pool` の `max`（今は既定の10） |
| DB の変更 | `apps/api/scripts/migrate.ts`（drizzle-orm の migrator）が `apps/api/drizzle/` を当てる | notes を消す DB の変更も、ここから当たる |
| 夜間の停止 | 0時〜8時は DB に届かない | `DB_UNAVAILABLE`（503）の読みかえ |

## 確かめられなかったもの（作ったあとに確かめる）

- `terraform plan`・`apply`（GCP のプロジェクトがない）。最初の apply で API の有効化の順や、予算の権限で落ちたら、README の手順に足す。
- Scheduler から Cloud SQL Admin API への PATCH が通るか（`gcloud scheduler jobs run` で一度確かめる）。
- `roles/run.developer` で `gcloud run jobs execute --wait` まで通るか（最初のデプロイで確かめる）。
- 予算の通貨（請求先アカウントが円か）。
