# Research: 交流会・要約・QR・受付係と招待・アンケートの開閉・権限（event-001）

2026-11-19 作成。開発者が不在のため、AI が仮に決めたもの（【仮決め】）を含む。仮決めは、開発者が見直して変えてよい。

## R1. 交流会ごとの権限の引き方（AD-5）

- **Decision**:
  - `getEventRole(db, config, eventId, account)`：交流会がなければ `null`。あれば、`isOrganizer(config, account)` なら `"organizer"`、`event_staff` に組があれば `"staff"`、ほかは `null`。1つの命令（`event` に `event_staff` を左から結ぶ）で、あるかと受付係かを一緒に読む。
  - `requireEventRole(deps, roles)`：`requireSession(deps)` のあとに付ける middleware。道の `{eventId}` を読み、uuid の形でない・ない交流会は 404（code `NOT_FOUND`・event の文）、役目が `roles` になければ 403（code `FORBIDDEN`・event の文）。通したら役目を文脈に置き、処理は `currentEventRole(c)` で読む。
  - middleware は `@hono/zod-openapi` の入力の確かめより前に動くので、道の値の形は middleware の中で確かめる（`uuidParam` の 404 と同じ答え）。
  - 役目はセッションに写さず、要求のたびに引く（外した受付係は次の要求から 403）。
- **Rationale**: reception・survey が同じ形で使え、権限の確かめ方が領域ごとにばらばらにならない。404 を 403 より先にするのは、ID の形の誤りと同じ答えにするため（交流会の ID は uuidv7 で推し量りにくく、要約はログインした誰でも読めるので、あるかどうかは秘密でない）。
- **Alternatives**: 役目を `app.use("/api/v1/events/:eventId/*")` で付ける：組み立てが領域の道を1つの木に足すため、reception・survey の道にも勝手に効く（account の R7 と同じ理由）。

## R2. エラーの code と文言【仮決め】

- **Decision**：403 と 404 の code は土台と同じ `FORBIDDEN`・`NOT_FOUND` のまま、文言だけを event の約束で決める（`EVENT_ERRORS.FORBIDDEN`・`EVENT_ERRORS.NOT_FOUND`）。招待は `STAFF_INVITE_INVALID`（404。形が違う・知らない・作り直された）と `STAFF_INVITE_EXPIRED`（410。交流会の日が終わった）。文はどちらも EXPERIENCE の「この招待のリンクは使えません。主催者に新しいリンクをもらってください」を元にする。
- **Rationale**: 構成の約束「権限なしは 403」。画面は code と状態の番号で振る舞いを決め、文はそのまま出せる。

## R3. 招待の印は DB にそのまま持つ【仮決め】

- **Decision**：`staff_invite` は交流会ごとに1行（`event_id` 一意）。印は 32 バイトの乱数の base64url（43文字。セッションの札と同じ形）を `token` に一意で持つ。作り直しは同じ行の印と作った時刻を替える（`INSERT … ON CONFLICT (event_id) DO UPDATE`）。
- **Rationale**：主催者が準備の画面を開き直しても、今のリンクを写せる要がある（spec の取り決め「今のリンクを読む」）。SHA-256 だけを持つと、開き直すたびに作り直すことになり、前に送ったリンクが使えなくなる。印で得られるのは受付係（参加者の名前と合計を見る・手でチェックインする）までで、困りごと・書き出し・削除には届かない。DB の読み出しが漏れたときは、作り直せば前の印は使えない。
- **Alternatives**：SHA-256 だけを持ち、リンクは作った直後だけ出す：主催者が受付係ごとに作り直すと、前の人のリンクが使えなくなる。暗号化して持つ：鍵の置き場所（Secret Manager）が増える（Constitution V）。

## R4. 交流会の日時は始まりだけ【仮決め】

- **Decision**：`starts_at`（timestamptz）だけを持つ。画面は日本時間の日付（`type="date"`）と時刻（`type="time"`）の2つの欄で入れ、`YYYY-MM-DDTHH:mm:00+09:00` にして送る。API は時差つきの ISO 8601 だけを受け取る。出すときは `Intl.DateTimeFormat`（`timeZone: "Asia/Tokyo"`）。
- **Rationale**：PRD は「日時」1つ。招待の期限（AD-5）は日付だけで決まる。`datetime-local` は端末の時刻帯で読むので、日本時間に固定するために日付と時刻を分けた。

