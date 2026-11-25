# 取り決め：survey の窓口と画面の差しこみ（survey-001）

## 窓口（`/api/v1/events/{eventId}/survey-answers`。`operationId` は `survey` で始める。どれもログイン必須）

| 動き | 道 | だれ | 入力 | 成功 | 主なエラー |
|---|---|---|---|---|---|
| GET | `…/survey-answers/me` | ログインした人 | — | 200 `MySurveyState` | 401・404 |
| PUT | `…/survey-answers/me` | チェックインした人（開いている間） | `SurveyAnswerInput` | 200 `SurveyAnswer` | 400・401・403 `SURVEY_NOT_CHECKED_IN`・404・409 `SURVEY_CLOSED` |
| GET | `…/survey-answers/checkins/{checkinId}` | 主催者 | — | 200 `ProxySurveyState` | 401・403・404 `CHECKIN_NOT_FOUND` |
| PUT | `…/survey-answers/checkins/{checkinId}` | 主催者（閉じていても） | `SurveyAnswerInput` | 200 `SurveyAnswer` | 400・401・403・404 `CHECKIN_NOT_FOUND` |
| GET | `…/survey-answers` | 主催者 | 問い合わせ `tester=yes`（任意）・`sort=newest\|price`（既定 newest） | 200 `{ answers: SurveyAnswerRow[] }` | 400・401・403・404 |
| GET | `…/survey-answers/export` | 主催者 | — | 200 `text/csv; charset=utf-8`（BOM つき・`Content-Disposition: attachment; filename="concerns-YYYY-MM-DD.csv"`） | 401・403・404 |

- 交流会がない・形の違う ID は 404（event の `NOT_FOUND`）。権限の誤りは 403（event の `FORBIDDEN`）。

## 形（`@workspace/contracts/survey`）

| 名前 | 中身 |
|---|---|
| `SurveyAnswerInput` | `{ concern?, monthlyPrice?, tester?, jobRole?, jobType? }`（どれも省略・null 可。困りごとは前後の空白を除き2,000文字まで。知らない欄は 400） |
| `normalizeSurveyAnswer(input)` | 省略と空の困りごとを null にした、5つの欄がそろった形 |
| `SurveyAnswer` | `{ concern, monthlyPrice, tester, jobRole, jobType, answeredAt }`（選択肢は code か null。`answeredAt` は直した時刻） |
| `MySurveyState` | `{ checkedIn: boolean, answer: SurveyAnswer \| null }` |
| `ProxySurveyState` | `{ answer: SurveyAnswer \| null }` |
| `SurveyAnswerRow` | `SurveyAnswer` ＋ `{ id, checkinId, name（チェックインの名前）, method: "line" \| "manual", createdAt }` |
| 選択肢 | `MONTHLY_PRICES`・`MONTHLY_PRICES_HIGH_FIRST`・`TESTER_ANSWERS`・`JOB_ROLES`・`JOB_TYPES` と `*_LABELS`・`NOT_ANSWERED_LABEL`（「答えない」）・`SURVEY_QUESTION_LABELS` |
| 並び | `SURVEY_SORTS`（`newest`・`price`）と `compareByMonthlyPrice` |
| `SURVEY_ERRORS` | `SURVEY_CLOSED`（409）・`SURVEY_NOT_CHECKED_IN`（403） |

## 画面

| 道 | 画面 | だれ |
|---|---|---|
| `/e/$eventId/survey`（`PARTICIPANT_ROUTE_PATTERNS.survey`） | P2 アンケートの画面 | ログインした人（答えられるのはチェックインした人） |
| `/admin/events/$eventId/concerns`（`ADMIN_ROUTE_PATTERNS.eventConcerns`） | 困りごと | 主催者（`EventAdminNav` の「困りごと」） |

差しこみ（`features/reception/index.ts`）：`registerCheckinPanelSection({ id: "survey-proxy-answer", … })`・`registerEventDataSection({ id: "survey-concerns-csv", … })`。問い合わせの鍵はどれも `"survey"` で始める。
