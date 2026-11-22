# Tasks: 当日の組み直し・大きく映す・担当の受け渡し（match-003）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)

## Phase 1: 約束

- [x] T001 `options.ts` に当日の印 `left`、`table.ts` に組の `offset`・`archive`・`PLAN_GAMES_MAX`。`table.test.ts` に通る形と通らない形

## Phase 2: 組み直し（AD-29）

- [x] T002 `plan.ts`：`targetGameCount`・`archivedHistoryOf`・`replanGroup`（今の試合を残せれば残す）。`buildPlan` は `archive` と `offset` を使う
- [x] T003 `day-of.ts`：`markAttendance`・`actionsFor`・`describeAttendance`。property-based のテスト `day-of.test.ts`（終わった試合・ほかの組・今の試合・出られない人・いた間の試合の数の差）
- [x] T004 `regroup.ts`：`changeSettings`・`describeSettingsChange`。テスト `regroup.test.ts`（終わった試合が消えない・変わらない組・組み直し・行の数）
- [x] T005 `roster-edit.ts`：`archive` の人は消さない・帰った人を数える

## Phase 3: 画面

- [x] T006 `GroupTabs.tsx`（試合表の画面から移した組のタブと今の試合の番号）・`DayOfDialogs.tsx`（人を選んで直す・分け方と試合の形）・`BoardPage.tsx`（ボタン・組み直したときの帯・前の分け方の試合）
- [x] T007 `RosterPage.tsx`：設定を変えたら `changeSettings`。確かめの枠に何が変わるかを出す
- [x] T008 `BigPage.tsx`（名前は SVG）・道（`"bare"`）・`paths.ts`
- [x] T009 `TableFrame.tsx`・`device.ts`・`online.ts`：担当の端末の短い名前・つながっているときだけ・確かめの枠・前の担当に保存できなかった理由
- [x] T010 E2E：人を選んで直す → 分け方を変える → 大きく映す → 別の端末で担当を受け取る → 前の担当が保存できない。両方の幅で axe・CSP

## Phase 4: 文書と確かめ

- [x] T011 `docs/apps/match.md` を直す
- [x] T012 `pnpm check` を流し、コミットする

## 後の段

- [ ] 見るだけのページと入口の QR・QR で受け付ける（match-004）
- [ ] ネットなしで開く・電波なしで渡す・送れなかった変更を端末に残す（PRD 7.1 の5）
- [ ] 大きく映す画面の字の大きさを UX で決める（research R5）
- [x] セルフレビューの直し：組めなかった組・一緒にした組の行の数（試合表の進んだ数）・飛ばした試合・枠の開き直し・知らせの文・大きく映すの「次」と全画面
