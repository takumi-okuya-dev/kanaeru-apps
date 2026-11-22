# Tasks: ログインなしで読める道の読む要求の回数の制限（core-016）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

- [x] T001 この仕様（spec・plan・research・tasks）
- [x] T002 `apps/api/test/app.test.ts`：頭の集め方と形の確かめ・道の当て方・見本の領域での上限（別に数える・IP ごと・切なら数えない・頭の外は数えない・起動を止める）
- [x] T003 `apps/api/src/app.ts`：`DomainModule.publicReadPaths`・`collectPublicReadPaths`・`isPublicReadPath`・`PUBLIC_READ_RATE_LIMIT`・3つ目の回数の制限
- [x] T004 文書：`docs/architecture.md`・`docs/rules/coding.md` 6-6
- [x] T005 `pnpm check`
- [ ] T006 試合表の PR で `modules/match/index.ts` に `publicReadPaths` を足す（research R4）
- [ ] T007 主催者が仮決め（60秒に600回）を確かめる
