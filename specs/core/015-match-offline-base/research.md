# Research: 試合表の道だけの Service Worker の組み立てと、カメラの許可（core-015）

2026-11-22 作成。答える人がいないため、構成の決めごと AD-27・AD-28・AD-30 と PRD 試合表アプリ 4.6・FR-M29 から AI が決めた。**【仮決め】はどれも主催者の確かめを待つ。**

## R1. 手で書いた本文＋小さな plugin（外の plugin を入れない）【仮決め】

- 候補：vite-plugin-pwa（Workbox）・手で書いた本文。
- vite-plugin-pwa は、既定でアプリ全体に効く形（範囲・登録・マニフェスト）を作り、Workbox の実行の部品を足す。範囲を `/match/` に絞る・API の答えを持たない・止め方（AD-27）を、設定で打ち消して作ることになり、依存とふるまいが大きい。
- そこで、本文は試合表の領域が手で書き（import を書かないふつうの JS）、組み立ての plugin（約100行）は「持つファイルの一覧と版の印を埋めて書き出す」だけにした。業務を知らない技術の道具なので、組み立て（`apps/web`）の直下に置く。
- 書き出す先が `match/sw.js` なので、範囲の上限は `/match/`（Service Worker の決まり。`Service-Worker-Allowed` の見出しを出さないので広がらない）。API の `serveWeb` がそのまま返す（`Cache-Control: no-cache`。ブラウザが更新を確かめられる）。

## R2. 持つのは入口と試合表の画面の束だけ

- 組み立ての束の図（`imports`・`dynamicImports`）をたどる：入口の束からは静かな読み込みだけ、試合表の領域のモジュールを含む開いたときに読む束からは、開いたときに読む束もたどる（QR を読む道具 jsQR など）。CSS も持つ。
- 入口の束は全部の道の組み立てを含むので持つ（試合表の道を描くのに要る）。LINE の SDK（開いたときに読む束）は持たない（試合表の道は LIFF を始めない。core-013）。
- 版の印は、持つファイルの名前（中身の印つき）・本文・index.html の SHA-256 の頭12文字。画面を組み直せば変わる。

## R3. カメラは試合表の道だけ許す【仮決め】

- 今の Permissions-Policy は全部の道で `camera=()`。これだと試合表の画面でカメラを開けない（AD-30・FR-M23 の「カメラで読む」）。
- 全部の道で許すと、ほかのアプリの画面（参加者の道を含む）にも許すことになるので、試合表の道（`/match`・`/match/…`。LIFF を始めない道と同じ比べ方）だけ `camera=(self)` にした。マイク・位置は止めたまま。CSP は変えない（カメラの映像は `srcObject` で渡し、写真は `createImageBitmap` で読むので、`blob:` を許さなくてよい）。
- 開発のサーバーと vite preview も同じにした（`server.headers` のあとで書かれても試合表の道では許す値のまま）。

## R4. QR を読む道具は BarcodeDetector → jsQR【仮決め】

- BarcodeDetector は Android の Chrome と macOS の Chrome・Safari（17 から）にあるが、iPhone の Safari と Windows の Chrome にはないことがある（要確認：実機）。ないときの道具の候補：jsQR（依存なし・JS だけ・約 250KB〈min 前〉・Apache-2.0・1.4.0 は 2021 年で止まっているが QR の読み方は変わらない）・ZXing（大きい）・WebAssembly のもの（CSP に `wasm-unsafe-eval` が要る）。
- jsQR を選び、使うときだけ開いたときに読む（ほかのアプリの束を重くしない）。`eval`・`new Function` を使わないので、今の CSP のまま動く。
- 依存を足すと lockfile が変わるので、この共通の PR に入れた（使うのは match-005）。

## R5. E2E の機能の印

- `match.offline`（AD-27 の止め方）を E2E の設定で入にする。この PR では読むものがない（match-005 の画面と窓口が読む）。E2E の設定は共通のファイルなので、ここに入れた。
