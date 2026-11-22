# Implementation Plan: ネットなしで開く・端末に残して送る・電波なしで渡す QR（match-005）

**Branch**: `feature/match-005-offline` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)。理由と仮決めは [research.md](./research.md)、手で確かめる手順は [quickstart.md](./quickstart.md)。共通の土台は [core-015](../../core/015-match-offline-base/plan.md)。

## Summary

試合表の道だけの Service Worker（core-015 の組み立てで書き出す本文）を、機能の印 `match.offline` で入れる・外す。担当の端末は試合表の中身と送っていない変更を IndexedDB に持ち、古い順に送る（409 は止めて残す）。見るだけのページは見込みの今の試合を出し、運営の QR を読んで新しい版を取り込む。参加者の受付の QR を運営の M7 で読む。

## Technical Context

**Language/Version**: TypeScript 6.0・React 19・Vite 8

**Primary Dependencies**: TanStack Router/Query・`uqr`（QR を作る）・`jsqr`（QR を読む。core-015 で足した）。新しい依存はない

**Storage**: IndexedDB（運営の端末の試合表と送っていない変更）・localStorage（見るだけのページの最後に読んだ表・端末の ID）・Cache Storage（Service Worker の画面のファイル）。DB の変更なし

**Testing**: Vitest（`offline/outbox.test.ts`・`handoff.test.ts`・`view-estimate.test.ts`・`routes-share.test.ts`）・Playwright（`match-offline.spec.ts`。`setOffline`・両方の幅・axe・CSP）

**Constraints**: Service Worker の範囲は `/match/` だけ・API の答えを持たない・CSP を変えない・共通のファイルは core-015 に分ける

## Constitution Check

| 原則 | 確かめ |
|---|---|
| II. 個人の情報は最小限 | 端末に置くのは呼び名とレベル（氏名なし）。QR に入れるのは呼び名と組み合わせと進み具合と版（レベルなし）・受付の QR は呼び名とレベルだけ。カメラの映像・写真は送らない・残さない |
| III. 電波がなくても動く | この段の目的。1度開けば、開く・直す・渡す・受け付けるが電波なしでできる |
| IV. 小さく始める | 外の PWA の道具を入れず、手で書いた本文。マニフェストは置かない |
| V. 運用費 | サーバーの仕事は増えない（機能の印を読む小さな窓口だけ） |
| 技術の制約 | 共通のファイル（組み立て・守りの見出し・依存・E2E の設定）は core-015 に分けた。領域の境界は index.ts のまま |

違反なし。

## 形

| 場所 | 中身 |
|---|---|
| `apps/web/src/features/match/offline/sw.js` | Service Worker の本文 |
| `offline/register.ts`・`offline/start.ts`・`offline/UpdatePrompt.tsx` | 入れ方・外し方・新しい版の知らせ（試合表のどの道も `beforeLoad`） |
| `offline/store.ts`・`offline/outbox.ts`・`offline/table-sync.ts`・`offline/table-list.ts` | IndexedDB・送りの列・読み方（端末の中身に切りかえる） |
| `table-editor.ts`・`queries.ts`・`TableFrame.tsx`・`device.ts` | 送りの列を使う・電波がないときの文・止めたときの選び方・端末の ID を IndexedDB に写す |
| `handoff.ts`・`qr-decode.ts`・`QrScanner.tsx`・`HandoffDialog.tsx`・`JoinQrReader.tsx` | QR の中身・読む道具・M4・M7 の読む部分 |
| `ViewPage.tsx`・`view-estimate.ts`・`JoinPage.tsx`・`BoardPage.tsx`・`ListPage.tsx`・`BigPage.tsx` | 画面 |
| `apps/api/src/modules/match/routes-share.ts`・`packages/contracts/src/match/public.ts` | `GET /api/v1/match/offline`・`MatchOfflineSetting` |
| `docs/study/service-worker.md`・`property-based-testing.md` | 学び（AD-27） |
