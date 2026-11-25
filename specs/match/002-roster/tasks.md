# Tasks: 名簿・組み方・試合表・印刷（match-002）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/match.md](./contracts/match.md)

テストを先に書き、落ちるのを見てから作る。

## Phase 1: 約束

- [x] T001 `packages/contracts/src/match/options.ts`（試合の形・分け方と組・当日の印）・`table.ts`（中身と窓口の形）・`errors.ts`。単体のテスト `table.test.ts`（氏名の欄を受けない・ID の重なり・試合の人数・組の食い違い・時刻の前後）

## Phase 2: 窓口

- [x] T002 結合のテストを先に書く（`apps/api/src/modules/match/routes.test.ts`）：作る・一覧・読む・直す（版・担当・変更の ID）・担当を受け取る・消す・組織と権限・入力の誤り・90日・見えないアプリ
- [x] T003 `access.ts`（権限の1つの関数）・`repository.ts`・`routes.ts`・`index.ts`。テストの手伝い `apps/api/test/helpers/match.ts`
- [x] T004 退会の手順のテスト（`withdrawal.test.ts`）と `withdrawal.ts`

## Phase 3: 組み方（AD-29）

- [x] T005 `fast-check` を `apps/web` の devDependencies に足す
- [x] T006 property-based のテストを先に書く（`pairing.test.ts`）：差が1以内・重ならない・来ない人は入らない・同じ種なら同じ・組み直しで終わった試合は変わらない・遅れて来た人
- [x] T007 `pairing.ts`（`planGames`。docstring に流れ・守る順・くじの種・守れない場合）・`plan.ts`（`buildPlan`・試合の数・組の数・設定に合わない試合を外す）

## Phase 4: 画面

- [x] T008 名簿の読み方のテスト（`roster-read.test.ts`）と `roster-read.ts`・`roster-edit.ts`
- [x] T009 印刷の大きさのテスト（`print-layout.test.ts`）と `print-layout.ts`・`print.css`
- [x] T010 `api.ts`・`queries.ts`・`device.ts`・`table-editor.ts`・`MatchGate.tsx`・`TableFrame.tsx`・`nav-items.ts`・`routes.ts`・`index.ts`
- [x] T011 `ListPage.tsx`・`CreatePage.tsx`・`RosterPage.tsx`・`BoardPage.tsx`・`PrintPage.tsx`
- [x] T012 E2E（`e2e/tests/match.spec.ts`）：未ログイン・作る → 貼る → 設定 → 作る → チェック → 印刷 → シングルス。両方の幅で axe・横のスクロール・CSP

## Phase 5: 文書と確かめ

- [x] T013 `docs/apps/match.md` を直す
- [x] T014 `pnpm check` を流し、コミットする

## 後の段

- [ ] 学びの文書（property-based のテスト・Service Worker）を別の文書の PR で足す（AD-27）
- [ ] 当日の組み直し（来なかった・来た・帰る）・大きく映す・分け方や形を変えても終わった試合を残す（PRD 7.1 の3）
- [ ] 見るだけのページと入口の QR・QR で受け付ける（7.1 の4）
- [ ] ネットなしで開く・電波なしで渡す（7.1 の5）
- [ ] 受付の交流会から名簿を入れる・前に入れたレベル（7.1 の6）
