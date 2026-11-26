# Specification Quality Checklist: MCP で本人の記録を外の AI に渡す（core-021）

**Purpose**: `/speckit-clarify` と `/speckit-plan` の前に、仕様の完成度を確かめる
**Created**: 2026-11-23
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] 利用者にとっての価値（接続・本人の記録だけを読む・止める）が中心に書かれている
- [ ] 実装の詳細が入っていない → **例外**：この repo の仕様は、AD-20・AD-21 の決めごと（RFC 番号・SDK 名・`/api/mcp`）を参照する形で書く（house style）。技術の決めごとは計画で確かめる
- [x] 主要な項目（範囲・見せない項目・エラー・夜間の停止）が書かれている
- [x] 必須の節（User Scenarios・Requirements・Success Criteria）がそろっている

## Requirement Completeness

- [x] 未決めの点は残っていない。3件（書く操作と範囲・独自ドメイン・DCR）は主催者の不在中に AI が【仮決め】で決めた（spec.md の Clarifications）。主催者の確かめ待ち
- [x] 要件は確かめられる形で書かれている（FR-001〜FR-024）
- [x] 成功の基準は数字と確かめ方で書かれている（SC-001〜SC-006）
- [x] すべての受け入れシナリオが書かれている（3つのユーザーストーリー）
- [x] 端のケースが書かれている（認可の途中・期限・取り消し・夜間・Origin・別の宛先）
- [x] 範囲の外が明記されている
- [x] 前提と依存が書かれている（core-005・account の Bearer・LINE ログインの公開）

## Feature Readiness

- [x] すべての機能要件に受け入れの基準がある（ユーザーストーリーとSC のどちらかで確かめられる）
- [x] 主要な流れがユーザーストーリーに入っている
- [x] 計画に進める（【仮決め】の確かめは主催者の判断として残す）

## Notes

- 残りの未チェックは、主催者（または `/speckit-clarify`）の答えを待つもの。実装の詳細の項目は、この repo の仕様の書き方（決めごとの参照）に合わせて例外にした。
- 済：`plan.md`・`tasks.md` を作成（2026-11-23）。整合の確かめ（参照の欠け・番号の抜け）は 2026-11-23 に行い、FR-034 の抜けを直した。次：主催者の確かめ、それから実装（フェーズ 1 の共通の PR は着手の前に主催者に伝える）。
- 計画のときに確かめる（[development-flow.md](../../../../docs/rules/development-flow.md) 2 の MCP を入れる仕様の欄）：LINE ログインの Web 用チャネルで MCP クライアントの認可の流れが通るか、CIMD だけで足りるか。
