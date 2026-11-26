# Tasks: 組み合わせを手で入れかえる（match-010）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)

- [x] T001 [US1] [US2] 試験を先に書く `apps/web/src/features/match/swap.test.ts`（property-based：約束の形・終わった試合とほかの組は変わらない／同じ試合に2回・違う組・終わった試合は理由を返す／ミニゲームの入れかえと移し・空のチームは作らない）
- [x] T002 [US1] [US2] `apps/web/src/features/match/swap.ts`（`swapGameSlots`・`swapTeamMembers`・`moveTeamMember`・理由の文）
- [x] T003 [US1] `apps/web/src/features/match/BoardPage.tsx`：担当の端末に「組み合わせを直す」「直し終える」。直す形では名前をボタンにし、ドラッグと2人を順に押すで入れかえる（Esc でやめる・押した名前は aria-pressed・結果は帯に出す）
- [x] T004 [US2] `apps/web/src/features/match/MiniTeams.tsx`：直す形では人をボタンにし、入れかえ・チームの枠へのドラッグ・「チーム N へ移す」
- [x] T005 E2E `e2e/tests/match.spec.ts`：パソコンでドラッグ・スマホの幅で2人を順に押す・同じ試合に2回入るときの知らせ・ミニゲームの移し
- [x] T006 `docs/apps/match.md` を直し、`pnpm check` を流してコミットする
