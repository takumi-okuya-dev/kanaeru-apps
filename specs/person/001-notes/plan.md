# Implementation Plan: 人物メモの最初の版（person-001）

**Branch**: `feature/person-001-notes`（仕様）・`feature/person-001-pr1-tables`（DB の変更）・`feature/person-001-pr2-notes`（窓口と画面） | **Date**: 2026-11-27 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) と、次の4つ。

- 決めた理由と仮決め：[research.md](./research.md)
- 表：[data-model.md](./data-model.md)
- 窓口と画面の道：[contracts/person.md](./contracts/person.md)
- 確かめの手順：[quickstart.md](./quickstart.md)

## Summary

人物メモ（key `person`・領域 `person`・`uses: ["reception"]`）を作る。

- **pr1**：1行の一覧に登録し、人のメモ・会った場・人と会った場の組の3つの表を足す（`0025_person.sql`）。`/person` には準備中の案内だけを置く。
- **pr2**：人を足す・書く・書き足す・探す・会った場・続けて足す・アカウントを開く・書き出す窓口と画面を足す。
- 範囲の外：PaletKit の交流会を会った場に選ぶ部分（受付と交流会の小さな PR のあとの別の仕様）。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: 新しい依存はなし。

- API：Hono・`@hono/zod-openapi`・Drizzle 0.45
- 画面：React・TanStack Router と Query・`@workspace/ui`
- `packages/csv`

**Storage**: PostgreSQL。表を3つ足す DB の変更を1つ（`0025_person.sql`。番号は道具が振る）。

**Testing**: Vitest と Playwright。

- 表と窓口の結合のテストは、本物の PostgreSQL に当てる。
- 約束（そろえ方・当たった位置・URL）は単体のテスト。
- 画面は jsdom と Testing Library。
- E2E は、ログインしていないときの案内と、ログインした各画面の axe（WCAG 2.2 AA。Constitution の技術スタック制約）。

**Target Platform**: スマホのブラウザ（帰り道の片手）と PC。Cloud Run の1つのコンテナ（AD-8）。

**Project Type**: モジュラーモノリスの新しい領域（AD-1・AD-15）。

**Performance Goals**: 1人の使う人で、数百人の一覧と検索がすぐ返る（Open Questions 12）。

**Constraints**:

- 夜の停止（0時〜8時）の間は `503 DB_UNAVAILABLE`。
- 共通のファイルで触るのは、1行の一覧（`apps.list.ts`・`modules.list.ts`・`features.list.ts`）と、文書の一覧の行（`docs/README.md`・`docs/rules/specs.md`）だけ。
- メモの値を、ログ・URL に出さない（AD-31）。

**Scale/Scope**: 最初は持ち主1人（運営者だけに見える）。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関わらない |
| II. 個人の情報は最小限 | 電話番号・メール・顔写真の欄を持たない。見られるのは持ち主だけで、ほかの人の記録は 404。外の AI・MCP に渡さない（AD-20・AD-21・AD-31）。ログ・URL にメモの値を出さない。退会で CASCADE で消える。受付の名簿を読まない |
| III. 気軽さ | 受付の流れに何も足さない。帰り道のスマホで、名前だけで足せる・会った場を選んで続けて足せる |
| IV. 小さく始める | PRD 7.1 の2・3・5だけ。交流会を選ぶ部分・知らせ・暗号は作らない。会った場の `source`・`event_id` は、次の仕様で DB の変更を増やさないために先に持つ（research R3） |
| V. 運用費ゼロに近く | 新しい資源・定期の仕事・有料のサービスを足さない。夜の停止はそのまま |
| 技術の制約 | 表の名前は `person_`。ほかの領域の表は外部キーにだけ使う（`accountTable`・`eventTable`）。ほかの領域は `index.ts` からだけ読む（account・suite） |

違反なし。設計のあとも同じ。

## Project Structure

### Documentation (this feature)

```text
specs/person/001-notes/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/person.md
├── checklists/requirements.md
└── tasks.md            （/speckit-tasks）
```

### Source Code

```text
packages/contracts/src/person/   limits.ts・options.ts・index.ts（pr1）
                                 search.ts・accounts.ts・heading.ts・note.ts・meeting.ts・errors.ts（pr2。どれも *.test.ts つき）
apps/api/src/modules/person/     schema.ts・schema.test.ts・index.ts（pr1）
                                 access.ts・repository.ts・search.ts・csv.ts・routes.ts・routes.test.ts・logging.test.ts（pr2）
apps/api/test/helpers/person.ts  （pr2）
apps/api/drizzle/                0025_person.sql・meta（pr1）
apps/web/src/features/person/    index.ts・routes.ts・paths.ts・PlaceholderPage.tsx（pr1）
                                 api.ts・queries.ts・ListPage.tsx・NoteFormPage.tsx・NotePage.tsx・MeetingsPage.tsx・MeetingPage.tsx と *.test.tsx（pr2）
e2e/tests/person.spec.ts         （pr2）
docs/apps/person.md              （pr1。pr2 で窓口と画面を足す）
一覧の1行：apps.list.ts・modules.list.ts・features.list.ts（pr1）
```

**Structure Decision**: 試合表（match-001・002）と同じ形。退会の手順（`withdrawal`）は出さない（research R11）。

## Complexity Tracking

違反がないので、空。
