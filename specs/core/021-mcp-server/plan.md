# Implementation Plan: MCP で本人の記録を外の AI に渡す（接続・認可・読み取り）（core-021）

**Branch**: `feature/core-021-mcp-server` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

## Summary

`/api/mcp`（Streamable HTTP・SDK 2.x）と、account の中の自前の OAuth 2.1 認可サーバー（`/api/oauth/*`）を作る。最初の版は読むツールだけ（本番の書くツールは作らない）。書き込みは、型・範囲・同意・トークン・記録の仕組みを最初から入れて、あとで書くツールを足すだけにする（下の「書き込みへの備え」）。ツールは画面と同じ HTTP の窓口を `app.request` で呼び、利用者の Bearer を付ける（AD-20）。認可は LINE ログインに本人の確かめを任せ、PKCE（S256）・`state`・`iss`・RFC 8707 の `resource`・CIMD を守る。DCR は作らない（【仮決め】）。

## Technical Context

- 既存：Hono（`apps/api`）、zod の契約（`packages/contracts`）、account の `requireSession`（クッキー）、`requireApp`・`isAppVisible`（core-005）、LINE ログイン（AD-2）、DB は Drizzle（AD-17）。
- 新しい依存：`@modelcontextprotocol/server`・`@modelcontextprotocol/hono`（2.x）。
- 新しいシークレット：なし（LINE の Web 用チャネルのシークレットは AD-21 のとおり既存の計画どおり Secret Manager）。
- 新しい DB の変更：`oauth_client`（CIMD の取得結果の短い期限付きキャッシュ）・`oauth_code`（一時）・`oauth_grant`（同意。範囲はアプリごとの配列）・`oauth_token`（`kind`：`access` または `refresh`・ハッシュ・期限・範囲・親の同意の id）・`mcp_tool_call`（記録。`access`・ツール名・対象の id・結果の種類。中身は持たない）。`kind` と範囲の配列を最初から持つので、refresh や書く範囲を足すときに表を作り直さない。**DB の変更は1本の PR に分け、先に入れる**（[並行開発の決まり](../../../docs/rules/parallel-development.md) 3 の 5。AD-17）。

## Research

