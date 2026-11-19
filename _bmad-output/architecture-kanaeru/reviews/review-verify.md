# 確かめの見直し（review-verify）— architecture-kanaeru

- 見直した日：2026-11-19
- 観点：決めごとの1つ1つが、学習データの記憶ではなく、ウェブ・いまのプロジェクト・npm などで確かめられているか。古くなっていそうなもので確かめていないものはないか。
- 対象：`../architecture-kanaeru.md`（以下「spine」）と `../.memlog.md`
- いまのプロジェクトとの照合先：`package.json`・`apps/api/package.json`・`apps/web/package.json`・`pnpm-lock.yaml`・`docker-compose.yml`・`apps/api/src/modules/notes/schema.ts`
- memlog で 2026-11-19 に確認済みの項目（Hono・Drizzle・Vite・React・pg・@line/liff・Terraform google provider・Node 26・LINEミニアプリ推奨・verify の窓口・Cloud Run 東京の無料枠など）は、npm・レジストリで数値だけもう一度当てた。

## 判定

**条件つきで通る（直しが要る）。** 版の数字はすべていまのプロジェクト・npm と合っていた。PostgreSQL 18 も Cloud SQL で選べ、既定の版になっている。ただし次の2つは、このまま Terraform を書くと**事故か費用の大きな見誤り**になる。

1. **Cloud SQL の「エディション」が spine にない。** PostgreSQL 16 以上は、API（＝Terraform）でエディションを書かないと **Enterprise Plus** になる。Enterprise Plus では一番小さい台（共有コアの `db-f1-micro`・`db-g1-small`）が選べず、apply が 400 で落ちるか、高い台を選ぶことになる。`edition = "ENTERPRISE"` を決めごとに書く必要がある。
2. **夜間停止と Terraform がぶつかる。** Scheduler が `activationPolicy` を `NEVER` に変えると、Terraform の状態とずれる。夜間に `terraform apply`（またはデプロイ）が走ると DB が起き、昼に走ると止めた設定が戻る。`ignore_changes` を決めごとに入れる必要がある。

## 項目ごとの結果

凡例：✅ 確かめた（合っている）／⚠️ 確かめた（spine の直しが要る）／❌ 食い違い／❓ 確かめられなかった

### 1. Stack の版（いまのプロジェクト・npm と照合）

| spine の Stack | いまのプロジェクト | npm の最新（2026-11-19） | 判定 |
|---|---|---|---|
| Node.js 26（Active LTS） | `engines: >=26.13 <27`・`devEngines 26.13.1` | v26.13.1（2026-11-10、LTS「Lithium」） | ✅ |
| TypeScript 6 | `typescript: 6.0.3`（固定） | **latest は 7.0.2**（6 系の最後は 6.0.3） | ⚠️ 下を見る |
| Hono 4.13 | `^4.13.19` | 4.13.19 | ✅ |
| @hono/node-server 2.1 | `^2.1.8`（lock は 2.1.9） | 2.1.9 | ✅ |
| Drizzle ORM 0.45 | `^0.45.4` | 0.45.4 | ✅ |
| drizzle-kit 0.31 | `^0.31.11` | 0.31.11 | ✅ |
| pg 8.23 | `^8.23.1` | 8.23.1 | ✅ |
| Vite 8.3 | `^8.3.8` | 8.3.8 | ✅ |
| React 19.3 | `^19.3.1` | 19.3.1 | ✅ |
| @line/liff 2.32（2.31.1 未満は使わない） | まだ入っていない | 2.32.0（2026-11-09 公開。2.31.1 は 2026-09-30） | ✅（入れるときに `^2.32.0`） |
| PostgreSQL（Cloud SQL）18 | `docker-compose.yml`・CI とも `postgres:18` | Cloud SQL で 18 が GA・既定 | ✅（2章） |
| Terraform google provider 8.12 | まだない | 8.12.0（registry.terraform.io） | ✅ |
| google-github-actions/auth v3 | まだない | v3（GitHub の latest release） | ✅ |

