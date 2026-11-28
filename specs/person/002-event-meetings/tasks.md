# Tasks: PaletKit の交流会を会った場に選ぶ（person-002）

**Input**: [plan.md](./plan.md)・[spec.md](./spec.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/person.md](./contracts/person.md)・[quickstart.md](./quickstart.md)

**Tests**: テストを先に書く（Constitution・開発の流れの決まり）。結合のテストは本物の PostgreSQL。

## Phase 0：先に入れる共通の PR（`feat/core-person-event-sources`）

- [x] T001 受付の `listCheckedInEventIds(db, accountId)` を足す（`apps/api/src/modules/reception/repository.ts`・`index.ts`）。自分のアカウントでのチェックインだけを新しい順に返し、手でのチェックインと入れた人は数えない。テストは `apps/api/src/modules/reception/attendees.test.ts`
- [x] T002 交流会の `listAccountEventSummaries(db, accountId, alsoEventIds)` を足す（`apps/api/src/modules/event/repository.ts`・`index.ts`）。持ち主・受付係・渡した ID の交流会を `{ eventId, name, startsAt }` で1回で返し、組織の役割は数えない。uuid の形でない ID は捨てる。テストは `apps/api/src/modules/event/account-events.test.ts`
- [x] T003 `docs/apps/reception.md`・`docs/apps/event.md` の「ほかの領域が使うもの」に2つの関数を足す
- [ ] T004 #170 が `develop` に入ったら、`eslint.config.js` の person の許す一覧を広げる（reception の `index.ts` は `allowImportNames: ["listCheckedInEventIds"]`、event は `["eventTable", "listAccountEventSummaries"]`。research R7）
- [x] T005 `pnpm check` を流し、結果を PR に書いて出す（PR #175）

## Phase 1：約束（pr1。`feature/person-002-pr1-event-meetings`）

- [x] T006 [P] [US1] 約束のテストを書く：`packages/contracts/src/person/meeting.test.ts` に `EventCandidate`・`EventCandidateList`・`MeetingFromEventInput`（`eventId` は uuid）の形
- [x] T007 [US1] `packages/contracts/src/person/meeting.ts` に `EventCandidate`（`eventId`・`name`・`metOn`・`meetingId|null`）・`EventCandidateList`（`available`・`items`）・`MeetingFromEventInput` を、`limits.ts` に `PERSON_EVENT_CANDIDATE_MAX = 50` を足し、`index.ts` から出す

## Phase 2：User Story 1 - 交流会を選んで会った場にする（P1）🎯 MVP

**Goal**: 会った場の画面に選べる交流会が並び、押すと会った場ができて開く。

**Independent Test**: 主催した会・受付係の会・チェックインした会・関係のない会を用意すると、初めの3つだけが並び、押すとその名前と日付の会った場が開く。

### Tests（先に書く）

- [x] T008 [P] [US1] `apps/api/src/modules/person/event-meetings.test.ts`（候補の窓口）：持ち主・受付係・チェックインの会が出る。関係のない会と組織の役割だけの会は出ない。同じ会は1件。今日より後の会は出ない。新しい順に最大50件。作った会には `meetingId`。受付アプリが見えないときは `available: false` で空
- [x] T009 [P] [US1] 同じファイル（作る窓口）：201 で名前の写しと日本時間の日付の会った場ができる。2回目は 200 で同じ ID。同時に2回送っても1つ。選べない会・ない会・今日より後の会・受付アプリが見えないときは `404 PERSON_NOT_FOUND`。形の違う `eventId` は 400
- [x] T010 [P] [US1] `apps/api/src/modules/person/logging.test.ts` に2つの窓口を足す（交流会の名前とチェックインした人の名前を決まった言葉にして、ログと答えに出ないこと）

### Implementation

- [x] T011 [US1] `apps/api/src/modules/person/events.ts`：`listEventCandidates(deps, account)` が、`isAppVisible(db, "reception", …)` → `listCheckedInEventIds` → `listAccountEventSummaries` の順に呼び、今日（日本時間）の終わりまでに始まるものを新しい順に50件にし、会った場の `meetingId` を付ける（research R1・R3）
- [x] T012 [US1] `apps/api/src/modules/person/repository.ts`：`findOrCreateEventMeeting(db, owner, { eventId, name, metOn })` を足す。`source='event'`、`name_key` は400字で切る（research R5）。`(owner_account_id, event_id) WHERE event_id IS NOT NULL` で `onConflictDoNothing` し、ぶつかったら前の行を返す
- [x] T013 [US1] `apps/api/src/modules/person/routes.ts`：`personListEventCandidates`（`GET /event-candidates`）と `personCreateMeetingFromEvent`（`POST /meetings/from-event`）を足す。作るときは T011 の候補の中に `eventId` があるかを確かめ直す
- [x] T014 [P] [US1] 画面のテスト：`apps/web/src/features/person/MeetingsPage.test.tsx`（候補が並ぶ・作った札・押すと会った場へ移る・`available: false` で欄がない・候補がないときの文）
- [x] T015 [US1] 画面：`apps/web/src/features/person/api.ts`・`queries.ts` に2つの窓口、`MeetingsPage.tsx` に「PaletKit の交流会」の欄（「開く」は作ってから会った場の画面へ。送っている間は押せない）

## Phase 3：User Story 2 - 交流会の会った場を同じように使う（P1）

**Goal**: 交流会から作った会った場で、続けて足す・付ける・探す・書き足しの見出し・CSV が手で書いたものと同じに使える。

- [x] T016 [US2] `event-meetings.test.ts` に、交流会から作った会った場で、人を足す・付ける・会った場の名前で探す・書き足しの見出し・CSV の会った場の列を確かめるテストを足す（person-001 の窓口のまま通ること）

## Phase 4：User Story 3 - 交流会が消えても残る（P2）

**Goal**: 交流会が消えても、受付係から外れても、会った場は名前・日付・人のまま残る。

- [x] T017 [US3] `event-meetings.test.ts` に、交流会の名前を直しても写しが変わらない・交流会を消すと `event_id` が空になり会った場と人が残る・候補から消える・受付係から外れても残る、のテストを足す

## Phase 5：仕上げ

- [x] T018 [P] `e2e/tests/person.spec.ts` に、会った場の画面で交流会を選んで続けて足す流れ（両方の幅で axe）を足す
- [x] T019 [P] `docs/apps/person.md` に2つの窓口と画面の欄、読むほかの領域の関数を足す
- [ ] T020 `/code-review` のあと `pnpm check` を流し、結果を PR に書く
- [ ] T021 ステージングで [quickstart.md](./quickstart.md) の手での確かめ（持ち主）

## Dependencies & Execution Order

- **Phase 0** → pr1。T004 は #170 のあと。共通の PR が `develop` に入るまで、pr1 の PR は開かない（lint で止まるため）。
- pr1 の中：T006・T007 → T008〜T010（テスト）→ T011 → T012 → T013 → T014・T015 → T016・T017 → T018〜T020。
- DB の変更はないので、DB の変更の PR を同時に1本だけ開く決まりには当たらない。

## Parallel Example

```text
T008・T009・T010（API のテスト）と T014（画面のテスト）は、別のファイルなので同時に書ける。
T018（E2E）と T019（地図）は同時に書ける。
```

## Implementation Strategy

1. 共通の PR（Phase 0）を出し、#170 のあとに T004 を足す。
2. US1 だけで MVP（交流会を選んで続けて足す画面に着く）。
3. US2・US3 はテストを足すだけで通る見込み（person-001 の窓口と外部キーのまま）。通らなければ直す。
