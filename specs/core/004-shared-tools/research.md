# Research: core-004 共通の道具をまとめると DB の変更の確かめ

## R1 CSV の道具の形

- **Decision**：包み `@workspace/csv` に、2つの関数を置く。
  - `csvCell(value: string): string`：式として読まれない守りと、`"` の囲み
  - `buildCsv(header: readonly string[], rows: readonly (readonly string[])[]): string`：BOM・CRLF・最後の行の CRLF

  見出しも `csvCell` を通す。今の見出しは守りの文字で始まらず、`"`・`,`・改行も含まないので、出力は変わらない。値の文字にする（ラベル・日時・数）のは、使う側の領域が行う。
- **Rationale**：守りと形を1か所にする（AD-18）。業務の型（チェックイン・回答）を知らないよう、文字の行だけを受け取る。
- **Alternatives**：
  - `kernel/csv.ts`：API の中に閉じて、切り出したサービスが取り込めないのでやめた（AD-18 の改定）。
  - 行のオブジェクトと列の定義を受け取る汎用の書き出し：今の2つの使い方には大きすぎる（原則 IV）。

## R2 日本時間の日時

- **Decision**：`packages/contracts/src/core/jst.ts` に `jstDateTime(instant: Date | string): string`（`YYYY-MM-DD HH:mm`）を足す。作り方は今の `jstDate` と同じで、UTC に9時間を足して `toISOString` で読む。reception と survey の `formatJstDateTime`（Intl の `en-CA`・`h23`）は消す。
- **Rationale**：日本時間の関数は contracts の core に1つ置く約束（構成の決めごと Consistency Conventions「ID・時刻」）。Intl の時刻帯のデータに頼らない。
- **確かめ**：同じ時刻で2つの書き方の出力が一致することを、日付の変わり目（日本時間 0時・23:59）と UTC の日付の変わり目を含めて単体のテストで確かめる。秒は切り捨てる（今と同じ）。

## R3 CSV を返すヘッダー

