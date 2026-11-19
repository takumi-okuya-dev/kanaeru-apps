# Research: アンケートの回答・困りごとの一覧と書き出し（survey-001）

2026-11-19 作成。開発者が不在のため、AI が仮に決めたもの（【仮決め】）を含む。仮決めは、開発者が見直して変えてよい。

## R1. 表 `survey_answer` は `checkin_id` だけでひもづける【仮決め】

- **Decision**：`survey_answer` は `id`・`checkin_id`（NOT NULL・一意 `survey_answer_checkin_id_unique`・`checkinTable.id` を `ON DELETE CASCADE`）・`concern`・`monthly_price`・`tester`・`job_role`・`job_type`・`created_at`・`updated_at`。交流会の ID は写さない。交流会ごとの一覧と CSV は、reception の `listCheckins(db, eventId)` で引いたチェックインの ID で回答を集める（`checkin_id IN (…)`）。
- **Rationale**：AD-3 の表の持ち物のとおり（`checkin_id`・困りごと・月いくら・テスター・仕事の立場・職種）。交流会の ID を写すと、チェックインと食い違う行を作れてしまう（写してよいのは「入れるときに写し、変えない」場合だけで、要らなければ持たないほうが小さい。Constitution IV）。1回の交流会は数十人なので、`IN` で足りる。名前もチェックインから引く（AD-6）ので、一覧は `listCheckins` を1回引けば済む。
- **Alternatives**：`event_id` を写す：一覧の索引は効くが、表が1列増え、写した値の正しさを守る仕組みが要る。

## R2. 選択肢の code と「答えない」

- **Decision**：約束 `packages/contracts/src/survey/options.ts` に置く（zod を読まない）。
  - 月いくら `MONTHLY_PRICES`：`jpy0`（0円）・`jpy500`（500円）・`jpy1000`（1,000円）・`jpy3000plus`（3,000円以上）・`unknown`（分からない）。高い順 `MONTHLY_PRICES_HIGH_FIRST`：`jpy3000plus`・`jpy1000`・`jpy500`・`jpy0`・`unknown`。
  - テスター `TESTER_ANSWERS`：`yes`（はい）・`no`（いいえ）。DB は `text` と CHECK（Conventions「選択肢」。真偽の列にしない）。
  - 仕事の立場 `JOB_ROLES`：`executive`（経営者）・`manager`（管理職）・`employee`（会社員）・`freelance`（フリーランス）・`student`（学生）・`other`（その他）。
  - 職種 `JOB_TYPES`：`engineer`（エンジニア）・`designer`（デザイナー）・`sales`（営業）・`marketing`（マーケティング）・`planning`（企画・PM）・`backoffice`（事務・管理部門（人事・経理・総務など））・`management`（経営）・`other`（その他）。
  - 「答えない」`NOT_ANSWERED_LABEL`。API と DB では空（null）。画面のチップだけ `none` の値で持ち、送るときに null にする（`ChoiceChips` は1つ選ぶ形なので、選んだ状態で「答えない」を出すため）。
  - 「答えない」のチップは、選択肢の4つの設問（月いくら・テスター・仕事の立場・職種）のどれにも最後に置き、新しい回答では最初に選んでおく（前の回答で空の設問も「答えない」で出す）。どの設問も必須にしない（A7）ので、いちど選んだ月いくら・テスターも、答えないに戻せるようにする（`ChoiceChips` は選んだものを外せないため）。
- **Rationale**：Conventions のとおり英語の短い code と言葉と並びを隣に持つ。言葉は PRD FR-10・EXPERIENCE のまま。

## R3. 入力の形：どれも任意で、全部を送り直す

- **Decision**：`SurveyAnswerInput` は知らない欄を誤りにする `strictObject`。5つの欄はどれも省略でき、`null` も受ける（省略は null）。困りごとは前後の空白を除いて2,000文字まで、空なら null として持つ。`PUT` は全部を置きかえる（送らなかった欄は null になる）。正規化 `normalizeSurveyAnswer(input)` は約束に置き、API が使う。
- **Rationale**：どれも必須にしない（A7）。直すときは画面が全部の欄を送るので、置きかえで足りる。2,000文字は「仕事の困りごと」を書くのに十分で、CSV と一覧が崩れない長さ【仮決め】。

## R4. 何も入れずに送った回答も受け付ける【仮決め】

- **Decision**：全部が空の回答も行として作り、お礼の状態を出す。困りごとの一覧にも行として出る（困りごとの欄は空）。
- **Rationale**：どれも必須にしない（A7）。押した人に誤りを出さない（気軽さ。Constitution III）。「答えた人の数」が分かる。

## R5. 参加者の回答の窓口と、断る順

- **Decision**：`GET …/survey-answers/me`：要約がなければ 404（event の `NOT_FOUND`）。`{ checkedIn, answer }` を返す（開閉にかかわらず読める。画面は要約の `surveyOpen` と合わせて状態を決める）。`PUT …/survey-answers/me`：要約がなければ 404 → 閉じていれば 409 `SURVEY_CLOSED` → チェックインがなければ 403 `SURVEY_NOT_CHECKED_IN` → `INSERT … ON CONFLICT (checkin_id) DO UPDATE`。答えは 200 の回答。
- **Rationale**：AD-13（書くたびに `getEventSummary` で開閉を読む。今の account → `findCheckin` → `checkin_id`）。閉じているときは、チェックインがあってもなくても答えられないので、先に「閉じています」を伝える（画面の状態の順と同じ）。同時の2回は一意の制約と `ON CONFLICT` で1行に守る（coding.md 6-4）。
- **Alternatives**：チェックインがない人に 404：交流会がないのと見分けられない。

