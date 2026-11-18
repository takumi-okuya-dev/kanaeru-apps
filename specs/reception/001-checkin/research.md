# Research: チェックイン・合計・内訳・参加者の書き出し（reception-001）

2026-11-19 作成。開発者が不在のため、AI が仮に決めたもの（【仮決め】）を含む。仮決めは、開発者が見直して変えてよい。

## R1. 表 `checkin` の形

- **Decision**：1つの表に LINE と手のチェックインを置く。`account_id`（空を許す・`ON DELETE CASCADE`）があれば LINE、なければ手。手のときは `entered_by`（入れた人の account。空を許す・`ON DELETE SET NULL`）を持つ。一意は `(event_id, account_id) WHERE account_id IS NOT NULL`（`checkin_event_id_account_id_unique`）。選択肢の3つの列は `text` と CHECK（`checkin_application_source_check` など）。金額は `integer` と `amount >= 0`。チェックインの時刻は `created_at`。
- **Rationale**：AD-3・AD-6・AD-7 のとおり。手の行を別の表にすると、合計・一覧・survey の外部キーが2つに分かれる。手で入れたかは `account_id` の空で決まる（LINE の行は本人のアカウントが消えると行ごと消えるので、`account_id` が空の LINE の行はできない）。
- **Alternatives**：`method` の列を足す：`account_id` と食い違う行を作れてしまう。

## R2. 入れた人の名前は写さない【仮決め】

- **Decision**：`entered_by` の account の ID だけを持ち、一覧と CSV の名前は読むときに account の `findAccountById` で引く（同じ人は1回だけ引く）。入れた人のアカウントが消えたら `SET NULL` で空になり、「手でのチェックイン」の印だけが残る。
- **Rationale**：受付係も、消してほしいと頼まれたら消す（Constitution II）。名前を写すと、消したあとも残る。入れた人は1つの交流会で数人なので、1人ずつ引いても足りる（event の R7 と同じ）。

## R3. 自分でのチェックインの二重を防ぐ【仮決め】

- **Decision**：`POST /api/v1/events/{eventId}/checkins/me` は、行を足して 201 `{ checkin, alreadyCheckedIn: false }`。すでにあれば（先に読んで見つかる・同時の2回で一意の制約に当たる）、足さずに 200 `{ checkin（すでにあるもの）, alreadyCheckedIn: true }`。
- **Rationale**：FR-5「読み直すと『チェックイン済み』と出て、記録は増えない」。電波が悪く押し直したときにエラーを出すと、参加者が受付で止まる。同時の2回は DB の一意の制約で守る（coding.md 6-4）。
- **Alternatives**：409 を返す：画面がもう一度読み直す手間が増え、参加者には意味がない。

## R4. 同じ名前の印の付け方【仮決め】

- **Decision**：約束の `normalizeCheckinName(name)`（NFKC でそろえ、空白をすべて消す。前後の空白も消える）で比べる。同じ交流会の中で、そろえた名前が同じ行が2つ以上あり、**その中に手でのチェックインが1つ以上ある**とき、その手の行と、同じ名前のほかの行（LINE・手）の両方に `sameName: true` を付ける。LINE どうしだけのときは付けない。
- **Rationale**：PRD FR-5 は「手と LINE」。受付係が複数いると、同じ人を2人が手で入れることもあるので、手どうしも印を付ける（合計が増えすぎるのを防ぐ）。LINE どうしはアカウントが別なので、別の人として扱う。
- **Alternatives**：手と LINE だけ：手どうしの二重を見落とす。

## R5. 金額の決め方（AD-6）

- **Decision**：作るとき（自分・手）：`paymentMethod === "free"` なら0、ほかは `getEventSummary(db, config, eventId).fee`。直すとき（`PUT`。全部の欄を送る）：今の行と支払い方法が違うときだけ同じ決め方で決め直し、同じなら金額を変えない。合計は `sum(amount)`。
- **Rationale**：AD-6 のとおり。直す画面は全部の欄を送るので、名前だけを直しても支払い方法が同じなら金額は変わらない。

