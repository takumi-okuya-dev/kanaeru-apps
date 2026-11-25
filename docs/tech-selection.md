# 技術選定の候補

- 作成日：2026-11-18（tsunagu-app で使い込んだ構成を土台に、層ごとの候補を比べ直した）
- 種類：技術選定の候補（[文書の決まり](./rules/documents.md) 1）。**決まりではなく、選ぶときの材料**。プロダクトで決めたことは、そのリポジトリの Constitution「技術スタック制約」と `docs/rules/coding.md` 6章に書く。
- 版と料金は 2026-11-18 に npm・公式サイトで確かめた。（要確認）は公式で確かめきれなかったもの。使う前に、その日の版と料金を確かめ直す。

## 1. 前提（このテンプレートで作るもの）

- 1人の構想者と AI（Claude Code・Codex）で作る、小〜中くらいの Web のプロダクト。運営者の画面（パソコンとスマホのブラウザ）・軽い公開のページ・JSON の API（後で AI エージェントが MCP で呼ぶ）。
- 利用者は日本。個人の情報は東京に置く。最初の運用の費用は月に数千円。
- CI は節約する（[開発の流れの決まり](./rules/development-flow.md) 3）。手元の確かめを既定にする。

## 2. 言語

| 候補 | 選ぶとき |
|---|---|
| **TypeScript（既定）** | Web の画面と API を1つの言語・1つの型でそろえられる。API の約束（zod）から型・OpenAPI・MCP の道具まで1か所で作れる。AI がよく知っている。**`typescript` ブランチに動く骨組みがある** |
| Python | データ処理・機械学習が中心のとき（FastAPI＋Pydantic＋SQLAlchemy）。画面は別に TypeScript で作ることになる |
| Go | 1つの小さく速いサービス・CLI・常駐の処理が中心のとき。画面は別になる |
| Kotlin・Swift など | ネイティブのスマホのアプリが要るとき（Web で足りるなら選ばない） |

## 3. TypeScript を選んだときの層ごとの候補

各表の太字が `typescript` ブランチの既定。

### 3-1. 実行環境・言語・道具

| 層 | 既定 | 候補と目安 |
|---|---|---|
| 実行環境 | **Node.js 26（LTS）**。型を取り除く機能が既定で有効（`erasableSyntaxOnly`） | Bun（Anthropic が買収）・Deno 2：本番の既定にはまだしない |
| TypeScript | **6.x**（npm の latest は 7.0 なので、版をはっきり書く） | 7.0（Go 製・2026-07 に Stable）：速いが、プログラムから呼ぶ API がまだなく typescript-eslint が未対応。対応したら 7 に移る |
| パッケージの管理 | **pnpm 12**（2026-11-18 の最新は 12.21。`minimumReleaseAge` で新しすぎる版を待つ） | Turborepo・Nx：API 1つと画面 2つなら要らない。組み立てが遅くなってから足す |
| lint・整形 | **ESLint 10＋typescript-eslint＋eslint-plugin-boundaries（領域の境界）＋eslint-plugin-jsdoc＋Prettier** | Biome 2・Oxlint：速いが、境界の許可表と JSDoc の規則の代わりがまだない。速さが要るなら Oxlint を先に流す |
| テスト | **Vitest 5（単体・結合。API は本物の PostgreSQL）＋Playwright（通し）＋@axe-core/playwright** | 部品のテストは Vitest の Browser Mode でもよい |

### 3-2. API

| 候補 | 版 | 目安 |
|---|---|---|
| **Hono＋@hono/zod-openapi＋zod 4** | Hono 4.13・zod 4.6 | Node・Bun・Workers・Cloud Run のどこでも動く。zod の約束から型と OpenAPI を作る。セキュリティの直しが続くので版をこまめに上げる。5.0 は移行の案内が出て安定してから |
| oRPC | 1.16（2.0 は beta） | 約束を先に書き、RPC と OpenAPI の両方を出せる。2.0 が安定したら候補 |
| tRPC | 11 | TS どうしだけで呼ぶなら最も楽。OpenAPI が出せないので、MCP や外から呼ぶ API には向かない |
| NestJS | 12 | 型が決まっていて大きなチーム向け。1人で小さく作るには重い |
| Fastify・Express | 5 系 | Node だけ。型の安全と OpenAPI は自分で組む |

### 3-3. 画面

