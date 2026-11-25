# paletkit-apps

IT交流会で集めた「こんなアプリがあったらいいな」「日々の業務で面倒なこと」を、小さな実用アプリとして形にし、共通のアカウントとUIで**スイート型SaaS**に束ねていく構想。**いまは最初のアプリ（受付）を交流会で使い始め、2つ目・3つ目のアプリ（Threads・試合表）を作っている段階**。言語は TypeScript。

構想のたたき台は[構想メモ](_bmad-output/concept-memo.md)。

## 入っているアプリ

アプリの一覧の正本は `packages/contracts/src/core/apps.list.ts`（1行に1つ）。公開するかは、運営者が画面の「アプリの台帳」で決める（[スイートの地図](docs/apps/suite.md)）。

| アプリ | 何をするか | 領域の地図 |
|---|---|---|
| 受付 | 交流会の受付を QR と LINE だけで済ませ、合計と困りごとのアンケートを集める。名簿（申込み）も持つ | [event](docs/apps/event.md)・[reception](docs/apps/reception.md)・[survey](docs/apps/survey.md)・[booking](docs/apps/booking.md) |
| Threads | Threads の投稿の案をためて承認し、決めた時間に自動で投稿する（いまは運営者だけ） | [threads](docs/apps/threads.md) |
| 試合表 | 名簿から、偏りの少ないダブルス・シングルスの試合表を作って印刷する（電波がなくても開ける） | [match](docs/apps/match.md) |

## 進め方（ロードマップ）

| フェーズ | やること |
|---|---|
| 1. 需要を集める | 「あったらいいな」を集めるアプリを公開し、主催するIT交流会の参加者に初期ユーザーとして使ってもらう。いいねだけでなく、困りごとの深さや「いくらなら払うか」も集める |
| 2. ニーズをアプリにする | 集めた中から需要の高いものを選んで、すばやくMVPを作る。公式LINEを窓口に、「交流会で出た要望から作りました」と届けて、試してもらい声を集める |
| 3. スイート型SaaSに束ねる | 作った小さなアプリ群を共通のアカウント・UIでまとめ、スイート全体のサブスクリプションとして提供する。交流会の外の一般の利用者にも広げる |

## ディレクトリ構成

```text
.
├── README.md                  このファイル
├── CLAUDE.md                  AIが守る決まりの入口
├── .gitignore / .gitattributes
├── .github/
│   ├── pull_request_template.md
│   └── workflows/             CI・デプロイ（deploy.yml → deploy-environment.yml）・週1回の守りの確かめ
├── .specify/                  spec-kit（設定・テンプレート・スクリプト）
│   └── memory/constitution.md   守る原則（雛形）
├── .agents/skills/            BMADの実体＋spec-kitへのリンク（Codexが読む）
├── .claude/skills/            spec-kit・security-auditの実体＋BMADへのリンク（Claude Codeが読む）
├── skills-lock.json           入れたスキルの出どころと版
├── _bmad/                     BMADの設定（config.toml）とスクリプト
├── _bmad-output/              ⓪ 構想・プロダクトブリーフ・PRDの出力先
├── specs/                     ③ 機能ごとの仕様（specs/<領域>/NNN-…/）
├── apps/api/                  API（Hono）・DB の定義と変更（drizzle/）
├── apps/web/                  画面（Vite＋React）
├── packages/contracts/        API の約束（zod）とエラーの文言
├── packages/ui/               見た目の値（tokens.css）と部品
├── e2e/                       通しのテスト（Playwright）
├── infra/                     置き場所（GCP）の Terraform（本番とステージング）
├── tests/・scripts/security/  lint の規則と守りの確かめ
└── docs/
    ├── README.md              文書の一覧（迷ったらここ）
    ├── architecture.md        全体の形
    ├── apps/                  領域の地図（領域を足したら1つずつ）
    ├── ai-skills.md           スキルの置き場所と使う順番
    ├── tech-selection.md      技術選定の候補（言語と層ごとの候補・TypeScript の既定）
    ├── design/                UI デザインの既定（SmartHR Design System を土台にした DESIGN.md・EXPERIENCE.md）
    ├── decisions.md           決めたことの記録（ADRを短くした形）
    ├── backlog.md             バックログ
    ├── first-release.md       本番に初めて出す手順
    ├── release-guide.md       本番に出す手順（3つのモード）
    ├── hosting-cost.md        置き場所の比べと料金の試算
    ├── images/                置き場所の構成図（SVG と、作る台本）
    ├── study/                 初めて使う技術の学び
    └── rules/                 ② AIが守る決まり
        ├── development-flow.md   ブランチ・PR・レビュー・CI・マージ・デプロイ
        ├── specs.md              仕様のフォルダと番号・ブランチとコミットの名前
        ├── coding.md             書き方・設定と環境・DBの変更・テスト
        ├── parallel-development.md  セッションを分けて同時に進める決まり
        └── documents.md          文書の種類と置き場所・作らない文書
```

