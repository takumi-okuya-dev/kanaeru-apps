# コードの書き方の決まり

**対象**：コードを書くすべての人とAI。入口は[CLAUDE.md](../../CLAUDE.md)。

1〜5章は言語・フレームワークに依存しない決まり。6章は TypeScript の決まり（`typescript` ブランチ。ほかの言語にするときは、6章を書き換える）。

## 1. 書き方

- 外部に公開している関数・クラス・型には、その言語の標準の形式でドキュメントコメントを付ける（説明・引数・戻り値・投げる例外）。付け忘れは lint で自動で止める。
- コメント・画面の文言・エラーの文言は日本語で書く。
- 直すときは、変える行だけを直す。ファイル全体を整形しなおさない（差分が大きくなり、ほかのセッションの変更とぶつかる）。
- モジュールの境界（どこが何を持ち、どこから読んでよいか）は、人の注意ではなく自動の検査（lint のルールなど）で守る。
- **画面**は、プロダクトの `DESIGN.md`（見た目）・`EXPERIENCE.md`（振る舞い）に従う。どちらも [UI デザインの既定](../design/README.md)（SmartHR Design System を土台にしたもの）から始める。
  - 色・文字・余白・角・影の値は、DESIGN.md から写した1か所（言語を決めたら6章に置き場所を書く）だけから読む。画面のコードに値を直接書かない。部品の道具（shadcn/ui など）の最初の見た目のまま出さない。
  - アクセシビリティは WCAG 2.2 AA を下限にし、通しのテストに自動の確かめ（axe など）を入れる。
  - 画面の文言とエラーの文は、EXPERIENCE.md の言葉づかい（エラーは「何が起きたか・なぜか・どうすればよいか」）に従う。
  - SmartHR のブランドの色・ロゴ・イラストを使わない（[UI デザインの既定](../design/README.md) 3）。

## 2. 設定と環境

- 環境ごとの違いを、コードの分岐（`if (env == "production")`など）にしない。設定の値（`APP_ENV`のような環境の名前と、環境ごとの設定ファイル）で分ける。
- **大きな機能は、設定で止められるように作る**。
  1. 本番は「切」のまま出す。
  2. ステージングで「入」にして確かめる。
  3. 問題がなければ、本番も「入」にする（設定の1行を変えるPR）。

  こうしておくと、出したあとに困っても**コードを戻さず、設定の1行で止められる**。
- 秘密の値・本物の利用者のデータ・個人の情報は、コミットしない（手元の、コミットしない設定ファイルに置く。見本は`.example`の付いたファイルでコミットする）。
- コミットの前に秘密の値を確かめる仕組み（gitleaks など）を入れ、飛ばさない（`--no-verify`を使わない）。見間違いは、理由をその行の上に書いて、止めない一覧に足す。本物の鍵なら、一覧に足さずに、先に鍵を止めて作り直す。
- 依存の脆弱性の例外は、指摘の番号・理由・90日以内の期限を書いた一覧に足す（期限を過ぎると、また止まる）。
- テストの設定は、手元の設定ファイル（`.env`など）の機能の印や外部サービスの値で変わらないようにする（テストが使う値は見本の設定とテストの中で決め、手元からは作業場所ごとの DB の名前など、分けるのに要る値だけを読む）。

## 3. DBの変更（マイグレーション）

デプロイが**DBの変更 → アプリ**の順に動くと、DBの変更が当たってから新しいアプリに切り替わるまでの間は、**前の版のアプリが新しいDBで動きます**。アプリを前の版に戻したときも同じです。だから、**DBの変更は、そのとき本番で動いている前の版のアプリでも壊れない形だけ**にします。

