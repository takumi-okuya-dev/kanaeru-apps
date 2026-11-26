# Implementation Plan: 試合の数を入れる・分け方を複数選ぶ・ミニゲームのチーム分け（match-009）

**Branch**: `feature/match-009-game-settings` | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。理由と仮決めは [research.md](./research.md)、中身の形は [data-model.md](./data-model.md)、窓口と QR と画面の取り決めは [contracts/](./contracts/)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

設定の時刻の3つの欄をやめて「試合の数」を置き、分け方を「レベル別（1つ）・分けない・ミニゲーム」の組み合わせにする。組の key は分け方をまたいで重ならないので、`plan`・`archive` は今の形のまま「レベル別の組 + `all`」の並びで持つ（R2）。ミニゲームはチーム分けだけを中身の `mini.teams` に持ち、組み方は画面の側の状態を持たない関数（R4）。前の形の中身は、約束が読むときに新しい形へ直す（R1。DB の変更なし）。試合表・見るだけのページ・大きく映す・印刷に分け方のタブとミニゲームの表を足し、見るだけのページの見込みをやめ、電波なしで渡す QR を `KM2.` にする。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: React 19・TanStack Router/Query・zod・fast-check。新しい依存はない

**Storage**: なし（DB の変更なし。`match_table.content` の JSON の形を変え、前の形は読むときに直す）

**Testing**: Vitest（約束の `table.test.ts`・`public.test.ts`、組み方の `plan`・`regroup.test.ts`・`day-of.test.ts`、新しい `mini-game.test.ts`〈property-based〉、`handoff.test.ts`〈KM1 と KM2〉、`print-layout.test.ts`、端末の写しを直す `offline/store` の試験、窓口の `routes.test.ts`・`routes-share.test.ts`）・Playwright（`e2e/tests/match.spec.ts` などの設定の欄を直し、レベル別と分けないの両方・ミニゲームの流れを足す。1440px と 375px・axe・CSP）

**Constraints**: 試合表の道は LIFF を始めない。共通のファイルは触らない（match の領域・約束の match・e2e の match の試験・docs/apps/match.md・PRD だけ）。見るだけのページ・QR にレベルを出さない（AD-26）。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 足したのはチーム分け（名簿の人の ID の並び）とコート数だけ。氏名は持たない。見るだけのページ・QR はチームの呼び名だけ |
| III. 気軽さ（電波がなくても） | チーム分けは端末の中の計算。電波なしで渡す QR にも入れる |
| IV. 小さく始める | 持ち主の頼んだ範囲だけ（チームの中の順・対戦の回し方は作らない）。PRD を同じ PR で直す（R9） |
| V. 運用費ゼロに近く | サーバーの仕事は増えない |
| 技術の制約 | 画面は `@workspace/ui` の部品と tokens.css の名前。大きく映す・印刷の大きな字は今と同じく SVG の単位 |

違反なし（設計のあとも同じ）。

## Project Structure

```text
packages/contracts/src/match/
├─ table.ts            MatchSettings（新しい形・前の形を直す）・MatchMini・MatchTableContent（mini・組の確かめ）・INITIAL_CONTENT
├─ options.ts          MINI_COURTS_MAX・LEVEL_POINTS・分け方の言葉
└─ public.ts           MatchView（minutesPerGame を外し teams を足す）
apps/api/src/modules/match/
└─ share-repository.ts readView（組の並び・チーム）
apps/web/src/features/match/
├─ plan.ts             groupsOf（レベル別 + all）・gameCountFor・分け方ごとの進んだ数・rebuild（plan と mini）
├─ mini-game.ts        planTeams・teamsReport（新しい）
├─ regroup.ts          changeSettings（分け方の足し外し・ミニゲーム）
├─ SetTabs.tsx         分け方のタブ（新しい）
├─ MiniTeams.tsx       コートとチームの表（新しい）
├─ BoardPage.tsx・BigPage.tsx・ViewPage.tsx・PrintPage.tsx・DayOfDialogs.tsx・RosterPage.tsx
├─ handoff.ts          KM2（チーム）・KM1 も読む
├─ print-layout.ts     layoutTeamsSheet
├─ offline/store.ts    端末の写しを読むときに直す
└─ view-estimate.ts    消す
```
