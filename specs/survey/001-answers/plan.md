# Implementation Plan: アンケートの回答・困りごとの一覧と書き出し（survey-001）

**Branch**: `feature/survey-001-answers` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口と画面の差しこみは [contracts/survey.md](./contracts/survey.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

survey の領域を足す：`survey_answer` の表、参加者の自分の回答（読む・書く。開閉と書くたびに確かめる）・主催者の代わりの入力・困りごとの一覧（絞りこみ・並べ替え）・困りごとの CSV の窓口。画面には P2（アンケートの画面）・困りごとの画面と、reception の差しこみの場所への2つの節（A3 の代わりの入力・A5 の CSV）を出す。共通のファイルは `modules.list.ts`・`features.list.ts` の1行ずつと、文書だけ。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26.13

**Primary Dependencies**: Hono 4.13・@hono/zod-openapi・zod 4・Drizzle 0.45・React 19・TanStack Router/Query。新しい依存はない

**Storage**: PostgreSQL 18（1つの表を足す DB の変更を1つ）

**Testing**: Vitest（API の結合は本物の PostgreSQL・約束の単体・画面の単体）・Playwright（E2E。試験用のログイン・両方の幅で axe）

**Target Platform**: Cloud Run の1つのコンテナ・LINE の中の LIFF ブラウザと PC のブラウザ

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: 開閉は書くたびに event から読む。権限は要求のたびに引く。名前はいつもチェックインの名前。困りごとの本文をログに出さない。CSV は式の差しこみを防ぐ。困りごとの一覧は5秒おきに読み直す。

**Scale/Scope**: 1回の交流会で回答は数十。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 月いくらは答えるだけ（画面に「答えるだけで、実際には払いません」）。決済しない |
| II. 個人の情報は最小限・困りごとは主催者だけ | 持つのは PRD の5つの設問だけ。名前は写さない（チェックインから引く）。一覧・CSV・代わりの入力は主催者だけ（受付係も 403）。本文をログに出さない。チェックインの取り消しとアカウントの削除で消える（CASCADE） |
| III. 気軽さ | どの設問も必須にしない。空で送っても誤りにしない（R4）。手でのチェックインの人も主催者が代わりに入れられる |
| IV. 小さく始める | 「私も」・行方・機能の印は作らない。交流会の ID を写さない（R1） |
| V. 運用費ゼロに近く | 新しい資源・依存を足さない |
| 技術の制約 | account の `requireSession`・`currentAccount`、event の `requireEventRole`・`getEventSummary`、reception の `findCheckin`・`getCheckin`・`listCheckins`・`checkinTable` を index.ts から使い、ほかの領域の表を読まない。画面は reception の差しこみの場所に登録し、reception のフォルダを直さない |

違反なし。設計のあとも同じ。

## Project Structure

### Documentation (this feature)

```text
specs/survey/001-answers/
├── spec.md・plan.md・research.md・data-model.md・quickstart.md・tasks.md
├── contracts/survey.md
└── checklists/requirements.md
```

### Source Code

```text
packages/contracts/src/survey/
├── options.ts                 # 選択肢の code・言葉・並び・高い順・「答えない」（zod を読まない）
├── errors.ts                  # SURVEY_ERRORS（SURVEY_CLOSED・SURVEY_NOT_CHECKED_IN）
├── answer.ts（＋test）          # SurveyAnswerInput・normalizeSurveyAnswer・SurveyAnswer・MySurveyState・SurveyAnswerRow・並べ方
└── index.ts
apps/api/src/modules/survey/
├── schema.ts                  # survey_answer
├── repository.ts              # 読み書き（upsert・checkin の ID で集める）
├── views.ts                   # 答えの形・一覧の並びと絞りこみ
├── csv.ts（＋test）             # CSV
├── routes.ts                  # 窓口
├── survey.test.ts             # 結合のテスト
└── index.ts
apps/api/src/modules.list.ts   # 1行
apps/api/test/helpers/survey.ts # 回答を作る手伝い
apps/api/drizzle/0005_survey.sql
apps/web/src/features/survey/
├── api.ts・queries.ts           # 窓口の呼び出し・問い合わせの鍵（["survey", …]）
├── format.ts（＋test）           # チップの選択肢（「答えない」つき）・言葉
├── survey-form.ts（＋test）      # 欄の値と入力の行き来
├── SurveyFields.tsx            # 5つの設問（P2・代わりの入力）
├── SurveyPage.tsx（＋test）      # P2
├── ConcernsPage.tsx（＋test）    # 困りごと
├── ProxyAnswerSection.tsx      # A3 の節
├── ConcernsCsvSection.tsx      # A5 の節
├── routes.ts・index.ts          # 道と差しこみの登録
apps/web/src/features.list.ts  # 1行
e2e/tests/survey.spec.ts
docs/apps/survey.md・docs/architecture.md・docs/README.md（共通の文書）
```

**Structure Decision**：選択肢の並びと高い順は約束の1か所（API の並べ替えと画面のチップが同じものを使う）。P2 と代わりの入力は同じ `SurveyFields` を使う。CSV の式の打ち消しは reception と同じ形を survey の `csv.ts` に置く（reception の内部を読まない）。

## Complexity Tracking

| 増えたもの | なぜ要るか | もっと簡単な案を選ばなかった理由 |
|---|---|---|
| CSV の欄の書き方が reception と survey の2か所 | 困りごとの CSV | reception の `csv.ts` は入口から出ていない。領域の内部を読まない決まりのため、小さな関数を写した（共通に出すのは別の共通の PR） |
