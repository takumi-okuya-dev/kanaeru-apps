# Feature Specification: 試合表の道だけの Service Worker の組み立てと、カメラの許可（core-015）

**Feature Branch**: `feature/core-015-match-offline-base`。`feature/match-004-view-and-join` の上に積み、`feature/match-005-offline` の下に入れる

**Created**: 2026-11-22

**Status**: Draft（主催者の不在中に AI が作った。【仮決め】は主催者の確かめを待つ）

**Input**: 構成の決めごと AD-27（ネットなしで開く仕組みは試合表の道だけに効かせる・止め方）・AD-28（電波なしで渡す QR）・AD-30（受付の QR を運営のカメラで読む）と、[PRD 試合表アプリ](../../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md) 4.6（FR-M22〜M24）・FR-M29。試合表の領域の match-005（ネットなしで開く・端末に残して送る・QR で渡す）が要る共通の変更だけを、領域の PR に混ぜず、小さな共通の PR で先に入れる（[並行開発の決まり](../../../docs/rules/parallel-development.md) 3-3）。

## Clarifications

### Session 2026-11-22

主催者は不在。対話の clarify は飛ばし、AD-27・AD-30 に従った。決めていないところは、いちばん狭く安全な形を AI が選んだ（【仮決め】。理由は [research.md](./research.md)）。

- Q: Service Worker をどう作るか → A: 手で書いた小さな本文（試合表の領域の `features/match/offline/sw.js`）に、組み立ての plugin が持つファイルの一覧と版の印を埋めて `match/sw.js` に書き出す。外の plugin（vite-plugin-pwa など）は入れない【仮決め】（R1）
- Q: 何を持つか → A: 画面の外枠（index.html）・入口の束とその静かな読み込み・試合表の画面の束とその読み込み・CSS。ほかのアプリの画面の束は持たない（AD-27）（R2）
- Q: カメラ → A: Permissions-Policy を試合表の道（`/match`・`/match/…`）だけ `camera=(self)` にし、ほかの道は今までどおり止める【仮決め】（R3）
- Q: QR を読む道具 → A: ブラウザの BarcodeDetector を先に使い、ないブラウザでは jsQR（Apache-2.0・依存なし・`eval` なし）を開いたときに読む。依存を足すので、この共通の PR に入れる【仮決め】（R4）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 試合表の道だけの Service Worker を組み立てる (Priority: P1)

組み立て（`vite build`）は `dist/match/sw.js` を書き出す。範囲の上限は置いたフォルダの `/match/` なので、受付アプリなどほかのアプリの道には効かない。この PR の本文は自分を外すだけの形で、画面からはまだ入れない（match-005 で本文と入れ方を足す）。

**Acceptance Scenarios**:

1. **Given** `vite build`, **Then** `dist/match/sw.js` ができ、持つ道の並びに index.html と試合表の画面の束が入り、ほかのアプリの画面の束（例：event の画面）は入らない
2. **Given** 本文に埋める印がない・2つある, **Then** 組み立てが止まる
3. **Given** 画面の束が変わる, **Then** 版の印が変わる

### User Story 2 - 試合表の道だけでカメラを使える (Priority: P1)

運営のタブレットと参加者のスマホが、試合表の道で QR をカメラで読めるよう、試合表の道だけカメラを許す。ほかの道は止めたまま。

**Acceptance Scenarios**:

1. **Given** `/match`・`/match/…` の画面, **Then** `Permissions-Policy: camera=(self), microphone=(), geolocation=()`
2. **Given** ほかの道（`/`・`/matchfoo`・`/apps`・参加者の道）と `/api`, **Then** `camera=()` のまま

## Requirements *(mandatory)*

- **FR-001**: 組み立ての plugin（`apps/web/scoped-service-worker.ts`）：持つファイルの選び方・印の埋め方・版の印。単体のテスト。
- **FR-002**: `apps/web/vite.config.ts` で試合表の Service Worker を書き出し、開発のサーバーと vite preview も試合表の道だけカメラを許す。
- **FR-003**: `apps/api/src/platform/web/web.ts` の Permissions-Policy を道で分ける（`CAMERA_PATH_PREFIXES`・`allowsCamera`）。結合のテスト。
- **FR-004**: `jsqr` を画面の依存に足す（lockfile が変わる）。
- **FR-005**: E2E の設定で `match.offline` を入にする（match-005 の通しのテストが使う。この PR では効くものがない）。
- **FR-006**: 文書：`docs/architecture.md`・`docs/rules/coding.md` 6-3。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` が通る（ほかのアプリの画面とテストは変わらない。CSP は変えない）。
