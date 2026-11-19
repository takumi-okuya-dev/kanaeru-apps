# Implementation Plan: インフラとデプロイ

**Branch**: `feature/core-002-infra`（予定） | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/core/002-infra/spec.md`

## Summary

本番の置き場所（AD-8〜AD-11）を作る。1つのコンテナ（`Dockerfile`）が画面と `/api` を返し、同じコンテナで DB の変更を当てる。GCP の資源は `infra/` の Terraform で持ち、`main` へのマージで GitHub Actions（`.github/workflows/deploy.yml`）が コンテナ → db:migrate → 新しい版 の順に出す。決めた理由は [research.md](./research.md)。

## Technical Context

**Language/Version**: HCL（Terraform 1.11 以上・google プロバイダ `~> 8.12`・random `~> 3.9`）・Dockerfile（BuildKit）・GitHub Actions の YAML・TypeScript 6（`apps/api/scripts/migrate.ts` だけ）

**Primary Dependencies**: Node.js 26.13.1・pnpm 12.21.0・drizzle-orm 0.45（migrator）・google-github-actions/auth v3.0.0・setup-gcloud v3.0.1

**Storage**: Cloud SQL for PostgreSQL 18（ENTERPRISE・db-f1-micro・東京）。state は GCS（手で作る）

**Testing**: `terraform fmt -check`・`terraform validate`（Docker）・actionlint（Docker）・`tests/security/ci-config.test.ts`（Vitest）・Docker でコンテナを作り、Unix ソケットの PostgreSQL に migrate と API の起動を当てる

**Target Platform**: GCP asia-northeast1（Cloud Run・Cloud SQL・Artifact Registry・Secret Manager・Cloud Scheduler・Billing Budgets）・GitHub Actions（ubuntu-latest）

**Project Type**: Web サービスの置き場所とデプロイ

**Performance Goals**: 交流会の受付の山（数十人が数分に集まる）を最大2台で受ける

**Constraints**: 月2,000円以内（Constitution V）・DB は夜間0時〜8時に止まる・鍵を置かない・秘密を state に残さない

**Scale/Scope**: 環境は本番の1つ。資源はおよそ30

## Constitution Check

| 原則・制約 | 確かめ | 結果 |
|---|---|---|
| I. お金を預からない | 決済の部品を足さない | ✅ |
| II. 個人の情報は最小限 | ログは pino の JSON を標準出力（Cloud Logging）。DB のパスワードは state にも残さない | ✅ |
| III. 交流会では気軽さ | 最大2台・最小0（コールドスタートは「主催者が先に開く」。Deferred） | ✅ |
| IV. 小さく始める | 環境は本番だけ。モジュール・ロードバランサ・VPC を作らない | ✅ |
| V. 運用費はゼロに近づける | db-f1-micro・夜間停止・予算の知らせ・イメージの掃除・要求の間だけ CPU | ✅ |
| 技術スタック制約（GCP 東京・Terraform・Cloud SQL ENTERPRISE） | AD-8・AD-9 のとおり | ✅ |
| 構成の決めごと AD-9「Direct WIF」 | Cloud Run が対応していないため、WIF＋サービスアカウントのなりすまし（鍵なし）にした | ⚠️ 外れ（下の表・R-2） |

設計のあとの見直し：同じ（外れは1つだけ。鍵を置かないという目的は守れている）。

## Project Structure

### Documentation (this feature)

```text
specs/core/002-infra/
├── spec.md
├── plan.md
├── research.md          # 決めた理由・仮決め・core-001 とのつなぎ目
├── quickstart.md        # 確かめの手順・手で行う残り・全体の形に足す文
├── contracts/
│   └── deploy-interface.md   # コンテナ・環境の値・リポジトリの変数の約束
├── checklists/requirements.md
└── tasks.md
```

data-model.md は作らない（表を足さない。GCP の資源の一覧は `infra/README.md` 0 と contracts）。

### Source Code (repository root)

```text
Dockerfile                    # 多段：base → web・api → runtime
.dockerignore
apps/api/scripts/migrate.ts   # 本番の db:migrate（drizzle-orm の migrator）
infra/
├── versions.tf  variables.tf  locals.tf  outputs.tf
├── apis.tf  artifact_registry.tf  cloud_sql.tf  secrets.tf
├── service_accounts.tf  wif.tf  cloud_run.tf  scheduler.tf  budget.tf
├── terraform.tfvars.example  .terraform.lock.hcl  .gitignore
└── README.md                 # 初めての手順（日本語）
.github/workflows/deploy.yml
.github/dependabot.yml        # docker・terraform を足す
tests/security/ci-config.test.ts   # deploy.yml の守りを足す
docs/README.md                # 3章に infra/README.md を1行
```

**Structure Decision**：Terraform は環境が1つなのでモジュールを作らず、資源の種類ごとのファイルに分ける（[Terraformの学び](../../../docs/study/terraform.md) 6.1 の案）。`apps/`・`packages/` は別のセッションが直しているので、新しいファイル（`migrate.ts`）を1つ足すだけにする。`docs/architecture.md` は向こうも直すのでこの PR では触らず、足す文を [quickstart.md](./quickstart.md) 4 に置く。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| AD-9 の Direct WIF をやめ、デプロイ用のサービスアカウントを1つ足す | Cloud Run が WIF の直の権限に対応していない（Google の文書） | Direct WIF のままでは Cloud Run を更新できない。鍵は漏れる |
| `apps/api/scripts/migrate.ts` を足す（共通の API のフォルダ） | 本番のコンテナに開発の道具を入れずに db:migrate を当てる | drizzle-kit を入れると 610 MB（294 MB の2倍）で、lint・テストの道具も入る |
