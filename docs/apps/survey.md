# アンケート（survey）の地図

2026-11-19 作成（survey-001。決めた理由は [specs/survey/001-answers/research.md](../../specs/survey/001-answers/research.md)）。

アンケートの回答を持ち、参加者の回答（アンケートQR・チェックインの画面 → P2）・主催者の代わりの入力（A3 の直す枠）・困りごとの一覧（絞りこみ・並べ替え）と CSV（A5）を出す（構成の決めごと AD-3・AD-5・AD-6・AD-7・AD-13）。

## 1. 表

| 表 | 列 | 決まり |
|---|---|---|
| `survey_answer` | `id`・`checkin_id`・`concern`（困りごと）・`monthly_price`・`tester`・`job_role`・`job_type`・`created_at`（初めて答えた時刻）・`updated_at`（直した時刻） | `checkin_id` は一意（`survey_answer_checkin_id_unique`）で reception の `checkin` を `ON DELETE CASCADE`。選択肢の4つの列は `text` と CHECK で、答えていない・「答えない」は null。困りごとは null か1〜2,000文字 |

- 交流会の ID と名前は持たない。交流会ごとの回答は reception の `listCheckins(db, eventId)` のチェックインの ID で集め、名前と入れ方はそのチェックインから出す（AD-6）。
- 書き方は `INSERT … ON CONFLICT (checkin_id) DO UPDATE`（同時に送っても1行。全部の欄を置きかえる）。
- チェックインの取り消し・本人のアカウントの削除で、回答も一緒に消える。
- 困りごとの本文はログに出さない（survey のコードは logger を使わない）。

## 2. 窓口（どれもログイン必須。道の頭は `/api/v1/events/{eventId}/survey-answers`）

| 動き | 道 | だれ | すること |
|---|---|---|---|
| GET | `…/survey-answers/me` | ログインした人 | チェックイン済みか（`checkedIn`）と自分の回答（なければ `null`）。開閉にかかわらず読める |
| PUT | `…/survey-answers/me` | チェックインした人 | 自分の回答を作る・直す。書くたびに event の `getEventSummary` で開閉を読み、閉じていれば 409 `SURVEY_CLOSED`、チェックインがなければ 403 `SURVEY_NOT_CHECKED_IN`（この順） |
| GET・PUT | `…/survey-answers/checkins/{checkinId}` | 主催者 | そのチェックインの回答を読む・代わりに作る・直す（閉じていても受ける）。その交流会にないチェックインは 404 `CHECKIN_NOT_FOUND`（reception の文言） |
| GET | `…/survey-answers` | 主催者 | 困りごとの一覧。`?tester=yes` で「はい」だけ、`?sort=price` で月いくらの高い順（3,000円以上 → 1,000円 → 500円 → 0円 → 分からない → 答えていない。同じ答えの中は新しい順）。既定は回答の新しい順 |
| GET | `…/survey-answers/export` | 主催者 | 困りごとの CSV（UTF-8 の BOM・CRLF・回答の古い順・`concerns-YYYY-MM-DD.csv`。`=`・`+`・`-`・`@` で始まる欄は先頭に `'`） |

- どの設問も必須にしない。空で送っても受け付ける。
- 交流会がない・形の違う ID は 404（event の `NOT_FOUND`）、権限の誤りは 403（event の `FORBIDDEN`。受付係も）。
- 入力の形・選択肢（code・言葉・並び・高い順・「答えない」）・エラーの文言は `packages/contracts/src/survey/`。

## 3. ほかの領域が使うもの

API の入口（`apps/api/src/modules/survey/index.ts`）は `routes` だけを出す（回答の表は survey だけが読み書きする）。

約束（`@workspace/contracts/survey`）：`SurveyAnswerInput`・`normalizeSurveyAnswer`・`SurveyAnswer`・`MySurveyState`・`ProxySurveyState`・`SurveyAnswerRow`・`SurveyListQuery`、選択肢 `MONTHLY_PRICES`（`MONTHLY_PRICES_HIGH_FIRST`・`compareByMonthlyPrice`）・`TESTER_ANSWERS`・`JOB_ROLES`・`JOB_TYPES` と `*_LABELS`・`NOT_ANSWERED_LABEL`・`SURVEY_QUESTION_LABELS`・`SURVEY_COLUMN_LABELS`・`SURVEY_SORTS`、`SURVEY_ERRORS`。

