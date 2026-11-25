# Quickstart: ネットなしで開く・端末に残して送る・電波なしで渡す QR（match-005）

手で確かめる手順。Service Worker は組み立てた画面だけで動くので、`pnpm dev` ではなく、組み立てて API に画面を返させる。

## 手元（Chrome）

1. `.env` の `DOMAIN_FEATURES` に `match.offline` を足す。`WEB_DIST_DIR` を `apps/web/dist` に向ける。
2. `pnpm --filter web build` → API を立ち上げる（画面も API が返す）。
3. 運営としてログインし、試合表を作って名簿を入れ、試合表を作る。「見るだけのページ」でリンクを作る。
4. 開発者ツールの Application › Service Workers に `/match/` の範囲で入っていること、Cache Storage に `kanaeru-match-…` があることを見る。`/apps` を開くと、受け持たれていないこと。
5. Network を「Offline」にして試合表の画面を読み直す → 開ける。チェックを付ける → 「電波なし・HH:MM に保存（つながったら送ります）」。IndexedDB `kanaeru-match` の `changes` に変更が入る。
6. 「Offline」を外す → 送られ、「この端末（端末 XXXX）が担当です」に戻る。
7. 「電波なしで渡す」で QR を出す。別のブラウザ（見るだけのページを1度開いたもの）を「Offline」にして見るだけのページを開き、「QR を読む」でカメラか写真から読む → 新しい版が入る。
8. 受付のページを開いてから「Offline」にし、受付する → QR が出る。運営の M7 の「参加者の QR を読む」で読む → 名簿に入る。
9. `DOMAIN_FEATURES` から `match.offline` を外して立ち上げ直し、試合表の道を開く → Service Worker が外れ、Cache Storage が消える。

## 実機（research R15）

- iPhone の Safari・Android の Chrome で、試合表の中の画面（`/match/tables/…`）をホーム画面に置き、機内モードで開く・直す・つながって送る。
- 両方で、カメラから試合表の QR（つづきの QR を含む）と受付の QR を読む。
- 数日あけて、端末の中身（IndexedDB）が残るかを見る。
