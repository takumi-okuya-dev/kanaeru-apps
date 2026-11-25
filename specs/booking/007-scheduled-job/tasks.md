# Tasks: 予約の定期の仕事を共通の窓口に移す（booking-007）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

- [x] T001 この仕様（spec・plan・research・tasks）
- [x] T002 `apps/api/src/modules/booking/scheduled-job.ts`：`bookingScheduledJob`。`index.ts` から `scheduledJob` として出す
- [x] T003 `routes-waitlist.ts`：予約の窓口は `bookingScheduledJob.run` を呼ぶ（R1）。`waitlist.ts`：数のログを消す（R2）
- [x] T004 `apps/api/test/booking-scheduled-job.test.ts`：間隔と時間帯・組み立てが集める・共通の窓口から動く（R3）
- [x] T005 文書：`docs/apps/booking.md`・構成の決めごと AD-24
- [x] T006 `pnpm check`
- [ ] T007 `infra/booking.tf` の `booking_tick` を消し、`infra/README.md` 10章を直す（`feature/booking-008-infra-shared-tick`。この PR のあとにマージ）
