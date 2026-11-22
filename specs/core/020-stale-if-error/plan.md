# Implementation Plan: Cloud Run が落ちても案内を出す（core-020）

**Branch**: `feature/core-020-stale-if-error` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

## Summary

画面のもと（HTML）の `Cache-Control` を `stale-if-error` つきにし、画面の API の呼び出しが「アプリより前が返した 502・503・504」を「ただいま使えません」と読みかえる。費用は増えない（部品を足さない）。

## Research

- **R1. `stale-if-error`**（RFC 5861）：源が 5xx を返す・届かないとき、決めた秒数まで古いものを出してよい。Cloudflare はこれを守るが、`no-cache`・`must-revalidate` があると出さない。Always Online を入れると `stale-if-error` は効かない（Cloudflare の文書）。Always Online は URL を Internet Archive に渡すので入れない。
- **R2. Cloudflare は HTML を既定で覚えない**ので、公開のときに Cache Rule で `index.html` と画面の道を覚えさせる（バックログ C2）。`max-age=0` なので、ふだんは毎回 Cloud Run に確かめ、落ちたときだけ古いものを出す。`index.html` は誰が開いても同じ中身なので、覚えさせても他人のデータは出ない。
- **R3.** ブラウザ（Chrome など）は `stale-if-error` をほとんど使わない。効くのは Cloudflare を前に置いてから。
- **R4.** API が自分で返す 503（`DB_UNAVAILABLE`）はエラーの本文を持つ。Cloud Run が止まっているとき・混み合っているときの 502・503・504 は Google の入口や Cloudflare が返し、本文はエラーの形でない（HTML）。この違いで分ける。
- **R5.** `sw.js`（試合表のオフライン）は今のまま `no-cache`（古い Service Worker を持ち続けない）。

## Constitution Check

| 原則 | 確かめ |
|---|---|
| V. 運用費 | 部品も料金も増えない |

違反なし。
