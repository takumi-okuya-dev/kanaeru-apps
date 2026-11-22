# Implementation Plan: 本番に出す3つのモード（core-019）

**Branch**: `feature/core-019-release-modes` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

## Summary

`deploy.yml` を「時間帯の確かめ →（夜だけ）DB を起こす → ステージング → 承認 → 本番 →（夜だけ）DB を止め直す」の仕事に分け、1つの環境へのデプロイを `deploy-environment.yml` にまとめる。`infra/` は WIF のなりすましとデプロイの身分の権限を直す。決まりは `docs/rules/development-flow.md` に書く。

## Technical Context

**Language/Version**: GitHub Actions（reusable workflow）・Terraform 1.11 以上。アプリのコードは変えない

**Testing**: `tests/security/ci-config.test.ts`・actionlint・`terraform validate`・`terraform test`

## Constitution Check

| 原則 | 確かめ |
|---|---|
| V. 運用費 | 夜の緊急デプロイで DB を起こすのは決めた分だけ（1円未満）。部品は増えない |
| 開発ワークフロー | `develop` → ステージング、`main` → 本番は変わらない。本番の前に承認を足しただけ |

違反なし。
