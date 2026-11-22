# Tasks: 定期の仕事を1つの窓口にまとめる（core-017）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

- [x] T001 この仕様（spec・plan・research・tasks）
- [x] T002 `apps/api/src/kernel/scheduled-job.ts` と単体のテスト：型・形の確かめ・当たるかの判定
- [x] T003 `packages/contracts/src/core`：共通の窓口の答えの約束
- [x] T004 `apps/api/src/platform/jobs`：`POST /api/v1/jobs/tick`
- [x] T005 `apps/api/src/app.ts`：`DomainModule.scheduledJob`・集める・アプリが切なら動かさない
- [x] T006 `apps/api/test/app.test.ts`：見本の領域での窓口（当たる・時間外・合言葉・失敗を分ける・切・形の確かめ）
- [x] T007 `infra/scheduler.tf`：共通の Cloud Scheduler の仕事
- [x] T008 文書：`docs/architecture.md`・`docs/rules/coding.md` 6-6・`infra/README.md`
- [x] T009 `pnpm check`
- [ ] T010 Threads・booking が `scheduledJob` を出し、それぞれの Cloud Scheduler の仕事を消す（領域ごとの PR。research R4）
