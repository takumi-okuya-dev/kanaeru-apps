# Research: 読書記録の本棚と取りこみ（reading-001）

決めた理由と仮決め。元は [PRD 読書記録](../../../_bmad-output/prd-kanaeru-reading/prd-kanaeru-reading.md)・[補足](../../../_bmad-output/prd-kanaeru-reading/addendum.md) 6章・8章・構成の決めごと AD-32〜AD-34。持ち主は方針を任せている（2026-11-27）ので、【仮決め】は持ち主の確かめを待つ。

## R1 PR の分け方

- **Decision**：仕様は1つ、PR は2つ。pr1（`feature/reading-001-pr1-tables`）は表2つとアプリの登録と準備中の画面。pr2（`feature/reading-001-pr2-import`）は窓口と画面。
- **Rationale**：DB の変更のある PR は小さく先に入れ、`develop` に同時に1本だけ（AD-17）。人物メモの person-001 と試合表の match-001・002 と同じ切り方。
- **Alternatives**：1つの PR にまとめる（DB の変更が大きな PR に混ざり、人物メモの DB の PR と並べにくい）。

## R2 表は本とマーカーの2つ

- **Decision**：`reading_book` と `reading_marker` だけを足す。説明の材料・やってみること・設定（自分の ID）の表は、それぞれの仕様で足す。
- **Rationale**：原則 IV（小さく始める）。使わない表を先に作ると、列の形を決めきれないまま固めることになる。
- **Alternatives**：AD-32 の叩き台の表を全部作る（reading-003・004 で列が変わる見込みが高い）。

## R3 マーカーの重なりを見分ける鍵

- **Decision**：鍵は、そろえたマーカーの文（NFKC・空白と改行を1つの空白に・日本語の字どうしの間の空白を除く〈PDF の行の折り返しの名残〉・前後の空白を取る）と、ページと位置をつないだものの SHA-256（16進の64字）。文のないコメントだけのものは、そろえたコメントとページから作る。そろえ方と鍵を作る関数は `packages/contracts/src/reading/marker-key.ts` に置き、API と画面の両方が使う（Web Crypto の `crypto.subtle` は Node と端末の両方にある）。**鍵は API が作り直す**（画面から来た鍵は信じない）。`reading_marker` に（本・鍵）の一意の制約を置く。
- **Rationale**：AD-32。取りこみの束を2回送っても重ならない。画面は、同じ関数で「新しいマーカーの数」を数える（R7）。
- **Alternatives**：文だけで見る（同じ文を別のページで引いたものが1つになる）。読む場所の ID を使う（GoodNotes の PDF には ID がない。補足 6章）。

## R4 取りこみ直しの決まりと、消したマーカー

- **Decision**：取りこみは `INSERT … ON CONFLICT (book_id, dedupe_key) DO UPDATE`。
  - コメントは、`comment_edited` が偽のときだけ新しくする（読書記録で直したら真にする）。
  - `?` の印は、`question_edited` が偽のときだけ新しくする（画面で付け外したら真にする）。
  - 章は、空のときだけ埋める（確かめの画面で直した章を守る）。
  - **消したマーカーは行を残し、`deleted_at` を入れる**（一覧に出さない）。取りこみは `deleted_at` のある行を変えない。
- **Rationale**：PRD FR-R10・spec US3・US5 の4（消したマーカーは取りこみ直しても戻らない）。行を消すと、次の取りこみでまた入ってしまう。
- **Alternatives**：消したら行を消す（取りこみ直しで戻る）。消した鍵だけを別の表に持つ（表が増える）。

## R5 GoodNotes の PDF の読み方（pdf.js）

- **Decision**：`pdfjs-dist` 4.10.38 の legacy の束（`pdfjs-dist/legacy/build/pdf.min.mjs`）を、取りこみの画面で動的 import する。`isEvalSupported: false`・`disableFontFace: true`・`useSystemFonts: false`。ページごとに読んで `page.cleanup()` する。
  - **マーカー**：`page.getOperatorList()` を頭から読み、`save`・`restore`・`transform`（CTM）・`setStrokeRGBColor`・`setGState`（`CA`）・`setLineWidth`・`constructPath` を追う。線（stroke）で、不透明度が1未満かつ線の幅が 8pt 以上のものをマーカーの線とみなす（色は見ない。黄色以外でも拾える）。線の範囲（`constructPath` の最小・最大）を CTM でページの座標に直し、上下に幅の半分を足した四角にする。
  - **文**：`page.getTextContent()` の項目の位置（`transform` の e・f と幅・高さ）で、四角に半分以上入る文字を拾う。同じ高さ（4pt 以内）の線は1行にまとめ、行の間が 22pt より狭い行は1つのマーカーにまとめる（補足 6章で PyMuPDF と pdf.js の両方で確かめた値）。
  - **テキストボックス**：`page.commonObjs.get(fontName).name` の書体の名前で、そのページの本の文にいちばん多い書体と違う書体の文を集め、ページの上の柱の帯（上から 45pt）の外にあるものをコメントにする。HiraginoSans（GoodNotes の既定）を優先して見る。
  - **章とページ**：ページの上の帯（上から 45pt）の文から、章・節の名前（数字で始まる、または「章」を含む）と、数字だけのページ番号を取る。偶数ページの章の名前と奇数ページの節の名前は、章の名前を優先する。
  - 読み方の関数は、pdf.js から取り出した「線の四角・文の項目・書体の名前」を受け取る状態を持たない関数にし、pdf.js と切り分けてテストする（`apps/web/src/features/reading/import/goodnotes.ts`）。
