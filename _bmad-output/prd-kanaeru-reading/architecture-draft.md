---
title: "下書き：読書記録の構成の決めごと（AD-32〜AD-34）"
status: draft
created: 2026-11-28
---

# 下書き：読書記録の構成の決めごと（AD-32〜AD-34）

[構成の決めごと](../architecture-kanaeru/architecture-kanaeru.md) に足す中身の下書き。人物メモの PR #165（AD-31）が develop に入るまで、構成の文書には触らない（[並行開発の決まり](../../docs/rules/parallel-development.md)）。入ったら、この中身を構成の文書に移し、この下書きは消す。

- **番号**：人物メモが AD-31 を使う。読書記録は AD-32〜AD-34（2026-11-28 に人物メモのセッションと合わせた）。
- **元**：[PRD 読書記録](./prd-kanaeru-reading.md) 6章・FR-R1〜FR-R32、[構成との合い方](./review-fit.md)、[補足](./addendum.md) 6章（GoodNotes の PDF の形）。
- **範囲**：段階1（自分で試す版）。公開の本棚（段階2）は、下の「あとで決めること」に置き、段階2の前に番号を取る。

## AD-32 — 読書記録は reading の領域が持ち、記録はすべて持ち主の account に付ける [PROPOSED]

- **Binds:** reading（API・画面・約束の3つの領域）・`apps.list.ts`・account
- **Prevents:** 本とマーカーの持ち方がほかのアプリと違う形になること。取りこみ直しでマーカーが2重になること。読書記録の側で直したコメントが、取りこみ直しで消えること。退会したのに記録が残る・退会が DB のエラーで止まること
- **Rule:**
  - アプリの登録（AD-15）：key は `reading`、名前は「読書」、`uses: []`。表の名前は `reading_` で始め、API の道は `/api/v1/reading/…`、画面は `/reading/…`。
  - 最上位の記録は本（`reading_book`）で、持ち主の `account_id` を持つ（AD-19）。段階1〜3は組織に入れない。マーカー・説明の材料・やってみること・設定（自分の ID）も、本か account にぶら下げ、どれも `ON DELETE CASCADE`（退会の前の手順は持たない）。
  - 表の叩き台（細かい列は reading-001 の仕様で決める）：
    - `reading_book`：書名・著者・ISBN・書影の URL・分かりたいこと・状態・読む場所・最後に取りこんだ時刻
    - `reading_marker`：本・読む場所・章・ページか位置・本の中の並びの番号・マーカーの文・コメント・コメントを読書記録で直したか・`?` の印・分かったこと・重なりを見分ける鍵
    - `reading_material`（説明の材料）・`reading_try`（やってみること・思い出す日時・結果）・`reading_setting`（Amazon と楽天の ID・開示に出す名前・調べる先）
  - **重なりを見分ける鍵**：マーカーの文（空白をそろえたもの）と、ページか位置から作る SHA-256。`reading_marker` に（本・鍵）の一意の制約を置き、取りこみは「なければ足す」にする（2回送っても重ならない。FR-R10）。
  - **取りこみ直し**（FR-R10）：コメントを読書記録で直した印があるマーカーと、`?` の印を付け外したマーカーは、取りこみで上書きしない。読む場所の側で消したマーカーは消さない。
  - **探す**（FR-R17）：本人の記録の中だけを、DB の部分一致で探す（1人の記録は多くても数万件なので、全文検索の仕組みは入れない）【仮決め】。
  - **AI**（AD-20）：説明の材料・ブログの下書き・調べる文の組み立ては、`packages/contracts/src/reading/` に1つずつ置く。段階1は貼る形だけで、PaletKit から外の AI へは何も送らない。調べる先（ChatGPT・Claude・Google）は、画面が URL に調べる文を入れて開くだけ。
  - **カレンダー**（FR-R24）：予定のリンクは、`miniAppPermalink`（AD-14）で作る「思い出す」の道（`/reading/remind/{tryId}`）にする。既定の日時は2週間後の12時（夜の停止〈AD-10〉の外）。リンクを作る道具は、booking の約束から共通へ移してから使う（下の「共通の PR」）。

## AD-33 — 外の書誌の API は reading の API から呼び、選んだ本の書誌だけを持つ [PROPOSED]

- **Binds:** reading（API）・画面の CSP（`platform/web`）・設定と秘密の値
- **Prevents:** 画面から外の API を直接呼んで CSP を広げること・鍵が画面に出ること。書誌の API の会社を替えるたびに、領域の中のあちこちを直すこと。書影の写しを持って、利用条件に反すること
- **Rule:**
  - 画面は `GET /api/v1/reading/catalog?q=…`（書名か ISBN）だけを呼ぶ。外の API を呼ぶのは reading の API の中の1つの部品で、API の会社ごとの違いはその中だけに置く（差しかえられる形）。
  - 鍵が要る API なら、鍵は Secret Manager に置く（[コードの書き方の決まり](../../docs/rules/coding.md) 2）。外の API が落ちている・遅いときは `502`・code `CATALOG_UNAVAILABLE` を返し、画面は「手で書く」に進める（FR-R1）。
  - 持つのは、利用者が選んだ本の書誌（書名・著者・ISBN・書影の URL）だけ。検索の結果は持たない。書影は配信元の URL から出し、写しを持たない。配信元の画像の源を、画面の CSP の `imgSrc` に1つだけ足す（共通の PR）。
  - 回数の制限は、ログインした人ごとにかける（組み立ての今の制限を使う）。
  - どの API にするか（openBD・国立国会図書館サーチ・Google Books）は、利用条件（書影の表示・商用・帰属の表示）を読んで reading-001 の前に決める（PRD 10章）。