## R5. 一覧の並びと、受付係・どちらでもない人の一覧【仮決め】

- **Decision**：日時の新しい順（同じ日時は作った順の新しい方）。主催者はすべて、受付係は自分の交流会だけ、どちらでもない人は空（403 にしない。A1 の空の状態を出す）。行ごとに `myRole` を付ける。
- **Rationale**：主催者がいちばん使うのは次の交流会。参加者が一覧を開いても、ほかの交流会の名前を見せない。

## R6. 入力の決まり【仮決め】

- 名前：前後の空白を除き1〜100文字。会場：1〜200文字（要る）。参加費：0〜1,000,000 の整数（円）。
- GoogleフォームのURL・LINEグループの招待リンク：任意。空・なしは `null`。あれば `https://` の URL・2,000文字まで（参加者の画面のリンクに `javascript:` などを入れさせない）。LINE グループの源（`line.me`）までは絞らない（LINE が形を変えても止まらないように）。
- 交流会の日時を過去にすることは止めない（あとで記録を直すことがあるため）。

## R7. 受付係の一覧の表示名

- **Decision**：`event_staff` を読み、表示名は account の `findAccountById(db, id)` で1人ずつ引く。
- **Rationale**：AD-3（ほかの領域の表は、その `index.ts` の関数で読む。`accountTable` は外部キーのためだけ）。受付係は1つの交流会に数人なので、1人ずつ引いても足りる。

## R8. QR の作り方と、LIFF ID のない画面【仮決め】

- **Decision**：
  - QR は画面で作る（`uqr` 0.1.3。依存なし・MIT・ESM）。`encode(中身, { ecc: "M", border: 0 })` の点の並びから、React で SVG（1つの `path`）を描く。HTML の文字を差しこまない。点は `{colors.text}`（`currentColor`）、地は `{colors.surface}`、まわりに4モジュールの余白、画面では一辺 240px 以上（DESIGN の qr-display）。
  - 中身：`miniAppPermalink(LIFF ID, participantPaths.checkin(eventId))`（アンケートは `.survey`、招待は `.invite(印)`）。LIFF ID は組み立てのときに埋めた `__LIFF_ID__`。
  - LIFF ID のない手元・E2E は、画面の源＋参加者の道（例 `http://127.0.0.1:9787/e/{id}/checkin`）を入れ、「LINE につながない手元の形のため、画面の URL を入れています」と書く。本番の組み立ては LIFF ID を必ず埋める（AD-14 の「QR に置き場所の URL を入れない」は本番で守る）。
  - 印刷：準備の画面から、QR ごとの印刷の画面（1枚に1つ。「受付QR」「アンケートQR」の見出し・交流会の名前・QR を大きく）を開き、「印刷する」で `window.print()`。印刷のときは外枠の帯とナビと「印刷する」を隠す（event の CSS が、印刷の画面があるときだけ `@media print` で隠す）。
- **Rationale**：API は LIFF ID を知らない（画面の組み立ての値）。画面で作れば API に設定を足さずに済む。`uqr` は依存がなく小さい（`qrcode` は `pngjs`・`yargs` などを連れてくる）。`pnpm audit` は通った。
- **Alternatives**：`qrcode-generator`（依存なし。型が別・CommonJS）。`qrcode`（依存が多い）。API で PNG を作る：API に LIFF ID の設定が要る。

## R9. 管理の画面の道と、行き来のナビ（`EventAdminNav`）【仮決め】

