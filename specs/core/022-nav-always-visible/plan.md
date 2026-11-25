# Implementation Plan: サイドバーの項目を常に出す（core-022）

**Spec**: [spec.md](./spec.md)・[research.md](./research.md)

## 変えるファイル

| 場所 | 変更 |
|---|---|
| `apps/web/src/lib/feature.ts` | `NavItem` に `disabled?: { message: string }` を足す（共通・最小） |
| `apps/web/src/shell/current-nav.ts` | 薄い項目を「今の項目」の当たりから外す |
| `apps/web/src/shell/AppShell.tsx` | 薄い項目の描き方（`aria-disabled`・薄い見た目・補足・押すと `showNotice`）を、サイドバーとタブバー（「その他」の枠も）で同じに |
| `apps/web/src/features/event/last-event.ts`（新） | 直前に開いた交流会の記録（読む・書く・片付け）と、`registerLastEventReset` |
| `apps/web/src/features/event/nav-items.ts` | 外でも項目を出す（記録の行き先／記録がなければ薄く）。交流会の中で記録を書く |
| `apps/web/src/features/event/index.ts` | `registerLastEventReset()` を1度呼ぶ |
| `apps/web/src/features/match/last-table.ts`（新） | 直前に開いた試合表の記録（読む・書く） |
| `apps/web/src/features/match/nav-items.ts` | 試合表の中の画面すべてで項目を出す |
| `docs/apps/…`・`docs/README.md`・`docs/decisions.md` | 今の形と決めたこと |

データベース・API・約束（contracts）の変更はない。

## 順番

1. テストを先に書く（落ちることを確かめる）：`current-nav`・`AppShell`・`last-event`・event と match の `nav-items`
2. 型 → 外枠 → 記録 → 各領域のナビ
3. 手元：`format:check`・`typecheck`・`lint`・関わる範囲のテスト。DB が要る確かめ（`pnpm test` 全体・`db:check`・`e2e`）は CI

## 並行開発の決まりとの関係

共通のファイル（`lib/feature.ts`・`shell/`）の変更は、型への1項目と描き方に限る。領域の中身を共通に足さない。ほかの領域（booking・threads）のナビは変えない。
