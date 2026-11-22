# Implementation Plan: Cloud Run が落ちても案内を出す（core-020）

**Branch**: `feature/core-020-stale-if-error` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

## Summary

画面のもと（HTML）に Cloudflare だけが読む `stale-if-error` を付け（ブラウザ向けは `no-cache` のまま）、画面の API の呼び出しが「アプリより前が返した 5xx と 429」を「ただいま使えません」と読みかえる。古い画面が部品を読めなければ1回読み直す。費用は増えない（部品を足さない）。

## Research

- **R1. `stale-if-error`**（RFC 5861）：源が 5xx を返す・届かないとき、決めた秒数まで古いものを出してよい。Cloudflare はこれを守るが、`no-cache`・`must-revalidate` があると出さない。Always Online を入れると `stale-if-error` は効かない（Cloudflare の文書）。Always Online は URL を Internet Archive に渡すので入れない。
- **R2. Cloudflare は HTML を既定で覚えない**ので、公開のときに Cache Rule で `index.html` と画面の道を覚えさせる（バックログ C2）。`max-age=0` なので、ふだんは毎回 Cloud Run に確かめ、落ちたときだけ古いものを出す。`index.html` は誰が開いても同じ中身なので、覚えさせても他人のデータは出ない。
- **R3.** ブラウザ（Chrome など）は `stale-if-error` をほとんど使わない。効くのは Cloudflare を前に置いてから。
- **R3a. ブラウザ向けと Cloudflare 向けを分ける**：Cloudflare の Browser Cache TTL（既定4時間）は、源の `max-age` がそれより短いと長く書きかえる。`Cache-Control: max-age=0` だと、デプロイのあとも古い画面を最大4時間持ち続け、新しい版にない部品を探して真っ白になる。そこでブラウザ向けは `no-cache` のまま、Cloudflare 向けは `Cloudflare-CDN-Cache-Control`（Cloudflare が読んで外す。Browser Cache TTL は書きかえない）に書く。`public` も付けないので、ほかの共有のキャッシュが古い画面を出すこともない。Cache Rule の Edge TTL は「Use cache-control header if present」にする（バックログ C2）。
- **R3b. 古い画面が出るのは、落ちたときだけでない**：Cloudflare は源の 500・502・503・504 のどれでも前のものを出すので、版の切り替えの一瞬の 503 でも前の画面が出ることがある。前の画面が新しい版にない部品（とくに後から読む部品）を読みにいくと失敗するので、Vite の `vite:preloadError` で1回だけ読み直す。
- **R4.** API が自分で返すエラー（503 `DB_UNAVAILABLE` など。`app.onError` を含む）はいつもエラーの本文を持つ。Cloud Run が止まっているとき・混み合っているとき（502〜504・台が足りない 429）と、Cloudflare の 520〜530 は、本文がエラーの形でない（HTML・文字だけ）。この違いで分ける。
- **R6. 残り**：試合表の Service Worker（`apps/web/src/features/match/offline/sw.js`）は、入れるとき（install）に `/match/` を取り直すが、Cloudflare が前の画面を出しているあいだは、前の画面を覚えてしまうことがある（読み直し〈`refreshShell`〉は部品がそろっているかを確かめているが、install は確かめていない）。match の領域の直しなので、別の PR で行う（バックログ C2 と同じ時期・Cloudflare を前に置く前）。
- **R5.** `sw.js`（試合表のオフライン）は今のまま `no-cache`（古い Service Worker を持ち続けない）。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| V. 運用費 | 部品も料金も増えない |

違反なし。
