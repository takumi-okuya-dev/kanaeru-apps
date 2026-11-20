# Implementation Plan: 自前の申込みページ（booking-003）

**Branch**: `feature/booking-003-apply` → `feature/booking-003-pr2-apply` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決め・セキュリティの確かめは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口の形は [contracts/booking-apply.md](./contracts/booking-apply.md)、手で確かめる手順とインフラの変更は [quickstart.md](./quickstart.md)。

## Summary

使い方に「自前で申込みを受ける」を足し、交流会ごとの受付（既定は閉じる）と見せる範囲（誰でも・部員だけ）を持つ。参加者は `/e/{eventId}` をログインなしで見て、LINE ログインで名前を確かめて申し込む（案内の同意は任意・初めは外す）。完了の画面にカレンダー（Google のリンク・`.ics`）と公式アカウントの友だち追加・任意のメールアドレス。`/my-bookings` で自分の申込みを見て取り消し、部の予定を見て、案内の同意を外す。LINE を使わない人は名前とメールで確認のメール（札は SHA-256・24時間）から申し込み、同じ札で見る・取り消す。確定すると booking-002 の `sendNotice` で確定の知らせを送る。定員とキャンセル待ちは booking-004。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: Hono・@hono/zod-openapi・zod 4・Drizzle 0.45・React 19・TanStack Router/Query（新しい依存なし）

**Storage**: PostgreSQL（列と表を足す DB の変更を1つ：`0017_booking_apply.sql`）

**Testing**: Vitest（約束と `.ics`・カレンダーの単体・booking の API の結合〈本物の PostgreSQL〉・画面の単体）・Playwright（`e2e/tests/booking-apply.spec.ts`。axe・CSP・1440px と 375px）

**Target Platform**: Cloud Run の1つのコンテナ。参加者の画面は LINE ミニアプリと外のブラウザ

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: event・reception・suite・account の表を読まない（`index.ts` だけ。AD-3）。本物の LINE・メールを呼ばない（手元とテストは偽の送り手）。メールアドレス・札・名前をログに出さない（Constitution II）。`infra/` を直さない。定員を足せる形にする（ページの答え・状態の CHECK を広げられる）。

**Scale/Scope**: 交流会ごとに申込みは数十人。確認の待ちは交流会ごとに200件まで。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 申込みで払わせない。参加費は表示だけ |
| II. 個人の情報は最小限 | メールアドレスはメールで申し込む人の連絡（予約の知らせのためだけ）と、LINE の人の任意の連絡（booking-002）だけ。主催者の答え・名簿・CSV に出さない（R14・S12）。案内の同意はメールで取らない（R5）。札は SHA-256 だけ（R10）。ログに名前・アドレス・札を出さない |
| III. 気軽さ | LINE の人は名前の初めの値があり、文字を打たずに「申し込む」だけ（R4）。LINE を使わない人はメールで申し込める（R10） |
| IV. 小さく始める | 定員・キャンセル待ち・案内を送る・LINE の紐づけの一覧の画面は作らない。終わりの時刻は足さず2時間とする（R16） |
| V. 運用費ゼロに近く | 定時の処理・新しい資源を足さない（始まりで閉じるのは読むとき。期限切れの待ちは次の待ちを作るときに消す） |
| 技術の制約 | 境界は index.ts からだけ（event の `getEventSummary`・`getEventRole`・`findEventOrganizationId`・`findEventOwnerAccountId`・`listOrganizationEvents`〈足す〉、suite の `listMemberships`・`findOrganization`、account の `findSessionViewer`・`findDisplayNames`）。参加者の道は core の1か所（AD-14）。画面の部品は `@workspace/ui` |

違反なし。設計のあとも同じ。

## セキュリティの確かめ（[開発の流れの決まり](../../../docs/rules/development-flow.md) 2）