- **R1. CIMD**：クライアントは自分の HTTPS の URL に JSON を置き、その URL を `client_id` にする。認可サーバーはその JSON を取りに行き、名前・`redirect_uris` を確かめる（[WorkOS の解説](https://workos.com/blog/client-id-metadata-documents-cimd-oauth-client-registration-mcp)）。認可サーバーは OAuth のメタデータに `client_id_metadata_document_supported` を出して知らせる。
- **R2. DCR の扱い（改定）**：CIMD を勧める解説はあるが、DCR しか使えない接続（`mcp-remote` など）の報告もある。Claude Code は CIMD、`mcp-remote` は RFC 7591 の DCR を使う、という単一の開発者の報告がある（[Emblem AI の記事](https://dev.to/emblemai/claude-code-oauth-deep-dive-how-emblemais-mcp-server-handles-auth-e29)）。Codex CLI は CIMD と DCR の両方を書いている（[Codex の MCP の文書](https://developers.openai.com/codex/mcp)）。**このため最初の版から CIMD と DCR の両方を受ける**（FR-009 を改定）。**公式の仕様で確認済み（T002・2026-11-23）**：[client-registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration.md) は、優先順位を「事前登録 → CIMD（サーバーが `client_id_metadata_document_supported` を出したとき）→ DCR（`registration_endpoint`）→ 利用者に聞く」と定める。CIMD と事前登録は **SHOULD**、DCR は **MAY** で、「DCR は非推奨。新しい実装は CIMD を使う。後方互換のために残す」と書かれている。CIMD は draft-00 に従う（**MUST**）。CIMD の戻り先は、メタデータの `redirect_uris` と完全一致で確かめる（**MUST**）。CLI やローカルの `localhost` のアプリは `application_type: native` を使う（**SHOULD**）。PKCE と RFC 8707 は、このページには書かれていない（認可と安全性のページで確かめる）。
→ 結論：DCR は受けるが優先は CIMD。事前登録は FR-035 のとおり Muse の審査の経路に使う。
- **R3. 接続先**：[Auth0](https://auth0.com/blog/cimd-vs-dcr-mcp-registration/)・[Clerk](https://clerk.com/changelog/2026-08-06-client-id-metadata-documents)・[Descope](https://www.descope.com/blog/post/cimd-support) など、主要な認可のサービスが CIMD を出している。接続先（Claude・ChatGPT）の対応は、実機の確かめ（P2）で見る。
- **R4. LINE ログインの確かめ（構成の決めごと Open Questions 6）**：Web 用チャネルを「公開」にしないと、Admin と Tester 以外はログインできない。外の AI のブラウザからの流れが通るかは未確認（P2）。
- **R5. 独自ドメイン**：`issuer`・戻り先・MCP の URL に源が入るので、公開の前に固定する（spec FR-024【仮決め】）。ステージングは Cloud Run の既定の URL。

## Project Structure（想定。画面は作らない）

```text
apps/api/src/platform/mcp/      # /api/mcp・ツールの一覧（merge=union の1行1ツール）
apps/api/src/platform/web/      # /api・/.well-known の道の頭（既存の1つの関数に並べる）
apps/api/src/modules/account/   # 認可サーバー（/api/oauth/*）・同意・接続の一覧と取り消し・Bearer を受ける requireSession
apps/api/src/modules/suite/     # 設定の画面の接続の一覧（画面は suite の領域。core-005 の決め）
apps/web/src/features/suite/    # 「接続している AI」の一覧と取り消しの画面（小さく）
packages/contracts/src/account/ # 認可・接続の契約（zod）
```

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 支払いは扱わない |
| II. 個人の情報は最小限 | 外へ出すのは本人の記録だけ（FR-017）。ツールの出力は2人分のデータのテストで確かめる（SC-003）。トークン・記録の本文をログに出さない（FR-019） |
| III. 交流会の気軽さ | 画面に影響しない（設定の画面に1項目） |
| IV. 小さく始める | 読むツールだけ。書くツール・デバイス認可は後回し。DCR は対応する接続先があるので最初から入れる（FR-009） |
| V. 運用費 | 外部の認証・有料の API は使わない。Cloud Run の呼び出しが増えるだけ |

違反なし。

## Phases

1. **P0（先に入れる）**：`/api/mcp`・`/api/oauth/*` の道の頭を `platform/web` に並べる共通の小さな PR（AD-21・並行開発の決まり 4）。
2. **P1（DB の変更の PR）**：`oauth_*`・`mcp_tool_call` の表。`pnpm db:generate` → 生成された SQL を読む → `pnpm db:migrate`。単独の PR で先に入れる（AD-17）。
3. **P2（認可）**：CIMD の取得・検証、DCR の登録（上限と期限つき）、ループバックの戻り先（FR-033）、PKCE S256・`state`・`iss`・`resource` の確かめ、同意、トークン発行（ハッシュ保存）、`requireSession` の Bearer 対応（AD-12）。メタデータ（RFC 9728・8414）。
4. **P3（ツール）**：読むツールの一覧（`merge=union`）、`app.request` での呼び出し、範囲 `<key>:read`、回数の制限（トークンごと）、`Origin` の確かめ、記録。
5. **P4（利用者の画面）**：同意の画面（範囲の表示）・接続の一覧と取り消し・退会で全部取り消し。
6. **P5（確かめ）**：テストの MCP クライアントで SC-001 を通す。接続先の実機（P2 の確かめ）。ステージングで LINE の公開前の確かめ（Admin と Tester）。

## クライアントの対応（Claude・Codex・ほかの CLI）

| 種類 | 例 | 登録 | 戻り先 | 備考 |
|---|---|---|---|---|
| ブラウザでつなぐ | Claude（ブラウザ）・ChatGPT | CIMD（DCR も受ける） | https の登録どおり | 確かめの対象 |
| CLI（ブラウザを開ける） | Codex CLI・Claude Code | CIMD か DCR | ループバック（任意のポート。FR-033） | Codex は既定で 1455 番を使い、設定で変えられる。戻り先の確かめは完全一致＋ループバックの例外 |
| CLI（画面なし） | サーバーや SSH の先 | デバイス認可（RFC 8628） | なし | Phase D。最初の版では出さない |
| 単一の開発者の報告で DCR だけ | `mcp-remote` など | DCR（RFC 7591） | ループバック | DCR で受けるので対応する |
| 審査で発行するコネクタ（API） | Muse（[コネクタ審査](https://platform.muse.ai/docs)） | 事前登録（`client_id`・シークレット。FR-035） | Muse が指定する https | 主催者の決め：API で接続（FR-040）。許可リストの道だけ Bearer。公開は Phase M の審査 |

**クライアントを特別扱いしない（FR-032）**

- 接続先の名前は、登録のメタデータ（CIMD の名前・DCR の `client_name`）から出す。User-Agent は見ない。
- ツールの応答は、テキストと構造化の結果の両方を返す（どちらか一方しか読まないクライアントがあるため）。
- 任意の機能（サンプリング・確認の要求など）は使わない。使えないクライアントでも、読むツールは動く。

**確かめの方法（SC-008）**

- 自動：CIMD・DCR・ループバックのポート違い・登録にない戻り先の断り、の各組を、テストのクライアントで通す。
- 実機：Claude（ブラウザ）・Codex CLI・主催者が挙げるほかの CLI で、接続から1回のツール呼び出しまで。Codex Desktop は、ログインのあと新しい会話で試す（既知の問題：開いたままの会話では使えないことがある）。
- 結果は、この表の「確かめ」の列に残す（この版では表の下に追記する）。

## Muse の審査に合わせた設計の前提（FR-035〜039）

[Muse のコネクタの審査の要件](https://platform.muse.ai/docs)（2026-11-23 に確認）と、今の設計の対応：

| 審査の要件 | 今の設計 |
|---|---|
| OAuth の資格情報か API キーで接続（5.4） | 事前登録のクライアント（FR-035）。T062 |
| 読みと書きを分けて分類（3.2）。読みと書きを混ぜたツールは書き扱い | ツールの型に `access` と `sensitivity`（normal・sensitive）を持つ（FR-036）。T063 |
| 書き込みは確認を取る。重要な操作は「常に許可」にしない（3.3・3.4） | `confirmation` と、`sensitive` の毎回の確認（FR-027・FR-036） |
| 読むだけを選べるようにする（3.1） | 同意の画面の read・write の別選択（FR-037） |
| 最小限のデータ・2次利用をしない・利用者ごとに分ける（4.2・4.4） | FR-017・FR-026。書く・読むの窓口は利用者の資格でしか呼ばない |
| 開始した作業を完了させる（1.1）・リンク集だけでは不可（1.2） | FR-038 |
| テスト用の利用者を審査中ずっと使えるようにする（5.x） | 運用の作業（FR-039・T064） |
| セキュリティの事故を48時間以内に Meta へ連絡（4.8） | 運用の作業（FR-039・M003。連絡先の決めが要る） |

**審査の対象外（この設計では扱わない）**：金融の送金・取引（Muse は読み取りだけ許可。書く金融の操作は作らない）。

**Muse の審査は、主催者が判断する**：事業者の確認とデータ処理の質問票は、主催者（事業者）の名前で出す。審査のための提出は、この仕様の完成とは別の判断。

## Muse（API 経路）の設計

- **道**：Muse は画面と同じ `/api/v1/<領域>/…` のうち、許可リストに載った道だけを呼ぶ（FR-040）。許可リストは `packages/contracts/src/core/connector-allowlist.ts`（仮の置き場所。領域ごとに足す1行の一覧にする＝`merge=union`）。項目は `operationId`・`access`（read・write・sensitive）・`scope`（`<key>:read` など）。
- **認可**：事前登録のクライアント（FR-035）。同じ OAuth の認可サーバー（`/api/oauth/*`）で、同意の画面で範囲を選ぶ（読むだけが既定）。
- **Bearer の受け方**：`requireSession` は許可リストの道だけで Bearer を受ける。許可リストにない `/api/v1` は、Bearer があっても `401`（テストで確かめる）。範囲の確かめは `requireScope`。
- **説明文**：OpenAPI の `operationId` と注釈から生成（FR-041）。Muse の審査の「ツールの文書」「read/write の分類」に合わせる。
- **書く操作**：許可リストで `write`・`sensitive` と分類したものは、この版では載せない（読むだけ）。書く操作の仕組みは FR-025〜031 のとおり（後で追加）。
- **審査の前提**：テスト用の利用者（T064）・事故の連絡窓口（M003）は Phase M。

## 認可のページの確認（T002b・2026-11-23）

[認可のページ](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization.md) で確かめた、kanaeru に効く条件：

- **PKCE**：このページは PKCE の要件を書いていない（OAuth 2.1 の草案に従う）。kanaeru は AD-21 のとおり S256 を必須にする（今の設計のまま）。
- **RFC 8707 `resource`**：クライアントは認可と発行の両方で必ず送る（MUST）。値は MCP サーバーの正規の URI（`https://…/api/mcp`）。サーバーは、トークンが自分宛てか確かめる（MUST）。自分宛てでないトークンは受けない・転送しない（MUST NOT）。
- **RFC 9207 `iss`**：サーバーは認可の応答に `iss` を入れる（SHOULD。エラーの応答も）。入れるときはメタデータに `authorization_response_iss_parameter_supported: true` を出す（MUST）。クライアントは `iss` を比べる（文字列の完全一致）。
- **トークンの受け方**：無効・期限切れは `401`（MUST）。トークンは `Authorization: Bearer` だけで送り、URL の問い合わせには入れない（MUST NOT）。範囲が足りないときの `403` は `error="insufficient_scope"` と必要な `scope` を付ける（SHOULD）。
- **更新のトークン**：発行するかはサーバーの自由。`offline_access` を範囲の一覧に出さない（SHOULD NOT）。FR-031 の「refresh は範囲を再確認して出す」と矛盾しない。

→ 設計への反映：FR-008（`iss`）と FR-013（Bearer のみ）は、この確認で変更なし。`403` の応答に `insufficient_scope` と `scope` を入れる（T025・T034 のテストに足す）。

## 書き込みへの備え（v1 は読むだけ。仕組みだけ作る）

**目的**：あとで書く権限（`<key>:write`）を足すとき、認可・同意・トークン・ツールの登録・記録・回数の制限を作り直さなくてよいようにする。書く操作の中身（どの記録を・どう書くか）は、その時の仕様で決める。

**1. ツールの型**（`platform/mcp` の登録。spec FR-025）

```ts
// 形のイメージ（実装は P3 で zod にする）
type McpTool = {
  name: string;          // 例：reception.list_my_checkins
  appKey: string;        // アプリの key（範囲の名前に使う）
  access: 'read' | 'write';
  requiredScope: `${string}:read` | `${string}:write`;
  idempotent: boolean;
  confirmation: 'none' | 'required';
  call: (c: Context) => Promise<Response>; // app.request で画面と同じ窓口を呼ぶ（AD-20）
};
```

- 起動のとき、`access` と `requiredScope` の食い違い（書くのに `:read`、読むのに `:write` など）を検査し、食い違えば起動を失敗させる。
- 試験用の書くツールは、テストの中だけに登録する（本番の一覧には入れない）。

**2. 範囲と同意**

- 範囲は `<key>:read`・`<key>:write` の2種類。同意の画面は、アプリごとに read と write を別々に選ぶ（既定は read のみ）。
- write を選んだときは、画面で「このアプリの記録を AI が書き換えられる」と分けて書く。
- 同意は後から範囲を減らせる（設定の画面）。減らした同意に紐づくトークンは、次の呼び出しから使えない（`oauth_token.grant_id` で一括で止める）。
- アプリの定義（core-005 の台帳）に、外へ出してよい記録（read）と、書かせてよい操作（write）の一覧を足す。定義にない操作は、範囲があっても登録されない。

**3. 書く操作の守り**

- 窓口の権限（`requireApp`・役割・本人の確かめ）は、既存のまま。ツールの側では権限を作り直さない（FR-026）。
- `confirmation: 'required'` は2段階：1段階目は差分だけ返し、2段階目は短い期限の1回だけの確認の値を付けて書く（FR-027）。確認の値は `oauth_code` と同じ仕組みで、DB にはハッシュだけ持つ。
- 冪等キーは必須。同じキーの再送は、保存した前の結果を返す（FR-028）。保存先は `mcp_tool_call` の対象 id と結果の種類で足りるよう、キーの表を別に持つ（P1 で作る）。

**4. トークンと期限**

- 読むだけのトークンと、write を含むトークンの期限を分ける（write の方が短い）。期限の数は P3 で決める。
- refresh トークン（`kind: refresh`）は、発行のときに範囲を同意と照らして出す。write を外した同意からは、write 付きの新しいトークンを出さない。

**5. 記録と回数の制限**

- `mcp_tool_call` に `access` を残す。書いた中身・引数の本文は残さない（FR-029）。
- 回数の制限は、トークンごとに read と write の2つの枠（FR-030）。

**6. 今の版で試すこと**（書く操作の本番は含まない）

- SC-007：読むだけのトークンで試験用の書くツールを呼ぶと `403`。窓口には届かない。
- 確認の値の使い回し・期限切れ・別のトークンの確認の値は、どれも書かない。
- 範囲を減らしたあと、そのトークンは次の呼び出しから使えない。

**7. 将来の仕様で決めること**（この版では決めない）

- どの記録を書き換えてよいか（本人の予約のキャンセル、本人の情報の更新など。他人の記録は書かない）。
- write の期限の数、確認の値の期限、冪等キーの保存期間。
- AI の作業（段階1・段階2）で書く操作を使うかどうか（AD-20 の守りは同じ）。

## Open Checks（計画の確かめ項目。実装の前に済ませる）

- **P1**：公式の仕様で DCR と CIMD の扱いを確定（R2）。
- **P4**：Muse が MCP を呼ぶかどうか（公開の情報では確認できない。Meta の開発者向けの情報か、Muse の審査の担当に確かめる）。
- **P2**：LINE ログインの Web チャネルで、外の AI のブラウザからの流れが通るか。通らなければ spec の接続の方法を見直す。
- **P3**：db-f1-micro の接続の上限と、認可のための表の増えの影響（構成の決めごと Open Questions 4）。
- 回数の制限の数と記録の保存期間（spec Assumptions。ここで決める）。