画面の入口（`apps/web/src/features/survey/index.ts`）：`SURVEY_QUERY_KEYS`（どれも `"survey"` で始まる）。reception の差しこみの場所に、`registerCheckinPanelSection({ id: "survey-proxy-answer" })` と `registerEventDataSection({ id: "survey-concerns-csv" })` をここで1度だけ登録する。

テスト：API は `apps/api/test/helpers/survey.ts` の `SAMPLE_ANSWER`・`setSurveyOpen(app, organizerCookie, eventId, open)`・`answerSurvey(app, cookie, eventId, input?)`。

## 4. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| `/e/$eventId/survey`（`PARTICIPANT_ROUTE_PATTERNS.survey`） | P2 アンケートの画面（ログインした人） | 状態の順：読めない（「この交流会は見つかりません」・夜間の停止）→ 閉じている（「アンケートは閉じています」）→ チェックインしていない（「先にチェックインしてください」と「チェックインの画面へ」）→ 入力 → お礼。入力は目的の案内（h1「仕事の困りごとを聞かせてください」と本文・箇条書き2つ）→ 困りごと → 月いくら（「答えるだけで、実際には払いません」）→ テスター → 任意（仕事の立場・職種。「答えない」が最初に選ばれている）→ 「送る」（回答済みなら「回答済みです…」と「送り直す」）。送ったら同じ画面をお礼（h2「あなたの困りごとが、解決する企画やアプリにつながります」にフォーカス）に変え、Googleフォームの URL があれば「続けて交流会のアンケートへ」、LINE グループの招待リンクがあれば「交流会のLINEグループに参加する」、「答えを直す」。送ったときの 409・403 は「送る」の近くに出し、値を残す |
| `/admin/events/$eventId/concerns`（`eventConcerns`） | 困りごと（主催者だけ） | 上に `EventAdminNav`（「困りごと」）。「絞りこみ」（すべて／テスターに「はい」だけ）と「並べ方」（回答の新しい順／月いくらの高い順）のチップ。広い画面は表（名前・困りごと・月いくら・テスター・仕事の立場・職種）、狭い画面はカード。5秒おきに読み直し（夜間の停止では止める）。空は「まだ困りごとはありません」（閉じていれば準備の画面への入口）。「書き出しと削除」への入口 |
| A3 の直す枠の節（reception が、主催者が手でのチェックインを開いたときだけ出す） | アンケートの回答 | 見出し h3。「アンケートの回答を入れる」（回答があれば「…を直す」）で P2 と同じ欄を節の中に開き、「回答を保存」。閉じていても入れられる |
| A5 の節 | 困りごとをCSVで書き出す | 見出し h2・説明・ボタン。API の CSV を受け取って保存する |

## 5. 置き場所

| 所 | ファイル |
|---|---|
| 約束 | `packages/contracts/src/survey/`（`options.ts`・`errors.ts`・`answer.ts`・`index.ts`） |
| API | `apps/api/src/modules/survey/`（`schema.ts`・`repository.ts`・`views.ts`・`csv.ts`・`routes.ts`・`index.ts`・テスト） |
| DB の変更 | `apps/api/drizzle/0005_survey.sql` |
| 画面 | `apps/web/src/features/survey/`（`api.ts`・`queries.ts`・`format.ts`・`survey-form.ts`・`SurveyFields.tsx`・`SurveyPage.tsx`・`ConcernsPage.tsx`・`ProxyAnswerSection.tsx`・`ConcernsCsvSection.tsx`・`routes.ts`・`index.ts`） |
| テストの手伝い | `apps/api/test/helpers/survey.ts` |
| 通しのテスト | `e2e/tests/survey.spec.ts` |
