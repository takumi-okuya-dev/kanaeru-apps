# Implementation Plan: 予約の知らせの仕組み（booking-002）

**Branch**: `feature/booking-002-notify` → `feature/booking-002-pr2-notify` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決め・セキュリティの確かめは [research.md](./research.md)、表は [data-model.md](./data-model.md)、窓口と道具の形は [contracts/booking-notify.md](./contracts/booking-notify.md)、手で確かめる手順とインフラの変更は [quickstart.md](./quickstart.md)。

## Summary

送る道具（LINE の push・reply・ボット情報・Webhook の署名・メールの形・偽の送り手・`NOTIFY_MODE` と `NOTIFY_ALLOWLIST` の守り）を `platform/notify` に置き、組み立てが設定から作って `DomainRouteDeps.notifier` で領域に渡す。booking は、組織と個人の LINE 公式アカウントの設定（暗号文と末尾）・紐づけ・使い切りの札・参加者の連絡のメールアドレス・知らせの記録の5つの表を持ち、設定の画面（A4）・Webhook（友だち追加であいさつ、ブロックで紐づけを消す）・紐づけの画面（`/line-link/{token}`）・`sendNotice`（LINE → メール → なし）を出す。この版で実際に送るのは、設定の画面の「自分に確かめのメッセージを送る」と、友だち追加へのあいさつだけ。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: Hono・@hono/zod-openapi・zod 4・Drizzle 0.45・React 19・TanStack Router/Query・`@workspace/secret-box`（新しい依存なし。LINE の SDK は入れず、3つの窓口を `fetch` で呼ぶ）

**Storage**: PostgreSQL（表を5つ足す DB の変更を1つ：`0017_booking_notify.sql`）

**Testing**: Vitest（`platform/notify` の単体・booking の API の結合〈本物の PostgreSQL〉・約束と画面の単体）・Playwright（`e2e/tests/booking-notify.spec.ts`。axe・1440px と 375px）

**Target Platform**: Cloud Run の1つのコンテナ。LINE の Webhook は LINE のサーバーから届く

**Project Type**: pnpm のワークスペースの Web（API＋SPA）

**Constraints**: 送る道具は業務を知らない（AD-18）。手元とテストは本物を呼ばない（AD-24）。秘密の値・宛先・本文・札をログに出さない（Constitution II）。event・suite・account の表を読まない（`index.ts` だけ）。`infra/` を直さない。

**Scale/Scope**: 組織ごとに設定は1つ、紐づけは数十〜数百。Webhook は友だち追加とブロックのときだけ。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関わらない。LINE のメッセージの費用は各組織の LINE の契約（AD-24） |
| II. 個人の情報は最小限 | メールアドレスは本人が入れたものだけ・任意・本人の窓口で消せる・主催者に見せない（R14）。知らせの記録に本文と宛先を持たない（R12）。公式アカウントの鍵は秘密の箱で包み、末尾だけを出し、ログに出さない（R9・S4）。紐づけの札は SHA-256 だけ（R3）。ログに LINE のユーザー ID・メールアドレス・本文・札を出さない |
| III. 気軽さ | 参加者の操作はリンクを開いてログインし「紐づける」だけ（文字を打たない） |
| IV. 小さく始める | 送る道具は今使う3つの LINE の窓口と、メールの形だけ。メールの送信のサービス・送り直し・主催者が送った知らせを見る画面は作らない |
| V. 運用費ゼロに近く | 新しい資源・定期の仕事を足さない。あいさつは reply（LINE の数に数えない）。メールのサービスは無料枠のあるものを選ぶ（あとで） |
| 技術の制約 | 境界は index.ts からだけ（event の `findEventOrganizationId`〈足す〉・`findEventOwnerAccountId`・`getEventSummary`、suite の `findMembership`・`listMemberships`・`findOrganization`、account の `findDisplayNames`）。画面の部品は `@workspace/ui` |

違反なし。設計のあとも同じ。

## セキュリティの確かめ（[開発の流れの決まり](../../../docs/rules/development-flow.md) 2）

**外からの知らせ（Webhook）**と**外のサービスの秘密の値**に当たる。結論と対策の表は [research.md](./research.md) の「計画のときのセキュリティの確かめ」（S1〜S14）。tasks に守りの作業（T030）を入れ、表の確かめをテストにする。`docs/security/` の対応表はまだない（言語を決めたら置く決まり）ので、research の表を正本にする。

## Project Structure

