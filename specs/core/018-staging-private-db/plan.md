# Implementation Plan: ステージングを足し、Cloud SQL を内部の IP だけにする（core-018）

**Branch**: `feature/core-018-staging-private-db` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・[research.md](./research.md)

## Summary

`infra/` を「共通の資源」と「環境ごとの部品（`modules/environment`）」に分け、本番とステージングを同じ部品で作る。Cloud SQL は内部の IP だけにし、Cloud Run は Direct VPC egress でつなぐ。デプロイの流れは `main`・`develop` を GitHub の環境で出し分ける。

## Technical Context

**Language/Version**: Terraform 1.11 以上（google `~> 8.12`）・GitHub Actions。アプリのコードは変えない

**Testing**: `terraform fmt -check`・`terraform validate`・`terraform test`（模擬のプロバイダ）・`pnpm check`

**Constraints**: 本番の資源の名前は変えない。DB の接続の合計を db-f1-micro の上限に収める。本番はまだ作っていないので、state の移し替え（moved）は要らない

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 新しく持つ情報はない。ステージングは本物の参加者に知らせを送らない |
| V. 運用費 | ステージングで増えるのは Cloud Scheduler の4つ目（月0.10ドル）だけ。内部の IP で、止めている間の IP の料金（月 約2.4ドル）がなくなる |
| 技術の制約 | 共通の PR（`infra/`・デプロイの流れ・文書）。領域のフォルダは触らない |

違反なし。