## AD-34 — 取りこむファイルは端末の中で読み、読み取ったマーカーとコメントだけを分けて送る [PROPOSED]

- **Binds:** reading（画面と API）・画面の組み立て（Vite）・画面の CSP
- **Prevents:** 買った本のファイルがサーバーに残ること（著作権・漏れ）。PDF を読む部品のために CSP を緩めること（`unsafe-eval`・外の CDN）。大きな取りこみが API の本文の上限（`MAX_BODY_BYTES`＝100KB）で落ちること。部品が画面のすべての道の読みこみを重くすること
- **Rule:**
  - Kindle の書き出し（HTML）・Web のノートブックの貼り付け・GoodNotes の PDF・ふつうの貼り付けは、**画面の reading の領域**（`apps/web/src/features/reading/import/`）で読む。読み方は読書記録の業務なので、共通には置かない（AD-18）。サーバーには、本のファイルも、マーカーのない本の文も送らない。
  - **PDF を読む部品**は pdf.js（`pdfjs-dist`）。取りこみの画面を開いたときだけ読みこむ（動的 import）。
    - 部品の worker と、日本語の文字の対応表（CMap）は、組み立てで画面の静かなファイルとして出す（自分のドメインから。CSP の `scriptSrc 'self'` の中で動き、CSP を変えない）。
    - `isEvalSupported: false`・`disableFontFace: true` で使う（文字を取り出すだけで、描かない）。
    - ページごとに読んで片づけ、1つの PDF は 300MB まで（FR-R7・PRD 4.2）。
  - **GoodNotes の PDF の読み方**（[補足](./addendum.md) 6章）：マーカーは「半透明で太い線」を見つけ、その下の文を拾う。テキストボックスは本と違う書体の文を拾い、同じページのいちばん近いマーカーのコメントにする。章はページの上の柱から取り、取れなければページで並べる。読み方の関数は状態を持たない形にし、書き出した PDF の形を写した小さな見本（架空の文で作る。本物の本の PDF はリポジトリに置かない）でテストする。
  - **送り方**：確かめの画面（FR-R9）で利用者が「入れる」を押したあと、マーカーを 100KB に収まる束に分けて `POST /api/v1/reading/books/{bookId}/markers:import` に順に送る。重なりは AD-32 の鍵で止めるので、途中で切れても、もう一度送ればよい。1回の取りこみは5,000件まで（多いときは `422`）。
  - 確かめの画面の「新しいマーカー」の数は、画面が `GET /api/v1/reading/books/{bookId}/marker-keys`（鍵の一覧）を読んで、端末の中で数える。

## 共通の PR（段階1。reading-001 より先に入れる）

作る前に持ち主に伝える（[並行開発の決まり](../../docs/rules/parallel-development.md) 3-3）。人物メモは、どちらのファイルも触らないと確かめた（2026-11-27）。

1. **カレンダーの道具を共通へ移す**（AD-18：2つ目の領域が要り、形が固まった）：`calendarStamp` と Google カレンダーの URL を作る処理を、`packages/contracts/src/booking/calendar.ts` から新しい小さな包み（`packages/calendar`）へ移す。交流会の長さ（`eventEndsAt`・`EVENT_DEFAULT_DURATION_MINUTES`）は交流会の業務なので booking に残し、包みは「題・始まり・終わり・場所・説明」を受け取る形にする。booking の今の呼び方は変えずに、中で包みを呼ぶ。
2. **画面の CSP**：書影の配信元を `imgSrc` に足す（AD-33。API を決めてから）。pdf.js は自分のドメインから出すので、CSP は変えない。

## 構成の文書のほかの所に足すこと

- **Design Paradigm の図**：「2つ目からのアプリの領域」の横に `reading`（本・マーカー・説明の材料・やってみること）を足す（account にだけ矢印）。
- **Capability → Architecture Map**：FR-R1〜FR-R5 → AD-32・AD-33、FR-R6〜FR-R12 → AD-32・AD-34、FR-R17 → AD-32、FR-R22〜FR-R25 → AD-20・AD-32、FR-R29〜FR-R32 → AD-20。
- **Open Questions**：PC のブラウザでの LINE ログインと、LINE の中のブラウザでファイルを選べるか（今の Open Questions 3 に読書記録を足す）。
- **binds と sources**：PRD 読書記録（FR-R1〜FR-R49）を足す。

## あとで決めること（段階2の前に番号を取る）

- **公開の本棚**：独自のドメイン・URL の形（AD-15 の `/<key>/…` に従うか）・LIFF を立ち上げないページ・題と OGP と状態コード・検索に出す・回数の制限・夜の停止の間の出し方（AD-10 に1行）・持ち主が止められること（AD-19 の例外）。Constitution の改訂（1.4.0）と一緒に決める（PRD 6章「段階2の前」）。
- **MCP**（AD-21）：本人のマーカーを読ませるツールは、使ってみてから決める（範囲は `reading:read`）。
