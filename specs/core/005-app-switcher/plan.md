# Implementation Plan: アプリの切り替え・アプリの台帳・スイート全体の設定（core-005）

**Branch**: `feature/core-005-app-switcher` | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・[PRD](../../../_bmad-output/prd-kanaeru-suite/prd-kanaeru-suite.md)・構成の決めごと AD-15・AD-16・AD-19

## Summary

アプリの静的な一覧（contracts の `apps.list.ts`）と、suite の領域（台帳の表・見えるか・窓口・画面）を足す。組み立て（API の `app.ts`）が一覧から、アプリに属する領域のすべての道に `requireApp` を付ける。画面の組み立て（`router.tsx`）は、今の道のアプリを決め、ナビを今のアプリの項目に絞り、見えるアプリを外枠に渡す。外枠は切り替え（PC はメニュー・スマホは下から出す枠）と設定の入口を出す。account に退会の窓口を足す。

## Technical Context

**Language/Version**: TypeScript 6.0・Hono＋@hono/zod-openapi・React 19・TanStack Router/Query・Base UI（Menu・Dialog）。新しい依存はない

**Storage**: PostgreSQL の `app_setting`（suite）。DB の変更は `0008_suite.sql`（表と一意の索引と CHECK、受付アプリ＝公開の行）。ほかのブランチも 0008 を足すので、後に入る方が AD-17 の手順で作り直す

**Testing**: Vitest（約束の登録の決まり・suite の結合〈見える・台帳・requireApp〉・account の退会・外枠・組み立て・設定の項目の決め方・部品）・Playwright（両方の幅で axe と CSP）

**Constraints**: 外枠は lib だけを読む。外枠にアプリの名前を書かない。テストにアプリや領域の数を書かない。見た目は tokens.css の名前だけ

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 契約・売り方は作らない |
| II. 個人の情報は最小限 | 新しく集める情報はない。退会で本人の記録を消す（AD-7）。ほかの人の記録を持つ人は消さずに 409（AD-19） |
| III. 気軽さ | 受付アプリだけの間、参加者と受付係の画面は今のまま（切り替えを出さない） |
| IV. 小さく始める | PRD を先に作った。契約・AI の API キー・アプリの設定の項目は作らない |
| V. 運用費 | 部品・費用は増えない。要求ごとに台帳を1度引く（主キーの索引） |
| 技術の制約 | 共通の変更（app.ts・router.tsx・shell・lib・packages）は、この共通の PR に入れる。領域どうしは index.ts からだけ |

違反なし。

## 形

| 場所 | 中身 |
|---|---|
| `packages/contracts/src/core/`（土台） | `app-definition.ts`（`AppDefinition`・`defineApp`・`APP_ICONS`）・`apps.list.ts`（1行に1つ）・`apps.ts`（`listApps`・`appOfDomain`・`appRegistryProblems`・`unassignedDomains`・`COMMON_DOMAINS`・`RESERVED_APP_KEYS`） |
| `packages/contracts/src/suite/` | 公開の状態（`APP_VISIBILITIES`・言葉・`isVisibleTo`）と窓口の形 |
| `apps/api/src/modules/suite/` | `schema.ts`（`app_setting`）・`repository.ts`・`visibility.ts`（`isAppVisible`・`requireApp`・`readViewer`）・`routes.ts` |
| `apps/api/src/app.ts`（組み立て） | 一覧を確かめ（起動を止める）、アプリに属する領域の道ごとに `app.on(動き, 道, requireApp)` を先に置く。`extraApps`・名前つきの `extraModules`（テスト） |
| `apps/api/src/kernel/` | `DomainRouteDeps.apps`・`isForeignKeyViolation` |
| `apps/api/src/modules/account/` | `DELETE /api/v1/accounts/me`・`findSessionViewer` |
| `apps/api/src/server.ts`・`test/e2e-server.ts` | 立ち上げの手順を分け、E2E は見本のアプリを足して立ち上げる |
| `apps/web/src/lib/`（共通） | `apps.ts`（外枠の形・最後に使ったアプリ・開いたときの道）・`settings.ts`（設定の項目の形と決め方）・`icon.tsx`・`feature.ts`（`NavItem.group`・`WebFeature.settings`）・`router.ts`（`staticData.section`） |
| `apps/web/src/router.tsx`（組み立て） | 道 → 領域 → アプリ、ナビの絞りこみ、設定のナビ、`useShellApps`、はじめの画面 |
| `apps/web/src/shell/` | `AppSwitcher.tsx`・`AppShell.tsx`（切り替え・設定の入口・見出しつきのナビ・見えないアプリは見つからない画面・最後に使ったアプリ） |
| `apps/web/src/features/suite/` | すべてのアプリ・設定の一覧・アカウント・台帳 |
| `packages/ui` | `menu.tsx`・`sheet.tsx`・`ChoiceChips.labelHidden`・`--container-menu` |
