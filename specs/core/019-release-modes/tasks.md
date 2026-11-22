# Tasks: 本番に出す3つのモード（core-019）

- [x] T001 この仕様（spec・plan・research・tasks）
- [x] T002 `infra/`：WIF のなりすましを環境ごとに複数のブランチで・デプロイの身分に `kanaeruSqlActivation`・出力に `SQL_INSTANCE`
- [x] T003 `.github/workflows/deploy.yml`（時間帯の確かめ・DB を起こす・ステージング・本番・止め直す）と `deploy-environment.yml`
- [x] T004 `tests/security/ci-config.test.ts`
- [x] T005 文書：`docs/release-guide.md`（手順書）・`docs/README.md`・`docs/rules/development-flow.md`・`docs/rules/specs.md`・`infra/README.md`・AD-11・`docs/decisions.md`
- [ ] T006 `pnpm check`・actionlint・`terraform validate`・`terraform test`
- [ ] T007 主催者：GitHub の環境 `production` に承認者を入れ、デプロイしてよいブランチを `main` に、`staging` は `main` と `develop` にする（`infra/README.md` 5章）
- [ ] T008 初めての本番のデプロイで、承認を待って本番に出ることと、夜の緊急デプロイ（DB を起こして止め直す）を確かめる