ログインなしの窓口・メールのリンクの札・外へ送るメール・申込みの重複・部員だけの回の見え方・CSRF・回数の制限を確かめた。結論と対策の表は [research.md](./research.md) の「計画のときのセキュリティの確かめ」（S1〜S16）。tasks に守りの作業（T040）を入れ、表の確かめをテストにする。

## Project Structure

### Documentation (this feature)

```text
specs/booking/003-apply/
├── spec.md
├── research.md
├── data-model.md
├── contracts/booking-apply.md
├── quickstart.md
├── checklists/requirements.md
├── plan.md
└── tasks.md
```

### Source Code

```text
packages/contracts/src/booking/
├── options.ts          # self_page（使い方・入口）・見せる範囲・受付の状態の code と言葉・usesRoster
├── apply.ts            # 入出力の形（zod）と上限
├── calendar.ts         # Google カレンダーのリンク（zod を読まない）
├── roster.ts           # BookingSetting に欄を足す
├── errors.ts           # BOOKING_ERRORS に足す
└── index.ts
packages/contracts/src/core/participant-paths.ts  # apply・entry・myBookings（AD-14）
apps/api/src/modules/event/repository.ts・index.ts # listOrganizationEvents を出す
apps/api/src/modules/booking/
├── schema.ts           # 列・CHECK・2つの表
├── tokens.ts           # 札を作る・SHA-256（line-link.ts と共に使う）
├── apply-repository.ts # 設定の列・申込み・同意・確認の待ち
├── apply.ts            # ページの答え・申し込む・取り消す・確認の待ち・札
├── calendar-ics.ts     # .ics
├── routes-apply.ts     # 参加者の窓口
├── routes.ts           # self-page・setting の欄・名簿の確かめを広げる・まとめるで連絡と札を移す
├── notify.ts・notify-repository.ts  # 行の連絡のメールを送り先に足す
├── withdrawal.ts       # 申込みと同意の数を確かめの中身に足す
└── index.ts
apps/api/drizzle/0017_booking_apply.sql
apps/web/src/features/booking/
├── apply-api.ts・links.ts
├── ApplyPage.tsx・EntryTokenPage.tsx・MyBookingsPage.tsx
├── SelfPageSection.tsx・ModeSection.tsx（3つ目のカード）
├── nav-items.ts・ReceptionRosterSection.tsx・RosterGate.tsx（自前でも名簿）
├── RosterPage.tsx（入口「自前」）
├── routes.ts・index.ts
e2e/tests/booking-apply.spec.ts
docs/apps/booking.md・docs/apps/event.md・_bmad-output/architecture-kanaeru/architecture-kanaeru.md（AD-3・AD-14 の注）
```

## PR の分け方

1. `feature/booking-003-apply`（DB の変更の PR）：仕様のフォルダ（1つ目のコミット）・選択肢の値（`options.ts`）・`schema.ts`・`0017_booking_apply.sql`・制約の結合のテスト（2つ目のコミット）。
2. `feature/booking-003-pr2-apply`（1の上）：共通（`participant-paths.ts` の道）を1つ目のコミットに分け、そのあと booking の窓口・画面・知らせ・E2E・文書（event の `index.ts` の1つの関数を含む）。共通の変更は、並行開発の決まり 3-3 では小さな共通の PR に分けて先に入れる形なので、PR を出すときにユーザーに分けるかを確かめる。

## Complexity Tracking

| 決まりから外れること | 理由 | もっと単純な案を取らない理由 |
|---|---|---|
| 共通（core の参加者の道）を領域の作業場所で直す | AD-14 が参加者の道を1か所に持つと決めている | 共通の PR を先に出すと booking の確かめができない。コミットを分け、PR のときにユーザーに分けるかを確かめる |
| ログインなしの窓口（ページ・`.ics`・メールで申し込む・札） | PRD FR-B40・FR-B46 | 申込みページをログインの後ろに置くと SM-C1（ログインを強く求めすぎない）に反し、LINE を使わない人が申し込めない |
