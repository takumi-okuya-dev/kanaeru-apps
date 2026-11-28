# Implementation Plan: PaletKit の交流会を会った場に選ぶ（person-002）

**Branch**: `feature/person-002-event-meetings`（仕様）・`feature/person-002-pr1-event-meetings`（窓口と画面） | **Date**: 2026-11-28 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) と、次の4つ。

- 決めた理由と仮決め：[research.md](./research.md)
- 使う欄：[data-model.md](./data-model.md)
- 窓口と画面：[contracts/person.md](./contracts/person.md)
- 確かめの手順：[quickstart.md](./quickstart.md)

## Summary

使う人がチェックインした会・持ち主の会・受付係の会を、人物メモの会った場の画面に候補として出す。選ぶと、交流会の名前と日付を写した会った場を作り（あれば開き）、続けて足す画面に進む。

- **先に入れる共通の PR**（`feat/core-person-event-sources`）：
  - 受付の `listCheckedInEventIds`
  - 交流会の `listAccountEventSummaries`
  - lint の許す一覧に、この2つの名前を足す（#170 が入ったあと）
- **pr1**（窓口と画面）：候補の窓口・交流会から作る窓口・会った場の画面の欄。DB の変更はない。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: 新しい依存はなし（person-001 と同じ）。

**Storage**: PostgreSQL。DB の変更はない（person-001 の `person_meeting` の `source`・`event_id`・部分の一意の索引を使う）。

**Testing**: Vitest と Playwright。

- 窓口の結合のテストは、本物の PostgreSQL に当てる。交流会・受付係・チェックインは、テストの手伝い（`test/helpers/event.ts`・`reception.ts`）で窓口から作る。
- 画面は jsdom と Testing Library。
- E2E は、会った場の画面で交流会から作る流れと axe。

**Target Platform**: スマホのブラウザと PC（person-001 と同じ）。

**Project Type**: 既存の領域 `person` に足す（AD-31）。

**Performance Goals**: 候補は1回の窓口で返す。受付・交流会の問い合わせは、それぞれ1回（交流会ごとに引かない）。

**Constraints**:

- person が読んでよいのは、AD-31 の許す一覧だけ（research R7）。
- 共通のファイルは、共通の PR の `eslint.config.js` の許す一覧だけを触る。
- 会った場の名前（交流会の名前）を、ログ・URL に出さない。

**Scale/Scope**: 最初は持ち主1人。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関わらない |
| II. 個人の情報は最小限 | 候補に出すのは交流会の名前と日付だけ。チェックインした人の名前・人数・名簿は読まず、出さない（PRD FR-P8。lint で止める）。外の AI・MCP に渡さない |
| III. 気軽さ | 受付の流れに何も足さない。帰り道に2回押すだけで、続けて足す画面に着く |
| IV. 小さく始める | DB の変更なし。人のメモの画面から交流会を選ぶことはしない（research R8） |
| V. 運用費ゼロに近く | 新しい資源・定期の仕事を足さない |
| 技術の制約 | ほかの領域は `index.ts` の許した関数だけ。表は外部キーにだけ使う |

違反なし。設計のあとも同じ。

## Project Structure

### Documentation (this feature)

```text
specs/person/002-event-meetings/
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
共通の PR（feat/core-person-event-sources）
  apps/api/src/modules/reception/   repository.ts・index.ts・attendees.test.ts（listCheckedInEventIds）
  apps/api/src/modules/event/       repository.ts・index.ts・account-events.test.ts（listAccountEventSummaries）
  docs/apps/reception.md・docs/apps/event.md
  eslint.config.js                  （#170 のあと。person の許す一覧に2つの名前）

pr1（feature/person-002-pr1-event-meetings）
  packages/contracts/src/person/    meeting.ts（EventCandidate・MeetingFromEventInput）・limits.ts（候補の上限）・index.ts と *.test.ts
  apps/api/src/modules/person/      events.ts（候補を作る・確かめ直す）・repository.ts（交流会から作る）・routes.ts・event-meetings.test.ts・logging.test.ts
  apps/web/src/features/person/     api.ts・queries.ts・MeetingsPage.tsx・MeetingsPage.test.tsx
  e2e/tests/person.spec.ts
  docs/apps/person.md
```

**Structure Decision**: 候補の作り方（R1）は `events.ts` の1つの関数にまとめ、候補の窓口と作る窓口の両方が使う（条件の食い違いを防ぐ。AD-31）。

## Complexity Tracking

違反がないので、空。