## R6. 一覧の並びと CSV の並び【仮決め】

- **Decision**：一覧は `created_at` の新しい順（同じ時刻は ID の新しい順）。CSV は古い順。
- **Rationale**：受付の最中は、来たばかりの人を上で確かめたい。CSV は名簿として来た順に読む。

## R7. 窓口の形

- **Decision**（道の頭は `/api/v1/events/{eventId}/checkins`。`operationId` は `reception` で始める）：

  | 動き | 道 | だれ |
  |---|---|---|
  | GET・POST | `…/checkins/me` | ログインした人（交流会があれば） |
  | GET・POST | `…/checkins` | 主催者・受付係 |
  | PUT・DELETE | `…/checkins/{checkinId}` | 主催者・受付係 |
  | GET | `…/checkins/totals` | 主催者・受付係 |
  | GET | `…/checkins/breakdown` | 主催者 |
  | GET | `…/checkins/export` | 主催者（`text/csv`） |

  - 自分の窓口は `requireSession` だけを付け、交流会がなければ 404（event の `NOT_FOUND`。`getEventSummary` が null）。
  - 管理の窓口は `requireSession` と `requireEventRole(deps, ["organizer", "staff"])`（内訳と CSV は `["organizer"]`）。
  - 直す・取り消すは、`{checkinId}` がその交流会のものでなければ 404 `CHECKIN_NOT_FOUND`。
  - `PUT` は名前と3つの選択肢を全部送る（自分・手・直すで同じ入力 `CheckinInput`）。
- **Rationale**：Consistency Conventions の道の頭。`me` と `totals`・`breakdown`・`export` は決まった文字なので、`{checkinId}`（uuid）とぶつからない（GET の `{checkinId}` はない）。

## R8. 選択肢の code【仮決め】

- **Decision**：
  - 申し込みの媒体 `applicationSource`：`connpass`（connpass）・`peatix`（Peatix）・`direct`（直接）・`other`（その他）
  - 知ったきっかけ `referral`：`friend`（知人の紹介）・`sns`（SNS）・`announcement`（connpass などの告知）・`other`（その他）
  - 支払い方法 `paymentMethod`：`paypay`（PayPay）・`cash`（現金）・`free`（無料（招待など））
  - 並び順は PRD FR-4 のとおり。code・言葉・並びは `packages/contracts/src/reception/options.ts` の1か所（zod を読まない）。
- **Rationale**：Consistency Conventions「選択肢」。知ったきっかけの code は PRD にないので仮に決めた。

## R9. 名前の入力【仮決め】

- **Decision**：前後の空白を除いて1〜50文字（account の表示名の上限と同じ）。DB には入れた形（前後の空白を除いたもの）を持ち、比べるときだけそろえる。
- **Rationale**：手で打った名前をそろえて書きかえると、受付係の見た目と食い違う。

## R10. ほかの領域が A3・A5 に節を足す「差しこみの場所」【仮決め】

- **Decision**：reception の画面の入口が、2つの登録の関数を出す（並行開発の決まり 3-1 の「差しこみの場所」）。
  - `registerEventDataSection({ id, Component })`：A5（書き出しと削除）の節。`Component` は `{ event: EventView }` を受け取る（survey の「困りごとをCSVで書き出す」）。
  - `registerCheckinPanelSection({ id, Component })`：A3 の直す枠の中、主催者が**手でのチェックイン**を開いたときだけ出す節。`Component` は `{ event: EventView; checkin: CheckinView }` を受け取る（survey の「アンケートの回答を入れる」。A9）。
  - survey は自分の `index.ts` で登録する（`features.list.ts` が全部の入口を読むので、描く前に済む）。
- **Rationale**：EXPERIENCE は A5 に困りごとの CSV、A3 の手の行の枠に回答の入力を置く。reception のフォルダを survey が直さずに済む。
- **Alternatives**：survey が自分の画面にだけ置く：EXPERIENCE の置き場所と違う。

## R11. CSV の形【仮決め】

