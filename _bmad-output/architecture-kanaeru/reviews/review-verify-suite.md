# 確かめの見直し（review-verify-suite）— architecture-kanaeru の AD-15〜AD-21

- 見直した日：2026-11-19
- 観点：見直しで足した・直した決めごと（AD-15〜AD-21、AD-1・AD-3・AD-5・AD-9 の直し、Stack の WIF の行、Open Questions 6〜9、Deferred）が、学習データの記憶ではなく、ウェブ・npm・いまのリポジトリで確かめられているか。古い・確かめていないものがないか。
- 対象：`../architecture-kanaeru.md`（以下「spine」）と `../.memlog.md`
- 照合に使ったもの：npm レジストリ（`curl https://registry.npmjs.org/<pkg>`）・drizzle-kit 0.31.11 と drizzle-orm 0.45.4 の配布物の中身（読んだだけ）・MCP の仕様 2026-07-28 の本文・Google Cloud の文書・LINE Developers の文書・リポジトリ（`apps/api/drizzle/`・`apps/api/drizzle.config.ts`・`package.json`・`.github/workflows/ci.yml`・`.gitattributes`・ブランチ `feature/core-002-infra` の `specs/core/002-infra/research.md`）

## 判定

**条件つきで通る（直しが要る）。** 大きな決めごと（Drizzle 0.45 のまま・1.0 は RC・1.0 で journal がなくなる・`prefix: timestamp` では journal のぶつかりが残る・MCP の仕様の最新は 2026-07-28・CIMD を推奨し DCR は非推奨・Cloud Run は Direct WIF 非対応）は、どれも1次の情報で確かめられた。ただし次の4つは直すか書き足す必要がある。

1. **MCP の SDK の版が古い系列。** memlog は `@modelcontextprotocol/sdk 1.32.2` を確かめたとするが、これは v1 系列（保守だけ）。2026-07-28 の仕様を実装する安定版は **v2**（2026-07-27 に 2.0.0）で、包みが分かれた：`@modelcontextprotocol/server` 2.4.0・`@modelcontextprotocol/hono` 2.0.2（Hono ^4.11.4 が要る・zod ^4.2）。MCP を作るときは v2 の `server`＋`hono` を使う、と書き換える。
2. **AD-21 の認可の要件が仕様に足りない。** 仕様 2026-07-28 の MUST のうち、spine は「CIMD・PKCE・保護資源のメタデータ（RFC 9728）」しか挙げていない。**認可サーバーのメタデータ（RFC 8414 か OIDC Discovery のどちらか）・トークンの宛先（RFC 8707 の `resource`。MCP サーバーは自分宛てのトークンだけ受ける）・`/mcp` での `Origin` の確かめ（MUST）** が抜けている。`iss`（RFC 9207）は SHOULD だが、次の版で MUST にする予定と書かれている。また **DCR は「非推奨」で消えてはいない**。ChatGPT は CIMD を優先するが DCR も使い、CIMD の相互運用の不具合の報告もある。「CIMD を基本、つながらない相手のために DCR を残すか」を Open Question 9 に足す。
3. **`drizzle-kit check` が見るものが、AD-17 の期待より狭い。** 0.31.11 の中身では、`check` は ①snapshot の形が壊れていないか、②同じ親（`prevId`）を指す snapshot が2つ以上あるか（＝2本のブランチが同じところから DB の変更を作った）だけを見て、どちらかなら exit 1 で止まる。journal の `when`（時刻）が順に増えていないものは **警告だけで、止まらない**。一方、マイグレーターは「DB で最後に当てたものより `when` が新しいものだけ」を当てる（drizzle-orm 0.45.4 `pg-core/dialect.js`）。そのため journal を手で直して古い `when` が後ろに来ると、**本番で黙って飛ばされる**。schema.ts を直して `db:generate` を忘れたことも見つけない。CI に「journal の `when` が順に増えるか」と「`db:generate` をしても差分が出ないか」の確かめを足す。
4. **AD-9 の出典の番号が違う。** 「core-002 R-1」とあるが、`feature/core-002-infra` の `specs/core/002-infra/research.md` では R-1 は「コンテナの形」で、WIF は **R-2**（「GitHub Actions の入り方」）。「core-002 R-2」に直す。中身（Cloud Run は Direct WIF 非対応・なりすましが要る）は Google の文書で確かめた。

