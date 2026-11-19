# Feature Specification: 戦略のガイドと AI との壁打ち（threads-009）

**Feature Branch**: `feature/threads-001-core-port`（同じ作業場所で続けて作った。PR は分ける）

**Created**: 2026-11-20

**Status**: Draft（手元で実装と確かめまで済み。PR はまだ）

**Input**: 主催者の指示「めぐるの Threads をすべて移す」（2026-11-20）。PRD の FR-1（戦略）を補うもの。移す元はめぐるの specs/014-strategy-guidance（考えるヒント・入力の量の印・AI と深める・全体の見直し・活動の軸）・specs/018-strategy-ai-sparring（AI と壁打ち）・`packages/shared/src/strategy-guidance.ts`・`strategy-prompts.ts`・`strategy-sparring.ts`・画面の `components/strategy/`。threads-001 では戦略の欄と保存だけを移していた。

## Clarifications

### Session 2026-11-20

主催者が不在のため、AI が仮に決めた（【仮決め】）。

- Q: 中身（ヒントの文・印の目安の文字数・プロンプト・答えの目印と読み取り）→ A: めぐるのまま（約束に写し、めぐるの単体テストも写した）
- Q: DB と窓口 → A: 要らない。プロンプトは画面の今の値（保存の前を含む）から画面で作り、貼り戻した答えは画面の欄に入れるだけ。保存は今の「保存」（threads-001 の PUT …/strategy）。DB の変更なし【仮決め】
- Q: めぐるの「プロフィールの状態」（profile-status。Threads のプロフィールとの見比べ）→ A: 移さない（Threads のプロフィールの読み取りを足すことになり、FR の外）【仮決め】
- Q: 画面の形 → A: 戦略の画面の上に「AI と考える」の節（進み・全体の見直しと活動の軸は閉じたトグル・壁打ちも閉じたトグル）、項目ごとに印・考えるヒント（閉じたトグル）・「AI と深める」の枠。めぐるの区分のチップ・進みのカードは、kanaeru の画面の形（1列のフォーム）に合わせて省いた【仮決め】
- Q: アプリは AI を呼ぶか → A: 呼ばない（AD-20。利用者がコピーして外の AI に貼る）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 何をどれだけ書けばよいかがわかる (Priority: P1)

**Acceptance Scenarios**:

1. **Given** 空の戦略, **When** 開く, **Then** 「十分に書けた項目：0／16」と次のおすすめ。項目ごとに「未入力」の印
2. **Given** 目安より短い入力, **Then** 「短め」とひとこと
3. **Given** 考えるヒントを開く, **Then** コツ・悪い例・良い例・足す観点・こんな場合は・もっと良くするなら

### User Story 2 - 1つの項目を AI と深める (Priority: P1)

**Acceptance Scenarios**:

1. **Given** 「AI と深める」, **When** プロンプトをコピーし、答えを貼る, **Then** 【完成版ここから】〜【完成版ここまで】のあいだ（なければ全部）がこの項目に入る（保存はまだ）

### User Story 3 - AI と壁打ちしてまとめて埋める (Priority: P2)

**Acceptance Scenarios**:

1. **Given** 区分と「未入力と短めだけ」を選ぶ, **Then** 質問してもらう項目の数とプロンプト
2. **Given** 【項目：〇〇】〜【項目ここまで】の答え, **Then** 項目ごとの候補（今と同じ・長すぎるは選べない）。選んで入れる

## Requirements *(mandatory)*

- **FR-1**: 印は入力の量だけを見て、内容の良し悪しは判定しない。
- **FR-2**: 全体の見直しの答えは取りこまない（質問をもらうだけ）。
- **FR-3**: 入れた内容は保存するまで DB に入らない。

## 残り

- PR を分けて出す（DB の変更はない）。
