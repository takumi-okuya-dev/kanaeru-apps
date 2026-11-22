# スイート（suite）の地図

2026-11-20 作成（core-005。決めた理由と仮決めは [specs/core/005-app-switcher/spec.md](../../specs/core/005-app-switcher/spec.md)、範囲は [PRD](../../_bmad-output/prd-kanaeru-suite/prd-kanaeru-suite.md)）。同じ日に suite-001（組織と退会の手順の組み立て。[specs/suite/001-organization](../../specs/suite/001-organization/spec.md)・[PRD 組織](../../_bmad-output/prd-kanaeru-org/prd-kanaeru-org.md)・AD-22）を足した。同じ日に event-002 で、組織を使う領域と退会の手順を出す領域に event を足した。

スイートの共通の領域（どのアプリにも属さない）。アプリの台帳（公開の状態）を持ち、アプリが見えるかを決める1か所（構成の決めごと AD-15・AD-16）。組織（人と役割・招待）と、契約の持ち主の形（`entitlement`。払うしくみと売り方は売り始めるときに足す）も持つ（AD-22）。画面では、すべてのアプリ・設定（一覧・アカウント・組織・アプリの台帳）・組織の招待の確かめの画面を持つ。

## 1. アプリの一覧（`packages/contracts/src/core/apps.list.ts`）

アプリは1行に1つ（`merge=union`）。`defineApp({ … })` の欄：

| 欄 | 何か |
|---|---|
| `key` | 英小文字で始まる英小文字・数字。一意。予約語（`RESERVED_APP_KEYS`：`api`・`admin`・`e`・`invite`・`dev`・`assets`・`apps`・`oauth`・`mcp`・`well-known`・`settings`・`join`）は使えない |
| `name`・`summary`・`description` | 名前・切り替えの短い説明・すべてのアプリの説明 |
| `icon` | 線のアイコンの種類（`APP_ICONS`。線は `apps/web/src/lib/icon.tsx`） |
| `domains` | 属する領域。どの領域も、ちょうど1つのアプリか共通（`COMMON_DOMAINS`：`account`・`suite`）に属する |
| `basePath` | 画面の道の頭（新しいアプリは `/<key>`。受付アプリは `/admin/events`） |
| `uses` | 使ってよいほかのアプリの key |
| `accountData` | 退会で消える、そのアプリの本人の記録（退会の確かめの枠に出す） |

今のアプリ：`reception`（受付。`event`・`reception`・`survey`・`booking`）・`threads`（Threads。`threads`）・`match`（試合表。`match`。`reception` を使う）。一覧の正本は `packages/contracts/src/core/apps.list.ts`。

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
| `organization` | `id`・`name`（1〜50文字の CHECK）・`admin_seen_at`（管理者が組織の画面を最後に見た日時）・`created_at`・`updated_at` | suite-001（`0012_suite_organization.sql`） |
| `organization_member` | `organization_id`・`account_id`（主キーはこの組）・`role`（`admin`・`editor`・`member`）・`joined_at`・`demoted_at`（最後にメンバーに下げた日時） | 管理者は1組織に1人（`organization_member_admin_unique`。部分の一意）。どちらの外部キーも CASCADE。アプリの「チームに入れる」・担当の表は、この組を指す複合の外部キーを CASCADE で持つ |
| `team` | `id`・`organization_id`・`name`（1〜30文字の CHECK）・`created_at`・`updated_at` | suite-003（組織の中のチーム。`0014_suite_team.sql`）。`(organization_id, name)` と `(id, organization_id)` が一意。組織が消えると消える。1つの組織に20まで（窓口が数える） |
| `team_member` | `team_id`・`account_id`（主キーはこの組）・`organization_id`・`leader`（リーダー）・`joined_at` | `team(id, organization_id)` と `organization_member(organization_id, account_id)` を指す複合の外部キーを CASCADE（チームが消える・組織から抜けると消える）。アプリの「チームに入れる」・担当の表は、この組を指す外部キーを CASCADE で持つ |
| `organization_invite` | `organization_id`（主キー）・`token_hash`（一意）・`token_ciphertext`・`token_iv`・`key_version`・`created_at` | 照らし合わせは SHA-256 だけ。出し直すための写しを秘密の箱で包む（箱がなければ空） |
| `entitlement` | `id`・`app_key`・`holder_account_id`・`holder_organization_id`・`created_at`・`updated_at` | 持ち主はどちらか1つ（`entitlement_holder_check`）。どちらも CASCADE。売り始めるまで使わない（料金などの列はそのときに足す） |