あわせて、AD-8 の「`/api` 以外は `index.html` に戻す」は、Consistency Conventions に足した `/mcp`・`/oauth/*`・`/.well-known/*` と食い違う（下の 2-6）。

## 項目ごとの結果

凡例：✅ 確かめた（合っている）／⚠️ 確かめた（直すか書き足すのが要る）／❌ 食い違い／❓ 確かめられなかった

### 1. Drizzle（AD-17・AD-3・Stack）

| 主張（spine・memlog） | 確かめた結果 | 判定 |
|---|---|---|
| drizzle-orm の安定版の最新は 0.45 | npm の `latest` は **0.45.4**（2026-10-08）。drizzle-kit は **0.31.11**（2026-09-21）。リポジトリの `apps/api/package.json` も `^0.45.4`・`^0.31.11` | ✅ |
| 1.0 はまだ RC | npm の `rc` タグは **1.0.0-rc.5**（2026-10-21）。`latest` は 0.45.4 のまま | ✅ |
| 1.0 は `meta/_journal.json` をやめ、DB の変更ごとのフォルダにする | 公式の v1 への上げ方の頁：「Each migration gets its own folder…」「`meta/_journal.json` is removed」「Removing the shared journal avoids Git conflicts in that file」。フォルダの中は `migration.sql` と `snapshot.json` | ✅ |
| `drizzle-kit up` で移す | 同じ頁：「`up` converts local files without changing the database」。snapshot の鎖を全部残すこと、という注意あり。**1.0 の drizzle-kit で流す**（0.31 の `up` は snapshot の形を上げるだけで、フォルダの形にはしない） | ✅（書き足し推奨） |
| `prefix: timestamp` は journal のぶつかりを解かない | drizzle-kit 0.31.11 の `prepareMigrationMetadata` では、prefix はファイル名の頭（`0008` か `20261119…` か unix 秒か）を変えるだけ。journal には同じように行を足し、drizzle-orm 0.45.4 の `readMigrationFiles` は `meta/_journal.json` がないと例外になる | ✅ |
| `pnpm check` で `drizzle-kit check` を流す | `check` の中身（0.31.11 `src/cli/commands/check.ts` の部分）は下のとおり。2本のブランチが同じ親から作った snapshot は見つけて exit 1。**それ以外は見ない** | ⚠️ 下を見る |
| DB の変更のある PR は同時に1本だけ（いまの決まり4を強める） | `docs/rules/parallel-development.md`・`coding.md` 6-6 の2 にすでに「小さく切って先に入れる」がある。リポジトリの journal は 0000〜0007 の通し番号で、ぶつかった跡はない | ✅ |

#### `drizzle-kit check`（0.31.11）が見るもの・見ないもの

配布物 `bin.cjs` の `checkHandler` を読んだ（`curl https://registry.npmjs.org/drizzle-kit/-/drizzle-kit-0.31.11.tgz`）。

- 見る（exit 1）：
  - snapshot の版が古い（「`drizzle-kit up` を流して」）
  - snapshot の形が壊れている
  - **同じ `prevId` を指す snapshot が2つ以上**（「…are pointing to a parent snapshot: … which is a collision.」）。2本のブランチが同じところから `db:generate` し、両方の snapshot が残ったとき。つまり、取り込みで journal と snapshot のぶつかりを「両方残す」で直してしまった事故は見つかる。
- 見るが止めない（警告だけ）：journal の `when` が順に増えていない行（「If the earlier entry has already been applied, the migrator will skip this entry.」）
- 見ない：
  - journal の `idx`・`tag` の重なりや、journal と SQL のファイルの食い違い
  - schema.ts と最新の snapshot の食い違い（`db:generate` の忘れ）
  - DB に当たっている履歴（DB につながない。ただしこのリポジトリの `drizzle.config.ts` は `DATABASE_URL` がないと例外を投げる。CI の `ci.yml` は入れているので動く）
- 「索引の名前のぶつかり」：`check` は見ない。索引の名前が重なるのは `generate` のときに「collision between the index name…」と出る別の確かめ。

マイグレーター（drizzle-orm 0.45.4 `pg-core/dialect.js`）は、`__drizzle_migrations` の `created_at` の最大より `folderMillis`（＝journal の `when`）が大きいものだけを当てる。並行のブランチの journal を手で並べ直すと、本番で**黙って飛ばされる**ことがある。

