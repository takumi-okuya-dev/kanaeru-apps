# Feature Specification: ステージングを足し、Cloud SQL を内部の IP だけにする（core-018）

**Feature Branch**: `feature/core-018-staging-private-db`（`develop` から切る。共通の PR：`infra/`・デプロイの流れ・文書）

**Created**: 2026-11-22

**Status**: Draft（主催者が決めた：ステージングは構成 B・あとで C にしやすい形・定期の仕事は両方の環境で動かす・Threads は両方で運営者だけ・Cloud SQL は内部の IP）

**Input**: [決めたことの記録](../../../docs/decisions.md) 2026-11-22・[置き場所の比べと料金の試算](../../../docs/hosting-cost.md) 7章・[バックログ](../../../docs/backlog.md) C3。本番はまだ作っていない（初めての apply の前）。

## Clarifications

### Session 2026-11-22

- Q: ステージングの形 → A: 構成 B。同じプロジェクトに Cloud Run（`kanaeru-stg`）をもう1つ置き、本番と同じ Cloud SQL のサーバーの中の別の DB（`kanaeru_stg`）を使う。`develop` のマージで出す（R1）
- Q: あとで C（別のプロジェクト）に移しやすくするには → A: 環境ごとの資源を Terraform の部品（`infra/modules/environment`）にまとめ、共通の資源（ネットワーク・Cloud SQL のサーバー・イメージの置き場・WIF）は呼ぶ側に置く（R1）
- Q: 定期の仕事 → A: 両方の環境で動かす。二重投稿（同じ Threads のアカウント）・本物の参加者への知らせ・DB の接続の数・LIFF は手当てする（R4）
- Q: アプリの公開 → A: Threads は両方の環境で「運営者だけ」、ほかは「公開」。台帳（設定 → アプリの台帳）で決めるので、この PR ではコードを変えない（デプロイのあとの手順に書く）
- Q: Cloud SQL のつなぎ方 → A: 内部の IP だけ。Cloud Run は Direct VPC egress（サーバー代なし）で VPC に出て、TCP でつなぐ（R2・R3）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - develop のマージでステージングに出し、本番の前に確かめる (Priority: P1)

主催者として、`develop` にマージした変更を、本物の GCP と LINE の上（ステージング）で確かめてから、`main` に出したい。

**Acceptance Scenarios**:

1. **Given** `terraform.tfvars` に `production` と `staging`, **When** apply, **Then** 本番（`kanaeru`）とステージング（`kanaeru-stg`）の Cloud Run・DB・秘密・身分ができ、同じ Cloud SQL のサーバーの中の別の DB を使う
2. **Given** `staging = null`, **Then** ステージングの資源は作らない
3. **Given** `develop` に push, **When** deploy の流れ, **Then** GitHub の環境 `staging` の変数で、ステージングにだけ出る。`main` なら `production` で本番にだけ出る
4. **Given** `develop` から入った GitHub Actions, **Then** 本番のデプロイの身分になりすませない（`main` も同じく、ステージングの身分になりすませない）
5. **Given** ステージングの `booking_notify_mode = "on"`, **Then** plan で止まる
6. **Given** ステージングに何度出す, **Then** 本番の動いている版のイメージは古いイメージの掃除で消えない（イメージの名前を環境で分ける）

### User Story 2 - Cloud SQL を内部の IP だけにする (Priority: P1)

運営者として、夜に DB を止めている間の公開の IP の料金をなくし、DB をインターネットから見えなくしたい。

**Acceptance Scenarios**:

1. **Given** apply, **Then** Cloud SQL は公開の IP を持たず、内部の IP だけを持つ
2. **Given** Cloud Run のサービスと DB の変更を当てる job, **Then** Direct VPC egress で VPC に出て（内部の宛先だけ）、`DATABASE_URL`（内部の IP・`sslmode=no-verify`）でつなぐ
3. **Given** LINE・Threads などの外の API, **Then** 今までどおり直に出る（VPC を通さない）

## Requirements *(mandatory)*

- **FR-001**: `infra/modules/environment`：DB と DB の利用者・秘密の値・身分と権限・Cloud Run のサービスと job・共通の定期の仕事（core-017）を、環境の名前（`kanaeru`・`kanaeru-stg`）で作る部品。
- **FR-002**: `infra/`：共通の資源（`network.tf`〈VPC・サブネット・プライベート サービス アクセス〉・`cloud_sql.tf`〈内部の IP だけ〉・`wif.tf`〈main と develop〉・`artifact_registry.tf`・`scheduler.tf`〈夜間の停止〉・`budget.tf`）と、2つの環境を呼ぶ `environments.tf`。変数は `production`・`staging`（null なら作らない）。
- **FR-003**: デプロイの身分は環境ごと。書く権限は、その環境の Cloud Run のサービスと job の単位で付ける。WIF のなりすましはブランチ（`refs/heads/main`・`refs/heads/develop`）で分ける。
- **FR-004**: `.github/workflows/deploy.yml`：`main`・`develop` の push で、GitHub の環境（`production`・`staging`）の変数を使って出す。イメージの名前は `app-<環境>`。
- **FR-005**: `infra/tests/plan.tftest.hcl`：模擬のプロバイダで組み上がりを確かめる（両方・ステージングなし・ステージングで知らせを on にすると止まる）。
- **FR-006**: 文書：`infra/README.md`（0・1・4〜7・9〜11章）・構成の決めごと AD-8・AD-11・`docs/rules/development-flow.md` 5章・`docs/decisions.md`・バックログ C3。

## Success Criteria *(mandatory)*

- **SC-001**: `terraform fmt -check`・`terraform validate`・`terraform test` が通る。
- **SC-002**: `pnpm check` が通る（アプリのコードは変えない）。
- **SC-003**: 初めての apply とデプロイで、両方の環境の `/api/v1/health` が答える（手順は `docs/first-release.md`。この PR のあと直す）。