**TypeScript 6 について（⚠️）**
- TypeScript 7.0（Go で書き直したもの）は 2026-07〜08 に正式版が出ており、npm の `latest` は 7.0.2。spine の「6」は、知らずに古いものを選んだように読める。
- ただし、いまのプロジェクトは `typescript-eslint` 8.73 を使っていて、その `peerDependencies` は `typescript: >=4.8.4 <6.1.0`（npm で確認）。7.0 は安定したプログラムからの API がなく、7.1 待ちと報じられている。**6 に留まるのは正しい判断**。
- 直し：Stack の TypeScript を「6.0（7.0 は出ているが typescript-eslint が `<6.1` までなので 6 に留める。7.1 で API が出たら見直す）」とし、memlog にもこの理由を残す。
- 出典：https://www.infoq.com/news/2026/08/typescript-7-released/ ／ https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/ ／ `npm view typescript dist-tags`・`npm view typescript-eslint peerDependencies`

**Stack に足りないもの（小さい）**
- いまのプロジェクトにあって、spine の約束で使っているのに Stack にないもの：zod 4.6（選択肢の列挙）・TanStack Query 5（一覧画面の5秒の読み直し）・TanStack Router 1・Tailwind 4・pnpm 12.21。直し：Stack に足す（版はプロジェクトの package.json のまま）。

### 2. Cloud SQL for PostgreSQL の版 — ✅（spine の【仮決め】は確定にしてよい）

- Cloud SQL の版の一覧で、**PostgreSQL 18 は既定の版**（最新のマイナーは 18.6。通常サポートの開始は 2025-09-25）。release notes では 2025-12-16 に GA。
- いまのプロジェクトは主キーに `uuidv7()` を使う（`apps/api/src/modules/notes/schema.ts`、spine の Consistency Conventions）。`uuidv7()` は PostgreSQL 18 で入った関数なので、**18 は「最新に合わせる」ではなく必須**。
- 直し：Stack の PostgreSQL を「18（`uuidv7()` を使うので 18 未満にはしない。Terraform では `database_version = "POSTGRES_18"` と明記）」にし、【仮決め】を外す。
- 出典：https://docs.cloud.google.com/sql/docs/postgres/db-versions ／ https://docs.cloud.google.com/sql/docs/postgres/release-notes

### 3. 一番小さい台・エディション・料金 — ⚠️（spine の直しが要る。今回いちばん大事）

**エディションの既定（⚠️ 重大）**
- Google の文書：gcloud と Cloud SQL Admin API でエディションを書かないとき、`POSTGRES_16`・`POSTGRES_17`・`POSTGRES_18` は **Enterprise Plus** が既定。コンソールでも Enterprise Plus が先に選ばれている。
- 共有コア（`db-f1-micro`：1 vCPU・0.614 GB、`db-g1-small`：1 vCPU・1.7 GB）は **Enterprise エディションだけ**。Enterprise Plus は N2・C4A・C4・C4D の台だけ。
- Terraform の google provider は、以前は手元で `ENTERPRISE` を既定にしていたが、それを外した。いまは書かないと API の既定（Enterprise Plus）になり、`Invalid Tier (db-g1-small) for (ENTERPRISE_PLUS) Edition` で apply が落ちる。この旨の文書の直しは magic-modules PR #18014（2026-06-24 merge）。
- spine の AD-8 は「一番小さい台数」とだけ書いていて、エディションも台の名前もない。
- 直し：AD-8 の Rule に「`edition = "ENTERPRISE"`・`tier = "db-f1-micro"`（足りなければ `db-g1-small`）・`database_version = "POSTGRES_18"` を Terraform に明記する。Enterprise Plus にしない」を足す。あわせて「一番小さい台数」を「一番小さい台（共有コア）」に言い直す（「台数」は Cloud Run の最小の台数と紛らわしい）。
- 出典：https://docs.cloud.google.com/sql/docs/postgres/editions-intro ／ https://docs.cloud.google.com/sql/docs/postgres/machine-series-overview ／ https://github.com/GoogleCloudPlatform/magic-modules/pull/18014 ／ https://docs.cloud.google.com/sql/docs/postgres/instance-settings