- **Rationale**：AD-34・補足 6章。Node の pdf.js で、持ち主の PDF から線 258 本・64 ページ・テキストボックス 4 つを PyMuPDF と同じに拾えた。legacy の束は、iPhone の Safari の古めの版でも動く（`Promise.withResolvers` などを補う）。
- **Alternatives**：PyMuPDF をサーバーで動かす（本の PDF をサーバーに送ることになり、AD-34 に反する）。pdf.js 5.x（画像の読み方に WebAssembly を使い、CSP の `wasm-unsafe-eval` が要る見込み）。

## R6 pdf.js の worker と CMap を自分のドメインから出す

- **Decision**：
  - worker は `import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"` で、Vite に画面の静かなファイルとして出させる（`GlobalWorkerOptions.workerSrc = workerUrl`）。
  - 日本語の CMap は、`import.meta.glob("/node_modules/pdfjs-dist/cmaps/*.bcmap", { query: "?url", import: "default" })` で同じく静かなファイルにし、pdf.js の `CMapReaderFactory` に、名前から URL を引いて `fetch` する小さなクラスを渡す。読みこむのは要る CMap だけ（遅延）。
  - どちらも `apps/web/src/features/reading/import/` の中で済ませ、`vite.config.ts`（共通）は触らない。
- **Rationale**：CSP の `script-src 'self'`・`connect-src 'self'` の中で動き、CSP を変えない（AD-34）。外の CDN を使わない。共通のファイルに触らない（並行開発の決まり 2）。
- **Alternatives**：`vite.config.ts` に写す仕組みを足す（共通の PR が要る）。`cMapUrl` に外の CDN（CSP を緩める）。

## R7 送り方と「新しいマーカー」の数

- **Decision**：
  - 画面は、確かめの画面を出す前に `GET /api/v1/reading/books/{bookId}/marker-keys`（その本の鍵の一覧。消したものも含む）を読み、R3 の関数で読み取ったマーカーの鍵を作って、新しい数を数える。
  - 「入れる」で、マーカーを JSON にしたときに 90KB を超えない束に分け、`POST /api/v1/reading/books/{bookId}/markers/import` に順に送る（API の本文の上限 `MAX_BODY_BYTES` は 100KB。余白を取る）。1束は 500 件まで。
  - 答えは束ごとに `{ inserted, updated, unchanged }`。途中で失敗したら、そこで止めて「もう一度入れる」を出す（もう一度送っても、R4 で重ならない）。
- **Rationale**：AD-34・spec US2 の5。束をまとめる取りこみの記録（セッション）の表を作らずに済む。
- **Alternatives**：取りこみの ID を作って束を集め、最後に確定する（表が増える。途中の束が残ったときの片づけが要る）。

## R8 貼り付けの読み方

- **Decision**：1行に1つ。空の行は飛ばす。行の頭の `p.38`・`P38`・`p38`・`38:`・`38 `（数字のあとに空白かコロン）をページにする。`//` の後ろをコメントにする。`?`・`？` で始まるコメントに印を付ける【仮決め】。読む場所は「そのほか」。章はなし。
- **Rationale**：PRD FR-R8。どのアプリからでも、手で整えやすい形。
- **Alternatives**：CSV（手で書きにくい）。

## R9 書誌の検索（国立国会図書館サーチと openBD）

