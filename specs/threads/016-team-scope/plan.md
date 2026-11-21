# Implementation Plan: チーム運用をチームの単位にする（threads-016）

**Spec**: [spec.md](./spec.md)・**表とチーム**: [suite-003](../../suite/003-team/plan.md)

## 作り

- 表：`threads_organization_account.team_id`・`threads_assignment.team_id`（NOT NULL。`team`・`team_member` を指す外部キーを CASCADE。担当は `threads_organization_account(threads_account_id, team_id)` を指すので、別のチームに移すと消える）。
- 判定：`access.ts` の `resolveAccess` に、チームの人かどうか（管理者でない組織の人は、運用アカウントのチームの人のときだけ関わる）。
- 読み書き：`team.ts`（チームに入れる〈持ち主が入っているチームだけ〉・担当〈管理者とリーダー。相手はチームの人〉・組織の画面〈見られるチームごと〉・運用状況の範囲〈`team` を足す〉）。`team-status.ts`（`team` の範囲とチームの名前）。`withdrawal.ts`（新しい持ち主をチームに入れてから替える）。
- 約束：`packages/contracts/src/threads/team.ts`（`ThreadsPlacementInput.teamId`・`ThreadsAccountTeam.team`・`ThreadsTeamCandidate`・`ThreadsOrganizationTeam`・運用状況の `scope: team`・`teamName`）。
- 画面：`TeamSection.tsx`（入れるチームを組織ごとに選ぶ）・`TeamOrganizationPage.tsx`（チームごとの区分）・`TeamStatusPage.tsx`・`RoleDiagram.tsx`（リーダー）と言葉（組織に見せる → チームに見せる）。

## 確かめ

- 結合：`team-scope.test.ts`（7件）と、`team.test.ts`・`team-withdrawal.test.ts` をチームの形に直したもの。
- E2E：`threads-team.spec.ts`・`threads-team-withdrawal.spec.ts`。
