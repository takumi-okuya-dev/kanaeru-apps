# Implementation Plan: 名簿・組み方・試合表・印刷（match-002）

**Branch**: `feature/match-002-pr2-roster` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。理由と仮決めは [research.md](./research.md)、中身の形は [data-model.md](./data-model.md)、窓口は [contracts/match.md](./contracts/match.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

試合表の窓口（一覧・作る・読む・直す・担当の端末・消す・入れられる組織）と、権限の1つの関数・90日の片付け・退会の手順を足す。画面は一覧・作る・名簿と設定（貼り付け・CSV・1人足す・呼び名・レベル・当日の印・設定）・試合表（組のタブ・名前だけの行・チェック）・印刷（組ごとに1枚・紙と向き・字の大きさを自動で合わせる SVG）。組み方は addendum の1〜2章を画面の側の状態を持たない関数にし、docstring に説明を書き、fast-check で確かめる。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: Hono・@hono/zod-openapi・zod 4・Drizzle 0.45・React 19・TanStack Router/Query・`apps/web/src/lib/csv-read.ts`（core-014）。新しい依存は `fast-check`（`apps/web` の devDependencies。テストだけ）

**Storage**: PostgreSQL（DB の変更なし。match-001 の表を使う）

**Testing**: Vitest（約束の単体・API の結合〈本物の PostgreSQL〉・組み方の property-based・名簿の読み方・印刷の大きさ）・Playwright（`e2e/tests/match.spec.ts`。1440px と 375px・axe・CSP・横のスクロール）

**Constraints**: 試合表の道は LIFF を始めない（`getLiff()`・`SessionGate` を使わない）。サーバーは中身を計算し直さない（AD-28）。氏名をサーバーに送らない。共通のファイルは触らない（1行の一覧は match-001 で足した）。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関わらない |
| II. 個人の情報は最小限 | 貼った表と CSV は画面の中で読み、氏名・レベル・タイムスタンプだけを使う。サーバーに送るのは呼び名・レベル・当日の印（中身の形が strict で氏名の欄を受けない）。氏名は画面を開いている間だけ。呼び名をログに出さない。90日で消す |
| III. 気軽さ | 組み方は端末の中で計算する（電波がなくても組める形の土台。保存はネットなしの段で端末に残す） |
| IV. 小さく始める | PRD 7.1 の2番だけ。当日の組み直し・見るだけ・QR・ネットなしは作らない |
| V. 運用費ゼロに近く | 定期の仕事を足さない（90日は一覧を開いたとき） |
| 技術の制約 | 境界は index.ts（account・suite）。画面は `@workspace/ui` の部品と tokens.css の名前だけ（印刷の版の mm は紙の大きさで、画面の値ではない） |

違反なし。
