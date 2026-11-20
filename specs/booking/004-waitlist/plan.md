# Implementation Plan: 定員・キャンセル待ち・期限つきの繰り上げ・変更と中止の知らせ（booking-004）

**Branch**: `feature/booking-004-waitlist` → `feature/booking-004-pr2-waitlist` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決め・セキュリティの確かめは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口の形は [contracts/booking-waitlist.md](./contracts/booking-waitlist.md)、手で確かめる手順とインフラの変更は [quickstart.md](./quickstart.md)。

## Summary

交流会ごとに定員と媒体の枠を持ち、埋まった席（確定＋打診中）から自前のページの残りを出す。残りが0なら自前の申込みはキャンセル待ちに入り、席が空くと先頭に期限つきで打診する（期限は日本時間で、夜と始まりの前を避ける）。返事は LINE の人は自分の申込み、メールの人は札のページ。期限切れは定期の窓口・書く窓口・読む窓口の3つで拾い、設定の行を押さえて二重の打診と定員超えを止める。日時や場所の変更は booking が持つ「最後に知らせた日時と場所」と event の要約を比べて知らせ（event を直さない）、中止は booking の「予約を中止する」で知らせる。主催者は満員・止める媒体・超えた人数・キャンセル待ちの並び・送った知らせを見る。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: Hono・@hono/zod-openapi・zod 4・Drizzle 0.45・React 19・TanStack Router/Query（新しい依存なし）

**Storage**: PostgreSQL（列と表を足す DB の変更を1つ：`0018_booking_waitlist.sql`）

**Testing**: Vitest（期限の計算・席の数え方・約束の単体、booking の API の結合〈本物の PostgreSQL・同時の片付け〉、画面の単体）・Playwright（`e2e/tests/booking-waitlist.spec.ts`。axe・CSP・1440px と 375px）

**Target Platform**: Cloud Run の1つのコンテナ。定期の仕事は Cloud Scheduler（10分おき・9時〜23時台）

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: event・reception・suite・account の表を読まない（`index.ts` だけ。AD-3）。event・reception の `index.ts` と画面を直さない（AD-23）。本物の LINE・メールを呼ばない（手元とテストは偽の送り手）。メールアドレス・札・名前をログと主催者の答えに出さない（Constitution II）。`infra/` を直さない。GET は書かない（booking-003 S5）。

**Scale/Scope**: 交流会ごとに申込みは数十人・枠は3つまで。定期の仕事の対象は、待っている打診かキャンセル待ちか近い変更がある自前の交流会だけ。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 席を押さえるのに払わせない |
| II. 個人の情報は最小限 | 送った知らせの一覧は種類・手段・結果・時刻だけ（R13・S10）。参加者には自分の何番目かと人数だけ（S13）。返事の札は SHA-256 だけ（R8）。ログに名前・アドレス・札を出さない |
| III. 気軽さ | キャンセル待ちも申込みと同じボタン1つ。打診への返事は1タップ（参加する） |
| IV. 小さく始める | 前日のリマインド・主催者への知らせ・event の中止の状態は作らない。枠は3つまで。変更は比べる形で event を直さない（R10） |
| V. 運用費ゼロに近く | 定期の仕事は Cloud Scheduler の仕事を1つ足す（無料の枠は3つまで。threads と夜間の停止で3つ使っているので、4つ目は月 0.1 米ドル。quickstart に書く）。DB を叩く処理は DB が動く時間だけ（AD-10） |
| 技術の制約 | 境界は index.ts からだけ（event の `getEventSummary`・`getEventRole`・`requireEventRole`、account・suite は今まで通り）。定期の窓口は threads と同じ `isJobRequest`。画面の部品は `@workspace/ui` |

違反なし。設計のあとも同じ。

## セキュリティの確かめ（[開発の流れの決まり](../../../docs/rules/development-flow.md) 2）

定期の窓口の認証・競り合いでの二重の打診と定員超え・札での返事・回数の制限と送りつけ・情報の漏れを確かめた。結論と対策の表は [research.md](./research.md) の「計画のときのセキュリティの確かめ」（S1〜S15）。tasks に守りの作業（T050）を入れ、表の確かめをテストにする。

## Project Structure

### Documentation (this feature)

```text
specs/booking/004-waitlist/
├── spec.md
├── research.md
├── data-model.md
├── contracts/booking-waitlist.md
├── quickstart.md
├── checklists/requirements.md
├── plan.md
└── tasks.md
```

### Source Code

```text
packages/contracts/src/booking/
├── options.ts          # 状態（waitlisted・offered）・打診の状態・枠の媒体・受付の状態 cancelled
├── notify-options.ts   # 知らせの種類 same_day
├── waitlist.ts         # 定員の入力・席の内訳・返事・変更・知らせの一覧・定期の仕事の答え・期限の値
├── roster.ts・apply.ts # 欄を足す
├── errors.ts
└── index.ts
apps/api/src/modules/booking/
├── schema.ts           # 列・CHECK・2つの表
├── deadline.ts         # 返事の期限（日本時間）
├── seats.ts            # 席の数え方（読む・書くで同じ）
├── waitlist-repository.ts
├── waitlist.ts         # 片付け・知らせ・返事・手の打診・中止・変更
├── routes-waitlist.ts  # 主催者・返事・定期の窓口
├── apply.ts・apply-repository.ts  # 定員つきの申込み・取り消しのあとの片付け・何番目か
├── routes.ts・views.ts # 設定の欄・手で足す・状態・名簿の欄
├── notify.ts・notify-repository.ts・notice-templates.ts  # 状態の言葉・same_day
└── index.ts
apps/api/drizzle/0018_booking_waitlist.sql
apps/web/src/features/booking/
├── waitlist-api.ts・CapacitySection.tsx・SeatSummary.tsx・NoticeLog.tsx
├── ModeSection.tsx・RosterPage.tsx・ApplyPage.tsx・MyBookingsPage.tsx・EntryTokenPage.tsx・apply-parts.tsx
e2e/tests/booking-waitlist.spec.ts
docs/apps/booking.md・_bmad-output/architecture-kanaeru/architecture-kanaeru.md（AD-24 の注）
```

## PR の分け方

1. `feature/booking-004-waitlist`（DB の変更の PR）：仕様のフォルダ（1つ目のコミット）・選択肢の値（`options.ts`・`notify-options.ts`）・`schema.ts`・`0018_booking_waitlist.sql`・制約の結合のテスト（2つ目のコミット）。
2. `feature/booking-004-pr2-waitlist`（1の上）：booking の窓口・画面・知らせ・定期の窓口・E2E・文書。共通と event・reception の変更はない。

## Complexity Tracking

| 決まりから外れること | 理由 | もっと単純な案を取らない理由 |
|---|---|---|
| 返事の期限に PRD にない4つ目の決まり（始まりの2時間前が夜なら0時） | DB が止まる時間に期限を置かない（AD-10・AD-24） | PRD の文のままだと、期限が答えられない時間に落ちる（R6） |
| 知らせの種類に `same_day` を足す（PRD FR-B80 の6つの外） | PRD FR-B67 が当日の空きを知らせると決めている | 打診の種類で送ると、記録と文面で区別できない |
| 変更を比べる形（event を直さない） | AD-23 の一方向と、共通の変更を避けるため | event に差し込み口を置くと共通の変更になる（R10） |