**共有コアはまだあるか（✅、ただし注意つき）**
- 2026-11 時点で、Enterprise エディションの「General purpose shared core」として残っている。廃止の告知は見つからなかった。
- 共有コアは Cloud SQL の SLA の対象外。小さい集まり（一晩の受付）には問題ないが、spine の Deferred か AD-8 に「SLA なし」を一言書いておくとよい。
- 出典：https://docs.cloud.google.com/sql/docs/postgres/machine-series-overview ／ https://cloud.google.com/sql/docs/postgres/pricing （SLA の注）

**東京の料金（❓ 公式の数字は取れなかった）**
- 公式の料金ページは中身が JavaScript で出るため読めなかった。第三者（Bytebase、2026 年の表）では `db-f1-micro`・PostgreSQL・Enterprise・東京で **約 $10/月（730 時間つけっぱなし）**。
- 停止中の請求（✅ 公式）：「止めると台の料金は止まる。データはそのまま。**ストレージと IP アドレスの料金は続く**」。
- memlog の「運用費の目安は月1,000円ほど」をこの数字でざっと積むと：台 $10 × 16/24 ≒ $6.7 ＋ SSD 10 GB（第三者の数字で $0.17〜0.22/GB・月、東京はもう少し高い）≒ $2 前後 ＋ 停止中の IP（第三者の数字で $0.01/時 前後 × 約240時間 ≒ $2.4。止まっている間に「使っていない IP」として課金されるかは未確認）＋ バックアップ。**合計 $10〜12/月前後で、1,000円より上（為替しだいで 1,500〜1,800円ほど）になりそう**。為替は確かめていない。
- 直し：memlog の目安を「月 1,500〜2,000円ほど（台 約$10/月の 2/3 ＋ ストレージ ＋ IP。数字は第三者の表。最初の請求で確かめる）」に直す。spine には費用の数字を書いていないので spine 本文の直しは不要。Terraform を当てる前に料金計算ツール（https://cloud.google.com/products/calculator ）で東京を選んで確かめる。
- 出典：https://docs.cloud.google.com/sql/docs/postgres/start-stop-restart-instance ／ https://www.bytebase.com/dbcost/cloudsql/instance/db-f1-micro/ ／ https://www.bytebase.com/blog/understanding-google-cloud-sql-pricing/

**接続の上限（❓ 公式の表はなかった）**
- 第三者の記事では `db-f1-micro` の `max_connections` の既定は 25、`db-g1-small` は 50。Google の quotas の頁は「台の大きさで決まる」とだけ書いて表を出していない。
- Cloud Run 側は「1つの容器から Cloud SQL へは 100 接続まで」（公式）。`pg` の Pool の既定は 10。Cloud Run の台数が 3 になると 30 で、25 を越えうる。
- 直し：AD-8 か Consistency Conventions に「`pg` の Pool の `max` を小さく（例：5）し、Cloud Run の最大の台数も絞る（例：3）。実際の値は作ったあと `SHOW max_connections;` で確かめる」を足す。
- 出典：https://dev.to/gleb_otochkin/demystifying-max-connections-limit-in-cloud-sql-for-postgresql-55o6 ／ https://docs.cloud.google.com/sql/docs/postgres/connect-run

### 4. Cloud SQL の停止と課金 — ✅

