# product-template

新しいプロダクトを、**構想（BMAD-METHOD）→ 仕様駆動の実装（spec-kit）**で進めるための開発テンプレート。`main` は言語・フレームワークに依存しない土台（AIのスキル・文書の構成・開発の決まり・[技術選定の候補](docs/tech-selection.md)）。

**TypeScript で作るなら `typescript` ブランチから始める**（`main` の上に、TypeScript の動く骨組み〈API・画面・DB・テスト・lint・CI〉を載せたもの）。

[meguru-app](https://github.com/takumi-okuya-dev/meguru-app)と tsunagu-app で使い込んだ進め方から、プロダクト固有の内容を抜いて作った。

## ディレクトリ構成

```text
.
├── README.md                  このファイル（使い始めたら、プロダクトの説明に書き換える）
├── CLAUDE.md                  AIが守る決まりの入口
├── .gitignore / .gitattributes
├── .github/
│   └── pull_request_template.md
├── .specify/                  spec-kit（設定・テンプレート・スクリプト）
│   └── memory/constitution.md   守る原則（雛形）
├── .agents/skills/            BMADの実体＋spec-kitへのリンク（Codexが読む）
├── .claude/skills/            spec-kit・security-auditの実体＋BMADへのリンク（Claude Codeが読む）
├── skills-lock.json           入れたスキルの出どころと版
├── _bmad/                     BMADの設定（config.toml）とスクリプト
├── _bmad-output/              ⓪ 構想・プロダクトブリーフ・PRDの出力先
├── specs/                     ③ 機能ごとの仕様（specs/<領域>/NNN-…/）
└── docs/
    ├── README.md              文書の一覧（迷ったらここ）
    ├── ai-skills.md           スキルの置き場所と使う順番
    ├── tech-selection.md      技術選定の候補（言語と層ごとの候補・TypeScript の既定）
    ├── design/                UI デザインの既定（SmartHR Design System を土台にした DESIGN.md・EXPERIENCE.md）
    ├── decisions.md           決めたことの記録（ADRを短くした形）
    ├── backlog.md             バックログ
    └── rules/                 ② AIが守る決まり
        ├── development-flow.md   ブランチ・PR・レビュー・CI・マージ・デプロイ
        ├── specs.md              仕様のフォルダと番号・ブランチとコミットの名前
        ├── coding.md             書き方・設定と環境・DBの変更・テスト
        ├── parallel-development.md  セッションを分けて同時に進める決まり
        └── documents.md          文書の種類と置き場所・作らない文書
```

ソースコードのフォルダ（`src/`・`apps/`など）は、言語とフレームワークを決めてから足す。

## 入っているスキル

| 種類 | スキル | 使う場面 |
|---|---|---|
| BMAD-METHOD | `bmad`・`bmad-brainstorming`・`bmad-forge-idea`・`bmad-deep-recon`・`bmad-product-brief`・`bmad-prfaq`・`bmad-prd`・`bmad-ux`・`bmad-architecture`・`bmad-party-mode` ほか（計30） | 構想・計画 |
| spec-kit | `speckit-constitution`・`speckit-specify`・`speckit-clarify`・`speckit-plan`・`speckit-tasks`・`speckit-analyze`・`speckit-implement`・`speckit-checklist`・`speckit-converge`・`speckit-taskstoissues` | 機能ごとの仕様 → 実装 |
| そのほか | `security-audit` | まとまった単位のセキュリティ点検 |

使う順番は[AIスキルの使い方](docs/ai-skills.md)。

## はじめにやること

1. GitHubで「Use this template」から新しいリポジトリを作り、クローンする（TypeScript で作るなら「Include all branches」に印を付け、`typescript` ブランチを既定の土台にする。または `git clone -b typescript` で取って新しいリポジトリに push する）。
2. プロダクトの名前を入れる。
   - `_bmad/config.toml`の`project_name`
   - `CLAUDE.md`・`.specify/memory/constitution.md`の`<プロダクト名>`
   - このREADMEを、プロダクトの説明に書き換える
3. 既定のブランチを`develop`にする（`git switch -c develop && git push -u origin develop`のあと、GitHubの設定で既定のブランチを`develop`に）。`main`・`develop`にブランチの保護を付ける。
4. **構想を練る**：Claude Codeを開き、`/bmad-brainstorming`や`/bmad-product-brief`から始める（迷ったら`/bmad`）。出力は`_bmad-output/`。画面は`/bmad-ux`で、[UI デザインの既定](docs/design/README.md)を土台にして考える（プロダクトの色は置きかえる）。
5. **原則を決める**：PRDが固まったら`/speckit-constitution`で原則を書き入れる。
6. **言語・フレームワークを決める**（`typescript` ブランチから始めたなら決め済み）：[技術選定の候補](docs/tech-selection.md)を材料に、最初の`/speckit-plan`の調査で決め、[コードの書き方の決まり](docs/rules/coding.md) 6章・`CLAUDE.md`の末尾・`.gitignore`に足す。領域を決めたら[仕様と名前の決まり](docs/rules/specs.md) 2の表に足す。
7. 以降は機能ごとに`/speckit-specify`から（[AIスキルの使い方](docs/ai-skills.md) 4）。