- **Decision**：
  - 窓口は `POST /api/v1/reading/catalog/search`（本文 `{ q }`）。書名や ISBN を URL に載せない。POST なので、組み立ての今の書く操作の回数の制限（IP ごと）がかかる。
  - `q` が ISBN（ハイフンと空白を除いて 10 桁か 13 桁。10 桁は 13 桁に直す）なら、openBD の `https://api.openbd.jp/v1/get?isbn=…` を呼び、なければ NDL の `https://ndlsearch.ndl.go.jp/api/opensearch?isbn=…&dpid=iss-ndl-opac`。
  - それ以外は NDL の `…/api/opensearch?title=…&dpid=iss-ndl-opac&cnt=20` を呼ぶ。答えの RSS（XML）は `fast-xml-parser`（MIT・依存なし）で読む（API の依存に1つ足す）。書名・著者（`dc:creator`）・ISBN（`dc:identifier` の `dcndl:ISBN`）を取り、同じ ISBN は1つにまとめる。書名の検索の候補の書影は、ISBN があるものだけ openBD に一度にまとめて問い合わせる（`get?isbn=a,b,c`）。
  - 外への出口は `deps.fetch`（テストで差しかえる）。5秒で打ち切る。失敗・打ち切り・形の違う答えは `502 CATALOG_UNAVAILABLE`（文に URL や検索の言葉を入れない）。
  - 書影の URL は `https://cover.openbd.jp/` で始まるものだけを受け付ける（CSP の #176 と同じ源）。本を足すときも、窓口がこの形を確かめる。
- **Rationale**：AD-33・補足 8章。NDL が作った書誌（CC BY 相当）に絞れば、営利でも申請が要らない。openBD は鍵なしで速い。
- **Alternatives**：Google Books・楽天（商用・有料プランと合わない。補足 8章）。NDL の SRU（形が細かく、名前の検索には OpenSearch で足りる）。正規表現で XML を読む（壊れやすい）。

## R10 仮の表紙

- **Decision**：書影がない本・書影を読めない本は、画面が書名の頭の文字と色の帯で表紙を描く（CSS と文字だけ。画像を作らない）。色は `tokens.css` の値だけ（墨の地は使わない。DESIGN.md の primary の決まり）。
- **Rationale**：技術書の多くは openBD に書影がない（補足 8章）。DESIGN.md の値だけを使う。
- **Alternatives**：灰色の空の箱（どの本か見分けにくい）。

## R11 退会と、持ち主だけ

- **Decision**：`reading_book.owner_account_id` と `reading_marker.owner_account_id` は `account` に `ON DELETE CASCADE`。マーカーは（`book_id`・`owner_account_id`）で本に複合の外部キーを張り、持ち主の違う本にマーカーを付けられないようにする。退会の手順（`withdrawal`）は出さない。権限は `reading/access.ts` の1つの関数で「持ち主か」だけを見て、ほかの人の記録は `404 NOT_FOUND`。
- **Rationale**：AD-19・AD-32。組織に入れない（段階1〜3）。人物メモ（AD-31）と同じ形。
- **Alternatives**：マーカーに持ち主を持たない（本からたどれるが、退会の CASCADE と持ち主の確かめが1段深くなる）。

## R12 アプリの登録と、共通の PR の順

- **Decision**：`apps.list.ts` に `reading`（名前「読書」・アイコン `book`・`domains: ["reading"]`・`basePath: "/reading"`・`uses: []`・`accountData: "本・マーカーとコメント"`）を1行足す。`modules.list.ts`・`features.list.ts` にも1行ずつ。ナビの項目は「本棚」だけ（「あとで調べる」は reading-002）。
- **順**：pr1 の前に #169（OAuth の範囲を MCP のツールを出すアプリだけから作る。足すとすぐ同意の画面に出るため）と #167（予期しない DB のエラーのログに SQL の値を書かない。マーカーの文がログに出ないため）。pr2 の前に #176（CSP の書影の源）。DB の変更は、人物メモの #168 が入ってから（AD-17）。
- **Rationale**：AD-15・AD-16・並行開発の決まり 3。
- **Alternatives**：`accountData` に先の仕様の記録まで書く（まだない記録を退会の画面に出すことになる）。

## R13 LINE の中のブラウザと iPhone の確かめ

- **Decision**：作ったあと、手で確かめる（quickstart の手で確かめること）。
  - LINE の中のブラウザ（ミニアプリ）で、ファイルを選べるか。選べなければ、取りこみの画面に「Safari で開いてください」と、Safari で開く URL を出す（構成の Open Questions 14）。
  - iPhone の Safari で、持ち主の PDF（11MB・357ページ）を1分以内に読めるか（SC-001）。大きな PDF（100MB 以上）で落ちないか（Open Questions 15）。落ちるなら、上限を下げる。
- **Rationale**：自動のテストでは確かめられない。持ち主は iPhone で読む（PRD 9章）。

## R14 テストの見本の PDF

- **Decision**：本物の本の PDF はリポジトリに置かない。補足 6章の形（半透明の太い線・HiraginoSans のテキストボックス・ページの上の柱）を写した架空の PDF を、テストの中で `pdf-lib` で作るか、小さな PDF を手で作って `apps/web/src/features/reading/import/__fixtures__/` に置く（架空の文だけ。数 KB）【仮決め。計画の作業で決める】。読み方の関数（R5）は、pdf.js を通さない形の入力でもテストする。
- **Rationale**：Constitution と CLAUDE.md（本物の利用者のデータ・買った本をコミットしない）。
