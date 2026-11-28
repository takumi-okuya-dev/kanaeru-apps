# Research: 読書記録の Kindle の取りこみ・探す・あとで調べる（reading-002）

決めた理由と仮決め。元は [PRD 読書記録](../../../_bmad-output/prd-kanaeru-reading/prd-kanaeru-reading.md)・[補足](../../../_bmad-output/prd-kanaeru-reading/addendum.md) 7章・[reading-001 の research](../001-bookshelf-import/research.md)。【仮決め】は持ち主の確かめを待つ。

## R1 PR の分け方

- **Decision**：pr1（DB の変更：マーカーに `learned`・`researched_at` を足す）と pr2（窓口と画面）。reading-001 と同じ。
- **Rationale**：AD-17。DB の変更を小さく先に入れる。

## R2 Kindle の書き出しの HTML の読み方

- **Decision**：画面の reading の領域（`apps/web/src/features/reading/import/kindle.ts`）に、状態を持たない関数を置く。`DOMParser`（`text/html`）で読み、スクリプトは動かさず `textContent` だけを使う。
  - 見分け：`.bookTitle` と `.noteHeading` があれば Kindle の書き出し。
  - 上から順に `.sectionHeading`（今の章）・`.noteHeading` と次の `.noteText` を組にする（入れ子なし）。
  - 見出しに `span[class^="highlight_"]` があればハイライト、なければメモ（言葉に頼らない）。
  - 見出しの中の数字（カンマを除く）のうち最後を位置、その前があればページ（「Page 9 · Location 55」・「ページ 9 · 位置No. 55」のどちらでも）。ラベルの言葉は見ない【仮決め】。
  - メモは直前のハイライトに付ける。直前がメモか、ない・位置が離れている（ハイライトの位置から 10 より大きく離れる）ときは、コメントだけのマーカーにする【仮決め】。
  - `position` は、ページがあればページ × 100,000 ＋ 位置、なければ位置（本の中の順）。
  - 書名は `.bookTitle`、著者は `.authors`。確かめの画面で入れる本を選ぶのに使う（reading-001 の `guessBook`）。
- **Rationale**：補足 7章。表示の言葉は言語で変わるが、クラスの名前は英語のまま。
- **Alternatives**：言葉で読む（日本語の実物がないので危うい）。サーバーで読む（AD-34 に反する）。

## R3 Web のノートブックの貼り付けの読み方

- **Decision**：行の並びのうち、「色｜位置」の行（`|` か `｜` を含み、位置かページの数字がある行）を区切りにし、次の行をハイライトの文、そのあとに「メモ」「Note」で始まる行があればコメントにする【仮決め】。日本語の実物で確かめるまでは、英語の形（`Yellow highlight | Location: 1,234`）と、推測の日本語の形の両方を見本にする。
- **Rationale**：補足 7章。Web のノートブックには書き出しのボタンがない。

## R4 「…」で終わるハイライト

- **Decision**：「…」か「...」で終わるハイライトの数を確かめの画面に出し、「出版社の上限で切れたかもしれません」と書く。切れたとは決めつけない（自動で「…」が付くことがある）。

## R5 探す

- **Decision**：
  - 窓口は `POST /api/v1/reading/search`（本文 `{ query }`。1〜100字）。言葉は URL に載せない。
  - そろえ方（NFKC → カタカナをひらがなに → 小文字）と、当たった所をもとの文の中の位置で返す関数を、`packages/contracts/src/reading/search.ts` に置く（人物メモと同じ考え方。領域どうしで共通にしない。AD-18）。
  - DB では、そろえた形の列を持たず、`lower()` の部分一致（`LIKE … ESCAPE`）で候補を本人の行から取り、API でそろえ方の関数で当たりを確かめ直す（かなと全角の違いを DB で吸収できないため）。1人の記録は数千件までなので、本人のマーカーを全部読んでも重くない。数が増えたら、そろえた形の列を足す【仮決め】。
  - 対象：マーカーの文・コメント・分かったこと（消していないもの）・本の書名と分かりたいこと。結果は本ごとに、当たったマーカーを本の中の順に、1冊20件・全体100件まで。
- **Rationale**：人物メモ（AD-31）と同じ形。全文検索の仕組みは入れない（AD-32）。
- **Alternatives**：pg_bigm（Cloud SQL のフラグが要る。数が増えてから）。

## R6 あとで調べる

- **Decision**：
  - 窓口は `GET /api/v1/reading/questions`（`question` が真で消していないマーカーを、本の書名・分かりたいことつきで。調べていないものが先）と、`PATCH /api/v1/reading/markers/{id}` に `learned`（分かったこと）を足す。`learned` を入れると `researched_at` を今にする。空にすると両方を消す。
  - 調べる文の組み立ては `packages/contracts/src/reading/research-prompt.ts`（書名・章・マーカーの文・コメント・分かりたいこと）。AD-20 の AI の作業の置き場所。
  - 調べる先の URL の頭は約束に決め打ち（ChatGPT `https://chatgpt.com/?q=`・Claude `https://claude.ai/new?q=`・Google `https://www.google.com/search?q=`）。URL が 2,000 字をこえるなら、開かずにコピーに切りかえる【仮決め】。
  - 調べる先の選び方は `localStorage`（読み書きは try/catch。読めなければ ChatGPT）。
  - 取りこみ直しは `learned`・`researched_at` を変えない（reading-001 の ON CONFLICT は、この2つを触らない）。
- **Rationale**：PRD FR-R19〜FR-R21。PaletKit から外の AI へは何も送らない（AD-20 の貼る形と同じ）。

## R7 どの章を読んだか

- **Decision**：本の画面の上に「マーカーのある章 N」と、章の名前とマーカーの数の一覧（押すとその章へ移る。見出しの `id`）。目次がないので、ない章は出さない。
- **Rationale**：PRD FR-R14。目次を貼る形（FR-R16）は段階1の後半か段階2。

## R8 ナビ

- **Decision**：外枠のナビに「あとで調べる」を足す（アイコンは今ある `search`）。本棚の上に探す欄を置く（見本の1）。
