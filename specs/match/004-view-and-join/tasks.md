# Tasks: 見るだけのページ・入口の QR・QR で受け付ける（match-004）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[contracts/match.md](./contracts/match.md)

## Phase 1: 約束

- [x] T001 `public.ts`（`MatchView`・`MatchJoinInput`〈strict〉・`MatchJoinList`・`MatchLinkIssued`・`JOIN_MAX`・`joinPlayerId`）・`errors.ts`（`VIEW_NOT_FOUND`・`JOIN_NOT_FOUND`・`JOIN_FULL`）・`MatchTable.links`。テスト `public.test.ts`

## Phase 2: 窓口

- [x] T002 結合のテスト `routes-share.test.ts`：レベルと氏名が出ない・no-store と noindex・作り直した札と期限切れの札と形の違う札は 404・期限の決め方・権限・strict の本文・締めた受付・100人・同じ名前・消す・見えないアプリ
- [x] T003 `tokens.ts`・`share-repository.ts`・`routes-share.ts`・`repository.ts`（`links`・`readContent`）・`index.ts`

## Phase 3: 画面

- [x] T004 `qr.tsx`・`link-store.ts`・`no-index.ts`・`joins.ts`（テスト `joins.test.ts`）・`use-joins.ts`・`api.ts`・`paths.ts`・`routes.ts`・`nav-items.ts`
- [x] T005 `ViewPage.tsx`（P1）・`JoinPage.tsx`（P2・P3）・`ViewLinkPage.tsx`・`JoinAdminPage.tsx`（M7）
- [x] T006 `PrintPage.tsx`（版の右上の QR・入口に貼る1枚）・`RosterPage.tsx`（受付の人を入れる・消すと受付の行も消す・同じ名前の印）
- [x] T007 E2E：リンクと QR を作る → 印刷の QR と入口の1枚 → 受付を始める → ログインなしで受け付ける（誤り・できた）→ 見るだけのページ（自分の名前・電波なし）→ 一覧と名簿に入る → 締める → 締め切り

## Phase 4: 文書と確かめ

- [x] T008 `docs/apps/match.md` を直す
- [x] T009 `pnpm check` を流し、コミットする

## 後の段

- [ ] 見るだけ・受付の GET に IP ごとの回数の制限を足す（共通の `app.ts` の小さな PR。research R6）
- [ ] P3 の参加者の QR を運営のカメラで読む・電波なしで渡す・ネットなしで開く・見込みの今の試合（ネットなしの段。R5・R7）
- [ ] 道の形を `packages/contracts/src/core` に移す（ほかの領域が使うとき。R3）
- [ ] M7 の「この QR を印刷」・入口から使い始めた運営の数を数える
