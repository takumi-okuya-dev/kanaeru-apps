# Tasks: 試合表の道だけの Service Worker の組み立てと、カメラの許可（core-015）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

## Phase 1: 仕様

- [x] T001 この仕様（spec・plan・research・tasks）。対話の clarify は飛ばし、【仮決め】を research に書いた

## Phase 2: 組み立て（テストを先に）

- [x] T002 `apps/web/scoped-service-worker.test.ts`：持つファイルの選び方・印の埋め方・版の印
- [x] T003 `apps/web/scoped-service-worker.ts` と `vite.config.ts` の配線・`features/match/offline/sw.js`（自分を外すだけ）

## Phase 3: カメラの許可（テストを先に）

- [x] T004 `apps/api/test/web.test.ts`：試合表の道だけ `camera=(self)`
- [x] T005 `apps/api/src/platform/web/web.ts`・開発の見出し

## Phase 4: 依存・設定・文書・確かめ

- [x] T006 `jsqr` を足す・E2E の `match.offline`
- [x] T007 文書：`docs/architecture.md`・`docs/rules/coding.md` 6-3
- [x] T008 型・lint・単体と結合（E2E の全部は match-005 で流す）
- [ ] T009 主催者が仮決めを確かめる（research の R1・R3・R4）
