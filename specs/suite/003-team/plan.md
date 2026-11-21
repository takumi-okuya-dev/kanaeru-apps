# Implementation Plan: 組織の中のチーム（suite-003）

**Spec**: [spec.md](./spec.md)・**Threads の側**: [threads-016](../../threads/016-team-scope/plan.md)

## 作り

- 表：`apps/api/src/modules/suite/schema.ts` に `team`・`team_member`。DB の変更 `apps/api/drizzle/0014_suite_team.sql`（threads-016 の `team_id` と同じ1本。生成のあと、一意の索引を外部キーより先にし、今ある「組織に入れる」を組織ごとの「チーム1」へ移す手順を手で足した）。
- 読み書き：`apps/api/src/modules/suite/teams.ts`（作る・名前・消す・人を足す/リーダー・外す・読む・`addTeamMember`）。チームの数は組織の行に鍵をかけて数える。
- 窓口：`routes-organization.ts` にチームの5つの道。組織の画面の答えに `teams`・`teamLimit`。判定は `requireOrganizationRole(…, "admin")`。
- 約束：`packages/contracts/src/suite/organization.ts`（`TeamName`・`TeamNameInput`・`TeamMemberInput`・`TeamView`）と `organization-errors.ts`（`TEAM_*`）。
- 画面：`apps/web/src/features/suite/OrganizationTeams.tsx`（組織の画面の「チーム」の区分）。

## 確かめ

- 結合：`apps/api/src/modules/suite/team.test.ts`（作る・名前・上限・同じ名前・役割ごとの操作・足す・リーダー・外す・消す・抜ける・別の組織）。
- 画面：`OrganizationPage.test.tsx`（管理者の操作・メンバーには出さない）。
- E2E：`e2e/tests/threads-team.spec.ts`（管理者が画面でチームを作り、人を足す）。