| 変更 | 出し方 |
|---|---|
| 表を足す | 1回でよい |
| 列を足す（空を許す、または既定値つき） | 1回でよい |
| 索引を足す | 1回でよい |
| 列を足す（`NOT NULL`で既定値なし） | **だめ**。前の版のアプリの`INSERT`が失敗する。既定値を付けるか、空を許す |
| 列や表を消す | **2回に分ける**。1回目：アプリがその列を読みも書きもしない版を出す（`NOT NULL`なら、ここで外す）。2回目：消す |
| 列の名前を変える | まず、**DBの列の名前は変えずに、コードの中の名前だけ変える**。それで済まないときだけ、下の例の4回に分ける |
| 列の型を変える | 新しい列を足して写す。下の例と同じ4回 |
| 既存の行が通らないかもしれない制約（`UNIQUE`・`CHECK`・`NOT NULL`）を付ける | **2回に分ける**。1回目：違反する値を書かない版を出す。2回目：残っている行を直してから、制約を付ける |

**列の名前を変える例**：`title`を`headline`に変える

| リリース | DBの変更 | アプリ | 戻す先（1つ前の版）が困らない理由 |
|---|---|---|---|
| 1回目 | `headline`を足す（空を許す） | `title`と`headline`の**両方に書き**、`title`を読む | 前の版は`headline`を知らないだけ |
| 2回目 | すべての行で`title`を`headline`に写す | 両方に書き、**`headline`を読む** | 1回目の版は両方に書くので、取りこぼさない |
| 3回目 | `title`の`NOT NULL`を外す（付いていれば） | **`headline`だけに**書いて読む | 2回目の版は`headline`を読むので困らない |
| 4回目 | `title`を消す | 変えない | 3回目の版は`title`を使わない |

- 次のリリースは、前のリリースが本番で落ち着いてから出す。前の版に安全に戻せるのは**1つ前まで**。
- DBの変更のファイルを道具で作ったら、**できたSQLを読んでからコミットする**（名前の変更を「消して足す」として書く道具がある）。
- **一度`develop`に入ったDBの変更のファイルは、書き換えない・消さない**。ステージングにはもう当たっているので、直すときは新しい変更を足す。
- DBの変更の作り忘れ・記録（`meta/_journal.json`）の順番の狂い・壊れた記録は、`pnpm db:check`（`pnpm check`に入っている）が止める。落ちたら、出た直し方に従う（番号・記録・snapshotを手で直さない）。

## 4. テスト

- 機能を足したら、テストも足す（単体・結合・関わるE2E）。
- テストに領域（アプリ）の数や並びを書かない（[並行開発の決まり](./parallel-development.md) 3）。

## 5. この文書の更新

- 決まりを変えたら、同じPRでこの文書を直す。

## 6. 言語・フレームワークごとの決まり（TypeScript）

`typescript` ブランチの既定（[技術選定の候補](../tech-selection.md) 3章）。全体の形は [全体の形](../architecture.md)。

### 6-1. 言語と道具

- TypeScript 6.x（版はルートの `package.json` で固定する。7.0 は typescript-eslint が対応してから）。型を取り除くだけで動く書き方だけを使う（`erasableSyntaxOnly`。`enum`・`namespace`・引数のプロパティ〈`constructor(readonly x)`〉を書かない）。
- Node.js 26 系の LTS。版はルートの `package.json` の `devEngines.runtime` で pnpm が入れる（`pnpm install` で落とし、`pnpm` で流す手順はその版で動く）。手元の Node.js の版は変えなくてよい。`.node-version` は、それを読む道具（nodenv・fnm など）のため。
- パッケージの管理は pnpm（版は `package.json` の `packageManager`）。出てから1日たっていない版は入れない（`pnpm-workspace.yaml` の `minimumReleaseAge`）。
- よく使う手順（リポジトリのルートで）：

  | 手順 | すること |
  |---|---|
  | `pnpm install` | 依存を入れる。コミットの前の秘密の値の確かめ（`.githooks/pre-commit`）も、ここで git に設定する |
  | `pnpm --filter e2e exec playwright install chromium` | 初めての1回（E2E のブラウザを入れる） |
  | `pnpm local:setup` | 初めての1回（DB の容器・DB の変更・見本のデータ）。何度流しても増えない |
  | `pnpm dev` | DB・API・画面を立ち上げる |
  | `pnpm check` | 全部の確かめ（秘密の値と依存の脆弱性・整形・型・lint・単体と結合・E2E）。PR の前に流す |
  | `pnpm security:check` | 秘密の値（`pnpm security:secrets`。gitleaks。`brew install gitleaks`）と依存の脆弱性（`pnpm security:audit`）だけを確かめる |
  | `pnpm typecheck`・`pnpm lint`・`pnpm test`・`pnpm e2e` | 確かめを1つずつ流す |
  | `pnpm format` | 整形（Prettier）。直した行だけでなくファイルが変わるときは、整形だけのコミットに分ける |
  | `pnpm db:generate` → SQL を読む → `pnpm db:migrate` | DB の変更（3章）。`apps/api/drizzle/` にファイルができる |
  | `pnpm db:seed` | 見本のデータ（仮の中身だけ）を入れる。`SAMPLE_DATA_ENABLED=true` のときだけ動く |
  | `pnpm --filter api openapi` | API の窓口の文書を `apps/api/openapi.json` に書き出す（コミットしない） |

