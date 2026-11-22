# Tasks: ステージングを足し、Cloud SQL を内部の IP だけにする（core-018）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

- [x] T001 この仕様（spec・plan・research・tasks）
- [x] T002 `infra/modules/environment`：DB と利用者・秘密・身分と権限・Cloud Run のサービスと job・共通の定期の仕事
- [x] T003 `infra/`：`network.tf`・`cloud_sql.tf`（内部の IP）・`wif.tf`（main と develop）・`environments.tf`・`variables.tf`（production・staging）・`outputs.tf`・`apis.tf`・`scheduler.tf`・`service_accounts.tf`・`artifact_registry.tf`・`terraform.tfvars.example`
- [x] T004 `infra/tests/plan.tftest.hcl` と `terraform fmt`・`validate`・`test`
- [x] T005 `.github/workflows/deploy.yml`：環境で出し分ける
- [x] T006 文書：`infra/README.md`・AD-8・AD-11・`docs/rules/development-flow.md` 5章・`docs/decisions.md`・バックログ C3・学びの文書の注記
- [x] T007 `pnpm check`
- [ ] T008 `docs/first-release.md` を、ステージングと今のアプリに合わせて直す（文書の PR）
- [ ] T009 初めての apply とデプロイで、デプロイの身分の権限（R5）と Direct VPC egress の起動（R2）を確かめる