| 候補 | 版 | 目安 |
|---|---|---|
| **Vite＋React（SPA）＋TanStack Router＋TanStack Query＋shadcn/ui＋Tailwind 4** | Vite 8・React 19.3・TanStack Router 1.170・Tailwind 4.3 | 静的なファイルを置くだけで安く、縛られない。shadcn の新しい部品は Base UI が既定（Radix も保守される）。見た目の値は [UI デザインの既定](./design/README.md)（SmartHR の値を土台）で上書きする。公開のページの OGP は、API が index.html を返すときに `<meta>` を差しこむ |
| React Router 8 | 8.5 | 画面の道を React Router にする（SPA のまま）か、公開のページの SEO・SSR が多く要るときに framework mode。成熟している |
| TanStack Start | 1.x（2026-10 に 1.0） | 型の安全は最も強い。安定してまだ日が浅い |
| Next.js | 16.4 | Vercel で完結させ、RSC を使いこむとき。覚えることが多く、Vercel の外に置くと手間 |
| Astro | 7 | 公開のページ・LP だけを別に作るとき |
| smarthr-ui（部品集） | 103.1（MIT） | SmartHR の部品をそのまま使える。ただし Tailwind 3 に縛られ・メジャー版がほぼ毎月上がり・`react-intl` が要り・そのままの色では SmartHR に見える。既定では使わず、値と型だけを [UI デザインの既定](./design/README.md) に取りこんだ |

### 3-4. データ

| 層 | 既定 | 候補と目安 |
|---|---|---|
| ORM | **Drizzle 0.45（安定版）**（SQL を読んでから当てる・生の SQL・RLS の宣言）。1.0 は RC（壊れる変更あり）。正式版が出たら移る | Kysely（ORM に縛られたくない）・Prisma 7（慣れを優先。8 は作り直しで揺れる） |
| DB | **PostgreSQL。置き場所は Cloud SQL 東京**（最小で月 2,000〜3,000円ほど。要確認） | Supabase（東京あり。試作は無料〈7日使わないと止まる〉・Pro は $25）・PlanetScale Postgres（東京の単価は要確認）。Neon は東京がない |
| ログイン | **Better Auth**（データは自分の DB・0円・独自の OAuth/OIDC〈LINE など〉・組織・パスキー。2026-07 に Vercel が買収） | Supabase Auth（Supabase にまとめるとき）・WorkOS（企業の SSO が要るとき）・Clerk（データが外に出る） |
| 裏の処理 | **Cloud Tasks（列）＋Cloud Scheduler（時刻）**。応答のあと CPU が止まる置き場所に合う。kanaeru は今のところ Cloud Tasks を使わず、Cloud Scheduler が環境ごとに1つの共通の窓口（`POST /api/v1/jobs/tick`）を5分ごとに呼ぶ形（core-017） | pg-boss（取引の中で確実に積みたいときの受け皿）・Inngest・Trigger.dev（データが国外を通る） |
| ファイル | **GCS 東京** | S3 東京・R2（日本に置く保証がない） |

### 3-5. 置き場所とインフラ

| 層 | 既定 | 候補と目安 |
|---|---|---|
| 置き場所 | **GCP 東京の Cloud Run**（最小0台・使った分だけ・容器なので移しやすい）。kanaeru は一般に公開するとき、独自ドメインを取り Cloudflare の無料プランを前に置く（CDN・WAF。[置き場所の比べ](./hosting-cost.md)） | Vercel Pro（画面だけ・商用）・Cloudflare Workers（静的な画面の配信は無料。実行地域を東京に固定できない）・Fly.io（安いが運用を背負う）。Render・Railway は東京がない。AWS App Runner は新しい客を受け付けない |
| インフラのコード | **Terraform 1.17**（BSL。使う分には制約なし） | OpenTofu（オープンソースのライセンスにこだわるとき。ほぼ互換）・Pulumi（TS で書きたいとき） |
| CI | **GitHub Actions**（ラベル `run-ci` のときだけ・部品は SHA で固定・鍵を置かず WIF で GCP に入る） | — |
| AI エージェントの入口 | **MCP の公式 SDK v2（`@modelcontextprotocol/server`＋`@modelcontextprotocol/hono`）を同じ API に置く** | 認可（OAuth）の作法は使うときに確かめる |

### 3-6. セキュリティの道具

| 層 | 既定 | 候補と目安 |
|---|---|---|
| 秘密の値 | **gitleaks 互換の設定（`.gitleaks.toml`）** | gitleaks は v8.30（2026-03）で止まり、後継の Betterleaks（MIT・同じ設定とフラグ）が出た（要確認）。移るときは設定をそのまま使える |
| 依存の脆弱性 | **pnpm audit**（例外は理由と期限つきの一覧） | osv-scanner v2（pnpm-lock に対応）を足す |
| 依存の更新 | **Dependabot**（グループに `*` を使わない） | Renovate（pnpm の monorepo と `minimumReleaseAge` に強い） |

## 4. 選び直すとき

- 公開のページの SEO が中心になった → React Router 8 の framework mode か Astro を、公開のページだけに足す。
- 費用をもっと下げたい（個人の情報を扱わない） → 画面を Cloudflare の静的な配信へ、DB を Supabase の無料へ。構成ごとの比べと料金の試算は[置き場所の比べと料金の試算](./hosting-cost.md)。
- データ処理・機械学習が中心 → その部分だけ Python のサービスに分ける（API の約束は OpenAPI でつなぐ）。
- 選び直したら、この文書を直し、[決めたことの記録](./decisions.md)に1行足す。
