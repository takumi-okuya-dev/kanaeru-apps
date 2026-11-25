# Implementation Plan: 見るだけのページ・入口の QR・QR で受け付ける（match-004）

**Branch**: `feature/match-004-view-and-join` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。理由と仮決めは [research.md](./research.md)、窓口は [contracts/match.md](./contracts/match.md)、列の使い方は [data-model.md](./data-model.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。

## Summary

ログインなしの見るだけのページと受付のページ（窓口と画面）、運営の「見るだけのページ」「QR で受け付ける」（M7）、印刷の版の QR と入口に貼る1枚を足す。札は 192ビットの乱数で DB は SHA-256 だけ。受付は `match_join` に足し、担当の端末が名簿に入れる。

## Technical Context

**Language/Version**: TypeScript 6.0・Node.js 26

**Primary Dependencies**: Hono・@hono/zod-openapi・zod 4・Drizzle・React 19・TanStack Router/Query・`uqr`（すでに event・suite が使う依存。新しい依存はない）

**Storage**: PostgreSQL（DB の変更なし）。運営の端末の札・参加者の自分の名前と最後に読んだ表は localStorage

**Testing**: Vitest（`routes-share.test.ts`〈本物の PostgreSQL〉・`public.test.ts`・`joins.test.ts`）・Playwright（ログインなしの別のブラウザで見る・受け付ける。1440px と 375px・axe・CSP）

**Constraints**: ログインなしの道は札の SHA-256 で引き、期限切れ・締めた・ない札は同じ 404。レベル・氏名・名簿の人の ID を返さない。共通のファイルは触らない（GET の回数の制限は共通の PR で。research R6）。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 受付で受けるのは呼び名とレベルだけ（strict）。見るだけのページは呼び名と組み合わせと進み具合だけ。札は SHA-256 だけを持ち、その日の終わりで切れる。検索に出さない |
| III. 気軽さ | 参加者はログインもアプリも要らない（1.3.0 の例外の範囲：見るだけ・受付のページ） |
| IV. 小さく始める | PRD 7.1 の4番だけ。ネットなし・カメラで読む形は作らない |
| V. 運用費ゼロに近く | 読み直しは30秒おきの版の番号だけ。定期の仕事なし |
| 技術の制約 | 境界は index.ts。画面は `@workspace/ui` の部品と tokens.css の名前（QR と印刷の版は SVG の単位） |

違反なし。
