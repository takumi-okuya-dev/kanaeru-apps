# Feature Specification: ログインなしで読める道の読む要求にも、IP ごとの回数の制限をかける（core-016）

**Feature Branch**: `feature/core-016-public-get-rate-limit`（`develop` から切る。試合表の積み重ねの外の、小さな共通の PR）

**Created**: 2026-11-22

**Status**: Draft（主催者の不在中に AI が作った。共通の変更は主催者が認めた〈案 A〉。【仮決め】は主催者の確かめを待つ）

**Input**: 構成の決めごと AD-26（見るだけの窓口は「回数の制限は IP ごとにかける」）・AD-30（受付の窓口も IP ごと）と、[specs/match/004-view-and-join/research.md](../../match/004-view-and-join/research.md) R6（組み立ての回数の制限は書く操作だけを数えるので、見るだけ・受付の GET には制限が効いていない。共通の小さな PR で足す、と残した）。match-004（PR #68）の前に入れる。

## Clarifications

### Session 2026-11-22

主催者は不在。共通の変更は主催者が認めた（案 A：ログインなしの GET にも IP ごとの制限を足す）。形と数は AI が選んだ（【仮決め】。理由は [research.md](./research.md)）。

- Q: どの道に効かせるか → A: 領域が `index.ts` から出す `publicReadPaths`（ログインなしで読める道の頭の並び）で始まる道の読む要求だけ。組み立て（`app.ts`）に領域の名前や業務の言葉を書かない（R1）
- Q: 数 → A: 60秒に600回（IP ごと・IPv6 は /64 ごと）。書く操作のふつうの上限とは別に数える【仮決め】（R2）
- Q: ほかの読む要求 → A: 今までどおり数えない（ログインした画面の5秒おきの読み直しを止めないため）（R3）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - ログインなしで読める道を、総当たり・読みすぎから守る (Priority: P1)

札で開く見るだけのページ（`GET /api/v1/match/views/{token}` と `/version`）や受付のページ（`GET /api/v1/match/joins/{token}`）は、ログインなしで誰でも呼べる。同じ IP から多すぎる読む要求が来たら、`429`（`RATE_LIMITED`・`Retry-After`）で止める。

**Acceptance Scenarios**:

1. **Given** 領域が `publicReadPaths: ["/api/v1/<領域>/views/"]` を出す, **When** 同じ IP から60秒に600回を超えて、その頭の道を GET する, **Then** 601回目は `429`・`Retry-After`
2. **Given** 1つの IP の後ろに30人, **When** 30秒おきに版を確かめ、版が変わるたびに読み直す（1分に約90回）, **Then** 止まらない
3. **Given** ログインなしで読める道の上限に達した IP, **When** 書く操作（受付の送信など）, **Then** 書く操作のふつうの上限で数える（見る要求で止まらない）
4. **Given** 頭の外の GET（ログインした画面の読み直し・動いているかの窓口）, **Then** 今までどおり数えない
5. **Given** `RATE_LIMIT_ENABLED=false`（手元とテストだけ）, **Then** 数えない
6. **Given** 領域が自分の領域の外（`/api/v1/<ほかの領域>/…`）や領域全体（`/api/v1/<領域>/`）を頭に出す, **Then** 起動を止める

## Requirements *(mandatory)*

- **FR-001**: `DomainModule` に任意の `publicReadPaths?: readonly string[]` を足す（`withdrawal`・`eventLinkRestriction` と同じ、領域が出し組み立てが集める形）。
- **FR-002**: `collectPublicReadPaths`：形（`/api/v1/<領域>/<道>/`。`/` で終わる）と、自分の領域の下であることを確かめ、合わなければ起動を止める。`isPublicReadPath`：道が頭のどれかで始まるか。
- **FR-003**: `app.ts` に3つ目の IP ごとの回数の制限（`PUBLIC_READ_RATE_LIMIT`。60秒に600回）を足し、集めた頭の道の読む要求（GET・HEAD・OPTIONS）にだけかける。頭が1つもなければ足さない。入・切は `RATE_LIMIT_ENABLED` に従う。
- **FR-004**: テスト：頭の集め方と形の確かめ・道の当て方の単体のテストと、見本の領域（`/api/v1/test-only/views/{token}` と `/version`）での組み立ての結合のテスト。
- **FR-005**: 文書：`docs/architecture.md`（要求の流れの回数の制限）・`docs/rules/coding.md` 6-6（領域が出せるもの）。

この PR では試合表の道はまだ `develop` にないので、試合表の領域が `publicReadPaths` を出すのは試合表の PR（#68 の上）で行う（1行。research R4）。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` が通る（今の道の答えと、ほかの回数の制限は変わらない）。
