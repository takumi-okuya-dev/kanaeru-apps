# Feature Specification: 試合表の道は LIFF を始めずに開く（core-013）

**Feature Branch**: `feature/core-013-start-without-liff`

**Created**: 2026-11-22

**Status**: Draft（主催者の不在中に AI が作った。【仮決め】は主催者の確かめを待つ）

**Input**: 構成の決めごと AD-4 の改定（2026-11-22。「例外：LIFF を始めない道」）と AD-26・AD-27。試合表アプリ（[PRD](../../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md) 6章）の見るだけのページ（`/match/view/…`）と受付のページ（`/match/join/…`）はふつうのブラウザでログインなしに開き、運営の画面は電波のない体育館でも開く。今の画面の入口（`apps/web/src/main.tsx`）は `liff.init()` を待ってからルーターを作り、失敗すると「読みこめませんでした」になるので、ネットなしでは開けない。組み立て（`main.tsx`・`lib/liff.ts`）を直すので、試合表の領域の PR より先に、小さな共通の PR で入れる（[並行開発の決まり](../../../docs/rules/parallel-development.md) 3-3）。

## Clarifications

### Session 2026-11-22

主催者は不在。対話の clarify は飛ばし、AD-4 の本文に従った。本文が決めていないところは、いちばん狭く安全な形を AI が選んだ（【仮決め】。理由は [research.md](./research.md)）。

- Q: どの道で LIFF を始めないか → A: 試合表の道すべて（`/match` と `/match/…`。見るだけ・受付・運営）。AD-4 の本文のとおり（R1）
- Q: 電波の有無で変えるか（つながっていれば運営の画面だけ LIFF を始めるか） → A: 変えない。開いた道だけで決める【仮決め】（R1）
- Q: 何で決めるか → A: 開いたときの `location.pathname` だけ。大文字と小文字は分け、`/matches` のような似た道は今までどおり始める【仮決め】（R2）
- Q: LIFF を始めずに開いたあと、LIFF の要る道（受付アプリなど）へ画面の中で移るとき → A: 同じ URL でページを読み直し、組み立てがそこで LIFF を始める【仮決め】（R3）
- Q: LIFF を始めずに開いた道で `getLiff()` を呼んだら → A: 理由の文つきで投げる。試合表の運営のログイン（期限切れのとき。AD-4 の【仮決め】の外のブラウザ向けのログイン・Open Questions 11）は、この PR では作らない【仮決め】（R4）
- Q: E2E の試合表の道 → A: 置く道を足さない。見つからない画面（ルーターが描く）で確かめる【仮決め】（R5）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 参加者が、見るだけ・受付のページを LINE なしで開く (Priority: P1)

参加者は、体育館に貼った QR をスマホのカメラで読み、ふつうのブラウザで試合表の見るだけのページ（`/match/view/{viewToken}`）や受付のページ（`/match/join/{joinToken}`）を開く。画面は LINE（LIFF）を始めずに描かれる。LINE の SDK を読まず、LINE のサーバーとの往復もない。

**Independent Test**: LIFF を始められない状態で `/match/view/…`・`/match/join/…` を開き、「読みこめませんでした」にならず、ルーターが画面を描くことを確かめる。

**Acceptance Scenarios**:

1. **Given** LIFF を始められない（SDK を読めない・`liff.init()` が失敗する）, **When** `/match/view/…` を開く, **Then** SDK を読まずに、ルーターが画面を描く
2. **Given** 同じ, **When** `/match/join/…` を開く, **Then** 同じ
3. **Given** 試合表の道はまだない（この PR の時点）, **When** 開く, **Then** 外枠の中に「ページが見つかりません」（ルーターが動いた印）

---

### User Story 2 - 運営が、電波のない体育館で試合表の画面を開く (Priority: P1)

運営の端末（ホーム画面に置いたふつうのブラウザ）は、電波がなくても試合表の運営の画面（`/match/…`）を開ける。LIFF を始めないので、LINE に届かなくても止まらない。ログインは前のセッションのクッキーをそのまま使い、つながってから API が確かめる（AD-4）。

**Independent Test**: LIFF を始められない状態で `/match/…` を開き、ルーターが画面を描くことを確かめる（ネットなしで画面のファイルを返す仕組みは AD-27。この PR の外）。

**Acceptance Scenarios**:

