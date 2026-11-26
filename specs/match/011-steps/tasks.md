# Tasks: 名簿と設定に手順を出す（match-011）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)

- [x] T001 [US1] 試験を先に書く `apps/web/src/features/match/steps.test.ts`（名簿なし → ①が今／名簿あり・組んでいない → ②が今／組み合わせかミニゲームのチームがある → ③まで済み／名簿を消すと①が今／レベルのない人の数）
- [x] T002 [US1] `apps/web/src/features/match/steps.ts`（`rosterSteps`）
- [x] T003 [US1] `apps/web/src/features/match/RosterSteps.tsx`（`<ol aria-label="試合表を作る手順">`・今の手順は `aria-current="step"`・印と「今」・押すと見出しへ移ってフォーカス・組んでいれば試合表へ）と `RosterPage.tsx` の題の下に置く
- [x] T005 [US1] `RosterPage.tsx` の名簿の入れ方：空のときは説明つきのカード、入ったあとは「名簿を足す・入れ直す」から開く（FR-006）
- [x] T004 E2E `e2e/tests/match.spec.ts`：空 → ①が今 → ①を押すと名簿へ → 貼る → ②が今 → 作る → 済み（両方の幅で axe）
- [x] T006 `docs/apps/match.md` を直し、`pnpm check` を流してコミットする
