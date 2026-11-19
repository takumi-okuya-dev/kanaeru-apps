# 全体の形（アーキテクチャ）

2026-11-18 作成（TypeScript の骨組み。`typescript` ブランチ）。2026-11-19 直した（core-001：見本の領域を消し、画面を API から返す形・LIFF の始め方・DB の夜間停止の 503・参加者の道と日本時間の関数・プロダクトの見た目の値を足した）。

今のシステムの形。選んだ技術の候補と目安は [技術選定の候補](./tech-selection.md)、守る決まりは [コードの書き方の決まり](./rules/coding.md) 6章。

## 1. 構成

```mermaid
flowchart LR
  subgraph browser["LINE の中（LIFF ブラウザ）・ブラウザ"]
    web["画面<br/>apps/web（Vite＋React の SPA）<br/>lib/liff.ts が LIFF を始める"]
  end
  subgraph server["1つのコンテナ（本番は Cloud Run）"]
    api["API<br/>apps/api（Hono on Node）<br/>/api と、組み立てた画面のファイル"]
  end
  db[("PostgreSQL 18")]
  line["LINE（LIFF の SDK・ログイン）"]
  api -- "画面のファイル（/api 以外）" --> web
  web -- "/api（同じ源。手元は Vite が中継）" --> api
  web -. "LIFF の SDK" .-> line
  api --> db
  contracts["packages/contracts<br/>約束（zod）・参加者の道・日本時間"] -.-> api
  contracts -.-> web
  ui["packages/ui<br/>見た目の値と部品"] -.-> web
  design["_bmad-output/ux-kanaeru-reception/DESIGN.md<br/>（docs/design/DESIGN.md を引き継ぐ）"] -. "値を写す" .-> ui
```

| 場所 | 役目 |
|---|---|
| `apps/api` | API（Hono を Node の上で動かす）。設定 `WEB_DIST_DIR` があれば、組み立てた画面のファイルも返す（`platform/web`。1つのコンテナで画面と `/api` を同じ源にする）。DB の定義（`src/modules/<領域>/schema.ts`）・DB の変更（`drizzle/`）・見本のデータの手順（`scripts/`）もここに置く。DB を読み書きするのは API だけ |
| `apps/web` | 画面（Vite＋React の SPA。TanStack Router〈コードで書く形〉と TanStack Query）。API は `/api` を同じ源で呼ぶ。LINE（`@line/liff` 2.32）は `lib/liff.ts` だけが始める |
| `packages/contracts` | API の約束（ふつうの zod）。入力の形・答えの形・エラーの code と日本語の文言。API の入力の確かめ・窓口の文書（OpenAPI。名前は API の側で付ける）・画面の入力の確かめが、同じ形を使う。領域ごとのフォルダ（`src/<領域>/`）に分ける。`src/core/` には、参加者が開く道とミニアプリの URL（`participantPaths`・`PARTICIPANT_ROUTE_PATTERNS`・`miniAppPermalink`）と日本時間の関数（`jstDate`・`endOfJstDate`）もある |
| `packages/ui` | 見た目の値（`src/styles/tokens.css`。プロダクトの DESIGN.md と、それが引き継ぐ土台から写したもの。プロダクトの色は墨）と部品（shadcn/ui の Base UI の形を、値だけ直したもの） |
| `e2e` | Playwright の通しのテスト（キーボードだけ・アクセシビリティ〈axe〉・守りの見出しと CSP）。本番と同じく、API が組み立てた画面を返す形で流す |
| `tests` | lint の規則（境界・守りの規則・見た目の値）が働くかの確かめと、リポジトリのファイルを読む守りの確かめ（CI の設定・Dependabot・手元の口・秘密の値と依存の手順） |
| `scripts/security`・`security` | 秘密の値（gitleaks）と依存の脆弱性（`pnpm audit`）の確かめの手順と、依存の例外の一覧 |
| `.githooks`・`.github` | コミットの前の秘密の値の確かめ（`pre-commit`）・CI（`workflows/ci.yml`・`security-weekly.yml`）・Dependabot |

ログインと置き場所（インフラ）はまだない。ログインは account の仕様で足す（LINE の ID トークンを API が確かめ、自前のセッションを出す。構成の決めごと AD-4）。置き場所（Cloud Run と Cloud SQL・Terraform）は、インフラの仕様で足す（AD-8〜AD-11）。

### 設定（`apps/api/src/kernel/config.ts`）

環境の違いは設定の値で持つ（見本は `.env.example`）。kanaeru で足したもの：

