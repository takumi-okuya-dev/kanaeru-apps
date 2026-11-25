# Tasks: 試合表の表とアプリの登録（match-001）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)

テストを先に書き、落ちるのを見てから作る。

## Phase 1: DB の変更（PR `feature/match-001-tables`）

- [x] T001 約束の選択肢を先に置く：`packages/contracts/src/match/options.ts`（`MATCH_LEVELS` と言葉）・`index.ts`。単体のテスト `options.test.ts`
- [x] T002 結合のテストを先に書く（`apps/api/src/modules/match/schema.test.ts`）：レベルの CHECK・名前と中身と版と担当の端末の CHECK・札の一意・前に入れたレベルの相手と一意・組織に入れる行の外部キーと持ち主が抜けたとき・交流会を消したとき・持ち主と本人と組織を消したとき
- [x] T003 `apps/api/src/modules/match/schema.ts` に4つの表を書く
- [x] T004 `pnpm db:generate --name match` → `apps/api/drizzle/0021_match.sql` を読む（表を足すだけ）→ `pnpm db:migrate`
- [x] T005 アプリの登録：`apps.list.ts`・`modules.list.ts`・`features.list.ts` に1行ずつ。`match/index.ts`（API・画面）・`/match` の仮の画面
- [x] T006 文書：`docs/apps/match.md`・`docs/README.md` 2章・`docs/rules/specs.md` の領域の一覧
- [x] T007 `pnpm check` を流し、コミットする