- 設定は、ルートの `.env`（見本は `.env.example`）。DB には、つなぐ時間と1つの命令の時間の上限がある（`DATABASE_CONNECT_TIMEOUT_MS`・`DATABASE_QUERY_TIMEOUT_MS`）。値の意味と確かめは `apps/api/src/kernel/config.ts`。staging・production で危ない組み合わせ（見本のデータ・試験用のログイン〈`TEST_LOGIN_ENABLED`〉・回数の制限を外す・見本の DB のパスワード・手元を指す源・http の源・production の窓口の文書）と、要る値がないこと（`LINE_CHANNEL_IDS`・`ORGANIZER_LINE_USER_ID`・`WEB_DIST_DIR`）は、起動のときに止まる。

### 6-2. 置き場所

- API は `apps/api/src/`：`kernel/`（土台：設定・DB・ログ・エラー・列・道の型）・`platform/<名前>/`（共通：動いているか・回数の制限・画面を返す・知らせを送る〈LINE・メールと守り。`notify`〉）・`modules/<領域>/`（領域）・組み立て（`app.ts`・`index.ts`・`modules.list.ts`・`client.ts`）。DB の変更は `apps/api/drizzle/`、手順は `apps/api/scripts/`。
- 画面は `apps/web/src/`：`shell/`（外枠）・`features/<領域>/`（領域）・`lib/`（共通）・組み立て（`router.tsx`・`main.tsx`・`features.list.ts`）。
- API の約束（zod）は `packages/contracts/src/<領域>/`（土台のものは `core/`。日本時間の関数〈`jstDate`・`jstDateTime`・`endOfJstDate`〉もここ）。見た目の値と部品は `packages/ui/`（値は `src/styles/tokens.css`）。業務を知らない技術の道具は `packages/<道具>/` の小さな包み（今は CSV の作り方の `@workspace/csv` と、AES-256-GCM で包む秘密の箱の `@workspace/secret-box`。ほかの包みとアプリを読まない。lint で止める）。CSV を返すヘッダーは API の `kernel/http.ts` の `csvAttachment`、画面のファイルの受け取りと保存は `apps/web/src/lib/download.ts`（[並行開発の決まり](./parallel-development.md) 3-3）。
- 通しのテストは `e2e/`。lint の規則・守りの確かめ・DB の変更の確かめのテストは `tests/`。守りの手順は `scripts/security/`、DB の変更の確かめは `scripts/db/`。
- 領域の ID は、仕様のフォルダの領域の ID（`specs/<領域>/`）と同じにする。
- 依存の向きは、組み立て → 領域 → 共通 → 土台。領域どうし・共通どうしは、相手の `index.ts` からだけ読む。画面から API は `apps/api/src/client.ts` を `import type` でだけ読む。この決まりはルートの `eslint.config.js` の境界の規則で止める（`tests/lint/boundaries.test.ts` が確かめる）。

### 6-3. 書き方

