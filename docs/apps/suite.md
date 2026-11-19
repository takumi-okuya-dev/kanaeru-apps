# スイート（suite）の地図

2026-11-20 作成（core-005。決めた理由と仮決めは [specs/core/005-app-switcher/spec.md](../../specs/core/005-app-switcher/spec.md)、範囲は [PRD](../../_bmad-output/prd-kanaeru-suite/prd-kanaeru-suite.md)）。

スイートの共通の領域（どのアプリにも属さない）。アプリの台帳（公開の状態）を持ち、アプリが見えるかを決める1か所（構成の決めごと AD-15・AD-16）。画面では、すべてのアプリ・設定（一覧・アカウント・アプリの台帳）を持つ。契約（`entitlement`）と売り方は、売り始めるときに足す。

## 1. アプリの一覧（`packages/contracts/src/core/apps.list.ts`）

アプリは1行に1つ（`merge=union`）。`defineApp({ … })` の欄：

| 欄 | 何か |
|---|---|
| `key` | 英小文字で始まる英小文字・数字。一意。予約語（`RESERVED_APP_KEYS`：`api`・`admin`・`e`・`invite`・`dev`・`assets`・`apps`・`oauth`・`mcp`・`well-known`・`settings`）は使えない |
| `name`・`summary`・`description` | 名前・切り替えの短い説明・すべてのアプリの説明 |
| `icon` | 線のアイコンの種類（`APP_ICONS`。線は `apps/web/src/lib/icon.tsx`） |
| `domains` | 属する領域。どの領域も、ちょうど1つのアプリか共通（`COMMON_DOMAINS`：`account`・`suite`）に属する |
| `basePath` | 画面の道の頭（新しいアプリは `/<key>`。受付アプリは `/admin/events`） |
| `uses` | 使ってよいほかのアプリの key |
| `accountData` | 退会で消える、そのアプリの本人の記録（退会の確かめの枠に出す） |

今のアプリ：`reception`（受付。`event`・`reception`・`survey`）。

確かめ：`appRegistryProblems`（key・領域・道の頭）と `unassignedDomains`（どこにも属さない領域）。`packages/contracts/src/core/apps.test.ts`・`apps/api/test/apps-registry.test.ts`（API の領域）・`apps/web/src/router.test.tsx`（画面の領域）。API は、決まりに合わないと起動しない。

### 新しい領域を足すとき（例：`threads`）

1. `apps/api/src/modules.list.ts` と `apps/web/src/features.list.ts` に、いつもの1行（[コードの書き方の決まり](../rules/coding.md) 6-6）。
2. 新しいアプリなら `apps.list.ts` に1行：

   ```ts
   export const threads = defineApp({ key: "threads", name: "Threads", summary: "投稿の案・承認・自動投稿", description: "…", icon: "chat", domains: ["threads"], basePath: "/threads", uses: [], accountData: "運用アカウント・投稿の案" });
   ```

   今のアプリに領域を足すなら、その行の `domains` に足す。
3. 台帳に行がない間は「運営者だけ」に見える。運営者が台帳で「公開」にする（デプロイは要らない）。
4. 設定の画面に項目を出すなら、`feature.settings` に `{ id, label, to: "/settings/<key>…", group: "app" }` を足し、その道を自分の領域で作る（`staticData: { section: "settings" }`）。

## 2. 表

| 表 | 列 | 決まり |
|---|---|---|
| `app_setting` | `id`（uuid）・`app_key`（text）・`visibility`（text）・`created_at`・`updated_at` | `app_key` は一意（`app_setting_app_key_unique`）。`visibility` は `off`・`operator_only`・`public`（CHECK）。行がないアプリは `operator_only`。DB の変更（`0008_suite.sql`）が受付アプリを `public` で入れる。書くのは suite だけ |

## 3. 窓口