**直し（AD-17 に足す）**：
- 後の PR の作り直しは、`git checkout origin/develop -- apps/api/drizzle` で develop の形に戻してから `pnpm db:generate --name <領域>`（または `drizzle-kit drop` で自分の変更を消す）。手元の DB は前のファイルで当たっているので作り直す（`pnpm local:setup`）。
- `pnpm check` に2つ足す：①`drizzle-kit check`、②`db:generate` を流して `git diff --exit-code apps/api/drizzle`（schema と SQL のずれ）と、journal の `when` が順に増えるかの小さな確かめ（警告を落ちる扱いにする）。

### 2. MCP（AD-20・AD-21・Open Question 9・Consistency Conventions）

| 主張 | 確かめた結果 | 判定 |
|---|---|---|
| 仕様の最新は 2026-07-28 | 仕様の Versioning の頁：「The **current** protocol version is **2026-07-28**」。これより新しい版はない | ✅ |
| 認可は OAuth 2.1 | 「Authorization servers **MUST** implement OAuth 2.1」（draft-ietf-oauth-v2-1-13）。認可そのものは OPTIONAL だが、HTTP で使うなら SHOULD で従う | ✅ |
| PKCE | 仕様の流れで、クライアントが PKCE を作る。OAuth 2.1 で必須（S256） | ✅ |
| 保護資源のメタデータ（RFC 9728） | 「MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata (RFC9728)」 | ✅ |
| CIMD を推奨・DCR は非推奨 | 「Authorization servers and MCP clients **SHOULD** support … Client ID Metadata Documents」「Dynamic Client Registration is deprecated and retained for backwards compatibility」。認可サーバーは `client_id_metadata_document_supported: true` をメタデータに出す | ✅ |
| （spine にない）認可サーバーのメタデータ | 「MCP authorization servers **MUST** provide at least one of …: RFC8414 / OpenID Connect Discovery 1.0」 | ⚠️ 足す |
| （spine にない）トークンの宛先 | 「MCP servers **MUST** validate that access tokens were issued specifically for them as the intended audience (RFC 8707)」。クライアントは `resource` を認可とトークンの両方の要求に入れる。認可サーバーは `resource` をトークンの行に持ち、`/mcp` はそれが自分（例 `https://<host>/mcp`）かを確かめる | ⚠️ 足す |
| （spine にない）`iss`（RFC 9207） | 認可サーバーは認可の応答に `iss` を入れる **SHOULD**、入れるならメタデータに `authorization_response_iss_parameter_supported: true`。「A future revision … is expected to upgrade … from SHOULD to MUST」 | ⚠️ 入れておくのを推奨 |
| （spine にない）`Origin` の確かめ | Streamable HTTP：「Servers **MUST** validate the `Origin` header on all incoming connections」。不正なら 403 | ⚠️ 足す |
| 範囲（scope）を分け、読むだけを既定に | 仕様の Scope Selection Strategy・Scope Challenge Handling と合う（不足は 403 と `WWW-Authenticate: Bearer error="insufficient_scope", scope=…`）。`offline_access` は保護資源の `scopes_supported` に入れない（SHOULD NOT） | ✅ |
| トランスポートの名前「Streamable HTTP」 | 今も標準の2つ（stdio・Streamable HTTP）の1つ。**2026-07-28 で中身が変わった**：プロトコルのセッション（`Mcp-Session-Id`）と GET の流れがなくなり、要求ごとに POST、`MCP-Protocol-Version`・`Mcp-Method`・`Mcp-Name` のヘッダーが必須 | ✅（書き足し推奨） |
| @modelcontextprotocol/sdk 1.32.2（memlog） | npm の `latest` は 1.32.2（2026-10-23）で数字は合う。ただし **v1 系列**。v2（2026-07-27 に 2.0.0）が 2026-07-28 の仕様の安定版で、包みが分かれた：`@modelcontextprotocol/server` 2.4.0・`client` 2.4.0・`hono` 2.0.2・`node` 2.1.2（いずれも 2026-10-23 前後）。v1 は v2 の後少なくとも6か月は直しが出る、と案内されている（終わりの日付は確かめられなかった） | ⚠️ 直す |

