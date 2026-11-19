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
| 2026-11-19 | アプリのアイデアを渡したら、記録・市場と似たアプリ・低い評価のレビュー・事業性（生成AIの代替・お金の計算・値付け・法律と商標）・判断までを回すスキル `app-idea-research` を足した | 同じ指示を毎回出さずに、アイデアを同じ観点で比べられるようにするため（ユーザーが決めた）。コミットと PR は今までどおり頼まれたときだけ | [AIスキルの使い方](./ai-skills.md) 3 |
| 2026-11-19 | 作業場所（git worktree）は、リポジトリの名前の親フォルダの中に、もとのクローン（`base`）と並べて領域ごとに作る | 並行して作るとフォルダが散らかり、どれが何か分からなくなるため（主催者が決めた） | [並行開発の決まり](./rules/parallel-development.md) 1 |
| 2026-11-19 | スイートとして並行開発できる構成に見直した（アプリの一覧と台帳・「使えるか」は suite の1つの関数・DB の変更は同時に1本・2つ目の領域が要る処理は共通の PR で先に・新しいアプリは持ち主の account で持つ・AI の作業を1か所で定義して3つの段階で使う・MCP は自前の OAuth 2.1）。多くは主催者の不在中の仮決め | 受付アプリの4つの領域を作ったときに、並行して作るとぶつかる所（DB の変更の番号・二重の処理・共通の文書）が見えたため。売り方の切り替えと AIエージェントネイティブを最初から前提にするため（主催者が決めた） | `_bmad-output/architecture-kanaeru/`（AD-15〜AD-21） |
| 2026-11-19 | `docs/decisions.md` を、行を足すだけの表にして `merge=union` にした | 見直しの作業中に、別々の PR が同じ表の最後に行を足して2回ぶつかったため | [並行開発の決まり](./rules/parallel-development.md) 3-1 |
| 2026-11-19 | 構成の見直しの仮決め（AD-15〜AD-21）をすべて採用し、Constitution を 1.1.0 に改定した（kanaeru の利用料は支払いの会社の画面で払う・集める情報は各アプリの仕様で決めたものだけ・外の AI に渡すのは本人の記録だけ・新しいアプリと共通の機能は先に PRD）。集客専用アプリはこのリポジトリの中に作る | 原則が受付アプリを前提に書かれていて、スイートの各アプリと文字どおりに食い違ったため。原則の中身は変えずに言葉を広げた（主催者が決めた） | [Constitution](../.specify/memory/constitution.md)・`_bmad-output/architecture-kanaeru/` |
| 2026-11-19 | 共通にしてよいのは、業務を知らず状態を持たない技術の道具だけにし、`packages/` の小さな包みに置く。業務の共通は作らない | 将来のマイクロサービス化を考えて、領域ごとに切り出せる形を保ち、共通の処理の直しで並行の作業がぶつからないようにするため（主催者の指摘） | `_bmad-output/architecture-kanaeru/`（AD-18） |
| 2026-11-20 | めぐるの Threads の運用アプリを、kanaeru の2つ目のアプリ（領域 `threads`）として作り直す。最初は運用アカウント・戦略・プロンプト・投稿の案・承認だけ（threads-001）で、公開は `DOMAIN_FEATURES` の `threads.app` で止める | 人材版の Threads の土台にするため。スイートの台帳がまだないので、機能の印で本番に出さずに確かめる（主催者の指示。範囲は AI の仮決め） | `_bmad-output/prd-threads/`・[specs/threads/001-core-port](../specs/threads/001-core-port/spec.md) |
| 2026-11-20 | Threads の運用アプリの範囲を、めぐるの Threads のすべて（料金・チーム・テスター・運営者・紹介を除く）に広げた。Threads のトークンは `packages/secret-box`（AES-256-GCM・鍵の版・ひもづけ）で包み、領域には鍵ではなく秘密の箱を渡す。自動投稿は Cloud Scheduler の5分おきの仕事（8時〜23時台）で動かし、投稿の時刻は 8:30〜23:00 だけにする | 主催者の指示。秘密を DomainConfig に入れず、暗号は業務を知らない道具として共通にする（AD-18）。DB の夜間の停止（AD-10）の間は投稿できないため（範囲のほかは AI の仮決め） | `_bmad-output/prd-threads/`・[specs/threads/002-connect-autopost](../specs/threads/002-connect-autopost/spec.md) |
| 2026-11-20 | アプリの切り替え・アプリの台帳・スイート全体の設定を作った（core-005）。台帳は公開の状態だけを持ち、売り方の列は売り始めるときに足す。設定の項目は `feature.settings` で出し、新しい一覧のファイルを作らない。アプリが1つのときも「設定」の入口を出す。多くは主催者の不在中の仮決め | 2つ目のアプリ（Threads）を並べる前に、見せ分けと切り替えの場所を共通で用意するため。売り方は売り始めるまで要らないため（主催者が決めた） | [specs/core/005-app-switcher](../specs/core/005-app-switcher/spec.md)・[PRD](../_bmad-output/prd-kanaeru-suite/prd-kanaeru-suite.md) |
| 2026-11-20 | Threads の運用アプリを、アプリの一覧（`apps.list.ts`）にアプリ `threads` として登録し、公開を機能の印 `threads.app` からアプリの台帳（AD-16）に移した。定期の仕事と Webhook の道は、台帳が切のときだけ止める（`requireAppNotOff`） | スイートの台帳（core-005）が入り、どの領域もアプリに属さないと API が起動しないため。運営者だけの間も自動投稿が動くように（主催者の指示「マージまで」を受けた AI の仮決め） | [docs/apps/threads.md](./apps/threads.md)・[specs/core/005-app-switcher](../specs/core/005-app-switcher/spec.md) |