## 技術の形

API・画面・DB・テスト・lint・CI・置き場所がそろっている。全体の形は [docs/architecture.md](docs/architecture.md)、決まりは [コードの書き方の決まり](docs/rules/coding.md) 6章。

| 層 | 使うもの |
|---|---|
| 言語・道具 | TypeScript 6・Node.js 26 LTS・pnpm 12・ESLint 10（境界・JSDoc・守りの規則・見た目の値）・Prettier |
| API（`apps/api`） | Hono＋@hono/zod-openapi＋zod 4・Drizzle 0.45＋PostgreSQL 18・pino |
| 画面（`apps/web`） | Vite 8＋React 19＋TanStack Router＋TanStack Query＋Tailwind 4＋shadcn/ui（Base UI の形。値は [DESIGN.md](docs/design/DESIGN.md) から） |
| 約束・部品（`packages/`） | `contracts`（zod の約束と日本語のエラーの文言）・`ui`（見た目の値と部品） |
| テスト | Vitest（API は本物の PostgreSQL）・Playwright＋axe（1440px と 375px） |
| 守り | gitleaks（コミットの前）・`pnpm audit`（例外は理由と90日以内の期限）・Dependabot・GitHub Actions（`run-ci` のときだけ・部品は SHA で固定） |
| ログイン | LINE（LIFF の ID トークンを API が確かめ、セッションのクッキーを出す。[account の地図](docs/apps/account.md)） |
| 置き場所 | GCP 東京：Cloud Run（画面と API を1つのコンテナで）・Cloud SQL（PostgreSQL 18・内部の IP だけ・夜間0時〜8時は止める）・Cloud Scheduler。本番とステージングの2つ。Terraform（`infra/`）で作り、GitHub Actions が鍵なしで出す（[infra/README.md](infra/README.md)・[全体の形](docs/architecture.md)・[置き場所の比べ](docs/hosting-cost.md)） |

### 初めて動かす

前もって入れるもの：Docker（OrbStack・Docker Desktop など）・gitleaks（`brew install gitleaks`）・pnpm（`corepack enable` か `npm i -g pnpm`）。Node.js 26 は `pnpm install` が入れる。

```bash
cp .env.example .env                                  # 手元の設定（コミットしない）。口や DB がほかとぶつかるなら直す
pnpm install                                          # 依存と、コミットの前の確かめ（.githooks）を入れる
pnpm --filter e2e exec playwright install chromium    # 初めての1回（E2E のブラウザ）
pnpm local:setup                                      # DB の容器・DB の変更・見本のデータ
pnpm dev                                              # API と画面を立ち上げる（画面は http://localhost:5173）
pnpm check                                            # 全部の確かめ（秘密の値・依存・整形・型・lint・テスト・E2E）
```

5432 の口をほかの Postgres が使っているときは、`.env` の `POSTGRES_PORT` と `DATABASE_URL` の口をそろえて変える（例：5433）。作業場所を分けて同時に進めるときの設定は [並行開発の決まり](docs/rules/parallel-development.md) 1。

## 入っているスキル

| 種類 | スキル | 使う場面 |
|---|---|---|
| BMAD-METHOD | `bmad`・`bmad-brainstorming`・`bmad-forge-idea`・`bmad-deep-recon`・`bmad-product-brief`・`bmad-prfaq`・`bmad-prd`・`bmad-ux`・`bmad-architecture`・`bmad-party-mode` ほか（計30） | 構想・計画 |
| spec-kit | `speckit-constitution`・`speckit-specify`・`speckit-clarify`・`speckit-plan`・`speckit-tasks`・`speckit-analyze`・`speckit-implement`・`speckit-checklist`・`speckit-converge`・`speckit-taskstoissues` | 機能ごとの仕様 → 実装 |
| そのほか | `security-audit` | まとまった単位のセキュリティ点検 |

使う順番は[AIスキルの使い方](docs/ai-skills.md)。

## これからやること

1. **本番に初めて出す**：[本番に初めて出す手順](docs/first-release.md)のとおり（GCP・LINE・GitHub の準備 → ステージング → 承認 → 本番）。2回目からは[本番に出す手順](docs/release-guide.md)の3つのモード（緊急・週ごと・新しいアプリ）。
2. **次にやること**は[バックログ](docs/backlog.md)（独自ドメインと Cloudflare を前に置く・新しいアプリの候補など）。新しいアプリの案は `app-idea-research` スキルで調べてから、構想は BMAD、実装は `/speckit-specify` から（[AIスキルの使い方](docs/ai-skills.md)）。新しい領域の足し方は[コードの書き方の決まり](docs/rules/coding.md) 6-6。

[product-template](https://github.com/takumi-okuya-dev/product-template)の`typescript`ブランチから作った。
