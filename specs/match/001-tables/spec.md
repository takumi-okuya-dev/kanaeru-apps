# Feature Specification: 試合表の表とアプリの登録（match-001）

**Feature Branch**: `feature/match-001-tables`（DB の変更）。`feature/core-014-csv-lib` の上に積む。窓口・画面・組み方は match-002（`feature/match-002-pr2-roster`）

**Created**: 2026-11-22

**Status**: Draft（2026-11-22 手元で実装と確かめまで済み〈`pnpm check`〉。【仮決め】は主催者の確かめを待つ）

**Input**: [PRD 試合表アプリ](../../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md) の 5章（守ること）・6章（構成の決めごと）。作りは [構成の決めごと](../../../_bmad-output/architecture-kanaeru/architecture-kanaeru.md) の AD-25（記録と持ち主・組織に入れる・前に入れたレベル・消し方）・AD-26（見るだけの札）・AD-28（版の番号と担当の端末）・AD-30（受付の札と受付の行）、あわせて AD-3・AD-15・AD-16・AD-17・AD-19・AD-22。範囲の外：窓口・画面・組み方（match-002）・見るだけのページと受付のページ・ネットなしで開く・受付の交流会から名簿を入れる（後の段）。

## Clarifications

### Session 2026-11-22

答える人がいないため、PRD と構成の決めごとから AI が決めた（【仮決め】。理由は [research.md](./research.md)）。

- Q: 試合表の中身（名簿・組み合わせ・進み具合・設定）をどう持つか → A: AD-28 のとおり `match_table.content`（JSON の object）1つにまとめ、`version` を付ける。形は約束の zod で確かめてから書く（match-002）。DB は object であることだけを CHECK で確かめる【仮決め R1】
- Q: 同じ変更の二重をどう止めるか → A: `match_table.last_change_id`（最後に受けた変更の ID）を持つ。担当の端末は1台で、送りは古い順に1つずつなので、最後の1つと比べれば足りる【仮決め R2】
- Q: 退会の手順はこの PR に入れるか → A: 入れない。持ち主を指す外部キーは CASCADE なので、手順がなくても account を消す処理は止まらない（組織に入れた試合表を管理者へ引き継ぐのは、窓口と同じ match-002 で足す。この PR の段では、組織に入れる窓口がまだないので、引き継ぐ試合表は生まれない）【仮決め R3】
- Q: 受付の札の期限を列に持つか → A: 見るだけの札と同じく `join_token_expires_at` を持つ（「その日の終わり」を札を作るときに決めて持つ。試合の日を直しても、出した札の期限が黙って変わらない）【仮決め R5】
- Q: `/match` に何を出すか → A: アプリの登録の確かめ（アプリを開いたときの道が道の木にある）に要るので、準備中の案内だけの仮の画面を置く。台帳に行がない間は運営者だけに見える（AD-16）【仮決め R6】

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 試合表を持てる表がある (Priority: P1)

match-002 の窓口が、試合表（持ち主・名前・試合の日・中身・版・担当の端末・札・くじの種・つないだ交流会）と、組織に入れる行・前に入れたレベル・QR の受付の行を書ける。

**Why this priority**: 試合表アプリの土台。DB の変更は小さく切って先に入れる（[並行開発の決まり](../../../docs/rules/parallel-development.md) 4・AD-17）。

**Independent Test**: 表に直に書いて、CHECK・一意・外部キーの消し方を確かめる（`apps/api/src/modules/match/schema.test.ts`）。

**Acceptance Scenarios**:

1. **Given** 運営の account, **When** 試合表の行を足す, **Then** 版は1・くじの種は0・中身は空の object で入る。名前が空・61文字以上・中身が object でない・版が0・担当の端末が空の文字なら CHECK で止まる
2. **Given** 見るだけの札の SHA-256 がある試合表, **When** 同じ値の試合表を足す, **Then** 一意で止まる（札のない試合表はいくつでも足せる）
3. **Given** 試合表, **When** 持ち主が入っていない組織に入れる, **Then** 外部キーで止まる。持ち主が入っている組織なら入れられ、持ち主が組織を抜けると「組織に入れる」だけが消え、試合表は残る
4. **Given** 交流会をつないだ試合表, **When** 交流会を消す, **Then** つないだ交流会が空になり、試合表は残る
5. **Given** 試合表・受付の行・組織に入れる行・覚えたレベル, **When** 持ち主の account を消す, **Then** どれも消える（ほかの表で止まらない）
6. **Given** 前に入れたレベル, **When** 相手を運営と組織の両方か、どちらもなしにする, **Then** CHECK で止まる。相手と人の組は1行まで
7. **Given** レベルの code, **When** 約束の4つ（上級・中級・初級・入門）を入れる, **Then** どれも入り、ほかの値は CHECK で止まる

### User Story 2 - 試合表アプリが登録されている (Priority: P1)

アプリの一覧に key `match`・領域 `match`・`uses: ["reception"]` の1行があり、API と画面の領域の一覧にも1行ずつある。運営者が「すべてのアプリ」から試合表を開くと、`/match` に準備中の案内が出る。

**Independent Test**: アプリの登録のテスト（`apps/api/test/apps-registry.test.ts`・`apps/web/src/router.test.tsx`）が通る。

**Acceptance Scenarios**:

1. **Given** 登録, **When** アプリの一覧の決まりを確かめる, **Then** key が一意・予約語でない・領域はちょうど1つのアプリに属する・使ってよいほかのアプリは登録されたアプリ
2. **Given** 台帳に行がない, **When** 運営者でない人が `/api/v1/match/…` を呼ぶ, **Then** 見えないアプリとして 404（組み立てが `requireApp` を付ける。窓口は match-002）

### Edge Cases

- 退会：組織に入れた試合表の引き継ぎは match-002 の退会の手順で行う。この段では組織に入れる窓口がないので、持ち主を消すと試合表はみな消える（R3）。
- 前の版のアプリ：表を足すだけなので、前の版のアプリはこの表を知らずに動く（[コードの書き方](../../../docs/rules/coding.md) 3）。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `match_table`・`match_table_organization`・`match_level_memory`・`match_join` を足す（列と決まりは [data-model.md](./data-model.md)）。
- **FR-002**: DB の変更は表を足すだけ（`0021_match.sql`）。`pnpm db:check` が通る。
- **FR-003**: レベルの code と言葉を `@workspace/contracts/match` に置き、DB の CHECK と同じ並びにする。
- **FR-004**: アプリの一覧・API と画面の領域の一覧に1行ずつ足す（AD-15）。`/match` に仮の画面を置く。
- **FR-005**: 領域の地図 `docs/apps/match.md` を書き、`docs/README.md` 2章と `docs/rules/specs.md` の領域の一覧に1行ずつ足す。

### Key Entities

- **試合表**（`match_table`）：持ち主の account の記録。中身は1つの JSON と版の番号。
- **組織に入れる**（`match_table_organization`）：試合表ごとに1つの組織まで。
- **前に入れたレベル**（`match_level_memory`）：運営か組織ごとの、account のある人のレベル。
- **受付の行**（`match_join`）：QR の受付で入った呼び名とレベル。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check`（型・lint・単体と結合・E2E・gitleaks・依存の脆弱性・DB の変更の確かめ）が通る。
- **SC-002**: 表の結合のテストが、CHECK・一意・消し方をすべて確かめる。

## Assumptions

- 中身の JSON の形（名簿・組み合わせ・進み具合・設定）は match-002 の約束で決める。DB の CHECK は object であることだけにし、形を変えるたびに DB の変更が要らないようにする（R1）。