- 公式：「Stopping an instance suspends instance charges. … charges for storage and IP addresses continue to apply.」止めるのは `activationPolicy: NEVER`、動かすのは `ALWAYS` を `PATCH .../instances/INSTANCE` で送る。
- 起動にかかる時間は公式には書かれていない（数分かかることがある、と見込んでおく）。8時の起動のあと、すぐの利用はつらいかもしれない。
- 直し：AD-10 に「止めても、ストレージと IP の料金はかかる（台の料金だけが止まる）」を一言足す。費用の目安（3章）と合わせる。
- 出典：https://docs.cloud.google.com/sql/docs/postgres/start-stop-restart-instance

### 5. Cloud Scheduler から Cloud SQL Admin API を直接呼ぶ — ✅（形は合っている。Terraform との衝突は ⚠️）

- 公式：Scheduler の HTTP のターゲットは、`*.googleapis.com` の Google API には **OAuth トークン**を使う（OIDC ではない）。`PATCH` と本文も送れる。サービスアカウントには、呼ばれる側の権限（ここでは `cloudsql.instances.update` を持つ役割、例：`roles/cloudsql.editor`）と、Scheduler の設定をする人の `iam.serviceAccounts.actAs` が要る。
- `sqladmin.googleapis.com/v1/projects/P/instances/I` に `{"settings":{"activationPolicy":"NEVER"}}` を PATCH する形は、上の2つの公式の頁を組み合わせると成り立つ。Google の「この組み合わせのチュートリアル」そのものは見つからなかった（以前の公式例は Cloud Functions ＋ Pub/Sub 経由）。間に関数を挟まないこの形は**関数を作らずに済むので spine の方針に合う**。
- ⚠️ **Terraform のずれ**：Terraform の `google_sql_database_instance` は `settings.activation_policy` を持つ。Scheduler が夜に `NEVER` にすると、次の `terraform plan` に差分が出て、apply で `ALWAYS` に戻る（夜間に起きる）。直し：AD-9 か AD-10 に「Cloud SQL の資源では `lifecycle { ignore_changes = [settings[0].activation_policy] }` にし、止める・動かすは Scheduler だけが持つ」を足す。
- Scheduler の無料枠（課金アカウントごとに3つ）は、公式の料金頁が読めず ❓。使うのは2つ（0時・8時）なので、仮に有料でも月 $0.2 程度。
- 出典：https://docs.cloud.google.com/scheduler/docs/http-target-auth ／ https://docs.cloud.google.com/sql/docs/postgres/start-stop-restart-instance ／ https://cloud.google.com/scheduler/pricing （中身は読めず）

### 6. Cloud Run の組み込みの Cloud SQL 接続と `pg` — ✅（公開 IP の前提を書く）

- 公式：`--add-cloudsql-instances`（Terraform では Cloud Run v2 の `cloud_sql_instance` のボリューム）で、`/cloudsql/PROJECT:REGION:INSTANCE` に Unix ソケットが出る。暗号化は自動。サービスアカウントに **Cloud SQL Client** の役割が要る。
- **この接続は Cloud SQL の公開 IP が前提**（公式：「インスタンスに公開 IP があることを確かめる」。非公開 IP なら Direct VPC egress かコネクタが要る）。spine の AD-8 は VPC のつなぎ口を禁じているので、結果として「公開 IP あり・承認済みネットワークなし」になる。これは書いていない。
- `pg` は `host: '/cloudsql/PROJECT:REGION:INSTANCE'` で Unix ソケットにつながる（node-postgres の公式頁に Cloud SQL の形の例がある）。`DATABASE_URL` 1本で持つなら `postgresql://USER:PASS@/DB?host=/cloudsql/...` の形になるが、この URL の形は pg の頁では確かめられなかった（❓ 作り始めに手元で試す）。
- 直し：AD-8 に「Cloud SQL は公開 IP を持つが、承認済みネットワークは空にし、つなぐのは Cloud Run の組み込みの接続（Cloud SQL Client の役割）だけ」を足す。Consistency Conventions の設定の行に「本番の `DATABASE_URL` は Unix ソケットの形（`?host=/cloudsql/...`）。だめなら `PGHOST` などに分ける」を足す。
- 出典：https://docs.cloud.google.com/sql/docs/postgres/connect-run ／ https://node-postgres.com/features/connecting

