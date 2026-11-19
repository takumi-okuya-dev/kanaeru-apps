# Tasks: 外枠のナビ（core-003）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

テストを先に書き、落ちることを見てから作る。[P] は別のファイルで、並べて進められるもの。

## Phase 1: 共通（外枠・組み立て）

- [x] T001 [P] `apps/web/src/lib/feature.ts` に `NavIcon`・`NavItem`・`useNavItems`、`apps/web/src/lib/router.ts` に `layout` の静かな値の型を足す
- [x] T002 [P] `apps/web/src/shell/current-nav.test.ts` を書き（同じ道は page・下の道は一番長い項目が true・`also`・区切りの途中は当てない）、`current-nav.ts` を作る
- [x] T003 [P] `apps/web/src/shell/sidebar-state.test.ts` を書き（はじめは出す・覚える・保存が投げても誤りにしない）、`sidebar-state.ts` を作る
- [x] T004 [US1][US2][US3] `apps/web/src/shell/AppShell.test.tsx` を書き（管理の形のサイドバーとタブバー・メニューのボタンの aria-expanded と開閉が残る・ナビなしの形・項目がないとナビを出さない）、`AppShell.tsx`・`NavIcon.tsx` を作り直す
- [x] T005 `apps/web/src/router.tsx` を `useNavItems` に直し、`router.test.tsx` に「参加者の道はどれも bare・管理の道はどれも bare でない」を足す
- [x] T006 [P] `apps/web/src/styles.css`（`pb-safe`・`px-safe`）・`apps/web/index.html`（`viewport-fit=cover`）
- [x] T007 文書：`docs/rules/coding.md` 6-3・6-6、`docs/architecture.md` 6、EXPERIENCE.md（Information Architecture・Component Patterns・Responsive & Platform）、DESIGN.md（サイドバー・タブバー）

## Phase 2: 領域（道の値と画面の上のタブ）

- [x] T008 [US1][US2] event：`nav-items.test.tsx` を書き（交流会の外は一覧だけ・主催者は4つ・受付係は2つ・読みこむ前は一覧だけ・準備は直すを含む）、`nav-items.ts`・`admin-tabs.ts` の `icon`・`index.ts` の `useNavItems` を作り、`EventAdminNav` を消す
- [x] T009 [US3] 参加者の道を `bare` にする：event の招待・reception のチェックイン・survey のアンケート・account の `/dev/login`
- [x] T010 reception・survey の画面の上の `EventAdminNav` を消し、領域の地図（`docs/apps/*.md`）を直す
- [x] T011 [US1][US2][US3] E2E：`e2e/tests/shell.spec.ts`（PC の開閉が読みこみ直しても残る・375px のタブバーの項目〈主催者・受付係〉・参加者の画面にナビがない・axe）。`survey.spec.ts` のナビの名前を直す

## Phase 3: reception-001 の直し

- [x] T012 [US4] A3 の参加者の表の名前のセルを折り返さない（`ParticipantsTab.tsx`）

## Phase 4: 確かめ

- [x] T013 `pnpm check`
- [x] T014 撮影（PC 1440・SP 375。サイドバーを隠した PC も）を見て、崩れを直す
- [x] T015 撮影で見つけた別の崩れ：交流会の作成・編集と手元のログインのフォームの幅の上限（`max-w-xl`）が、tokens.css に名前がないため余白の段（48px）に落ちて、欄が縦に潰れていた → `--container-form`（560px）を足して `max-w-form` にする（core-001 の直し。別のコミット）
