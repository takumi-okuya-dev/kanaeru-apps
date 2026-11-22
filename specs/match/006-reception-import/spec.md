# Feature Specification: 受付の交流会から名簿を入れる・前に入れたレベル（match-006）

**Feature Branch**: `feature/match-006-reception-import`。`feature/match-005-offline` の上に積む

**Created**: 2026-11-22

**Status**: Draft（主催者の不在中に AI が作った。【仮決め】は主催者の確かめを待つ）

**Input**: [PRD 試合表アプリ](../../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md) 4.1 FR-M4（受付アプリの交流会を選んで、その参加者を名簿に入れる）・見本の M0（[key-screens.html](../../../_bmad-output/ux-kanaeru-match/mockups/key-screens.html)）・構成の決めごと AD-23（2026-11-22 の直し：申込みの名簿は booking の `index.ts` が名前と account だけを出す）・AD-25（選べる交流会は event の判定で主催者のものだけ・前に入れたレベル `match_level_memory`）。

## Clarifications

### Session 2026-11-22

主催者は不在。対話の clarify は飛ばし、PRD と AD-23・AD-25 に従った。決めていないところは、いちばん狭く安全な形を AI が選んだ（【仮決め】。理由は [research.md](./research.md)）。

- Q: 選べる交流会の一覧はどこから読むか → A: 画面が event の窓口（`GET /api/v1/events`）を読み、役目が主催者の行だけを出す。event の領域に関数を足さない。入れる窓口（match）が、event の `getEventRole` でもう一度確かめる【仮決め】（R1）
- Q: 申込みの名簿は → A: booking の `index.ts` が `listApplicantRoster`（確定した申込みの名前と account だけ）を出す。使い方が受付だけの交流会は空（R2）
- Q: レベルをいつ覚えるか → A: 担当の端末が中身を送ったとき、account のある人のレベルが入った・変わったら覚える。名簿の人に account を持たせる（中身の `players[].accountId`。見るだけのページ・QR には出さない）【仮決め】（R3）
- Q: だれのレベルとして覚えるか → A: 試合表を入れた組織、入れていなければ試合表の持ち主（R4）
- Q: ほかの組織の交流会を入れられるか → A: 入れられない。交流会と試合表が同じ組織か、どちらも組織に入れず持ち主が同じときだけ（AD-23 の組織ごとに閉じる）【仮決め】（R8）
- Q: 既定で入れる人 → A: チェックインした人がいればチェックインした人（当日）、いなければ申込みの名簿（前もって）【仮決め】（R5）
- Q: FR-M26（ログインの前に試す） → A: この PR では作らない（試合表を端末だけで持つ別の道と、保存のときに作る流れが要り、大きい）（R7）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 当日、チェックインした人を名簿に入れる (Priority: P1)

受付アプリでチェックインを受けた運営が、試合表の名簿と設定の画面で「受付の交流会から」を押し、自分が主催者の交流会を選んで、チェックインした人を名簿に入れる。

**Acceptance Scenarios**:

1. **Given** 自分が主催者（持ち主か、交流会を入れた組織の管理者・編集者）の交流会, **When** 「受付の交流会から」, **Then** その交流会が選べる。受付係・部員の交流会は出ない
2. **Given** 交流会を選んだ, **Then** 「チェックインした人（N人）」「申込みの名簿（M人）」と、「レベル：X人は前の試合表から入ります。Y人はまだないので、名簿で選んでください。」
3. **When** 「N人を名簿に入れる」, **Then** 呼び名は貼り付けと同じ決まり（姓・同じ姓は名の字・空白のない名前〈LINE の表示名〉は頭の2字で印）で作り、名前はこの画面にだけ出す
4. **Given** 主催者でない交流会・ない交流会・受付アプリが見えない・試合表と違う組織（持ち主）の交流会, **Then** 窓口は同じ 404（`MATCH_EVENT_NOT_FOUND`）。画面の一覧にも出ない

### User Story 2 - 前もって、予約の申込みの名簿を入れる (Priority: P1)

予約（booking）を使う交流会では、確定した申込みの名簿を前もって入れる。名前と account だけを受け取り、メールアドレス・媒体・案内の同意は受け取らない。

**Acceptance Scenarios**:

1. **Given** 確定・キャンセル待ち・取り消し・まとめた行のある名簿, **Then** 確定した、まとめていない行だけが申し込んだ順に出る
2. **Given** 使い方が受付だけ, **Then** 申込みの名簿は空

### User Story 3 - 前に入れたレベルを使う (Priority: P1)

LINE でチェックイン・申込みした人（account のある人）のレベルを入れると、同じ運営の次の試合表で、その人のレベルが入る。

**Acceptance Scenarios**:

1. **Given** account のある人のレベルを名簿で選んで保存した, **When** 次の試合表で同じ人を入れる, **Then** レベルが入る
2. **Given** 組織に入れた試合表で覚えた, **Then** 組織の試合表で使え、個人の試合表には付かない
3. **Given** account のない人（手でチェックイン・取り込み・貼り付け・QR の受付）, **Then** 覚えない
4. **Given** 名簿に残った account が消えた, **Then** 保存は止まらず、その人だけ覚えない

## Requirements *(mandatory)*

- **FR-001**: booking の `index.ts` に `listApplicantRoster`（`repository.ts`）を足す（booking の領域のフォルダは、この1つの関数と出す行だけ）。
- **FR-002**: 約束：`MatchPlayer.accountId`（任意）・`MatchReceptionRoster`・`MATCH_EVENT_NOT_FOUND`。
- **FR-003**: 窓口 `GET /api/v1/match/tables/{tableId}/reception-events/{eventId}`（`routes-reception.ts`）。reception・booking・event・suite の `index.ts` だけを読む。
- **FR-004**: 前に入れたレベル（`level-memory.ts`）：中身を直す `PUT` で覚え、入れる窓口で読む。
- **FR-005**: 画面：名簿と設定の画面に「受付の交流会から」（`ReceptionImportDialog.tsx`・`reception-import.ts`）。
- **FR-006**: テスト：結合（権限・入れる中身・レベル・booking の出すもの）・単体（選び方・呼び名・約束）・E2E（M0 の流れ）。
- **FR-007**: 文書：`docs/apps/match.md`・`docs/apps/booking.md`。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` が通る。
- **SC-002**: 主催者でない人は、ほかの人の交流会の名簿を読めない（結合のテスト）。