| 設定 | 何か | staging・production |
|---|---|---|
| `LINE_CHANNEL_IDS` | LINE の ID トークンを確かめる `client_id`（チャネル ID の並び） | 要る |
| `ORGANIZER_LINE_USER_ID` | 主催者の LINE のユーザー ID（秘密ではない） | 要る |
| `OPEN_CHAT_URL` | コミュニティのオープンチャットの URL（https） | 任意 |
| `WEB_DIST_DIR` | 組み立てた画面のフォルダ。あれば API が画面を返す | 要る |
| `VITE_LIFF_ID` | 画面の組み立てのときに埋める LIFF ID（空なら LINE につながない仮の形） | 本番の組み立てで入れる |

## 2. 依存の向き

依存は **組み立て → 領域 → 共通 → 土台** の一方向。領域どうし・共通どうしは、相手の `index.ts` からだけ読む。ルートの `eslint.config.js` の境界の規則が止める（`tests/lint/boundaries.test.ts` が確かめる）。

| アプリ | 土台 | 共通 | 領域 | 組み立て |
|---|---|---|---|---|
| API（`apps/api/src/`） | `kernel/`（設定・DB の接続・ログ・エラーと読みかえ・PostgreSQL のエラーの見分け・共通の列・道の型と手伝い・要求の ID・機能の印） | `platform/<名前>/`（`health`・`rate-limit`・`web`） | `modules/<領域>/` | `app.ts`・`index.ts`・`modules.list.ts`・`client.ts` |
| 画面（`apps/web/src/`） | — | `lib/`（API の呼び出し・LINE の始め方・道の根・ページの形・知らせ・フォームの誤り）・`shell/`（外枠・始められないときの画面） | `features/<領域>/` | `router.tsx`・`main.tsx`・`features.list.ts` |

```mermaid
flowchart TB
  subgraph api["apps/api/src"]
    comp["組み立て<br/>app.ts・modules.list.ts"] --> mod["領域<br/>modules/〈領域〉"]
    mod --> plat["共通<br/>platform/〈名前〉"]
    comp --> plat
    plat --> kernel["土台<br/>kernel"]
    mod --> kernel
    comp --> kernel
  end
  subgraph web["apps/web/src"]
    wcomp["組み立て<br/>router.tsx・features.list.ts"] --> feat["領域<br/>features/〈領域〉"]
    wcomp --> shell["外枠<br/>shell"]
    feat --> lib["共通<br/>lib"]
    shell --> lib
  end
  feat -. "import type だけ" .-> client["apps/api/src/client.ts"]
  lib -. "import type だけ" .-> client
```

- 画面から API は、`apps/api/src/client.ts` の型（`AppType`・`ModuleRoutes`）だけを `import type` で読む。API の動くコードは画面に入らない。
- 画面の道の型は、組み立て（`router.tsx`）が TanStack Router の `Register` に入れる。領域の `Link` の `to` と `params` は型で確かめられる。

## 3. 領域を足すときに触る所

| 触る所 | 中身 |
|---|---|
| `packages/contracts/src/<領域>/` | 入出力の形（zod）と、領域のエラーの code と文言 |
| `apps/api/src/modules/<領域>/` | 表（`schema.ts`）・読み書き（`repository.ts`）・道（`routes.ts`。`createRoute`）。入口は `index.ts` の `routes(deps)`。土台が渡すのは `db`・`logger`・`features`（機能の印）だけ |
| `apps/api/src/modules.list.ts` | 1行足す（`merge=union`。[並行開発の決まり](./rules/parallel-development.md) 3-1） |
| `apps/web/src/features/<領域>/` | 画面と道（`createRoute({ getParentRoute: () => rootRoute })`）。入口は `index.ts` の `feature`（`id`・`routes`・任意で `nav`） |
| `apps/web/src/features.list.ts` | 1行足す（`merge=union`） |
| `apps/api/drizzle/` | DB の変更（`pnpm db:generate` で作り、SQL を読んでからコミットする） |

組み立て（`app.ts`・`client.ts`・`router.tsx`）と外枠（`shell/`）と DB の変更の設定（`drizzle.config.ts`）は、領域を足しても直さない。手順は [コードの書き方の決まり](./rules/coding.md) 6-6。

## 4. 要求の流れ

```mermaid
sequenceDiagram
  participant B as ブラウザ（画面）
  participant V as 画面を返す所（本番と E2E は API の platform/web・手元は Vite）
  participant A as API（Hono）
  participant D as PostgreSQL
  B->>V: GET /e/{eventId}/checkin（ファイルがなければ index.html。画面の CSP などの守りの見出しつき）
  Note over B: main.tsx が initLiff() を待ってからルーターを作る
  B->>V: POST /api/v1/…（同じ源）
  V->>A: /api（本番は同じ API の中。手元は Vite が中継）
  Note over A: 要求の ID → 守りの見出し → 要求ごとのログ1行<br/>→ 源の確かめ（Origin が画面の源と違えば 403）<br/>→ 本文の大きさ（100KB まで）→ 回数の制限（書く操作。IP ごと・IPv6 は /64 ごと）
  Note over A: 道（createRoute）が約束（zod）で入力を確かめる<br/>道の ID が合わなければ 404、本文が合わなければ 400 と欄ごとの日本語の理由
  A->>D: 領域の読み書き（Drizzle）
  D-->>A: 行
  A-->>B: JSON（エラーは {error: {code, message, requestId, fields?}}）
```