**評価**：
- セッションがなくなった（stateless）のは、Cloud Run の最大2台・最小0（AD-8）と相性がよい。台をまたいだセッションの持ち回りが要らない。Open Question 9 の前提として書いておくとよい。
- 「LINE ログインは CIMD に対応しないので、自前の認可サーバーを持つ」（AD-21 の Prevents）は筋が通る。LINE ログインはコンソールで登録したコールバックの URL にしか返さないので、Claude・ChatGPT などの任意の `redirect_uri` を直接受けられない。
- **DCR を本当に捨ててよいかは未確認**。OpenAI の文書は「ChatGPT は CIMD があればそれを優先し、なければ DCR」とし、Auth0 のフォーラムでは ChatGPT の CIMD だけがうまくいかない報告がある。Claude 側は Anthropic の1次の文書で確かめられなかった（第三者の記事だけ）。Open Question 9 に「Claude・ChatGPT が CIMD だけで接続できるか。だめなら DCR（非推奨）を足すか」を足す。

**直し（AD-21 の文）案**：「認可は account の領域が自前の OAuth 2.1 の認可サーバーとして出す（認可サーバーのメタデータ RFC 8414・CIMD・PKCE S256・`iss`〈RFC 9207〉。MCP の仕様 2026-07-28）。`/mcp` は保護資源のメタデータ（RFC 9728）を出し、自分宛て（RFC 8707 の `resource`）のトークンだけを受け、`Origin` を確かめる。」Stack か Deferred に「MCP の SDK は v2（`@modelcontextprotocol/server`・`@modelcontextprotocol/hono`）」。

#### 2-6. AD-8 と MCP・認可の道の食い違い

AD-8 は「`/api` 以外は `index.html` に戻す」「`/api` の下は API の CSP、ほかは画面の CSP」。Consistency Conventions は MCP を `/mcp`、認可を `/oauth/*` と `/.well-known/*` に置く。このままだと `/.well-known/oauth-protected-resource`・`/.well-known/oauth-authorization-server`・`/mcp` が SPA の `index.html` に吸われる。AD-8 を「`/api`・`/mcp`・`/oauth`・`/.well-known` 以外は `index.html`」に直すか、AD-21 に「組み立て（`app.ts`）の戻し先から外す」と書く。なお RFC 9728 では、資源が `https://<host>/mcp` のとき、メタデータの場所は `/.well-known/oauth-protected-resource/mcp`（道を後ろに付けた形）になる。

### 3. Cloud Run と WIF（AD-9・Stack）

| 主張 | 確かめた結果 | 判定 |
|---|---|---|
| Cloud Run は Direct WIF に対応しない・なりすましが要る | Google の「Identity federation: products and limitations」の頁の Cloud Run の行：「Cloud Run doesn't support Workload Identity Federation direct resource access. To allow access, use service account impersonation.」。Artifact Registry・Secret Manager は制限なし、Cloud SQL は API に制限なし | ✅ |
| google-github-actions/auth v3（WIF ＋ なりすまし） | GitHub の最新のリリースは `v3`。README は Direct WIF を「preferred」としつつ、「not all Google Cloud resources support `principalSet` identities」と書き、なりすましの形（`service_account`）も載せている | ✅ |
| 出典「core-002 R-1」 | `feature/core-002-infra` の `specs/core/002-infra/research.md` は R-1＝コンテナの形、**R-2＝GitHub Actions の入り方**（上の Google の文を引いている） | ❌ 「core-002 R-2」に直す |
| memlog の古い行 | memlog の constraint 行に「google-github-actions/auth@v3 の Direct WIF」が残る。後の decision 行で直しているので、記録としては可。spine と Structural Seed（`gh -- "WIF" --> ar`）は合っている | ✅（参考） |

### 4. 利用者の API キーの暗号化（AD-20）

| 主張 | 確かめた結果 | 判定 |
|---|---|---|
| Secret Manager に置いた鍵で AES-256-GCM | 小さなアプリの形として妥当。Node の `crypto` の `aes-256-gcm` で足り、依存は増えない | ✅ |
| 費用（Secret Manager） | 公式の価格の頁は取り出せなかった（中身が切れた）。検索と既存の確かめ（memlog「無料枠は月6版・1万アクセス」）では、有効な版あたり月 $0.06・アクセス1万回 $0.03・無料枠は月6版と1万アクセス。いまの秘密は `kanaeru-database-url`（core-002 R-3）だけなので、鍵を足しても無料枠の中。**古い版を無効にしないと版の数に数えられる**ので、鍵を替えたら前の版は「無効」にする | ✅（概数） |
| （比べ先）Cloud KMS の費用 | ソフトウェアの鍵の版あたり月 $0.06・暗号の操作1万回 $0.03（検索で確かめた。Google の頁の直接の取り出しはできなかった）。無料の操作枠は Autokey で作った鍵だけ。**月10円ほどで、費用の差はほぼない**。spine は KMS を外す理由を書いていないので、費用を理由にするなら当たらない | ⚠️ 理由を書く |