- 外に出す関数・クラス・型・定数には JSDoc（説明・`@param`・`@returns`・`@throws`）。JSDoc に型を書かない。React の部品の props は `@param props` でまとめる。lint（`eslint-plugin-jsdoc`）で止める。
- 型だけを読むときは `import type`。
- API の道は `/api/v1/…` に置き、`@hono/zod-openapi` の `createRoute` で書く（入力の確かめと窓口の文書が一緒にできる）。Hono の `.get`・`.post` で `/api` の下に道を足さない（起動のときに止まる）。
- 道の値の ID は `kernel/http.ts` の `uuidParam` で書く（形が合わなければ、処理の前に 404 になる。処理の中で形を確かめなくてよい）。
- 入力の形とエラーの文言は `packages/contracts` の領域のフォルダに日本語で置く（API と画面が同じ形で確かめる）。約束は**ふつうの `zod`** で書き、`@hono/zod-openapi` を読まない（画面の組み立てに OpenAPI の道具を入れないため）。窓口の文書の名前と例は、API の道の側で `.openapi("名前")` を付ける（例：`platform/health/routes.ts`）。文言だけの定数は zod を読まないファイルに置く（例：`core/messages.ts`。画面が文言だけを読んでも zod が束に入らない）。zod の誤りの文は、欄のそばにそのまま出せる日本語で書く（日本語でない文は、API が決まった文に置きかえる）。領域のエラーは `{ code, status, message }` の一覧（例：`ACCOUNT_ERRORS`）にして `AppError` に渡す。
- ログに要求と応答の本文・利用者の入れた値・名前・メールを出さない（`kernel/logger.ts` が名前・メール・通行証を消すのは二重目の守り）。
- 画面の見た目の値は `packages/ui/src/styles/tokens.css`（DESIGN.md から写したもの）の名前だけを使う（`bg-primary`・`text-text-sub`・`p-xs`・`rounded-sm` など。角だけは Tailwind の名前とぶつかるので `sm`・`md`・`lg` と呼ぶ）。Tailwind の任意の値（`bg-[#…]`・`p-[13px]`）を書かない（lint で止める）。足りない値は、DESIGN.md と `tokens.css` に足す（`tokens.test.ts` が食い違いを止める）。
- 部品は `@workspace/ui` のもの（Button・Field・Input・Textarea・Table・Badge・Dialog・ConfirmDialog・ResponseMessage・NotificationBar・ChoiceChips〈選択肢のチップ〉）を使い、領域の中で作り直さない。新しい部品は shadcn/ui（Base UI の形。`packages/ui/components.json`）から持ってきて、値を `tokens.css` の名前に直してから使う。
- 外枠（`shell/AppShell.tsx`）の形は道ごとに、持ち主の領域が `createRoute` の `staticData.layout` で書く（型は `lib/router.ts`）。参加者が開く道（`PARTICIPANT_ROUTE_PATTERNS`）と手元のログインは `staticData: { layout: "bare" }`（ナビ・メニューのボタン・管理への入口を出さない）。書かない道は管理の外枠（PC は開閉できるサイドバー、スマホは下のタブバー）。`router.test.tsx` が、参加者の道はどれも `"bare"`、管理の道はどれも `"bare"` でないことを確かめる。ナビの項目は、領域の `feature.nav`（決まった項目）か `feature.useNavItems`（今の道に合わせた項目を返す React のフック。ナビのために問い合わせを始めず、画面が読んだものから決める）で出し、外枠に領域の名前や道を書かない。外枠は `lib` だけを読む。外枠のナビには、今の道のアプリ（道を出した領域が属するアプリ）の領域の項目だけが出る。どのアプリにも属さない外枠の画面（すべてのアプリ・設定）の道は `staticData.section`（`"apps"`・`"settings"`）を書く。外枠にアプリの名前を書かない（AD-15）。
- 画面の振る舞いは EXPERIENCE.md に従う：入力の誤りは欄のそば（`Field` の `error`）、送った結果は押したボタンの近く（`ResponseMessage`）、画面が切り替わるときだけ画面の上の知らせの帯（`lib/notice.ts` の `showNotice`）、消す前は `ConfirmDialog`。ページは `lib/page.tsx` の `Page`（題は h1。外枠が道の変わり目にフォーカスを移す）。
- 画面の `index.html` に中に書いた script を置かず、`eval`・`new Function` を使わない（組み立てた画面の CSP が止める。E2E が CSP の違反を落とす）。組み立てた画面の CSP は、本番も E2E も API が付ける（`apps/api/src/platform/web/web.ts` の `WEB_CSP_DIRECTIVES` の1か所）。画面から外の源を読むときは、そこを直し、源ごとに何に使うかを書く。画面のコードで環境の値（`process.env`・`import.meta.env.VITE_*`）を読まない（lint で止める。要る値は `vite.config.ts` の `define` で、秘密でないものだけ埋める）。
- LINE（`@line/liff`）を読むのは `apps/web/src/lib/liff.ts` だけ。画面と領域は `initLiff`・`getLiff` を使い、`liff.init()` を書かない（構成の決めごと AD-4）。サーバーに送るのは `getIDToken()` の生の値だけ。
- 参加者が開く画面の道・ミニアプリの URL・日本時間の日付と「その日の終わり」・夜間の停止の時間帯と DB に届かないときの文は、`@workspace/contracts/core` のもの（`participantPaths`・`PARTICIPANT_ROUTE_PATTERNS`・`miniAppPermalink`・`jstDate`・`endOfJstDate`・`isNightStopWindow`・`dbUnavailableMessage`）を使い、領域の中で作り直さない（AD-10・AD-14・Consistency Conventions）。
- ログインが要る API の道は、account の `requireSession(deps)` を `createRoute` の `middleware` に付け、今の利用者は `currentAccount(c)`、運営者か（アプリの台帳など。AD-16）は `isOrganizer(deps.config, …)` で読む。交流会の主催者と、新しいアプリの持ち主・権限に `isOrganizer` を使わない（AD-5・AD-19）。クッキーと `session`・`account` の表を領域で読まない（AD-3・AD-12）。ログインが要る画面は account の `SessionGate` で包み、今の利用者は `useSession()` で読む。
- 交流会ごとの権限が要る API の道は、event の `requireEventRole(deps, roles)`（役目は主催者・受付係・部員から選ぶ）を `requireSession(deps)` のあとに付け、役目は `currentEventRole(c)`、参加者に見せてよい交流会の欄は `getEventSummary(db, config, eventId)` で読む。`event`・`event_staff`・`event_organization` の表を領域で読まない（AD-3・AD-5・AD-23）。管理の画面（`/admin/events/…`）の道は `@workspace/contracts/event` の `ADMIN_ROUTE_PATTERNS`・`adminPaths` を使って作り直さず、交流会の読みこみと役目の確かめは `EventAccessGate`（か `useEvent`）で行う。交流会の中の行き来は外枠のナビ（event が出す項目）に任せ、画面の上にタブを置かない。
- チェックインと、そのときの名前（困りごとの一覧と書き出しの名前）は reception の `findCheckin`・`getCheckin`・`listCheckins` で読み、`checkin` の表を領域で読まない（外部キーは `checkinTable` にだけ。AD-3・AD-6）。申し込みの媒体・知ったきっかけ・支払い方法の選択肢と同じ名前の比べ方は `@workspace/contracts/reception` のものを使う。
- DB に届かないときの 503（`DB_UNAVAILABLE`）は土台（`kernel/errors.ts` の `toAppError`）が返す。領域で DB の接続のエラーを捕まえて読みかえない（AD-10）。
- DB の命令を文字のつなぎで作らない・`sql.raw` を使わない・HTML をそのまま差しこまない・アプリのコードから OS のコマンドを動かさない（どれも lint で止める）。

