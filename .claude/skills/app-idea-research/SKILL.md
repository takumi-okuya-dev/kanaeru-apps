---
name: app-idea-research
description: 'Turns a raw app idea for the kanaeru suite into a sourced go/no-go research report: records the idea in docs/backlog.md, then researches the market and similar apps, mines low-rated reviews for gaps, and checks business viability (generative-AI substitution risk, unit economics incl. AI API costs, pricing and billing channels, law/platform terms/trademark), and ends with a verdict and whether to sell it inside the suite or individually. Use when the user shares a new app idea ("こんなアプリを作りたい", "アプリのアイデア", a list of ideas with pain points) or asks to research/validate an app idea, its market, competitors or reviews.'
---

# アプリのアイデアの調べもの（app-idea-research）

主催者がアプリのアイデア（名前と困りごと）を渡したら、**同じ指示をもう一度もらわなくても**、記録から調べもの・判断までを一度に回す。2026-11-19 に主催者が決めた流れ。

## 前提として読むもの

- [CLAUDE.md](../../../CLAUDE.md) と `docs/rules/`（とくに [並行開発の決まり](../../../docs/rules/parallel-development.md) の作業場所の置き方・[文書の決まり](../../../docs/rules/documents.md)）
- [Constitution](../../../.specify/memory/constitution.md)（原則 I お金を預からない・II 個人の情報は最小限）
- [プロダクトブリーフ](../../../_bmad-output/brief-kanaeru-apps/brief-kanaeru-apps.md)（スイートの思い・最初に向き合う人）と、[構成の決めごと](../../../_bmad-output/architecture-kanaeru/architecture-kanaeru.md) の AD-15〜AD-21（アプリの台帳・売り方の切り替え・AIエージェントネイティブ）と、`docs/backlog.md` の B（今後作りたいアプリ）
- すでにある調べもの：`_bmad-output/research-app-ideas/`（同じ観点を調べ直さず、足りない所だけを足す）

## 守ること

- **答えは日本語**。主催者の言葉（困りごと）は書きかえずにそのまま残す。
- **主張には出典**（URL と確かめた日）。確かめきれないものは「要確認」。学習の知識だけで結論を書かない（[bmad-deep-recon](../../../.agents/skills/bmad-deep-recon/SKILL.md) の2つの決まり：学習の知識だけで結論しない・プロジェクトの文書は「何を聞くか」にだけ使い、事実の根拠にしない）。
- **このリポジトリは公開**。個人の名前・連絡先・相手のある打ち合わせの中身・報酬の条件などは書かない。主催者が非公開の資料を渡したら、一般的な要点だけを書き、「詳しくは主催者の手元の非公開の資料」とする。
- **法律の判断はしない**。気をつける法律・規約を挙げ、「専門家の確認が要る」と書く。
- 主催者に質問して止まらない。足りない情報は仮決めにして、報告に【仮決め】と書く（主催者が席を外していても進められるように）。

## 流れ

### 1. 受け取る

- アイデアごとに、名前・困りごと（主催者の言葉）・参考の資料を取り出す。いくつ渡されても、アイデアごとに分けて扱う。
- `docs/backlog.md` の B の表の最後の番号の次を、新しい番号にする（例：`B8`）。すでに B にあるアイデアなら、その番号を使う。短い英語の名前（例：`b8-meeting-notes`）を決める。

### 2. 作業場所を用意する

[並行開発の決まり](../../../docs/rules/parallel-development.md) 1 のとおり、リポジトリの名前の親フォルダの中に作る。

```bash
# base の中で
git fetch origin
git worktree add ../idea-<短い名前> -b docs/idea-<短い名前> origin/develop
```

- `docs/backlog.md` の B が `develop` にまだないとき（入る前）は、B があるブランチ（`docs/backlog-suite-architecture` など）から切る。
- ほかの作業場所のブランチを切り替えない。サブエージェントにも「ブランチを切り替えない・push しない」と伝える。

### 3. 記録する

`docs/backlog.md` の B の表に1行足す（状態は「調べ中」）。アイデアを複数もらったら、まとめて足す。

### 4. 調べる（3つを並行で）

アイデアごとに、次の3つのサブエージェントを並行で動かす（アイデアが3つ以上なら、1つのサブエージェントに2〜3個のアイデアをまとめてよい）。それぞれ `_bmad-output/research-app-ideas/<番号>-<短い名前>/` に1つずつファイルを書き、コミットはしない。頼むときは、アイデアの名前・困りごと・kanaeru の前提（下の「kanaeru の前提」）と、[報告の型](./assets/report-template.md) の担当の節を渡す。

