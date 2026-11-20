# Tasks: 交流会の持ち主と組織（event-002）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/event.md](./contracts/event.md)

テストを先に書き、落ちるのを見てから作る。[P] はほかと同時に進められるもの。

## Phase 1: DB の変更（1つ目の PR `feature/event-002-owner-organization`）

- [x] T001 結合のテストを先に書く：作ると `event.owner_account_id` が作った人になる・運営者が一覧を開くと持ち主のない交流会が運営者のものになる（`apps/api/src/modules/event/owner.test.ts`）
- [x] T002 `apps/api/src/modules/event/schema.ts` に `owner_account_id`（空を許す・account を `RESTRICT`・索引）と `event_organization`（`organization_member` への複合の外部キー `CASCADE`・索引）を足す
- [x] T003 `pnpm db:generate --name event_owner` → `apps/api/drizzle/0014_event_owner.sql` を読む（足すだけで、消す・名前を変えるがないこと）→ `pnpm db:migrate`
- [x] T004 `apps/api/src/modules/event/repository.ts` の `insertEvent` に持ち主を渡し、`claimLegacyEvents` を足す。`routes.ts` の作る・一覧から呼ぶ（権限は前のまま）
- [x] T005 `pnpm check` を流し、コミットする

## Phase 2: 判定の1か所（2つ目の PR `feature/event-002-pr2-roles`。US1・US2 の土台）

- [x] T006 [P] 約束の単体のテスト：`EVENT_ACCESS_ROLES` のラベル・`EventOrganizationInput`・`EventView` の持ち主と組織（`packages/contracts/src/event/event.test.ts`）
- [x] T007 約束：`roles.ts`（`EVENT_ACCESS_ROLES`・`EventAccessRole`・「部員」）・`event.ts`（`EventView` に `owner`・`organization`・`isOwner`、`EventOrganizationState`・`EventOrganizationInput`）・`errors.ts`（`EVENT_OWNER_ONLY`・`EVENT_ORGANIZATION_NOT_FOUND`）・`index.ts`
- [x] T008 結合のテストを先に書く（`apps/api/src/modules/event/owner.test.ts`・`access.test.ts`）：持ち主は主催者・ほかの人（運営者を含む）は 403・組織の管理者と編集者は主催者・メンバーは部員（`getEventRole` が `member`、管理の窓口は 403）・受付係で編集者なら主催者・役割を下げたら次の要求から部員・持ち主のない交流会は運営者が開くと埋まる
- [x] T009 `apps/api/src/modules/event/access.ts` に `resolveEventAccess` を作り、`requireEventRole`・`getEventRole` をそれに替える（`isOrganizer` は埋めるためだけ）

## Phase 3: US1 だれでも作り、自分の交流会だけを管理する（P1）

- [x] T010 結合のテストを先に書く：運営者でない人が作れる・一覧は主催者と受付係の交流会だけ（運営者も他人のものは出ない）・行ごとの `owner`・`organization`・`isOwner`・招待の「すでに主催者」はその交流会の主催者か
- [x] T011 `routes.ts`：作るから `requireOrganizer` を外す。一覧を `listAccessibleEvents`（持ち主・管理者と編集者の組織・受付係）に替える。詳細・招待の役目を `resolveEventAccess` から
- [x] T012 `summary.ts`・`repository.ts`：`EventView` に持ち主（account の `findDisplayNames`）と組織（suite の `findOrganization`）を入れる
- [x] T013 reception・survey の窓口で「ほかの人の交流会は運営者でも 403」を確かめる（`apps/api/src/modules/event/owner.test.ts` に、event・reception・survey の主催者の窓口をまとめて書いた）

## Phase 4: US2 組織に入れる・外す（P1）

- [x] T014 結合のテストを先に書く：持ち主が入れる・入れ替える・外す・同じなら何もしない・編集者は 403 `EVENT_OWNER_ONLY`・入っていない組織は 404・持ち主が抜けると外れる・組織が消えると外れる
- [x] T015 `apps/api/src/modules/event/organization.ts`（読む・入れる）と `routes.ts` の `GET/PUT /api/v1/events/{eventId}/organization`
- [x] T016 テストの手伝い `apps/api/test/helpers/event.ts` に `placeEvent` を足す

## Phase 5: US4 退会（P2）

- [x] T017 結合のテストを先に書く（`apps/api/src/modules/event/withdrawal.test.ts`）：組織の交流会は管理者に引き継ぐ・持ち主が管理者なら引き継いだ人へ・組織に誰もいなければ個人の交流会として消す・個人の交流会は子の行ごと消える・チェックインがあれば 409 で何も変わらない・確かめの中身
- [x] T018 `apps/api/src/modules/event/withdrawal.ts` と `index.ts` の `withdrawal`

## Phase 6: US3 画面（P2）

- [x] T019 [P] 画面の単体のテストを先に書く：一覧の行の持ち主と組織・絞りこみのチップ・「交流会を追加」はだれにも出る・準備の画面の「持ち主と組織」（持ち主は選べる・持ち主でなければ文だけ）
- [x] T020 `EventListPage.tsx`（持ち主と組織・チップ・追加のボタン）・`EventFormPage.tsx`（作るのはだれでも）・`OwnerOrganizationSection.tsx`（新）と `EventSetupPage.tsx`・`api.ts`・`queries.ts`
- [x] T021 E2E（`e2e/tests/event.spec.ts`）：運営者でない人が作り、組織に入れ、編集者が開ける。アクセシビリティ（1440px・375px）

## Phase 7: 仕上げ

- [x] T022 A5 の「参加者のデータを消す」を、運営者でない主催者はこの交流会のチェックインだけを消す形にする（`apps/web/src/features/reception/DataPage.tsx`。research R11）。今の形の文書：`docs/apps/event.md`・`docs/apps/reception.md`・`docs/apps/suite.md`・`docs/apps/account.md`（主催者の決め方・退会の段）、`docs/rules/coding.md` 6-3 の `isOrganizer` の書き方
- [x] T023 `pnpm check` と関わる E2E を流し、コミットする
- [ ] T024 本番で持ち主のない交流会が0件と確かめてから、`NOT NULL` の DB の変更と埋める処理を消す PR を出す（この仕様の外。主催者に頼まれてから）