### 6-4. DB の表

- 新しい表は、持ち主の領域の `modules/<領域>/schema.ts` に置く（drizzle-kit は `modules/*/schema.ts` と `platform/*/schema.ts` を読むので、設定は直さない）。
- 主キーは `uuid`（既定値 `uuidv7()`。`kernel/columns.ts` の `primaryId()`）、時刻は `timestamptz`（`timestamps()` で `created_at`・`updated_at`）。
- 表と列の名前は単数の snake_case（コードでは camelCase。Drizzle の `casing: "snake_case"`）。制約と索引の名前は `<表>_<列>_unique`・`<表>_<列>_idx` の形。
- 同時に来ても守りたい決まり（同じ題は1つ など）は、DB の一意の制約で守り、違反を領域のエラーに読みかえる（`kernel/pg-errors.ts`）。
- ログインや組織（複数のお客）を足すときは、その仕様で、表の持ち主の列（例：`organization_id`）と、読み書きを絞る決まりをここに足す。

### 6-5. テスト

- 単体と結合は Vitest（ルートの `vitest.config.ts` がワークスペースをまとめて流す）、通しは Playwright（アクセシビリティは `@axe-core/playwright`。1440px と 375px の2つの幅）。
- API の結合のテストは本物の PostgreSQL に当てる。テストの始めに `<DB名>_test_template` に DB の変更を当て、Vitest の働き手ごとに写した DB を使う（`apps/api/test/helpers/db.ts` の `useTestDatabase()`）。表の名前を書き並べず、`truncateAllTables` で空にする（空にしたあと、DB の変更が入れた初めの行〈suite の台帳の受付アプリ＝公開〉を戻す）。アプリの公開の状態を確かめるときは、`test/helpers/suite.ts` の見本のアプリ（`DEMO_APP`・`DEMO_MODULE`）を `buildApp` の `extraApps`・`extraModules` に渡す。
- 領域の窓口を足したら、`modules/<領域>/` に結合のテスト（作る・読む・直す・消すと、入力の誤り・ない ID）を足す。ログインした要求は `test/helpers/account.ts` の `loginAs`・`withCookie` で作る（試験用のログイン）。交流会と受付係は `test/helpers/event.ts` の `createEvent`・`makeStaff`、チェックインは `test/helpers/reception.ts` の `checkIn`・`manualCheckIn` で作る。外のサービスの答えは `buildApp` の `fetch` で差しかえる（既定はテストから外へ出ない）。画面を足したら、`e2e/tests/` に通しの流れとアクセシビリティの確かめを足す。
- E2E は E2E 専用の DB（`<DB名>_e2e`）と、`.env` の口の番号に 1000 を足した口を使い、1つずつ順に流す（テストの始めに DB を決まった状態にする）。E2E の API は `apps/api/test/e2e-server.ts` で立ち上げる（本番と同じ手順に、テストだけの見本のアプリ〈key `demo`〉を足す。立ち上げのときに台帳を戻す：見本のアプリは切・受付アプリは公開）。台帳を変える E2E は、終わりに戻す。E2E の API と画面に渡す設定は `e2e/env.ts` で決める（手元の `.env` からは DB の接続先と口の番号だけを読む）。E2E の主催者は `e2e/env.ts` の `E2E_ORGANIZER_LINE_USER_ID` で試験用のログインをする。
- テストの設定（`apps/api/vitest.config.ts`・`e2e/env.ts`）は、手元の `.env` からは DB の接続先と口の番号だけを読み、機能の印などはテストの中で決める（2章）。

