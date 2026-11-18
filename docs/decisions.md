# 決めたことの記録

プロダクト全体・作りの土台・開発の進め方について、**いつ・何を・なぜ決めたか**の記録（ADRを短くした形）。新しいものを下に足す。

- 今どうなっているかは、ここではなく「今の形」の文書（[docs/README.md](./README.md) 2章）が正本。ここは経緯を追うためのもの。
- 機能の中の決めごと（画面の細部・データの持ち方など）は、その仕様の`research.md`（R1、R2…）に書き、ここには写さない。
- 決まり（守ること）になったものは、本文を[CLAUDE.md](../CLAUDE.md)・`docs/rules/`に置き、ここには決めた日と理由だけを残す。
- 決めたことを覆したら、元の行は消さずに、新しい行を足して「〜をやめた」と書く。

| 日付 | 決めたこと | 理由 | 詳しく |
|---|---|---|---|
| <YYYY-MM-DD> | 構想・計画はBMAD-METHOD、実装はspec-kitで進める。2つを同じ機能で並行して使わない | 計画と実装で道具を分け、仕様を正本にして小さく作るため | [AIスキルの使い方](./ai-skills.md) |
| <YYYY-MM-DD> | ブランチを`main`（本番）・`develop`（ステージング）・`feature/*`の3段にする | 本番に出す前に、必ずステージングを通すため | [開発の流れの決まり](./rules/development-flow.md) 1 |
| <YYYY-MM-DD> | 仕様のフォルダと番号を領域ごとに分ける（`specs/<領域>/NNN-…`） | 領域を並行して作っても番号がぶつからないため | [仕様と名前の決まり](./rules/specs.md) |
| <YYYY-MM-DD> | レビューは「セルフレビュー → 別のAI」の順。PRは下書きで出す | 自動で動くレビューの前に、自分で見つかるものを直すため | [開発の流れの決まり](./rules/development-flow.md) 2 |
| <YYYY-MM-DD> | CIはラベル`run-ci`を付けたPRだけで流す | GitHubのCIは量に限りがあるため | [開発の流れの決まり](./rules/development-flow.md) 3 |
| 2026-11-18 | （テンプレート）tsunagu-app で育った言語に依存しない決まり（セキュリティの確かめの時・学びの文書・作業場所ごとの DB と口・サブエージェントにブランチを切り替えさせない など）を取り込んだ | 次のプロダクトで同じ失敗をくり返さないため | `docs/rules/` |
| 2026-11-18 | （テンプレート）層ごとの技術の候補を比べ直し、TypeScript の既定を決めた（Hono＋zod・Vite＋React＋TanStack Router・Drizzle 0.45・PostgreSQL・Better Auth・Cloud Run 東京・Terraform）。TypeScript の動く骨組みは `typescript` ブランチに置き、main は言語に依存しない土台のまま | ほとんどの開発を TypeScript で行うため。main を土台にしておくと、ほかの言語を選ぶときにも使える | [技術選定の候補](./tech-selection.md) |
| 2026-11-18 | （テンプレート）UI デザインの既定を SmartHR Design System を土台にして main に置いた（値は smarthr-ui〈MIT〉から、考え方は書き直し、プロダクトの色は置きかえる）。部品集の smarthr-ui そのものは既定にしない | 業務の道具として読みやすく迷わない型が、公開されていて使いこまれているため。部品集は Tailwind 3 に縛られ、メジャー版の更新が多く、そのままでは SmartHR に見えるため | [UI デザインの既定](./design/README.md) |
| 2026-11-18 | （テンプレート）`typescript` ブランチに TypeScript の動く骨組み（API・画面・約束・部品・見本の領域「メモ」・テスト・lint・CI・守りの確かめ）を置いた。画面の道は TanStack Router のコードで書く形にし、領域の登録は `modules.list.ts`・`features.list.ts` の1行の一覧（`merge=union`）にした。ログイン・複数のお客・インフラは入れず、仕様で足す | 次のプロダクトを、決まりと確かめがそろった状態から始めるため。ファイルで道を決める形は、作られる道の一覧（`routeTree.gen.ts`）を並行のブランチがぶつけ合い、生成の手順も要るので選ばなかった | [全体の形](./architecture.md)・[コードの書き方の決まり](./rules/coding.md) 6章 |
| 2026-11-19 | kanaeru-apps として始めた（product-template の `typescript` ブランチを土台にした）。構想は `_bmad-output/` のブレインストーミング → プロダクトブリーフ → PRD の順で固めた | 言語は TypeScript を前提にするため | [README](../README.md)・`_bmad-output/` |
| 2026-11-19 | スイートは1つのモジュラーモノリスにする（アプリは領域として足す。アカウントは account の領域だけが持つ） | 共通のアカウントが自然にでき、置き場所が1つで無料枠に収まり、1人で回せるため。アプリごとに分ける形は費用と手間が増える | `_bmad-output/architecture-kanaeru/`（AD-1・AD-2） |
| 2026-11-19 | 参加者の画面は未認証の LINEミニアプリで作り、ログインは LINE のIDトークンを API が確かめて自前のセッションを出す。テンプレートの既定の Better Auth は使わない | LINE が新規はミニアプリを勧めており、LIFF からは移せないため。Better Auth は LINE でメールがない人がログインできない | `_bmad-output/architecture-kanaeru/`（AD-4） |
| 2026-11-19 | 置き場所は Cloud Run（東京）＋ Cloud SQL for PostgreSQL（東京・db-f1-micro）。DB は夜間0時〜8時に止める。すべて Terraform で持つ | 主催者が GCP と Terraform を学びたいため。DB も東京で速い。Neon（0円・シンガポール）と Cloudflare・Supabase も比べた | `_bmad-output/architecture-kanaeru/`（AD-8〜AD-10） |
| 2026-11-19 | 環境は本番の1つで始め、`main` のマージで本番に出す。`develop` のマージでは出さない | 2026-11-25 の交流会に間に合わせるため。ステージングは交流会のあとに足す | [開発の流れの決まり](./rules/development-flow.md) 5 |
| 2026-11-19 | 組み立てた画面は、設定 `WEB_DIST_DIR` があるときに API（`platform/web`）が返し、画面の CSP も API の1か所で付ける。E2E も同じ形で流し、`vite preview` の CSP はやめた | 1つのコンテナで画面と `/api` を同じ源にし（AD-8）、CSP を2か所に書いてずれないようにするため。環境の名前で分けない（coding.md 2） | `specs/core/001-foundation/research.md`（R6・R12） |
| 2026-11-19 | 画面の CSP に LIFF の SDK が使う LINE の源を足し、`'unsafe-eval'` は入れない（外のブラウザで LIFF の小さな窓〈`requestFriendship` など〉が動かない見込みを受け入れる） | LINE に CSP の説明がなく、SDK の中身から源を拾った。友だち追加は LINE の中で出すので、守りを優先した（仮決め。本番で確かめる） | `specs/core/001-foundation/research.md`（R7） |
| 2026-11-19 | 領域の道に、秘密でない設定（`DomainConfig`）と外への出口（`fetch`）を土台から渡す。試験用のログインは設定 `TEST_LOGIN_ENABLED`（staging・production で入なら起動しない）で入・切する | account が LINE のチャネル ID・主催者・画面の源と LINE への出口を要るため。account の型を土台に足さず、ほかの領域も同じ形で使えるようにした。環境の名前で分けない（coding.md 2）（仮決め） | `specs/account/001-line-login/research.md`（R1・R3） |
| 2026-11-19 | セッションは札の SHA-256 だけを DB に持ち、期限は作ってから30日で延ばさない。画面は 401 で LINE の ID トークンを1度だけ送ってログインし直す | DB が漏れてもなりすませないため。LINE の中では切れても自動でやり直せるので、延ばす書きこみを要求のたびに足さない（仮決め） | `specs/account/001-line-login/research.md`（R4・R5・R9） |