- **Decision**：UTF-8 の BOM ＋ CRLF。見出し「名前,チェックインの時刻,申し込みの媒体,知ったきっかけ,支払い方法,金額,入れ方,入れた人」。時刻は日本時間 `YYYY-MM-DD HH:mm`、選択肢は画面の言葉、金額は数字だけ、入れ方は「LINE」か「手」。`,`・`"`・改行を含む欄は `"` で囲む。`=`・`+`・`-`・`@`・タブ・CR で始まる欄は先頭に `'` を足す（式として読ませない）。ファイル名は `participants-{日本時間の日付}.csv`。
- **Rationale**：Consistency Conventions「書き出し」・FR-15（Excel で文字化けしない）。名前は利用者が入れた値なので、式の差しこみを防ぐ。
- **画面**：`fetch` で受けて Blob にし、`a[download]` で保存する（エラーのときは JSON のエラーを読んでボタンの近くに出す）。

## R12. 何をどう使うかの1文【仮決め】

- **Decision**：P1 の「チェックインする」の上に「お名前と選んだ答えは、この交流会の受付と、主催者の集計だけに使います。」を出す。プライバシーポリシーのリンクは、主催者が URL を用意するまで置かない。
- **Rationale**：PRD 5章・EXPERIENCE Open Questions 2（公開前に主催者が用意する）。

## R13. 一覧画面の読み直しと状態【仮決め】

- **Decision**：一覧と合計と内訳を TanStack Query の `refetchInterval: 5000` で読み直す。エラーが 503 `DB_UNAVAILABLE` のときは止める（EXPERIENCE「自動で何度も読み直さない」）。読み直しが失敗しても前のデータを出したまま、タブの上に「最新にできませんでした」。手でのチェックイン・直す・取り消し・消すのあとは、鍵 `["reception", …]` をまとめて読み直す。読み直しは読み上げない（`aria-live` を付けない）。
- **Rationale**：Consistency Conventions「一覧画面の更新」・FR-11（数秒以内）。

## R14. 選択肢のチップの部品（共通の変更）【仮決め】

- **Decision**：`packages/ui/src/components/choice-chips.tsx` に、Base UI の `RadioGroup`・`Radio`（shadcn/ui の Base UI の形と同じ元）で `ChoiceChips` を足す。チップそのものが `role="radio"`（文字が名前）、まとまりが `role="radiogroup"`（設問の見出しと結ぶ）。高さ 48px（`min-h-xl`。44px 以上）・ふだんは `border-border-input` の 1px・選んだら `bg-primary-subtle` と `border-primary` の 2px とチェックの印と太字（DESIGN の choice-chip）。誤りは設問の下に出し、まとまりに `aria-invalid` と `aria-describedby`。
- **Rationale**：P1・A3（reception）と P2（survey）が同じ部品を使う。部品は `@workspace/ui` に置く決まり（coding.md 6-3）。共通のファイルなので別のコミットに分け、共通の PR に切り出せる形にした（並行開発の決まり 3-3）。
- **Alternatives**：reception の中に置き survey に出す：部品の置き場所の決まりと違う。

## R15. 参加者のデータを消す画面（A5）【仮決め】

- **Decision**：A5 にその交流会の参加者を並べ、行ごとの「削除」から確かめの枠を出す。アカウントのある人：「{名前}さんのアカウント・チェックイン・アンケートの回答を消します。ほかの交流会のチェックインと回答も消えます。元に戻せません。」→ account の `DELETE /api/v1/accounts/{accountId}`。手でのチェックイン：「{名前}さんのチェックインとアンケートの回答を消します。元に戻せません。」→ reception の取り消し。主催者自身のアカウントには「削除」を出さない（消すとログインが切れる）。
- **Rationale**：FR-16・AD-7・EXPERIENCE「参加者のデータを消す」。一覧の行には `accountId`（LINE のとき）を載せる（内部の ID で、受付係に見えても使い道がない）。

## R16. 機能の印・見本のデータ

- **Decision**：機能の印では止めない。見本のデータ（`db:seed`）にチェックインは足さない。
- **Rationale**：受付は 11-25 の交流会の要。見本は本物の名簿に混ざる恐れがある（event の R12 と同じ）。