1. **Given** LINE に届かない, **When** `/match/…` を開く, **Then** LIFF を始めずに、ルーターが画面を描く
2. **Given** 試合表の道で開いた, **When** 試合表の中の別の道へ移る, **Then** ページを読み直さない

---

### User Story 3 - ほかの道は今までどおり (Priority: P1)

受付アプリ・Threads・設定など、試合表のほかの道は、今までどおり LIFF を始めてからルーターを作る。始められなければ「読みこめませんでした」の画面になる。試合表の道で開いたあと、画面の中でほかの道へ移るときは、同じ URL でページを読み直し、そこで LIFF を始める（今と同じ始まり方になる）。

**Independent Test**: LIFF を始められない状態でほかの道を開くと「failed」になること。試合表の道からほかの道へ移るとページを読み直し、ログインが要る画面（`getLiff()` を読む）が描けること。ほかの道から移るときは読み直さないこと。

**Acceptance Scenarios**:

1. **Given** LIFF を始められない, **When** `/admin/events` を開く, **Then** 「読みこめませんでした」（ルーターを作らない。今と同じ）
2. **Given** `/match/view/…` で開いた, **When** 画面の中の「はじめの画面へ戻る」を押す, **Then** ページを読み直し、LIFF を始めてから、移った先の画面（ログインが要る画面）を描く
3. **Given** `/admin/…` で開いた, **When** 同じリンクを押す, **Then** ページを読み直さずに移る（今と同じ）

### Edge Cases

- `/matches`・`/matching/…`・`/admin/match` のように頭が似ているだけの道：今までどおり LIFF を始める
- `/Match/…` のように大文字の道：今までどおり LIFF を始める（安全な側に倒す）
- ミニアプリの URL（`https://miniapp.line.me/{liffId}/match/…`）で開いた：LINE はエンドポイント（`/`）に `liff.state` を付けて開くので、今までどおり LIFF を始め、LIFF が `/match/…` へ移す（試合表の QR はミニアプリの URL にしない。AD-26）
- 試合表の道で開いたあとで LIFF がもう始まっていた（ほかの所が `initLiff()` を呼んだ）：読み直さない
- 電波のないまま試合表の道からほかの道へ移る：読み直しは届かず、ブラウザのつながらない画面になる（ほかの道はもともとネットなしで開けない。今と同じ）

## Requirements *(mandatory)*

- **FR-001**: 画面の入口は、開いた道が試合表の道（`/match` か `/match/` で始まる）なら `liff.init()` を呼ばず、LINE の SDK も読まずに、ルーターを作って描く
- **FR-002**: ほかの道では、今までどおり `initLiff()` を待ってからルーターを作る。失敗したら「読みこめませんでした」の画面を出し、ルーターを作らない
- **FR-003**: 決め方（`needsLiff`・`startLiffFor`）は `apps/web/src/lib/liff.ts` の1か所に置く（AD-4）。電波の有無では変えない
- **FR-004**: LIFF を始めずに開いたあと、LIFF の要る道へ移るときは、同じ URL でページを読み直す（履歴を増やさない）。試合表の中の行き来は読み直さない
- **FR-005**: LIFF を始めずに開いた道で `getLiff()` を呼ぶと、理由の分かる文で投げる
- **FR-006**: 今の形の文書（`docs/architecture.md`）と、AI が守る決まり（`docs/rules/coding.md` 6-3：試合表の道で `getLiff()` を読む部品を使わない）を直す

## Success Criteria *(mandatory)*

- **SC-001**: 試合表の道は、LIFF を始められない状態でも、SDK を読まずに開く（単体のテスト）
- **SC-002**: ほかの道は、LIFF を始められなければ今までどおり「読みこめない」になる（単体のテスト）。今までの E2E がそのまま通る
- **SC-003**: 組み立てた画面で、試合表の道はルーターが描き、そこからほかの道へ移るとページを読み直して LIFF を始め、ほかの道どうしは読み直さない（E2E。両方の幅）
- **SC-004**: `pnpm check`（E2E・秘密の値・依存の脆弱性を含む）が通る

## 範囲の外

- 試合表の領域（道・画面・API・表）。match の仕様で作る
- ネットなしで画面のファイルを返す仕組み（Service Worker。AD-27）
- 試合表の道での LINE ログイン（期限切れのときの外のブラウザ向けのログイン。AD-4 の【仮決め】・Open Questions 11）
- 見るだけ・受付の道の形と URL を作る関数（`packages/contracts/src/core`。AD-26・AD-30）