1. **市場と似たアプリ**（`market.md`）：市場の大きさと伸び（日本と世界の数字）・流れ（AI の機能など）。似たアプリを5〜8個（何ができるか・料金・評価・ダウンロード数）。
2. **レビューと勝てる所**（`reviews.md`）：似たアプリの低い評価（★1〜2）のレビューを、App Store・Google Play・レビューのサイト・ブログ・X から集め、よく出る不満を出典つきでまとめる（取れなかったら、取れなかったと書く）。主催者の困りごとと重なる不満のうち、まだ解かれていないもの → 小さなアプリで持てる違い。逆に勝ちにくいもの（ネットワークの効果・コンテンツの量）。
3. **事業性**（`business.md`）：
   - **生成AIに置きかえられないか**：汎用の AI（ChatGPT・Claude・Gemini など。記憶・アプリ・エージェントを含む）で、その困りごとがどこまで解けるか。「AI に聞けば済む」以上に要るもの（記録がたまる・仲間とつながる・交流会のデータ・作業の自動化・LINE とのつながり）。危うさ（低・中・高）。
   - **お金の計算**：1人あたりの月の費用（土台の運用費・AI の利用料の目安〈安い型の料金のページを出典に〉・決済の手数料）と、月の値段ごとの損益分岐（何人いれば土台の費用を回収できるか）。解約率の目安。
   - **値付けと課金の手段**：似たアプリの値段・スイートか個別か・アプリストア（15%/30%）か Web の決済か。
   - **法律・規約・商標**：特定商取引法・消費者契約法・個人情報保護法・そのアイデアに固有の法律（人の紹介なら職業安定法、など）・LINE とアプリストアの規約。名前の商標（J-PlatPat）とドメイン。専門家の確認が要ることを書く。

`docs/backlog.md` の B のほかのアイデアと共通の観点（土台の運用費・課金の手段・特定商取引法など）は、`_bmad-output/research-app-ideas/business-viability.md` があればそれを引き、調べ直さない。

### 5. まとめて判断する

3つのファイルを読み、[報告の型](./assets/report-template.md) で `_bmad-output/research-app-ideas/<番号>-<短い名前>.md` を書く。

- 判断は「**早く作る／あとで作る／作らない**」のどれかと、その理由（3行まで）。
- 売り方は「**スイートに含める／個別に課金／両方**」（構成の決めごとの AD-16）。
- kanaeru との相性（受付アプリが玄関になるか・LINE・交流会のコミュニティ・アカウントの共通）と、1人で作るときの手間の目安。
- 次の一歩（例：`/bmad-forge-idea` でアイデアを固める・テスターに聞き取り・作らない）。

`docs/backlog.md` の B の行の「今の状態・メモ」を、判断と報告へのリンクに書きかえる。

### 6. 報告する

- 主催者への報告は短く：アイデアごとに判断1行と、いちばん大きな勝てる所・いちばん大きな危うさ・次の一歩・書いたファイルの道。
- コミット・push・PR は、[開発の流れの決まり](../../../docs/rules/development-flow.md) 4 のとおり、主催者に頼まれたときだけ行う。報告の最後に「コミットして下書きの PR にしますか？」と1行で聞く（同じ依頼の中で主催者が「PR まで」と言っていたら、聞かずに進める）。
- コミットするときは、頭を `docs: `、本文を日本語にし、最後に今の会話のコミットの決まり（Co-Authored-By など）の行を付ける。gitleaks のコミット前の確かめを飛ばさない。PR は下書きで、向き先は作業場所の元のブランチ。マージはしない。

## kanaeru の前提（サブエージェントに渡す）

- 1人の開発者が、IT交流会を開いている。交流会の受付とアンケートの無料のアプリ（LINE のミニアプリ）を玄関に、「日常のちょっとした課題を解決するスイート」（共通のアカウント・月額のサブスク）を作る。一部のアプリは個別に課金する（集客専用アプリなど）。
- 最初の利用者は、交流会に来る人（エンジニアと、非エンジニアのビジネス層）。
- 土台：Cloud Run と Cloud SQL（東京）。土台の運用費は月1,200〜1,800円ほど。お金は預からない（Constitution 原則 I）。
- 個人の情報は最小限（原則 II）。人の情報を扱うアイデアは、本人の同意と、集める量に気をつける。
