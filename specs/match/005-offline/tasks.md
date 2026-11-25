# Tasks: ネットなしで開く・端末に残して送る・電波なしで渡す QR（match-005）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

## Phase 1: 仕様

- [x] T001 この仕様（spec・plan・research・tasks・quickstart）。対話の clarify は飛ばし、【仮決め】を research に書いた
- [x] T002 共通の土台を core-015 に分けた（組み立ての plugin・カメラの許可・jsQR・E2E の機能の印）

## Phase 2: 止め方と Service Worker

- [x] T003 窓口 `GET /api/v1/match/offline` と結合のテスト
- [x] T004 本文 `offline/sw.js`・入れ方と外し方 `offline/register.ts`・`offline/start.ts`・新しい版の知らせ `offline/UpdatePrompt.tsx`

## Phase 3: 端末に残して送る（テストを先に）

- [x] T005 `offline/outbox.test.ts`
- [x] T006 `offline/store.ts`・`offline/outbox.ts`・`offline/table-sync.ts`・`offline/table-list.ts`・`table-editor.ts`・`queries.ts`・`TableFrame.tsx`・`device.ts`

## Phase 4: QR（テストを先に）

- [x] T007 `handoff.test.ts`・`view-estimate.test.ts`
- [x] T008 `handoff.ts`・`qr-decode.ts`・`QrScanner.tsx`・`HandoffDialog.tsx`（M4）・`ViewPage.tsx`（QR を読む・見込み）・`JoinPage.tsx`（P3）・`JoinQrReader.tsx`（M7）

## Phase 5: 通しと文書

- [x] T009 `e2e/tests/match-offline.spec.ts`
- [x] T010 学び：`docs/study/service-worker.md`・`property-based-testing.md`。地図：`docs/apps/match.md`
- [x] T011 `pnpm check`
- [ ] T012 実機で確かめる（research R15：iPhone の Safari・Android の Chrome）
- [ ] T013 持ち主と運営の方が仮決めを確かめる
