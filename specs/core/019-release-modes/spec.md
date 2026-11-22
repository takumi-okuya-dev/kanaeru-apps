# Feature Specification: 本番に出す3つのモード（緊急・週ごと・新しいアプリ）と、本番の前の承認・夜の緊急デプロイ（core-019）

**Feature Branch**: `feature/core-019-release-modes`（`develop` から切る。共通の PR：開発の流れの決まり・デプロイの流れ・`infra/` の権限・文書）

**Created**: 2026-11-22

**Status**: Draft（主催者が決めた：3つのモード・本番の前にステージングで確かめて承認・夜は DB を一時的に起こして出す・権限は両方の環境・週ごとは毎週水曜の昼）

**Input**: [決めたことの記録](../../../docs/decisions.md) 2026-11-22。core-018 でステージングを足した。

## Clarifications

### Session 2026-11-22

- Q: モード → A: ①緊急（重大なバグ。`hotfix/*` から `main` へ。夜でも出す）・②週ごと（軽い直し。毎週水曜の昼に `develop`→`main`）・③新しいアプリ（コードは②で本番に入れ、本番の台帳は切のまま。ステージングで1週間試してから公開に切り替える）
- Q: 緊急の直しをステージングでどう確かめるか → A: `main` のマージでは、1回の流れの中で「ステージングに出す → ユーザーがステージングで確かめて承認（GitHub の環境 `production` の承認者）→ 本番に出す」と進む（案B）。本番に出るのはいつも `main` の中身だけ
- Q: 夜に出すとき → A: `main` で手で流し `wake_db` を入にすると、DB を一時的に起こし、決めた分（既定60分・15〜90分）のあと必ず止め直す（取り消しても）。使えるのは `main` だけ・0時〜7時45分だけ。7時45分を過ぎていたら止めない。前から動いていたら起こしも止めもしない
- Q: DB を起こす権限 → A: 主催者は「両方の身分に」を選んだ。レビューで、この役割（`cloudsql.instances.update`）が台の設定も直せると分かったので、デプロイの身分には付けず、`main` からだけなりすませる専用の身分（`kanaeru-db-waker`）に持たせた。develop と main のどちらで確かめたいかという主催者の意図（夜に main の直しを出す）は、この形で満たせる

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 本番の前に、同じ中身をステージングで確かめてから承認する (Priority: P1)

1. **Given** `main` へのマージ, **Then** ステージングに出たあと、GitHub の環境 `production` の承認を待ち、承認したら本番に出る。承認しなければ本番には出ない
2. **Given** `develop` へのマージ, **Then** ステージングにだけ出る
3. **Given** ステージングへのデプロイが失敗, **Then** 本番には進まない

### User Story 2 - 夜に重大なバグを直して出す (Priority: P1)

1. **Given** 日本時間 1時に `main` で `wake_db` を入にして流す, **Then** DB を起こし、動き出したらステージング → 承認 → 本番の順に出し、`keep_awake_minutes` のあと DB を止め直す
2. **Given** 途中で失敗した・承認しなかった, **Then** それでも決めた分のあと DB を止め直す
3. **Given** 7時45分〜23時に `wake_db` を入にする・`develop` で入にする, **Then** 始める前に止まる
4. **Given** 止め直す時刻が7時45分を過ぎた, **Then** 止めない（Cloud Scheduler の8時の起動とぶつからないように）
5. **Given** 流れを取り消した, **Then** 待たずにすぐ DB を止め直す
6. **Given** 承認が遅れ、止め直す時刻まで15分を切った（昼なら23時15分を過ぎた）, **Then** 本番の仕事は何もせずに止まる

## Requirements *(mandatory)*

- **FR-001**: `docs/rules/development-flow.md`：3つのモード・`hotfix/*`・`main` のマージの流れ（ステージング → 承認 → 本番）。`docs/rules/specs.md`：ブランチの名前に `hotfix/<領域>-…`。
- **FR-002**: `.github/workflows/deploy.yml`：時間帯の確かめ（`prepare`）→（`wake_db` のとき）DB を起こす → ステージング → （`main` のとき）本番 →（`wake_db` のとき）DB を止め直す。1つの環境へのデプロイの中身は `.github/workflows/deploy-environment.yml`（`workflow_call`）にまとめ、環境ごとに1つずつ動かす。
- **FR-003**: `infra/`：ステージングのデプロイの身分は `develop` と `main` から使え、本番の身分は `main` からだけ。DB を起こす・止める専用の身分 `kanaeru-db-waker`（`kanaeruSqlActivation`・`main` からだけ）。前の1つのなりすましの許可を `moved` で移す。リポジトリの変数に `SQL_INSTANCE`・`GCP_DB_WAKER_SA` を足す。
- **FR-004**: 文書：`docs/release-guide.md`（3つのモードの選び方とやり方・承認・夜の緊急デプロイ・戻し方）・`docs/README.md`・`infra/README.md`（5章：GitHub の環境の承認者とデプロイしてよいブランチ・`SQL_INSTANCE`・`GCP_DB_WAKER_SA`。7章：夜の緊急デプロイ）・構成の決めごと AD-11・`docs/decisions.md`。
- **FR-005**: `tests/security/ci-config.test.ts`：2つの workflow の守り（ステージングが先・本番は main で承認のあと・夜の DB の起こし方と止め直し・環境ごとに1つずつ）。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check`・actionlint・`terraform validate`・`terraform test` が通る。
- **SC-002**: 初めての本番のデプロイで、承認を待って本番に出ることを確かめる（tasks T008）。
