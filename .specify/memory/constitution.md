# <プロダクト名> Constitution

<!--
  雛形。構想（_bmad-output/ のプロダクトブリーフ・PRD）が固まったら、/speckit-constitution で
  原則を書き入れる。<…> の部分を埋め、当てはまらない節は消す。
  ほかの文書と食い違ったら、この文書が正。
-->

## Core Principles

### I. <原則の名前>（NON-NEGOTIABLE）
<プロダクトが絶対に破ってはならない約束。例：利用者の承認なしに外へ送らない、お金を預からない、など>
**Rationale**: <なぜ守るのか。プロダクトの存在意義・いちばん避けたい事故との関係>

### II. <原則の名前>
<…>
**Rationale**: <…>

### III. 小さく始める（YAGNI）
MVPの範囲（PRDのMVP節）の外のものは作らない。範囲を変えるときは、先にPRDを直してから実装に進む。
**Rationale**: 1人とAIで小さく出し続けるため。作りすぎは、直し続けるコストになる。

## 技術スタック制約

<!-- 構想と /speckit-plan の調査のあとで決める。決めるまでは「未定」のままでよい -->

- 言語・フレームワーク：<未定>
- ホスティング：<未定>
- データベース：<未定>
- 認証：<未定>
- **運用コストの目標**：<例：月額固定のインフラ費用は$0から始める>
- **モジュールの境界**：<例：機能ごと（アプリ・モジュールごと）にフォルダを分け、ほかのモジュールは入口からだけ使う。境界は lint などの自動の検査で守る>
- **画面の見た目と振る舞い**：<例：見た目は `DESIGN.md`、振る舞いは `EXPERIENCE.md`（どちらも `docs/design/` の既定〈SmartHR Design System を土台にしたもの〉から始める）。WCAG 2.2 AA を下限にする>

## 開発ワークフロー

- **構想・計画はBMAD-METHOD、実装はspec-kit**で進める。BMADでプロダクトブリーフ・PRDまでの叩き台を作り（出力は`_bmad-output/`）、機能ごとに spec-kit（`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`）で作る。2つを同じ機能で並行して使わない（[docs/ai-skills.md](../../docs/ai-skills.md)）。
- **ブランチ**：`main`（本番）／`develop`（ステージング。既定のブランチ）／`feature/*`の3段構成。`main`・`develop`への直接のpushは禁止（PR必須）。詳しくは[docs/rules/development-flow.md](../../docs/rules/development-flow.md)。
- **仕様のフォルダと番号**：`specs/<領域>/NNN-<短い名前>/`。番号は領域ごとに振る（[docs/rules/specs.md](../../docs/rules/specs.md)）。
- AIが守る決まりの入口は`CLAUDE.md`。

## Governance

- 本Constitutionは、PRD・プロダクトブリーフ・個別の仕様より優先する。矛盾がある場合は本書を正とし、矛盾元の文書を直す。
- 改定はセマンティックバージョニングに従う：原則の削除・後方非互換な再定義＝MAJOR、原則の追加・実質的な拡張＝MINOR、文言の修正・明確化＝PATCH。
- 改定するときは`/speckit-constitution`を使い、Sync Impact Reportを残す。

**Version**: 0.1.0 | **Ratified**: <YYYY-MM-DD> | **Last Amended**: <YYYY-MM-DD>