- すべての応答に、要求の ID（`X-Request-Id`）と守りの見出し（HSTS は `WEB_URL` が https のときだけ）がつく。`/api`・`/api/…` は API の CSP（すべてを止める形）と `Cache-Control: no-store`。ほかの道は画面の CSP（自分の源と、LIFF の SDK が使う LINE の源だけ。`platform/web/web.ts` の `WEB_CSP_DIRECTIVES`）で、`/assets/` は長く持たせ、`index.html` は毎回確かめさせる。
- エラーは、どの窓口でも同じ形（`packages/contracts/src/core/errors.ts` の `ErrorBody`）。投げられたものの読みかえは `kernel/errors.ts` の `toAppError` の1か所：DB に届かない（拒否・時間切れ・止まっている。`kernel/pg-errors.ts` の `isDbUnavailable`）ときは、どの窓口でも `503`・`DB_UNAVAILABLE`（「夜間（0時〜8時）は止まっています。…」）。予期しないエラーは中身を出さず `INTERNAL`（ログにはエラーの名前と積み重ねと要求の ID だけ）。
- `/api` の下の道は、すべて `createRoute` で書かれ、窓口の文書（`GET /api/openapi.json`。設定 `OPENAPI_DOC_ENABLED` のときだけ）に載る。文書に載らない道があると、API は起動しない。
- 画面は、エラーの本文を `ApiError`（code・文・欄ごとの理由）に、応答がないときを `NetworkError` に読みかえる（`apps/web/src/lib/api.ts`）。

## 5. データベースの全体

- PostgreSQL 18 の DB を1つ使い、読み書きするのは API だけ。つなぐ時間と1つの命令の時間に上限があり（設定）、DB が答えないときは待ち続けずに `503 DB_UNAVAILABLE` で失敗する。本番の DB は夜間（0時〜8時）に止まる（AD-10）。動いているかの窓口（`GET /api/v1/health`）は DB に触るので、置き場所の起動の確かめ（probe）には使わない（Cloud Run の既定の TCP の確かめのまま）。接続先と DB の名前は設定の `DATABASE_URL` で決める（手元は Docker の `postgres:18` を1つ共通に使い、作業場所ごとに DB の名前で分ける。[並行開発の決まり](./rules/parallel-development.md) 1）。
- アプリの表は `public` スキーマ、DB の変更の記録は `drizzle` スキーマにある。DB の変更は `apps/api/drizzle/` の1列の SQL で、`meta/_journal.json` の順に当てる。当てた記録が残り、もう一度当てても何もしない。
- 表の名前は単数の snake_case。主キーは `uuid`（既定値 `uuidv7()`）、時刻は `timestamptz`（[コードの書き方の決まり](./rules/coding.md) 6-4）。
- 今あるアプリの表はない（見本の領域の `note` は core-001 の DB の変更で消した）。表は領域を足すときに、その領域の `schema.ts` で足す。

## 6. 画面の骨格

- 外枠（`apps/web/src/shell/AppShell.tsx`）：上に帯（アプリの名前）、752px 以上は左にサイドバー、751px 以下は1列（ナビは帯の下に横に並べる）。先頭に「本文へ移る」。道が変わったら、新しい画面の h1 にフォーカスを移す。
- ページ（`lib/page.tsx` の `Page`）：題（h1）→ リード文 → 中身。ブラウザの題は「{ページの題}｜{APP_NAME}」。
- 状態と結果の出し方は EXPERIENCE.md の型：入力の誤りは欄のそば・送った結果はボタンの近く・画面が切り替わるときだけ画面の上の知らせの帯・消す前は確かめの枠・読みこみ中と空と失敗の状態。
- 見た目の値は `packages/ui/src/styles/tokens.css` だけ（Tailwind の初期の値は消してある）。組み立てた画面は CSP（`script-src 'self' https://static.line-scdn.net`・`style-src 'self'`。`'unsafe-inline'`・`'unsafe-eval'` なし）で動き、Base UI の部品にも `<style>` を書き足させない（`UiProvider`）。
- 画面の入口（`main.tsx`）は、`lib/liff.ts` の `initLiff()` を待ってからルーターを作る（LIFF の init の前に URL を変えないため）。LIFF ID（組み立てのときの `VITE_LIFF_ID`）がなければ、LINE につながない仮の形（未ログイン・ID トークンなし）で動く。始められなければ「読みこめませんでした」の画面（`shell/StartupErrorPage.tsx`）を出す。
- 領域がまだないので、はじめの画面（`/`）は外枠の中の「ページが見つかりません」を出す（領域がナビを出せば、その最初の項目へ移る）。
