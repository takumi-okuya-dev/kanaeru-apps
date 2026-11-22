# Feature Specification: 予約の定期の仕事を共通の窓口に移す（booking-007）

**Feature Branch**: `feature/booking-007-scheduled-job`（コード・文書）→ `feature/booking-008-infra-shared-tick`（`infra/booking.tf` の予約だけの Cloud Scheduler の仕事を消す。infra は別の PR）。どちらも `develop` から切る

**Created**: 2026-11-22

**Status**: Draft（【仮決め】は主催者の確かめを待つ）

**Input**: [core-017](../../core/017-shared-job-tick/spec.md)（共通の窓口 `POST /api/v1/jobs/tick` と `DomainModule.scheduledJob`。research R4：各領域が `scheduledJob` を出し、その領域の Cloud Scheduler の仕事を消す PR を出す）・[決めたことの記録](../../../docs/decisions.md) 2026-11-22・前の仕様 [booking-004](../004-waitlist/spec.md)（定期の窓口 `POST /api/v1/booking/jobs/tick`。research R9）。

範囲の外：定期の仕事の中身（片付け・変更の知らせ）は変えない。Threads の移し替え（Threads の領域の PR）。

## Clarifications

### Session 2026-11-22

- Q: 間隔と時間帯 → A: 今の Cloud Scheduler の仕事（`kanaeru-booking-tick`）と同じ10分ごと・日本時間 9時〜23時台（8時台は DB の起動を待つ。AD-10・AD-24）
- Q: 予約の窓口 `POST /api/v1/booking/jobs/tick` を残すか → A: 残し、`scheduledJob` と同じ関数を呼ぶ形にする。本番の Cloud Scheduler からは呼ばない【仮決め R1】
- Q: 数のログ → A: 共通の窓口が領域ごとに数を出すので、予約の関数の数のログは消す（同じ行を2回出さない）。交流会ごとの失敗のログは残す（R2）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 予約の定期の仕事を共通の窓口で動かす (Priority: P1)

運営者として、予約の定期の仕事（打診の期限切れ・繰り上げ・当日の空き・変更の知らせ）を、共通の Cloud Scheduler の仕事（`kanaeru-jobs-tick`）から今と同じ間隔で動かし、予約だけの Cloud Scheduler の仕事をなくしたい。

**Acceptance Scenarios**:

1. **Given** booking の `index.ts`, **Then** `scheduledJob` は10分ごと・9時〜23時台で、組み立てが集める仕事に booking が入る
2. **Given** キャンセル待ちの人がいて席が1つ空いた交流会, **When** 10分の区切りでない回に合言葉つきで `POST /api/v1/jobs/tick`, **Then** booking は `skipped` で、何も変えない
3. **Given** 同じ, **When** 当たる回に呼ぶ, **Then** booking は `ran` で、キャンセル待ちの先頭に打診する
4. **Given** 予約の窓口 `POST /api/v1/booking/jobs/tick`, **Then** 今までどおり合言葉がない・違えば 404、合えば数を返す（同じ関数）

## Requirements *(mandatory)*

- **FR-001**: `apps/api/src/modules/booking/scheduled-job.ts` に `bookingScheduledJob`（`everyMinutes: 10`・`hours: [9, 23]`・`run(deps)` は `runWaitlistJob(deps, now)`。答えは数だけ）を置き、`index.ts` から `scheduledJob` として出す。
- **FR-002**: 予約の窓口 `POST /api/v1/booking/jobs/tick` は `bookingScheduledJob.run` を呼ぶ。
- **FR-003**: `infra/booking.tf` の `google_cloud_scheduler_job.booking_tick` を消し、`infra/README.md` 10章を共通の `kanaeru-jobs-tick` に向ける（別の PR）。
- **FR-004**: テストと文書（`docs/apps/booking.md`・構成の決めごと AD-24）。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` が通る（予約の定期の仕事の中身と、予約の窓口の答えは変わらない）。
- **SC-002**: infra の PR のあと、予約が入でも、予約だけの Cloud Scheduler の仕事はない。