## 3. 窓口

| 動き | 道 | すること | 主なエラー |
|---|---|---|---|
| GET | `/api/v1/suite/apps` | 見る人に見えるアプリ（登録の順。名前・説明・アイコン・領域・道の頭・公開の状態）と、運営者か。ログインの前でも答える（公開のアプリだけ） | — |
| GET | `/api/v1/suite/app-settings` | 台帳（登録されたアプリごとに1行。行がなければ `operator_only`・`stored: false`）。運営者だけ | 401・403 |
| PUT | `/api/v1/suite/app-settings/{appKey}` | 公開の状態を変える（`{ visibility }`）。すぐ効く。運営者だけ | 400・401・403・404（登録されていない key） |
| GET・POST | `/api/v1/suite/organizations` | 入っている組織（入った順・役割・人数）／組織を作る（作った人が管理者。管理者として持てる組織は20まで） | 400・401・409 `ORGANIZATION_LIMIT` |
| GET | `/api/v1/suite/organizations/{id}` | 組織の画面（人の表示名・役割・入った日・あなた・新しい人〈管理者だけ〉）。組織の人の全員 | 401・404 `ORGANIZATION_NOT_FOUND` |
| PATCH・DELETE | `/api/v1/suite/organizations/{id}` | 名前を直す・組織を消す（管理者だけ） | 403 `ORGANIZATION_ADMIN_ONLY`・404 |
| GET・POST | `/api/v1/suite/organizations/{id}/invite` | 招待の札を読む（なければ・出し直せなければ `null`）・作り直す（管理者だけ） | 403・404 |
| PUT・DELETE | `/api/v1/suite/organizations/{id}/members/{accountId}` | 役割をメンバー⇔編集者に切り替える（編集者は10人まで）・外す（管理者だけ。自分と管理者は不可。招待の札があれば同じトランザクションで作り直し、外した人が古いリンクで入り直せないようにする） | 403・404・409 |
| POST | `/api/v1/suite/organizations/{id}/teams` | チームを作る（管理者だけ。1つの組織に20まで。組織の画面の `teams` に出る） | 403・404・409 `TEAM_LIMIT`・`TEAM_NAME_TAKEN` |
| PATCH・DELETE | `/api/v1/suite/organizations/{id}/teams/{teamId}` | チームの名前を直す・消す（管理者だけ。消すとアプリの「チームに入れる」・担当が外れる） | 403・404 `TEAM_NOT_FOUND`・409 |
| PUT・DELETE | `/api/v1/suite/organizations/{id}/teams/{teamId}/members/{accountId}` | 組織の人をチームに足す・リーダーを切り替える（`{ leader }`）・外す（管理者だけ） | 403・404 `TEAM_MEMBER_NOT_FOUND` |
| POST | `/api/v1/suite/organizations/{id}/transfer` | 管理者を引き継ぐ（前の管理者は編集者） | 403・404・409 |
| POST | `/api/v1/suite/organizations/{id}/leave` | 抜ける（管理者は `successorAccountId` が要る） | 404・409 `ORGANIZATION_SUCCESSOR_REQUIRED` |
| GET・POST | `/api/v1/suite/organization-invites/{token}` | 招待の確かめの中身（名前・管理者・人数・すでに入っているか・満員か）・メンバーとして入る（同じ人は1回だけ） | 404 `ORGANIZATION_INVITE_INVALID`・409 `ORGANIZATION_FULL` |

組織の操作の判定は `routes-organization.ts` の `requireOrganizationRole` の1か所（組織の人でなければ 404・管理者だけの操作は 403）。役割は要求のたびに引く。

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

### 組織と契約（ほかが使うもの。suite-001・AD-22）

| 名前 | 何か |
|---|---|
| `organizationTable`・`organizationMemberTable` | 外部キーのためだけ（`.references()`・`foreignKey()`）。読み書きしない |
| `findMembership(db, organizationId, accountId)` | その人の組織の人の行（役割・入った日時・`demotedAt`）。組織の人でなければ `null`。要求のたびに引く |
| `listMemberships(db, accountId)`・`listMembers(db, organizationId)` | 入っている組織（組織の名前つき）・組織の人（表示名つき。管理者 → 編集者 → メンバー） |
| `findOrganization(db, id)`・`findOrganizationAdmin(db, id)` | 組織・管理者（表示名つき） |
| `adminAfterWithdrawal(db, organizationId, accountId)` | その人が退会したあとの管理者（組織が消えるなら `null`）。アプリが退会の確かめの中身で引き継ぐ先を決める |
| `withdrawal` | suite の退会の手順（管理者の組織をいちばん長くいる人に引き継ぐ・誰もいなければ消す）。組み立てがアプリより先に流す。アカウントを消すトランザクションの中の最後の確かめ（`finalize`）でも、同じことをもう一度確かめる。人ごとの鍵（組織を作る・管理者を引き継ぐ・最後の確かめで同じ鍵。順は「人 → 組織」）で、消える直前に管理者にされることを防ぐ |
| `hasEntitlement(db, { ownerAccountId, organizationId }, appKey)`・`ENTITLEMENTS_ENFORCED` | 契約があるか（持ち主の個人の契約か、記録を入れた組織の契約）。売り始めるまで `ENTITLEMENTS_ENFORCED = false` で、いつも true。どの窓口もまだ呼ばない |

