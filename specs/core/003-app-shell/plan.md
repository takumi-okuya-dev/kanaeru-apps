# Implementation Plan: 外枠のナビ（core-003）

**Branch**: `feature/core-003-app-shell` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。決めた理由と仮決めは [research.md](./research.md)。

## Summary

外枠（`apps/web/src/shell/AppShell.tsx`）を、道ごとの形（管理・ナビなし）で描き分ける。管理の形は、PC で開閉できるサイドバー（帯の「メニュー」ボタン・localStorage に覚える）と、スマホで下の段にいつも出るタブバー（帯と本文だけがスクロールする）。項目は領域が出す（event が交流会の中の項目を役目つきで出す）。各画面の上の `EventAdminNav` は消す。あわせて A3 の表の名前の列を折り返さない（reception-001 の直し。別のコミット）。

## Technical Context

**Language/Version**: TypeScript 6.0・React 19・TanStack Router/Query。新しい依存はない

**Storage**: なし（サイドバーの開閉だけブラウザの localStorage）

**Testing**: Vitest（外枠・組み立て・event の項目のフックの単体）・Playwright（両方の幅で axe・開閉が残る・タブバーの項目・参加者の画面にナビがない）

**Target Platform**: PC のブラウザと、LINE の中の LIFF ブラウザ

**Constraints**: 見た目の値は tokens.css の名前だけ。外枠は lib だけを読む（境界の決まり）。道が変わったら h1 にフォーカスを移す振る舞いを変えない。印刷では帯とナビを出さない。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 覚えるのはサイドバーの開閉だけ。参加者の画面に管理の入口を出さない |
| III. 気軽さ | 参加者の画面は帯とページだけ。スマホの管理の画面は片手で行き来できる |
| IV. 小さく始める | 依存・API・DB を足さない。項目の部品集やアイコンの部品集を足さない |
| 技術の制約 | 共通（shell・lib・router）と領域（event・reception・survey・account の道の値と画面の上のタブ）のコミットを分ける。領域どうしは index.ts からだけ |

違反なし。

## 形

| 場所 | 中身 |
|---|---|
| `apps/web/src/lib/feature.ts`（共通） | `NavIcon`・`NavItem`（`id`・`label`・`to`・`icon`・`also?`）。`WebFeature.nav` に `icon`、任意の `useNavItems` |
| `apps/web/src/lib/router.ts`（共通） | `ShellLayout = "admin" \| "bare"` と `StaticDataRouteOption.layout` |
| `apps/web/src/shell/AppShell.tsx`（共通） | 形の描き分け・帯（メニューのボタン）・サイドバー・タブバー・今の項目の決め方・h1 へのフォーカス（今のまま） |
| `apps/web/src/shell/NavIcon.tsx`・`sidebar-state.ts`・`current-nav.ts`（共通） | アイコン・開閉の覚え方・今の項目 |
| `apps/web/src/router.tsx`（組み立て） | `useNavItems`（領域の項目を並べたフック）を外枠に渡す |
| `apps/web/src/styles.css`・`index.html`（共通） | `pb-safe`・`px-safe`・`viewport-fit=cover` |
| event（領域） | `nav-items.ts`（`useEventNavItems`）・`admin-tabs.ts` に `icon`・`index.ts`・`EventAdminNav` を消す・招待の道を `bare` |
| reception・survey・account（領域） | 参加者の道（と `/dev/login`）を `bare`・画面の上の `EventAdminNav` を消す |
| 文書（共通） | `docs/rules/coding.md` 6-3・6-6・`docs/architecture.md` 6・EXPERIENCE.md・DESIGN.md。領域の地図は領域のコミット |

## Phase 1 の点検

- 道が変わったときのフォーカスは `<main>` の中の h1 を探す今の仕組みのまま。ナビは `<main>` の外。
- サイドバーとタブバーは、両方とも `<nav aria-label="メイン">`。どちらか一方だけが見える（CSS で隠す）。DOM の順は、サイドバーが本文の前、タブバーが本文の後（見た目の順と同じ）。
