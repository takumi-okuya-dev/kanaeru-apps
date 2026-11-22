# Tasks: 試合表の道は LIFF を始めずに開く（core-013）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

## Phase 1: 仕様

- [x] T001 この仕様（spec・plan・research・tasks）。対話の clarify は飛ばし、【仮決め】を research に書いた

## Phase 2: 決め方（テストを先に）

- [x] T002 `apps/web/src/lib/liff.test.ts` に、道ごとの決め方（試合表の道・似た道・大文字）、LIFF を始められないときの「failed」（ほかの道）と「skipped」（試合表の道。SDK を読まない）、始めずに開いたときの `getLiff()`、読み直しの判定のテストを書く
- [x] T003 `apps/web/src/lib/liff.ts` に `needsLiff`・`startLiffFor`・`mustReloadForLiff` を足す

## Phase 3: 組み立て

- [x] T004 `apps/web/src/main.tsx`：`startLiffFor(window.location.pathname)` を待ち、"failed" だけ「読みこめない」
- [x] T005 `apps/web/src/lib/router.ts`：根の道の `beforeLoad` で、LIFF の要る道へ移るときに読み直す

## Phase 4: E2E と文書

- [x] T006 `e2e/tests/start-without-liff.spec.ts`（両方の幅・CSP）
- [x] T007 文書：`docs/architecture.md`・`docs/rules/coding.md` 6-3
- [x] T008 `pnpm check`
- [ ] T009 主催者が仮決めを確かめる（spec の Clarifications・research の R1〜R5）