**評価**：Secret Manager の鍵でよいが、外す理由は費用ではなく「依存と手順が少ない（KMS の API を呼ばない・夜間停止と関係しない）」とする。KMS（エンベロープ暗号）の得は「鍵がアプリのメモリーに出ない・使うたびに監査ログ・鍵の版の管理」。どちらにするかより、次を AD-20 に足すほうが大事：
- 1行ごとに12バイトのランダムな nonce、暗号文・nonce・認証タグ・**鍵の版の番号**を一緒に持つ（鍵を替えられるように）。
- AAD（追加の認証データ）に `account_id` を入れ、別の人の行に写した暗号文が復号できないようにする。
- Cloud Run の `secret_key_ref` の `latest` は台が立ち上がったときに決まる。鍵を替える手順（新しい版を足す → 再デプロイ → 古い行を新しい鍵で書き直す → 古い版を無効）を infra の README に書く。

### 5. LINE ログインの Web 用のチャネルを上流の IdP にする（AD-21・Open Question 9・AD-2）

| 主張・前提 | 確かめた結果 | 判定 |
|---|---|---|
| Web 用の LINE ログインのチャネルで本人を確かめる | LINE ログイン v2.1 の Web の流れ（認可コード）。`redirect_uri` はチャネルに登録したコールバックの URL（複数登録できる）。`state` は必須、`nonce` は任意、PKCE は任意で **S256 だけ**。`openid` で ID トークン（`sub`＝LINEのユーザーID）。トークンの交換に `client_secret` を使う | ✅ |
| AD-2：同じプロバイダーの下に作る | LINE のユーザーIDはプロバイダーごとに変わる（既存の確かめ）。Web 用のチャネルも同じプロバイダーに作れば、ミニアプリでログインした account と同じ人になる。AD-4 の `LINE_CHANNEL_IDS`（並び）に Web 用のチャネルの ID を足せば verify の形も同じ | ✅ |
| （spine にない）チャネルの公開の状態 | 新しい LINE ログインのチャネルは「開発中（Developing）」で作られ、その間ログインできるのはチャネルの Admin・Tester だけ。ほかの人に使わせるには「公開（Published）」にする | ⚠️ Open Question 9 に足す |
| （spine にない）メールアドレス | `email` の範囲は申請と承認が要る。kanaeru は `sub` だけ使うので要らない（memlog の Better Auth の判断と合う） | ✅ |
| PC での体験 | MCP の接続は多くが PC のブラウザで始まる。LINE ログインは PC ではメールとパスワードか QR でログインする（スマホの LINE で QR を読む）。動くはずだが、Open Question 3（PC の外のブラウザ）と合わせて実地で確かめる | ❓ 実地で |

**評価**：上流の IdP にすること自体に、文書の上での妨げは見つからなかった。Open Question 9 に「チャネルを公開にする」「コールバックは kanaeru の `/oauth/line/callback` だけを登録する（MCP の相手の `redirect_uri` は kanaeru の認可サーバーが CIMD で確かめる）」「LINE への要求にも PKCE（S256）と `state`・`nonce` を付ける」を足すとよい。LINE の利用規約上、自前の認可サーバーの裏で使う形に制限がないかは確かめられなかった（❓）。

### 6. そのほかの新しい・直した部分

| 項目 | 確かめた結果 | 判定 |
|---|---|---|
| AD-15・AD-18・Consistency の「1行に1つ」＝`merge=union` | `.gitattributes` に `modules.list.ts`・`features.list.ts` がある。`apps.list.ts`・MCP のツールの一覧・`docs/decisions.md` はまだない（作るときに足す前提で可）。GitHub の画面のマージでは効かないことは `parallel-development.md` 末尾にすでに書いてある | ✅ |
| AD-16・AD-19・AD-1・AD-3・AD-5 の直し | 外の技術の主張を含まない設計の決めごと。確かめる外の事実はない | ✅（対象外） |
| Open Questions 6〜8 | 主催者への問い。外の事実の主張はない | ✅（対象外） |
| Deferred の新しい行 | 外の事実の主張はない | ✅（対象外） |
| AD-20 段階2「AI の会社ごとの違いは `kernel/ai` で吸収」 | 会社ごとの SDK・モデルの名前を書いていない（作るときに確かめる）ので、いまは確かめることがない | ✅ |