### 7. Cloud Run jobs で DB の変更を当てる（AD-11）— ✅（夜間との衝突は ⚠️）

- `gcloud run jobs deploy` に `--set-cloudsql-instances` があり、`--wait`（＝`--execute-now` を含む）で終わるまで待てる。既定はタスクの時間切れ 10 分・再試行 3 回。
- 既知の問題：組み込みの Cloud SQL 接続は**複数の容器の job では使えない**（`/cloudsql` が出ない）。spine は1つの容器なので当たらない。
- ⚠️ **夜間停止との衝突**：0時〜8時は DB が止まっているので、その間に main に入れるとデプロイの `db:migrate` が落ちる（再試行 3 回も無駄に回る）。直し：AD-11 に「夜間（0時〜8時）は DB が止まっているのでデプロイは失敗する。その時間に出すときは手で起こしてから」、または「deploy.yml の最初に DB が `RUNNABLE` かを確かめ、止まっていれば止める」を足す。
- 直し（小）：job の `--max-retries` は 0〜1 にする（DB の変更を3回当て直さない）。
- 出典：https://docs.cloud.google.com/sdk/gcloud/reference/run/jobs/deploy ／ https://docs.cloud.google.com/run/docs/create-jobs ／ https://docs.cloud.google.com/run/docs/known-issues

### 8. LINEミニアプリを PC の外のブラウザでログインできるか（Deferred）— ✅（文書上はできる。Deferred を狭めてよい）

- 公式：「2025年10月から、LINEミニアプリは外のブラウザで使える」。外のブラウザでは `liff.init()` だけではログインしないので、`liff.isLoggedIn()` を見て `liff.login()` を呼ぶか、`liff.init({ withLoginOnExternalBrowser: true })` にする。
- LIFF の API リファレンス：`liff.login()` は「LINE の中のブラウザまたは外のブラウザでログインする」。ログインのあと `liff.getIDToken()` で ID トークンが取れる（`openid` のスコープが要る。トークンは1時間で切れる）。**つまり AD-4 の確かめ方はそのまま PC でも使え、spine の「使えなければ LINE ログインの Web の流れを足す」は、たぶん要らない。**
- 気をつける点（公式）：`liff.login()` の `redirectUri` は**エンドポイント URL で始まらないと失敗する**。管理の画面が `/admin` などにあるなら、エンドポイント URL を源の直下（`https://<Cloud Run の URL>/`）にしておく必要がある。外のブラウザでは `liff.sendMessages()`・`liff.closeWindow()`・`liff.openWindow()` などが使えない。また LINE は「外のブラウザでは LINE ログインなしでも動くようにする」ことを求めている（参加者向けの画面の作りに影響）。
- 未認証ミニアプリに外のブラウザの制限があるかは、文書に書かれていなかった（❓ 実地で確かめる）。
- 直し：Deferred の「PC で管理の画面を開くときのログイン」を「文書上は `liff.login()`（または `withLoginOnExternalBrowser: true`）で PC でもログインでき、`liff.getIDToken()` も取れる。未認証ミニアプリでも同じかを作り始めに確かめる」に直す。AD-4 か Structural Seed に「ミニアプリのエンドポイント URL は源の直下にする（`redirectUri` の制約）」を足す。
- 出典：https://developers.line.biz/en/docs/line-mini-app/develop/external-browser/ ／ https://developers.line.biz/en/reference/liff/ ／ https://developers.line.biz/en/tips/2026/08/06/between-liff-browser-and-external-browser/

### 9. GCP の新しいアカウントの 300 ドルの無料トライアル — ✅（期間に注意）

