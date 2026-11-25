# Implementation Plan: 試合表の道は LIFF を始めずに開く（core-013）

**Branch**: `feature/core-013-start-without-liff` | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md)・構成の決めごと AD-4（例外：LIFF を始めない道）・AD-26・AD-27

## Summary

`apps/web/src/lib/liff.ts` に、開いた道で LIFF を始めるかの決め方（`needsLiff`）と、組み立てが呼ぶ始め方（`startLiffFor`）と、読み直しの判定（`mustReloadForLiff`）を足す。`main.tsx` は `initLiff()` の代わりに `startLiffFor(location.pathname)` を待ち、「failed」のときだけ今までどおり「読みこめない」を出す。道の根（`lib/router.ts`）の `beforeLoad` で、LIFF を始めずに開いたあとに LIFF の要る道へ移るとき、同じ URL でページを読み直す。

## Technical Context

**Language/Version**: TypeScript 6.0・React 19・TanStack Router（`redirect` の `reloadDocument`）。新しい依存はない

**Storage**: なし（DB の変更なし）

**Testing**: Vitest（`lib/liff.test.ts`：道ごとの決め方・LIFF を始められないときの「failed」と「skipped」・SDK を読まないこと・読み直しの判定）・Playwright（`e2e/tests/start-without-liff.spec.ts`：両方の幅。試合表の道はルーターが描く・そこからほかの道へ移ると読み直す・ほかの道どうしは読み直さない・CSP の違反なし）

**Constraints**: LINE（`@line/liff`）を読むのは `lib/liff.ts` だけ（AD-4）。ほかの道のふるまいを変えない。テストに領域やアプリの数を書かない

## Constitution Check

| 原則 | 確かめ |
|---|---|
| I. お金を預からない | 関わらない |
| II. 個人の情報は最小限 | 集める情報は増えない。試合表の道では LINE の SDK も読まない |
| III. 気軽さ | 参加者は LINE なしで見るだけ・受付のページを開ける（Constitution 1.3.0 の例外・AD-26・AD-30）。ほかの道は今のまま |
| IV. 小さく始める | 試合表のログインの流れ（Open Questions 11）は作らず、決め方と読み直しだけにした |
| V. 運用費 | 費用は増えない |
| 技術の制約 | 組み立て（`main.tsx`）と共通（`lib/liff.ts`・`lib/router.ts`）の変更なので、領域の PR に混ぜず、この共通の PR で先に入れる（並行開発の決まり 3-3） |

違反なし。

## 形

| 場所 | 中身 |
|---|---|
| `apps/web/src/lib/liff.ts`（共通） | `PATH_PREFIXES_WITHOUT_LIFF`（`["/match"]`）・`needsLiff(pathname)`・`startLiffFor(pathname, options)`（"started"・"skipped"・"failed"）・`mustReloadForLiff(pathname)`。始めずに開いたときの `getLiff()` は理由の文で投げる。`resetLiffForTest` が始めなかった印も戻す |
| `apps/web/src/main.tsx`（組み立て） | `startLiffFor(window.location.pathname)` を待つ。"failed" なら「読みこめない」、ほかはルーターを作る |
| `apps/web/src/lib/router.ts`（共通。道の根） | 根の道の `beforeLoad`（`rootRoute.update` は `beforeLoad` を受け取らないので、根を作る所に書く）：`mustReloadForLiff(location.pathname)` なら `redirect({ href: location.href, reloadDocument: true, replace: true })` |
| `docs/architecture.md`（今の形） | 画面の入口の説明に、試合表の道の例外と読み直しを足す |
| `docs/rules/coding.md` 6-3（決まり） | 試合表の道で `getLiff()` を読む部品を使わない・LIFF を始めない道を足すときは共通の PR |

## 契約・データ

API・約束（`packages/contracts`）・DB は変えない（`contracts/`・`data-model.md` は作らない）。