## 直しの一覧（spine と memlog へ）

1. **AD-9**：「core-002 R-1」→「core-002 R-2」。
2. **AD-17**：`drizzle-kit check` が見るのは「同じ親から作った snapshot の重なり」だけだと書き、`pnpm check` に「`db:generate` で差分が出ない」と「journal の `when` が順に増える」の確かめを足す。作り直しの手順（develop の `apps/api/drizzle` に戻す → `db:generate`、手元の DB の作り直し）を書く。`drizzle-kit up` は「1.0 の drizzle-kit で」と書く。
3. **AD-21**：RFC 8414（または OIDC Discovery）のメタデータ・RFC 8707 の宛先の確かめ・`Origin` の確かめ・`iss`（RFC 9207）を足す。仕様 2026-07-28 は stateless（セッションなし）で Cloud Run に合う、と書く。
4. **AD-8**（または AD-21）：SPA の戻し先と画面の CSP から `/mcp`・`/oauth/*`・`/.well-known/*` を外す。
5. **memlog・Stack（MCP を作るとき）**：`@modelcontextprotocol/sdk 1.32.2` → v2 の `@modelcontextprotocol/server` 2.4・`@modelcontextprotocol/hono` 2.0。
6. **Open Question 9**：Claude・ChatGPT が CIMD だけでつながるか（だめなら DCR を足すか）、LINE ログインのチャネルを公開にする、を足す。
7. **AD-20**：費用ではなく手順の少なさを理由にする（KMS も月10円ほど）。鍵の版の番号・AAD に `account_id`・鍵の替え方を足す。

## 出典

- npm：https://registry.npmjs.org/drizzle-orm ・ https://registry.npmjs.org/drizzle-kit ・ https://registry.npmjs.org/@modelcontextprotocol/sdk ・ https://registry.npmjs.org/@modelcontextprotocol/server ・ https://registry.npmjs.org/@modelcontextprotocol/hono ・ https://registry.npmjs.org/@modelcontextprotocol/node
- drizzle-kit 0.31.11 の配布物（`bin.cjs` の `checkHandler`・`prepareMigrationMetadata`）：https://registry.npmjs.org/drizzle-kit/-/drizzle-kit-0.31.11.tgz
- drizzle-orm 0.45.4 の配布物（`pg-core/dialect.js` の `migrate`・`migrator.js`）：https://registry.npmjs.org/drizzle-orm/-/drizzle-orm-0.45.4.tgz
- Drizzle `check`：https://orm.drizzle.team/docs/drizzle-kit-check
- Drizzle v1 への上げ方：https://orm.drizzle.team/docs/upgrade-v1
- MCP 仕様 Versioning：https://modelcontextprotocol.io/specification/versioning
- MCP 仕様 Authorization（2026-07-28）：https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- MCP 仕様 Client Registration：https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration
- MCP 仕様 Transports：https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- MCP 仕様 Streamable HTTP：https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- MCP 2026-07-28 の告知：https://blog.modelcontextprotocol.io/posts/2026-07-28/
- MCP TypeScript SDK v2：https://ts.sdk.modelcontextprotocol.io/v2/ ・ https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/
- OpenAI（ChatGPT の CIMD・DCR）：https://developers.openai.com/apps-sdk/build/auth
- Auth0 フォーラム（ChatGPT の CIMD の不具合の報告）：https://community.auth0.com/t/auth0-cimd-registration-appears-incompatible-with-the-current-chatgpt-client-id-metadata-document/203817
- Google（identity federation の対応と制限・Cloud Run）：https://docs.cloud.google.com/iam/docs/federated-identity-supported-services
- google-github-actions/auth：https://github.com/google-github-actions/auth
- Cloud KMS の価格：https://cloud.google.com/kms/pricing （頁の直接の取り出しはできず、検索の結果で確かめた）
- Secret Manager の価格：https://cloud.google.com/secret-manager/pricing （同上）
- LINE ログインを組み込む：https://developers.line.biz/en/docs/line-login/integrate-line-login/
- LINE Developers コンソール（開発中と公開）：https://developers.line.biz/en/docs/line-developers-console/overview
- リポジトリ：`apps/api/drizzle/meta/_journal.json`・`apps/api/drizzle.config.ts`・`apps/api/package.json`・`.github/workflows/ci.yml`・`.gitattributes`・`docs/rules/parallel-development.md`・`git show feature/core-002-infra:specs/core/002-infra/research.md`
