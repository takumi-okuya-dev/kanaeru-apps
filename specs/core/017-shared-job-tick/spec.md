# Feature Specification: 定期の仕事を1つの窓口にまとめ、組み立てが各領域の定期の仕事を動かす（core-017）

**Feature Branch**: `feature/core-017-shared-job-tick`（`develop` から切る。小さな共通の PR）

**Created**: 2026-11-22

**Status**: Draft（主催者が案 A〈Threads と booking の定期の仕事を1つの Cloud Scheduler の仕事にまとめる〉を選んだ）

**Input**: [決めたことの記録](../../../docs/decisions.md) 2026-11-22・[置き場所の比べと料金の試算](../../../docs/hosting-cost.md) 7章。Cloud Scheduler の無料は請求先アカウントごとに3つまでで、DB の停止・起動・Threads・booking で4つになり、月0.10ドルかかる。

## Clarifications

### Session 2026-11-22

- Q: まとめ方 → A: 組み立てに共通の窓口 `POST /api/v1/jobs/tick` を1つ置き、Cloud Scheduler はそこだけを5分ごと（8時〜23時台）に呼ぶ。各領域は `index.ts` から `scheduledJob`（間隔と時間帯と動かす関数）を出し、組み立てが集めて、その回に当たる領域の仕事を動かす（R1）
- Q: 呼ぶ間隔 → A: 今のいちばん短い間隔（Threads の5分）のまま。回数を減らすのは利用者が増えてから（バックログ C4。呼ぶ間隔を保つと、待っている台は課金されずに温まる）
- Q: 領域ごとの間隔と時間帯 → A: 領域が出す（Threads は5分ごと・8〜23時台、booking は10分ごと・9〜23時台）。組み立ては日本時間で、その回に当たるかだけを決める（R2）
- Q: アプリが「切」のとき → A: その領域の仕事は動かさない（今の機械の道の決まり〈requireAppNotOff〉と同じ。運営者だけのアプリは動く）
- Q: 領域の仕事の窓口（`/api/v1/<領域>/jobs/tick`）→ A: この PR では消さない。領域が `scheduledJob` を出し、Cloud Scheduler の仕事を共通に移した PR で、その領域が決める（R4）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cloud Scheduler の仕事を1つにして、無料の3つに収める (Priority: P1)

運営者として、Threads と booking を両方入にしても、Cloud Scheduler の仕事が DB の停止・起動と共通の1つの合わせて3つに収まり、Cloud Scheduler の料金がかからないようにしたい。

**Acceptance Scenarios**:

1. **Given** 2つの領域が `scheduledJob` を出す（5分ごと・8〜23時、10分ごと・9〜23時）, **When** 日本時間 10時05分に合言葉つきで `POST /api/v1/jobs/tick`, **Then** 5分ごとの領域だけが動き、答えに領域ごとの結果（動いた・時間外・止めている・失敗）が出る
2. **Given** 同じ, **When** 10時10分, **Then** 両方が動く
3. **Given** 同じ, **When** 8時30分, **Then** 9時からの領域は動かない（時間外）
4. **Given** 合言葉がない・違う, **Then** `404`（今の領域の定期の窓口と同じ）
5. **Given** 1つの領域の仕事が投げる, **Then** ほかの領域の仕事は最後まで動き、答えは `200` で、その領域は「失敗」。ログには領域の名前と誤りの種類だけを出す
6. **Given** 領域が属するアプリが「切」, **Then** その領域の仕事は動かさない（止めている）
7. **Given** 領域が間隔に5の倍数でない数や、時間帯に0〜23の外を出す, **Then** 起動を止める

## Requirements *(mandatory)*

- **FR-001**: `DomainModule` に任意の `scheduledJob?: ScheduledJob` を足す（`withdrawal`・`publicReadPaths` と同じ、領域が出し組み立てが集める形）。`ScheduledJob` は `{ everyMinutes, hours: [from, to], run(deps) }`。
- **FR-002**: `kernel/scheduled-job.ts`：`ScheduledJob` の型、形の確かめ（間隔は5〜60の5の倍数・時間帯は0〜23で from ≤ to）、その回に当たるかの判定（日本時間。Cloud Scheduler の数秒の遅れを5分の区切りに丸める）。
- **FR-003**: `platform/jobs`：`POST /api/v1/jobs/tick`。合言葉の確かめは今の `isJobRequest`。当たる領域の仕事を並べて同時に動かし（Cloud Run の1回の上限60秒に収めるため）、1つの失敗でほかを止めない。答えは領域ごとの状態と時間だけ（数や中身は返さない）。
- **FR-004**: `app.ts`：領域の `scheduledJob` を集めて窓口に渡す。アプリに属する領域は、その回にアプリが「切」なら動かさない。
- **FR-005**: `infra/`：共通の Cloud Scheduler の仕事（5分ごと・8〜23時台・`/api/v1/jobs/tick`）を、合言葉があるとき（Threads か booking が入）だけ作る。
- **FR-006**: テストと文書（`docs/architecture.md`・`docs/rules/coding.md` 6-6・`infra/README.md`）。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` が通る（今の道の答えは変わらない）。
- **SC-002**: Threads と booking がそれぞれ `scheduledJob` に移り、領域ごとの Cloud Scheduler の仕事を消したあと、Cloud Scheduler の仕事は3つ（DB の停止・起動・共通）になる。