- 公式：新しい顧客は 300 ドルのクレジット、**90 日間**（使い切るか 90 日たつか、早い方で終わる）。延ばせない。期限の前に有料のアカウントにしないと、課金アカウントが閉じられ資源が止まる。トライアル中は無料枠の分はクレジットから引かれない。対象は、Google Cloud・Maps・Firebase で支払ったことがない人。
- memlog の「最初の数か月は実質0円」は、**最大 3 か月（90 日）**で、交流会（2026-11-25）からだと 2027-02 ごろで終わる。主催者のアカウントが対象か（過去に Firebase の Blaze などで支払っていないか）は確かめていない（❓）。
- ⚠️ 3章のエディションの罠で Enterprise Plus の台ができると、300 ドルが数週間で減る。
- 直し：memlog の「初回の300ドルクレジットがあれば最初の数か月は実質0円・要確認」を「新しい顧客なら 90 日・300 ドル。90 日のうちに有料に切り替えないと資源が止まる。予算の通知（Budget alert）を Terraform で作る」に直す。予算の通知は AD-9 の Terraform の一覧に足すとよい。
- 出典：https://cloud.google.com/free-trial/ ／ https://docs.cloud.google.com/free

### 10. memlog で確かめ済みの項目の当て直し — ✅

- @line/liff：2.32.0 が最新（2026-11-09）。2.31.1 は 2026-09-30 公開。memlog と合う。
- Node 26：26.13.0（2026-10-28）から LTS。26.13.1 が最新。memlog・package.json と合う。
- Terraform google provider 8.12.0・google-github-actions/auth v3：最新と合う。
- 出典：`npm view`・https://nodejs.org/dist/index.json ・https://registry.terraform.io/v1/providers/hashicorp/google ・https://github.com/google-github-actions/auth/releases

## spine の直しのまとめ（優先順）

1. **AD-8**：`edition = "ENTERPRISE"`・`tier = "db-f1-micro"`（足りなければ `db-g1-small`）・`database_version = "POSTGRES_18"` を明記。Enterprise Plus にしない。公開 IP あり・承認済みネットワークなし・つなぐのは組み込みの接続だけ。共有コアは SLA なし。Pool の `max` と Cloud Run の最大の台数を絞る。
2. **AD-9／AD-10**：Cloud SQL の資源は `ignore_changes = [settings[0].activation_policy]`。止めてもストレージと IP の料金は続く。Scheduler は OAuth トークンで `sqladmin.googleapis.com` に PATCH。予算の通知を Terraform に足す。
3. **AD-11**：夜間（0時〜8時）はデプロイの `db:migrate` が落ちる。その時の扱いを決める。job の再試行は 0〜1。
4. **Stack**：TypeScript は「6.0（7.0 は出ているが typescript-eslint が `<6.1` までのため）」。PostgreSQL 18 は `uuidv7()` のため必須にして【仮決め】を外す。zod・TanStack Query/Router・Tailwind・pnpm を足す。
5. **Deferred**：PC のログインは文書上できる（`liff.login()`／`withLoginOnExternalBrowser`）。未認証ミニアプリでの実地確認だけを残す。エンドポイント URL は源の直下に。
6. **memlog**：運用費の目安を月 1,500〜2,000円ほどに直す（第三者の数字。料金計算ツールと最初の請求で確かめる）。300 ドルは 90 日まで。

## 確かめられなかったもの（作り始めに実地で確かめる）

- Cloud SQL・東京の公式の料金（台・ストレージ・IP）。料金計算ツールで確かめる。
- 停止中に IP の料金がどれだけかかるか（公式は「続く」とだけ）。
- `db-f1-micro` の `max_connections` の実際の値（`SHOW max_connections;`）。
- `pg` の接続文字列 `?host=/cloudsql/...` の形が通るか。
- Cloud Scheduler の無料枠（3 つ）の今の扱い。
- 未認証ミニアプリで、外のブラウザ（PC）の `liff.login()` が使えるか。
- 主催者の Google アカウントが 300 ドルのトライアルの対象か。
- 為替（円の目安はすべて仮の換算）。