- **Decision**：
  - 道の形は `@workspace/contracts/event` の `ADMIN_ROUTE_PATTERNS`（TanStack Router の `path` にそのまま使う形）と `adminPaths`（値を入れた道を作る関数）に置く。

    | 名前 | 道 | 持ち主 |
    |---|---|---|
    | `eventList` | `/admin/events` | event（A1） |
    | `eventNew` | `/admin/events/new` | event（A2） |
    | `eventEdit` | `/admin/events/$eventId/edit` | event（A2） |
    | `eventSetup` | `/admin/events/$eventId/setup` | event（A4） |
    | `eventQrPrint` | `/admin/events/$eventId/setup/qr/$kind`（`checkin`・`survey`） | event（印刷） |
    | `eventReception` | `/admin/events/$eventId` | reception（A3 の参加者・合計） |
    | `eventConcerns` | `/admin/events/$eventId/concerns` | survey（A3 の困りごと） |
    | `eventData` | `/admin/events/$eventId/data` | reception（A5。困りごとの CSV は survey が節を足す） |

  - `EventAdminNav`（`features/event` の入口から出す）：`eventId` と今の役目を受け取り、「参加者・合計」（受付係も）・「困りごと」（主催者だけ）・「準備」（主催者だけ）を横に並べる。**その道が道の木に登録されているときだけ**項目を出す（reception・survey が道を足すと、event を直さずに出る。並行開発の決まり 3-1 の差しこみの場所）。今の画面は `aria-current="page"`。
  - 交流会の一覧の行の行き先は、ナビの最初の項目（受付係は「参加者・合計」があればそこ、なければ行き先なし）。招待を受けたあとも同じ。
  - ナビ（外枠）に「交流会」（`/admin/events`）を出す。はじめの画面（`/`）はナビの最初の項目へ移るので、受付係と主催者がミニアプリを開き直すと一覧に来る。
- **Rationale**：EXPERIENCE は A1〜A5 の道を仮の形とした。道が領域ごとに食い違わないよう、1か所の定数にした。道は参加者が外から開かないので、AD-14 の `core` ではなく event の約束に置く。
- **共通のファイルの変更**（並行開発の決まり 3-3。別のコミットに分け、要れば共通の PR に切り出せる形にした）：
  - `e2e/env.ts`：E2E の主催者の LINE のユーザー ID を決める（`ORGANIZER_LINE_USER_ID`。reception・survey の E2E も使う）。
  - `e2e/tests/a11y.spec.ts`・`e2e/tests/keyboard.spec.ts`：はじめの画面（`/`）が「見つからない」と決め打ちしていたので、ナビの最初の項目へ移っても通る形にする（領域の名前は書かない）。

## R10. アンケートの開閉の窓口

- **Decision**：`PUT /api/v1/events/{eventId}/survey`（`{ open: boolean }`）。何度送っても同じ結果。答えは `{ surveyOpen }`。
- **Rationale**：開く・閉じるの2つの道より少なく、二度押しでも困らない。

## R11. 招待を受ける流れ

- **Decision**：
  - `GET /api/v1/staff-invites/{inviteToken}`（ログイン必須）：交流会の名前・日時・期限・自分の役目（受ける前の役目）を返す。P3 が「受ける」の前に出す。
  - `POST …/accept`：印が知らない → 404 `STAFF_INVITE_INVALID`。すでに主催者・受付係 → 何もせず 200（期限にかかわらず。EXPERIENCE「すでに受付係なら、そのまま A3 へ」）。期限（`now < endOfJstDate(starts_at)`）を過ぎた → 410 `STAFF_INVITE_EXPIRED`。ほかは `event_staff` を足して 200（同時の2回は一意の制約で1つ）。答えは `{ eventId, role }`。
  - 印はログに出さない（道の形のログは土台が出す。`/api/v1/staff-invites/…` の道の値は要求の1行に出るので、土台のログの決まりを確かめた：要求の1行は `routePath`（`:inviteToken` の形）を出す）。
- **Rationale**：AD-5。主催者が自分のリンクを試しても受付係の行を作らない。

## R12. 機能の印・見本のデータ

- **Decision**：設定の機能の印（`DOMAIN_FEATURES`）では止めない。見本のデータ（`db:seed`）に交流会は足さない。
- **Rationale**：event は受付の前提で、止めると reception・survey も止まる。止めたいときは主催者が交流会を作らなければよい。見本の交流会は、本物の交流会と一覧で混ざる恐れがある。