- **Decision**：`apps/api/src/kernel/http.ts` に `csvAttachment(basename: string, now = new Date()): Record<string, string>` を足す。返すヘッダーは次の2つ。
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="<basename>-<jstDate(now)>.csv"`

  領域は `c.body(csv, 200, csvAttachment("participants"))` と書く。`basename` は英小文字・数字・`-` だけで、それ以外なら投げる（ヘッダーの差しこみを防ぐ）。
- **Rationale**：Hono の `c.body` に渡すのはヘッダーの値だけなので、kernel の関数にすれば領域の書き方がそろう。`now` を渡せるのでテストで日付を固定できる。
- **Alternatives**：Hono の middleware：窓口ごとに名前が違うので、関数の方が単純。

## R4 画面のダウンロード

- **Decision**：`apps/web/src/lib/download.ts` に2つの関数を置く。
  - `fetchDownload(call: () => Promise<Response>, fallbackName: string): Promise<DownloadedFile>`
    - 通信の失敗は `NetworkError`
    - エラーの応答は `request` と同じ読み方で `ApiError`
    - `Content-Disposition` は RFC 6266 の形で読む（`filename*=UTF-8''…` を先に、なければ `filename="…"` か `filename=…`）。読めなければ `fallbackName`（`filenameFromDisposition`）
    - エラーの応答は、`lib/api.ts` に出した `apiErrorFrom`（`request` と同じ読み方・401 の知らせ）で ApiError にする（セルフレビュー：応答を `request` に戻して読ませる形は、`request` の分かれ道が増えると、エラーの本文を CSV として保存しうる）
  - `saveFile(blob, filename)`：今の DataPage と ConcernsCsvSection の写しをまとめる

  型 `DownloadedFile` は `{ blob, filename }`。reception と survey の `DownloadedCsv` は消す。
- **Rationale**：通信・エラー・ファイル名の読み方が2か所で同じだった。hono の client の `$get` の型は領域ごとに違うので、`Response` を返す関数を受け取る形にする。

## R5 DB の変更の確かめ

- **Decision**：`scripts/db/check-migrations.ts` を作り、`pnpm db:check` として `pnpm check` の最初のほう（`security:check` のあと）に入れる。手順は次の3つ。
  1. **記録の確かめ**（DB の道具を使わない）：`apps/api/drizzle/meta/_journal.json` を次の4点で確かめる。
     - `idx` が 0 から1つずつ増える
     - `when` が前より大きい
     - `tag` の SQL のファイルがある
     - 記録にない SQL のファイルがない
     - 落ちたら、どの記録かと直し方（develop の側を取って作り直す）を出す。
  2. **整合**：`drizzle-kit check` を流す。壊れた snapshot と、同じ親を指す2つの snapshot を止める。
  3. **作り忘れ**：`drizzle-kit generate` を流し、何かが作られれば作り忘れとして、作られるファイルの名前を出して落ちる。

  2・3 は、`drizzle` のフォルダの**一時の写し**に対して流す。写しの隣に、`out` だけを写しに向けた一時の設定（もとの `drizzle.config.ts` を読んで `out` を上書き）を置き、`--config` で渡す。`drizzle-kit check` は `out` を「`./`」に続けて読むので、`out` は API のフォルダからの相対の道で書く（手で確かめた）。本物のフォルダには一度も書かない。そのため、途中で止めても（Ctrl-C・CI の取り消し）作業の木を汚さず、写しから戻すときの失敗もない（セルフレビュー：最初の「本物で流して写しから戻す」形は、戻すのに失敗したり止められたりすると、コミットしていない DB の変更を失いうる）。
- 接続：`drizzle.config.ts` は `DATABASE_URL` を要るが、`check` と `generate` は DB に接続しない。`drizzle.config.ts` と同じ所（環境の値・ルートの `.env`）のどこにもないときは、仮の値（`postgres://check@localhost:1/check`）を渡して流す。
- 記録の形（`entries` が配列で、各行に `idx`・`when`・`tag`）が違えば、落ちずに理由を出す。
- 道具が名前の付け替えを対話で聞いてきたときに止まらないよう、標準入力を閉じ、時間の上限（60秒）を置く。落ちたら「表の名前や列の名前の付け替えは、手元で `pnpm db:generate` を流して答えてください」と出す。
- **Rationale**：drizzle-orm 0.45 の当てる処理は、`when` が古いものを黙って飛ばす。`drizzle-kit check` は、`when` の逆順を警告するだけで止めない（点検 review-verify-suite）。git の状態に頼らず写しで戻すので、手元のコミットしていない DB の変更を消さない。
- **Alternatives**：
  - `git diff --exit-code apps/api/drizzle`：コミットしていない正しい DB の変更も差分になり、手元で流せないのでやめた。
  - `drizzle-kit generate --out <写し>`：`--out` を渡すと設定のファイルを読まなくなり、`dialect`・`schema`・`casing` を全部 CLI に写す必要がある（設定が2か所になる）のでやめた。
  - CI だけで流す：CI は節約の決まりでラベルのときだけなので、手元の `pnpm check` に入れる。

## R6 包みの境界

- **Decision**：`eslint.config.js` に、`packages/*/src/**`（`contracts` と `ui` を除く）から `@workspace/*`・`apps/`・`packages/` を読ませない `no-restricted-imports` を足す。次の技術の道具の包みも、規則を直さずに同じく止まる（セルフレビュー）。`tests/lint` で、止まることを確かめる。
- **Rationale**：AD-18（業務を知らない・ほかの領域を読まない）を作りで守る。boundaries の規則は workspace の包みを外の包みとして扱うので、名前で止める。

## R7 動かすコンテナに包みを写す（セルフレビュー）

- **Decision**：`Dockerfile` の動かすコンテナに `packages/csv` を写し、テストのファイルを消す行にも足す。`tests/security/dockerfile.test.ts` で、API の本番の依存の workspace の包み（`apps/api/package.json` の `workspace:`）が、すべて写されていることを確かめる。
- **Rationale**：包みは pnpm のリンク（`node_modules/@workspace/csv` → `packages/csv`）なので、写し忘れると起動で `ERR_MODULE_NOT_FOUND` になり、デプロイが落ちる。手元の確かめと E2E は workspace の全体で動くので気づけない。コンテナを組み立てて、`@workspace/csv` が読めることも手で確かめた。