## R6. 主催者の代わりの入力【仮決め】

- **Decision**：`GET`・`PUT …/survey-answers/checkins/{checkinId}`（主催者だけ）。reception の `getCheckin` で引き、ない・別の交流会なら 404（reception の `CHECKIN_NOT_FOUND` を使う）。開閉は見ない。窓口は LINE のチェックインにも受けるが、画面の節は手でのチェックインを主催者が開いたときだけ（reception の差しこみの場所がそう出す）。
- **Rationale**：AD-13（閉じていても受ける）・A9。主催者は1人で信頼できるので、窓口で手に絞る決まりを足さない（参加者が LINE で答えられないときに主催者が直せる余地を残す）。

## R7. 一覧の並びと絞りこみ【仮決め】

- **Decision**：`GET …/survey-answers?tester=yes&sort=price`。既定（`sort=newest`）は回答を作った時刻の新しい順（同じ時刻は ID の新しい順）。`sort=price` は `MONTHLY_PRICES_HIGH_FIRST` の順 → 答えていない（null）を最後、同じ答えの中は既定の順。`tester=yes` は「はい」だけ。並べ替えと絞りこみは API が行う（画面は問い合わせの値を渡す）。
- **Rationale**：EXPERIENCE「『分からない』と答えていない人は、高い順の最後」。作った時刻で並べると、直しても行が動かない。

## R8. 回答済みの人が開き直したとき【仮決め】

- **Decision**：アンケートが開いていれば、前の答えが入った入力の画面を「回答済みです。直すときは、答えを変えて送り直してください。」の1文つきで出す。ボタンは「送り直す」。送ったらお礼の状態。
- **Rationale**：EXPERIENCE「開いている間に開き直すと、前の答えが入った状態で出て、送り直せる。ボタンは『送り直す』」。

## R9. 画面の状態の順と文

- **Decision**：P2 は要約（event の `useEventSummary`）と自分の回答（`GET …/me`）を読み、①読めない（404 → 「この交流会は見つかりません」・夜間の停止・ほか）②閉じている（h1「アンケートは閉じています」・交流会の名前）③チェックインしていない（h1「先にチェックインしてください」・「チェックインの画面へ」〈`participantPaths.checkin`〉）④入力（h1「仕事の困りごとを聞かせてください」・本文と箇条書き2つは EXPERIENCE のまま）⑤お礼（同じ画面の h2「あなたの困りごとが、解決する企画やアプリにつながります」にフォーカス）の順に決める。送ったときの 409・403 は「送る」の近くに出し、値を残す。
- **Rationale**：EXPERIENCE の P2・State Patterns・Accessibility Floor。案内の見出しを h1 にすると、外枠が道の変わり目にフォーカスを移す先がそのまま案内になる。

## R10. 困りごとの画面の絞りこみ・並べ替えの部品

- **Decision**：表の上に2つの選択肢のチップ（「絞りこみ」：すべて／テスターに「はい」だけ、「並べ方」：回答の新しい順／月いくらの高い順）。広い画面は表（名前・困りごと・月いくら・テスター・仕事の立場・職種）、狭い画面はカード。空は「まだ困りごとはありません」（閉じていれば「準備の画面でアンケートを開く」へのリンク）、絞りこんで0件は「テスターに「はい」と答えた人はいません」。5秒おきに読み直す。CSV への入口は A5（書き出しと削除）。
- **Rationale**：部品は `@workspace/ui` の `ChoiceChips` を使い、新しい部品を作らない（coding.md 6-3）。キーボードで矢印で移れる。

## R11. 代わりの入力の節（A3）と CSV の節（A5）

- **Decision**：A3 の節は見出し h3「アンケートの回答」・今の回答の有無の1文・「アンケートの回答を入れる」（回答があれば「アンケートの回答を直す」）。押すと節の中に P2 と同じ欄（`SurveyFields`）と「回答を保存」「やめる」を開く（枠を重ねない）。保存したら欄を閉じ、「アンケートの回答を保存しました。」を近くに出し、困りごとの問い合わせを読み直す。A5 の節は h2「困りごとをCSVで書き出す」・説明・ボタン（reception の参加者の CSV と同じ形）。
- **Rationale**：reception の差しこみの場所の約束（A3 は枠を重ねず節の中で欄を開く・A5 は h2 から始める）。

## R12. CSV の形

- **Decision**：見出し `名前,困りごと,月いくら,テスター,仕事の立場,職種,入れ方,回答の時刻`。回答を作った時刻の古い順。空と「答えない」は空欄。入れ方は「LINE」か「手」（チェックインの入れ方）。回答の時刻は日本時間の `YYYY-MM-DD HH:mm`（直した時刻）。BOM・CRLF・`=`・`+`・`-`・`@`・タブ・CR で始まる欄は先頭に `'`・`,`・`"`・改行を含む欄は `"` で囲む（reception と同じ形を survey の `csv.ts` に置く。reception の内部は読まない）。ファイルの名前は `concerns-YYYY-MM-DD.csv`。
- **Rationale**：Conventions「書き出し」・reception R11 にそろえる。困りごとは改行を含むので、囲みが要る。
- **共通にする残り**：CSV の欄の書き方（`csvCell`・日本時間の日時）と、画面で受け取った CSV を保存させる道具（`ConcernsCsvSection.tsx` の保存）は、reception と同じものが2か所にある。領域の PR では直さず、共通に出す小さな PR に回す（backlog A-3）。

## R13. 困りごとの本文をログに出さない

- **Decision**：survey のコードは logger を呼ばない。要求ごとのログ1行は道の形と状態の番号だけ（土台）。エラーで投げるものに本文を入れない。
- **Rationale**：Constitution II・Conventions「ログ」。