| 動き | 道 | すること | 主なエラー |
|---|---|---|---|
| GET | `/api/v1/suite/apps` | 見る人に見えるアプリ（登録の順。名前・説明・アイコン・領域・道の頭・公開の状態）と、運営者か。ログインの前でも答える（公開のアプリだけ） | — |
| GET | `/api/v1/suite/app-settings` | 台帳（登録されたアプリごとに1行。行がなければ `operator_only`・`stored: false`）。運営者だけ | 401・403 |
| PUT | `/api/v1/suite/app-settings/{appKey}` | 公開の状態を変える（`{ visibility }`）。すぐ効く。運営者だけ | 400・401・403・404（登録されていない key） |

## 4. 見えるか（ほかが使うもの）

API（`apps/api/src/modules/suite/index.ts`）：

| 名前 | 何か |
|---|---|
| `isAppVisible(db, appKey, viewer)` | 見えるか。`viewer` は `{ isOperator }`（ログインの前は `null`）。公開はだれにも、運営者だけは運営者にだけ、切はだれにも見えない |
| `requireApp(deps, appKey)` | 見えなければ 404 の middleware。**各アプリは付けない**。組み立て（`app.ts`）が、アプリに属する領域のすべての道（参加者が外から開く道も）の前に自動で付ける。公開のアプリはセッションを引かずに通す |
| `requireAppNotOff(deps, appKey)` | 機械の道（`/api/v1/<領域>/jobs/…`・`/api/v1/<領域>/webhooks/…`。定期の仕事と外のサービスが送る）の middleware。見る人がいないので、**切のときだけ** 404（運営者だけでも通す）。組み立てが `requireApp` の代わりに付ける。道は自分で合言葉・署名を確かめる |
| `appVisibility(db, appKey)`・`upsertVisibility(db, appKey, visibility)` | 公開の状態を読む・書く（書くのは suite の窓口と E2E の立ち上げだけ） |
| `INITIAL_APP_SETTINGS`・`restoreInitialAppSettings(db)` | DB の変更が入れる初めの行と、それを戻す手順（結合のテストの `truncateAllTables` が使う） |

アプリの領域は `app_setting` を読まない。領域の中の大きな機能を止めるのは、今までどおり設定 `DOMAIN_FEATURES`（非常の切り替え）。

テスト：`apps/api/test/helpers/suite.ts` の見本のアプリ（`DEMO_APP`・`DEMO_MODULE`。key `demo`・道 `GET /api/v1/demo/ping`）を `buildApp(database, config, { extraApps: [DEMO_APP], extraModules: { demo: DEMO_MODULE } })` に渡す。E2E の API（`apps/api/test/e2e-server.ts`）も見本のアプリを足し、立ち上げのときに見本のアプリを切・受付アプリを公開に戻す。

## 5. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| `/apps` | すべてのアプリ（`staticData.section: "apps"`） | 見えるアプリのカード。最後に使ったアプリの「開く」が主のボタン。運営者には「運営者だけに見えています」の札と台帳への入口。ログインの前でも公開のアプリを出す |
| `/settings` | 設定の一覧（`section: "settings"`） | まとまり（個人の設定・アプリの設定・運営）ごとの項目。スマホはここから入る |
| `/settings/account` | アカウント | 表示名・ログインの方法・登録した日・使えるアプリ・ログアウト・退会（確かめの枠）。ログアウトと退会のあとは `/apps` に知らせの帯 |
| `/settings/apps` | アプリの台帳（運営者だけ） | 行ごとのチップで、押すとすぐ保存し、結果を行のそばに出す。今見える人と凡例 |

画面の入口（`apps/web/src/features/suite/index.ts`）：`useVisibleApps()`（見えるアプリ・運営者か。鍵に今わかっている利用者を入れる）・`loadVisibleApps(queryClient)`（はじめの画面）・`SUITE_QUERY_KEYS`・`SUITE_ROUTE_PATTERNS`。組み立てが外枠の切り替えとナビに使う。設定の項目は、領域の `feature.settings`（suite は「アカウント」と「アプリの台帳」）。