### Documentation (this feature)

```text
specs/booking/002-notify/
├── spec.md
├── research.md
├── data-model.md
├── contracts/booking-notify.md
├── quickstart.md
├── checklists/requirements.md
├── plan.md
└── tasks.md
```

### Source Code

```text
packages/contracts/src/booking/
├── notify-options.ts   # 知らせの種類・手段・結果・送り方の code と言葉（zod を読まない）
├── notify.ts           # 入出力の形（zod）と上限
├── errors.ts           # BOOKING_ERRORS に知らせのエラーを足す
├── paths.ts            # 設定の画面の道を足す
└── index.ts
packages/contracts/src/core/participant-paths.ts  # /line-link/$linkToken を足す（AD-14）
apps/api/src/kernel/
├── config.ts           # NOTIFY_MODE・NOTIFY_ALLOWLIST（Config.notify）
├── notifier.ts         # 送る道具の型（Notifier。領域に渡す）
└── http.ts             # DomainRouteDeps.notifier
apps/api/src/platform/notify/
├── guard.ts            # 守りの判定
├── line-client.ts      # LINE の HTTP（push・reply・ボット情報）
├── signature.ts        # Webhook の署名の確かめ
├── email.ts            # メールの形と送り手の差しこみ口
├── fake.ts             # 偽の送り手（覚えるだけ）
├── notifier.ts         # createNotifier
└── index.ts
apps/api/src/app.ts     # 組み立て：createNotifier を DomainRouteDeps に渡す（1か所）
apps/api/src/modules/event/index.ts   # findEventOrganizationId を出す（1行）
apps/api/src/modules/booking/
├── schema.ts           # 5つの表を足す
├── notify-repository.ts
├── notify-settings.ts  # 設定の読み書き（包む・末尾・確かめ）
├── line-link.ts        # 札と紐づけ
├── notice-templates.ts # 文面
├── notify.ts           # sendNotice・確かめのメッセージ
├── routes-notify.ts    # 設定・紐づけ・連絡・開発の窓口
├── routes-webhook.ts   # Webhook
├── routes.ts           # 上の2つをつなぐ
└── withdrawal.ts       # 個人の設定を確かめの中身に足す
apps/api/drizzle/0017_booking_notify.sql
apps/web/src/features/booking/
├── notify-api.ts・notify-queries.ts
├── NotifySettingsPage.tsx  # A4（個人・組織）
├── LineLinkPage.tsx        # 紐づけ（参加者）
├── routes.ts・index.ts     # feature.settings・feature.organization
e2e/tests/booking-notify.spec.ts
docs/apps/booking.md・docs/architecture.md（platform/notify の1行）・_bmad-output/architecture-kanaeru/architecture-kanaeru.md（AD-14・AD-24 の道）・.env.example
```

## PR の分け方

1. `feature/booking-002-notify`（DB の変更の PR）：仕様のフォルダ・`packages/contracts/src/booking/notify-options.ts`（CHECK の値）・`apps/api/src/modules/booking/schema.ts` の5つの表・`0017_booking_notify.sql`・選択肢の値と制約の結合のテスト。
2. `feature/booking-002-pr2-notify`（1の上）：共通（`kernel/config.ts`・`kernel/notifier.ts`・`kernel/http.ts`・`platform/notify`・`app.ts`・`participant-paths.ts`・`.env.example`）を1つ目のコミットに分け、そのあと booking の窓口・Webhook・紐づけ・画面・E2E・文書。共通の変更は、並行開発の決まり 3-3 では小さな共通の PR に分けて先に入れる形なので、PR を出すときにユーザーに分けるかを確かめる（コミットを分けておく）。

## Complexity Tracking

| 決まりから外れること | 理由 | もっと単純な案を取らない理由 |
|---|---|---|
| 共通（土台・platform・組み立て・core の道）を領域の作業場所で直す | AD-24 が送る道具を `platform/notify` に置くと決め、設定は `kernel/config.ts` で読む決まり。紐づけの道は AD-14 の1か所に足す | 共通の PR を先に出すと、booking の確かめができない。コミットを分け、PR を出すときにユーザーに分けるかを確かめる |
| 環境の名前（`APP_ENV`）で偽の送り手を決める | AD-24 が「`local`・`test` は偽だけ」と決めている。判断は `kernel/config.ts` の1か所で、領域は `fakeOnly` だけを見る | 設定の値だけにすると、手元の `.env` の写し間違いで本物に送りうる |
