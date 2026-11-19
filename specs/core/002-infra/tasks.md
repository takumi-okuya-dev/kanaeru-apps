# Tasks: インフラとデプロイ（core-002）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[contracts/deploy-interface.md](./contracts/deploy-interface.md)・[quickstart.md](./quickstart.md)

**Tests**: 新しい守り（deploy.yml）は `tests/security/ci-config.test.ts` に足す。Terraform と workflow は fmt・validate・actionlint で確かめる。

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 仕様のフォルダ `specs/core/002-infra/` に spec・plan・research・contracts・quickstart を置く
- [x] T002 [P] Terraform の置き場所と、コミットしないものを決める `infra/.gitignore`

## Phase 2: Foundational（どの話にも要る）

- [x] T003 版・backend（GCS。バケットは init で渡す）・provider を書く `infra/versions.tf`
- [x] T004 [P] 変数と見本を書く `infra/variables.tf`・`infra/terraform.tfvars.example`
- [x] T005 [P] 共通の値（名前・WEB_URL・イメージの置き場所）を書く `infra/locals.tf`
- [x] T006 使う API を有効にする `infra/apis.tf`

## Phase 3: User Story 1 — 本番の置き場所を作れる (P1) 🎯 MVP

**Goal**：手で作るもの以外の資源を Terraform で作れる。秘密は state に残らない。
**Independent Test**：`terraform fmt -check`・`validate` が通る（quickstart 1）。

- [x] T007 [P] [US1] イメージの置き場所と掃除の決まり `infra/artifact_registry.tf`
- [x] T008 [P] [US1] Cloud SQL（ENTERPRISE・db-f1-micro・POSTGRES_18・バックアップ・3段の守り・activation_policy の無視）と DB・利用者 `infra/cloud_sql.tf`
- [x] T009 [US1] ephemeral のパスワードと、書くだけの欄で DATABASE_URL の秘密 `infra/secrets.tf`
- [x] T010 [US1] 身分（run・deployer・db-scheduler）と最小の権限・自前の役割 `infra/service_accounts.tf`
- [x] T011 [US1] Cloud Run のサービス（最大2・環境の値・秘密・Unix ソケット・イメージの無視）と migrate の job `infra/cloud_run.tf`
- [x] T012 [P] [US1] 出力（web_url・github_variables など） `infra/outputs.tf`
- [x] T013 [US1] 本番のコンテナ（多段・非 root・開発の依存なし） `Dockerfile`・`.dockerignore`
- [x] T014 [US1] 本番の db:migrate（drizzle-orm の migrator） `apps/api/scripts/migrate.ts`
- [x] T015 [US1] 初めての手順（プロジェクト・請求・state・LINE・作成・変数） `infra/README.md`
- [x] T016 [US1] fmt・validate・プロバイダの指紋（4つの台）を流し、`infra/.terraform.lock.hcl` を置く
- [x] T017 [US1] Docker で、Unix ソケットの PostgreSQL 18 に migrate（2回）と API の起動を当てる（quickstart 1）

## Phase 4: User Story 2 — main のマージで出る (P1)

**Goal**：main への push と手での実行で、コンテナ → db:migrate → 新しい版。
**Independent Test**：actionlint と `pnpm exec vitest run --project security` が通る。

- [x] T018 [US2] WIF（このリポジトリの main だけ）と deployer へのなりすまし `infra/wif.tf`
- [x] T019 [US2] デプロイの流れ（paths・時間帯・変数の確かめ・auth・build と push・job の更新と実行・サービスの更新・health） `.github/workflows/deploy.yml`
- [x] T020 [US2] deploy.yml の仕事の塊だけ `id-token: write` を許し、守り（main だけ・取り消さない・WIF・順番）を確かめる `tests/security/ci-config.test.ts`
- [x] T021 [P] [US2] Dependabot に docker と terraform を足す `.github/dependabot.yml`

## Phase 5: User Story 3 — 費用を守る (P2)

**Goal**：夜間の停止と予算の知らせ。
**Independent Test**：validate が通る。作ったあと quickstart 2 の表。

- [x] T022 [P] [US3] 0時の停止・8時の起動（OAuth・paused の無視） `infra/scheduler.tf`
- [x] T023 [P] [US3] 月2,000円・50%と100%（クレジットを引く前の額） `infra/budget.tf`

## Phase 6: Polish

- [x] T024 [P] 文書の一覧の3章に `infra/README.md` を1行足す `docs/README.md`
- [x] T025 全体の形に足す文を quickstart 4 に置く（`docs/architecture.md` は別のセッションとぶつかるので触らない）
- [x] T026 lint・整形・型・security のテストを流す（結果は PR に書く）

## 手で行う残り（開発者。quickstart 3）

- [ ] T027 GCP のプロジェクト・請求・state のバケット（`infra/README.md` 2・3）
- [ ] T028 LINE の値を集め、`terraform.tfvars` を書いて昼に apply（同 4・5）
- [ ] T029 GitHub のリポジトリの変数を5つ入れ、最初のデプロイを手で流す（同 5）
- [ ] T030 本番の確かめ（quickstart 2）
- [ ] T031 構成の決めごと AD-9・Stack の「Direct WIF」を直す（research R-2）

## Dependencies & Execution Order

- Phase 2 → US1（T007〜T017）→ US2（T018〜T021。T010 の deployer が要る）→ US3（T022・T023。T008・T010 が要る）→ Polish。
- [P] は別のファイルで、前の作業に依らないもの。

## Implementation Strategy

US1 と US2 が揃うと、交流会（2026-11-25）に向けて本番に出せる。US3 は同じ apply で入る（費用の守りは最初の月から効かせる）。
