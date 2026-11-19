# kanaeru-apps Constitution

ほかの文書と食い違ったら、この文書が正。材料は [プロダクトブリーフ](../../_bmad-output/brief-kanaeru-apps/brief-kanaeru-apps.md)・[PRD](../../_bmad-output/prd-kanaeru-reception/prd-kanaeru-reception.md)・[構成の決めごと](../../_bmad-output/architecture-kanaeru/architecture-kanaeru.md)。

## Core Principles

### I. お金を預からない（NON-NEGOTIABLE）

アプリの中で決済しない。参加費は、支払い方法（PayPay・現金など）と金額を**記録するだけ**にする。kanaeru の利用料（スイートや各アプリの契約）は、支払いの会社（Stripe など）の画面で払ってもらい、kanaeru はカードや口座の情報を受け取らない・持たない。参加者に先払いや予約課金を求めない。
**Rationale**: お金を預かると、法の手続きと事故の重さがまったく変わる。交流会では気軽さを守るため、お金の約束を持ち込まない（ブリーフの判断の基準）。

### II. 個人の情報は最小限。困りごとは主催者だけ（NON-NEGOTIABLE）

集めるのは、各アプリの仕様（PRD）で決めた、そのアプリに要るものだけ（受付アプリでは、LINEのユーザーの識別子・表示名・PRD で決めた項目）。メールアドレスや電話番号は持たない。本人の確かめは、LINE のIDトークンをサーバーで確かめて行い、画面から送られたプロフィールを信じない。困りごとは主催者だけが読み、受付係にも見せない。勉強会やアプリにするときに名前を出さない。消してほしいと頼まれたら、その人のデータを消す。困りごとの本文・IDトークン・クッキー・利用者の API キー・OAuth のトークンをログに書かない。外の AI（利用者の API キー・MCP）に渡してよいのは、利用者本人の記録だけにする。ほかの人の名前・困りごと・人物メモは渡さない。
**Rationale**: 参加者に「書いても大丈夫」と思ってもらえることが、このプロダクトのすべての前提。アンケートの冒頭で約束していることを、作りで守る。

### III. 交流会では気軽さを最優先

入口（受付）は文字を打たずに1分以内で終わる形にする。アンケートの設問は必須にしない。LINE を使わない・使えない参加者も、主催者や受付係が手で受け付けられるようにする。会場の電波が悪くても受付を止めない。
**Rationale**: 登録は受付の副産物として自然に起きることが、初期ユーザーを集めるしくみの核（ブリーフ）。入口が重いと、そのしくみが崩れる。

### IV. 小さく始める（YAGNI）

その機能の PRD の範囲の外のものは作らない（受付アプリは PRD の6章）。範囲を変えるときは、先に PRD を直してから実装に進む。新しいアプリと共通の機能（アプリの台帳など）は、先に PRD を作る。
**Rationale**: 1人とAIで小さく出し続けるため。作りすぎは、直し続けるコストになる。

### V. 運用費はゼロに近づける

インフラはサービスの無料枠と最小の台数で組み、費用がかかる部品（ロードバランサ・常に動く台など）は構成の決めごとを直さずに足さない。請求の予算を設け、超えそうなら知らせを受ける。
**Rationale**: 収益が出る前の個人開発で、固定費が続けられるかどうかを決める。

## 技術スタック制約

- 言語・フレームワーク：TypeScript 6.x・Node.js 26 LTS・pnpm のワークスペース。API は Hono＋@hono/zod-openapi＋zod 4、画面は Vite＋React 19＋TanStack Router＋TanStack Query＋Tailwind 4＋shadcn/ui（Base UI の形）。API の約束（zod）は `packages/contracts` の1か所に置き、API と画面が同じ形を使う。
- ホスティング：GCP 東京（asia-northeast1）の Cloud Run を1つ（画面と `/api` を同じ源で返す）。GCP の資源はすべて Terraform（`infra/`）で持つ。
- データベース：PostgreSQL 18・Drizzle ORM（0.45 の安定版）。本番は Cloud SQL for PostgreSQL（ENTERPRISE・db-f1-micro・東京）を1つで、夜間（0時〜8時）は止める。手元とテストは 18 の容器。DB の変更は SQL を読んでから当て、前の版のアプリでも壊れない形だけにする（[docs/rules/coding.md](../../docs/rules/coding.md) 3）。
- 認証：参加者の画面は未認証の LINEミニアプリ（`@line/liff` 2.31.1 以上）。ログインは LINE のIDトークンを API が確かめ、自前のセッション（DB の表と `HttpOnly; Secure; SameSite=Lax` のクッキー）を出す。Better Auth は使わない（LINE でメールがない人がログインできないため）。
- **運用コストの目標**：本番の運用費は月2,000円以内（請求の予算の知らせを月2,000円に置く）。開発の AI の利用料は別枠。
- **モジュールの境界**：機能ごと（領域ごと）にフォルダを分け（`apps/api/src/modules/<領域>/`・`apps/web/src/features/<領域>/`・`packages/contracts/src/<領域>/`）、ほかの領域は入口（`index.ts`）からだけ使う。依存は 組み立て → 領域 → 共通 → 土台 の一方向。画面は API の型だけを読む。境界は ESLint の規則（`eslint.config.js`）で自動に守る。領域どうしの表の持ち主・権限・今の利用者の受け取り方は、構成の決めごと（AD-2〜AD-7・AD-12〜AD-14）に、アプリの登録・公開と契約・DB の変更・共通の道具・記録の持ち主・AI と MCP は AD-15〜AD-21 に従う。
- **画面の見た目と振る舞い**：見た目は `_bmad-output/ux-kanaeru-reception/DESIGN.md`、振る舞いは `EXPERIENCE.md`（どちらも `docs/design/` の既定〈SmartHR Design System を土台にしたもの〉から始めた）。値は `packages/ui/src/styles/tokens.css` に写した1か所だけから読む。WCAG 2.2 AA を下限にし、通しのテストで axe にかける。

## 開発ワークフロー

- **構想・計画はBMAD-METHOD、実装はspec-kit**で進める。BMADでプロダクトブリーフ・PRDまでの叩き台を作り（出力は`_bmad-output/`）、機能ごとに spec-kit（`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`）で作る。2つを同じ機能で並行して使わない（[docs/ai-skills.md](../../docs/ai-skills.md)）。
- **ブランチ**：`main`（本番）／`develop`（ステージング。既定のブランチ）／`feature/*`の3段構成。`main`・`develop`への直接のpushは禁止（PR必須）。ステージングを足すまでは、`main` のマージで本番に出し、`develop` のマージでは出さない。詳しくは[docs/rules/development-flow.md](../../docs/rules/development-flow.md)。
- **仕様のフォルダと番号**：`specs/<領域>/NNN-<短い名前>/`。番号は領域ごとに振る（[docs/rules/specs.md](../../docs/rules/specs.md)）。
- AIが守る決まりの入口は`CLAUDE.md`。

## Governance

- 本Constitutionは、PRD・プロダクトブリーフ・個別の仕様より優先する。矛盾がある場合は本書を正とし、矛盾元の文書を直す。
- 改定はセマンティックバージョニングに従う：原則の削除・後方非互換な再定義＝MAJOR、原則の追加・実質的な拡張＝MINOR、文言の修正・明確化＝PATCH。
- 改定するときは`/speckit-constitution`を使い、Sync Impact Reportを残す。

**Version**: 1.1.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-19
