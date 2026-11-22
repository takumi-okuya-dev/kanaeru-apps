# Research: 予約の定期の仕事を共通の窓口に移す（booking-007）

## R1. 予約の窓口 `POST /api/v1/booking/jobs/tick` を残す【仮決め】

- **Decision**：残す。中身は `scheduledJob` と同じ関数（`bookingScheduledJob.run`）を呼ぶだけにし、時間帯は見ない（呼べばいつでも1回動かす）。本番の Cloud Scheduler は共通の窓口だけを呼ぶ。
- **Rationale**：booking のテスト（`waitlist.test.ts`・`waitlist-admin.test.ts`・`change-cancel.test.ts`）が、テストの手伝いの `tick`（`apps/api/test/helpers/booking-waitlist.ts`）でこの窓口を呼び、1回ごとの数（`expired`・`offered`・`changed`）と合言葉の 404 を確かめている。共通の窓口の答えは領域ごとの状態と時間だけで数を返さず、時刻の区切りに当たらないと動かないので、そのままでは置きかえられない。手元の確かめ（booking-004 の quickstart の5）もこの窓口を使う。合言葉の確かめは今の `isJobRequest` のままで、増える守りはない。
- **Alternatives**：消して、テストを共通の窓口に移す → 数の確かめを DB の状態の確かめに書き直し、どのテストも時刻を区切りに合わせる要がある。テストの手伝いで領域に渡す道具を作って関数を直に呼ぶ → 偽の送り手などの道具は組み立ての中で作られ、テストから取り出す口がない（共通の変更が要る）。

## R2. 数のログを共通の窓口に任せる

- **Decision**：`runWaitlistJob` の数のログ（「予約の定期の仕事」）を消す。共通の窓口が、領域の名前・時間・数（`summary`）を1行出す。交流会ごとの失敗のログ（交流会の ID と誤りの種類だけ）は残す。
- **Rationale**：同じ数を2回出さない。

## R3. 共通の窓口から動くことのテスト

- **Decision**：`apps/api/test/booking-scheduled-job.test.ts` で、(1) 間隔と時間帯、(2) `collectScheduledJobs` が booking を含む、(3) 共通の窓口を当たる回と当たらない回に呼び、打診ができるかを確かめる。(3) の時刻は、今の時刻から次の当たる回を探して `Date` だけを差しかえる（交流会の始まり・打診の期限・DB の `now()` と食い違わないよう、今より前にしない）。
- **Rationale**：共通の窓口のテスト（`apps/api/test/job-tick.test.ts`）は見本の領域だけを見るので、booking が本当に集められて動くかは booking の側で確かめる。組み立て（`app.ts`）と `modules.list.ts` を読むので、領域のフォルダではなく `apps/api/test/` に置く（領域から組み立ては読めない。`docs/rules/coding.md` 6-2。`match-public-read-paths.test.ts` と同じ）。