### 6-6. 領域を足す手順

共通のファイルで直すのは `apps/api/src/modules.list.ts` と `apps/web/src/features.list.ts` の1行ずつと、属するアプリの `packages/contracts/src/core/apps.list.ts` の1行だけ（[並行開発の決まり](./parallel-development.md) 3-1）。ほかは、領域のフォルダの入口（`index.ts`）から出し、組み立てが読む（テンプレートの見本の領域 `notes` は core-001 で消した。形は `git show cd869b9:apps/api/src/modules/notes/routes.ts` などで読める）。

1. **約束**：`packages/contracts/src/<領域>/` に入出力の形（ふつうの zod）と、領域のエラーの code と日本語の文言を置き、`index.ts` から出す。
2. **表**：`apps/api/src/modules/<領域>/schema.ts` に表を書き、`pnpm db:generate --name <領域>` → できた SQL を読む → `pnpm db:migrate`。DB の変更のある PR は小さく切って先に入れる（[並行開発の決まり](./parallel-development.md) 4）。
3. **API**：道は `routes.ts` に `createRoute` で書き、約束の形に `.openapi("名前")` を付けて使う。道の ID は `uuidParam`。`apps/api/src/modules/<領域>/index.ts` から `routes`（`(deps: DomainRouteDeps) => …`。戻り値の型を書かず `.openapi()` のつながりのまま返す。`deps` は `db`・`logger`・`features`・`config`〈秘密でない設定だけの `DomainConfig`〉・`fetch`〈外のサービスへの出口。テストでは差しかえ、既定は外へ出ない〉・`apps`〈登録されたアプリ。suite が読む〉・`secretBox`〈外のサービスのトークンを DB に持つ前に包む秘密の箱。鍵の値は渡さない。設定がなければ undefined〉・`isJobRequest`〈定期の仕事〈Cloud Scheduler〉の合言葉の確かめ。値は渡さない〉・`metaApp`〈Meta のアプリの OAuth と Webhook の署名の確かめ。設定がなければ undefined〉・`notifier`〈知らせを送る道具。`platform/notify` の守り〈`NOTIFY_MODE`・`NOTIFY_ALLOWLIST`〉を通し、手元とテストは偽の送り手。LINE とメールの API を領域から直に呼ばない〉だけ。外のサービスは `deps.fetch` で呼び、全域の `fetch` を直に使わない。秘密の値を `DomainConfig` に足さず、値を使う道具にして渡す）を出す。`modules.list.ts` に `export * as <領域> from "./modules/<領域>/index.ts";` を1行足す。
4. **画面**：`apps/web/src/features/<領域>/index.ts` から `feature`（`id`・`routes`・任意で `nav`〈名前・行き先・アイコン〉と `useNavItems`）を `satisfies WebFeature` で出す（`WebFeature[]` と型を書くと、道の型が消える）。道は `createRoute({ getParentRoute: () => rootRoute, path: "/<領域>…" })`（`lib/router.ts`。TanStack Router のコードで書く形）。参加者が開く道には `staticData: { layout: "bare" }` を書く（6-3）。入力のフォームの画面は `lazyRouteComponent` で開いたときに読む。窓口は `createApiClient<ModuleRoutes["<領域>"]>()` と `request()` で呼ぶ（`ModuleRoutes` は `apps/api/src/client.ts` から `import type`）。`features.list.ts` に `export * as <領域> from "./features/<領域>/index.ts";` を1行足す。
5. **アプリへの登録**：領域は、ちょうど1つのアプリか、スイートの共通（`account`・`suite`）に属する（構成の決めごと AD-15）。新しいアプリなら `packages/contracts/src/core/apps.list.ts` に `export const <key> = defineApp({ key, name, summary, description, icon, domains: ["<領域>"], basePath: "/<key>", uses: [], accountData });` を1行足し、今のアプリに領域を足すなら、その行の `domains` に足す。どこにも属さない領域があると、テスト（`apps/api/test/apps-registry.test.ts`・`apps/web/src/router.test.tsx`）が落ち、API は起動しない。アプリに属する領域の道には、組み立てが suite の `requireApp` を自動で付ける（見えなければ 404。領域で付けない。AD-16）。新しいアプリは、台帳に行がない間「運営者だけ」に見える。設定の画面に項目を出すときは、`feature.settings`（`lib/settings.ts` の形）で出す（見えないアプリの項目は出さない）。
6. **大きな機能**は、設定 `DOMAIN_FEATURES` の印（`<領域>.<名前>`）で止められるように作る（2章）。API は `deps.features.enabled("<領域>.<名前>")` で読む。アプリ全体の公開は suite の台帳で決め、`DOMAIN_FEATURES` と取りかえて使わない（AD-16）。
7. **テスト**：6-5。領域の地図 `docs/apps/<領域>.md` を書き、[docs/README.md](../README.md) 2章に1行足す。