退会の手順の組み立て（AD-22）：各領域の `index.ts` の `withdrawal`（`kernel/withdrawal.ts` の形）を、`app.ts` の `orderWithdrawalSteps` が共通（`COMMON_DOMAINS` の順）→ アプリの一覧の順に並べ、`DomainRouteDeps.withdrawalSteps` で account に渡す（account の地図 2章）。手順を出している領域は suite・event（組織に入れた交流会の引き継ぎ・個人の交流会を消す。event の地図）・threads。組織の役割を読んで判定するアプリは threads（`access.ts`）と event（交流会の主催者・部員。`access.ts`）。

テスト：`apps/api/test/helpers/suite.ts` の見本のアプリ（`DEMO_APP`・`DEMO_MODULE`。key `demo`・道 `GET /api/v1/demo/ping`）を `buildApp(database, config, { extraApps: [DEMO_APP], extraModules: { demo: DEMO_MODULE } })` に渡す。E2E の API（`apps/api/test/e2e-server.ts`）も見本のアプリを足し、立ち上げのときに見本のアプリを切・受付アプリを公開に戻す。

## 5. 画面

| 道 | 画面 | 振る舞い |
|---|---|---|
| `/apps` | すべてのアプリ（`staticData.section: "apps"`） | 見えるアプリのカード。最後に使ったアプリの「開く」が主のボタン。運営者には「運営者だけに見えています」の札と台帳への入口。ログインの前でも公開のアプリを出す |
| `/settings` | 設定の一覧（`section: "settings"`） | まとまり（個人の設定・アプリの設定・運営）ごとの項目。スマホはここから入る |
| `/settings/account` | アカウント | 表示名・ログインの方法・登録した日・使えるアプリ・ログアウト・退会（確かめの枠）。ログアウトと退会のあとは `/apps` に知らせの帯 |
| `/settings/apps` | アプリの台帳（運営者だけ） | 行ごとのチップで、押すとすぐ保存し、結果を行のそばに出す。今見える人と凡例 |
| `/settings/organizations` | 組織（個人の設定） | 入っている組織の一覧と「組織を作る」 |
| `/settings/organizations/$organizationId` | 組織の画面 | 人の一覧（あなた・新しい人）。管理者は役割の切り替え・外す・招待のリンクと QR・作り直す・名前・消す・引き継ぐ。抜ける（管理者は引き継ぐ人を選ぶ）。アプリの組織の画面への入口（`feature.organization.links`。見えるアプリだけ） |
| `/join/$joinToken` | 組織の招待の確かめ（外枠のナビなし。ログインが要る） | 組織の名前・管理者・人数・「メンバーとして入ります」・見え方の説明（アプリの `feature.organization.joinNotes`。見えるアプリだけ）・入る。すでに入っていれば組織の画面への入口。使えないリンクは理由と「管理者に新しいリンクを頼んでください」 |

退会の枠（`/settings/account`）は、開いたときに `GET /api/v1/accounts/me/withdrawal` を読み、組織・引き継がれる記録・消える記録に分けて出す。

画面の入口（`apps/web/src/features/suite/index.ts`）：`useVisibleApps()`（見えるアプリ・運営者か。鍵に今わかっている利用者を入れる）・`loadVisibleApps(queryClient)`（はじめの画面）・`SUITE_QUERY_KEYS`・`SUITE_ROUTE_PATTERNS`。組み立てが外枠の切り替えとナビに使う。設定の項目は、領域の `feature.settings`（suite は「アカウント」「組織」「アプリの台帳」）。アプリが組織の画面と招待の確かめの画面に足すものは、領域の `feature.organization`（`lib/organization.ts`。組み立てが属するアプリを付けて渡す）。
