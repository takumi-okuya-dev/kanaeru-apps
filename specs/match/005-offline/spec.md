# Feature Specification: ネットなしで開く・端末に残して送る・電波なしで渡す QR（match-005）

**Feature Branch**: `feature/match-005-offline`。`feature/core-015-match-offline-base`（試合表の道だけの Service Worker の組み立てとカメラの許可）の上に積む

**Created**: 2026-11-22

**Status**: Draft（2026-11-22 手元で実装と確かめまで済み〈`pnpm check`・E2E〉。【仮決め】は持ち主と運営の方の確かめを待つ。iPhone の Safari と Android の Chrome の実機での確かめはまだ〈research R15〉）

**Input**: [PRD 試合表アプリ](../../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md) の 4.6（FR-M22〜M24）・FR-M15（見込みの今の試合）・FR-M29（電波がないときの受付の QR）。作りは [構成の決めごと](../../../_bmad-output/architecture-kanaeru/architecture-kanaeru.md) の AD-27（ネットなしで開く仕組みは試合表の道だけ・止め方・新しい版の知らせ・学びの文書）・AD-28（端末に残して古い順に送る・409 の扱い・電波なしで渡す QR は新しい版だけ取り込む）・AD-30（参加者の QR を運営のカメラで読む）と、[Constitution](../../../.specify/memory/constitution.md) III（電波がなくても動く）。画面は [主な画面の見本](../../../_bmad-output/ux-kanaeru-match/mockups/key-screens.html) の M4・P1・P3・M7。**DB の変更はない**。

## Clarifications

### Session 2026-11-22

答える人がいないため AI が決めた（【仮決め】。理由は [research.md](./research.md)）。

- Q: Service Worker の作り方と更新 → A: 手で書いた本文。外枠はすぐ返し、新しい版は待たせて「新しい版があります」で入れ替える【R1】
- Q: 止め方 → A: 機能の印 `match.offline` を画面と本文の両方が見る。本文が壊れたら自分を外すだけの版を出す【R2】
- Q: `/match`（末尾の `/` なし） → A: 範囲に入らない。ホーム画面には試合表の中の画面から置く（要確認）【R3】
- Q: 送れなかった変更 → A: IndexedDB に残し、古い順に送り直す。409 は止めて残し、捨てる・上書きするを選ぶ【R4・R5】
- Q: QR に入らない大きな表 → A: つづきの QR（最大16枚）。それでも入らなければ渡せないと出す【R9】
- Q: 受付の QR を読んだあとに参加者の送りが届いたら → A: 同じ名前の印が付き、運営が1人消す【R11】

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 電波のない体育館で試合表を開いて直す (Priority: P1)

運営は、つながっているときに1度試合表を開いておく。体育館で電波がなくても、試合表の画面（名簿と設定・試合表・大きく映す・印刷・見るだけのページ）を開き、進め・組み直しができる。直したものは端末に残り、「電波なし・HH:MM に保存（つながったら送ります）」と出る。つながると古い順に送られる（FR-M22・FR-M23）。

**Acceptance Scenarios**:

1. **Given** 1度つながって開いた試合表, **When** 電波なしで読み直す, **Then** 開ける（「電波なし・この端末に置いた HH:MM の試合表です」）
2. **Given** 電波なし, **When** チェックを付ける・別の組み合わせにする, **Then** 「電波なし・HH:MM に保存（つながったら送ります）。まだ送っていない変更：N件」。サーバーの版は変わらない
3. **Given** 送っていない変更, **When** つながる, **Then** 古い順に送り、サーバーの版が上がる
4. **Given** ほかの端末が担当を受け取った・サーバーの版が新しい, **When** 送る, **Then** 送りを止めて変更を端末に残し、知らせる。捨てる・上書きするを選べる

### User Story 2 - 電波なしで試合表を渡す (Priority: P1)

運営は試合表の画面の「電波なしで渡す」で QR を出す。前に見るだけのページを開いたスマホは、ネットなしでページを開き「QR を読む」で読むと、今より新しい版のときだけ表が入る（FR-M24・M4）。

**Acceptance Scenarios**:

1. **Given** 見るだけのページを1度開いたスマホ, **When** 電波なしで開いて「QR を読む」で運営の QR を読む, **Then** 「版 N の表を取り込みました」。今の試合が新しくなる
2. **Given** 同じ版・古い版の QR, **Then** 取り込まない
3. **Given** 1枚に入らない表, **Then** つづきの QR を切りかえて出し、全部読むと入る。上限を超えれば渡せないと出す
4. **Given** 電波なし, **Then** 見るだけのページは最後に読んだ表と1試合の長さから今の試合を見込む（FR-M15）

### User Story 3 - 電波がなくて受付できない参加者 (Priority: P2)

参加者が受付を送れないと、名前とレベルの QR が出る。運営は M7 の「参加者の QR を読む」で読み、名簿に入れる。参加者の端末は、つながったら自動で送る（FR-M29・AD-30・P3）。

**Acceptance Scenarios**:

1. **Given** 電波なし, **When** 参加者が受付する, **Then** 「この QR を運営に見せてください」と QR
2. **Given** 参加者の QR, **When** 担当の端末の M7 で読む, **Then** 名簿に入る。2回読んでも1人
3. **Given** 別の試合表・作り直す前の受付の QR, **Then** 入れない

### User Story 4 - 止められる (Priority: P1)

機能の印 `match.offline` を切にすると、Service Worker を入れず、入っているものを外す。Service Worker の範囲は `/match/` だけで、ほかのアプリの画面には効かない（AD-27）。

## Requirements *(mandatory)*

- **FR-001**: Service Worker（本文・入れ方・外し方・新しい版の知らせ）。API の答えは持たない。
- **FR-002**: 窓口 `GET /api/v1/match/offline`（ログインなし・no-store）。
- **FR-003**: 端末の置き場所（IndexedDB）と送りの列（もとの版・変更の ID・古い順・待つ・止める・捨てる・上書き）。
- **FR-004**: 電波がないときの文と、止めたときの選び方。
- **FR-005**: 見るだけのページの見込み・QR を読む・新しいほうを出す。
- **FR-006**: 電波なしで渡す QR（M4）・受付の QR（P3）・M7 で読む。カメラと写真から読む。
- **FR-007**: 学びの文書（Service Worker・property-based テスト）。
- **FR-008**: テスト（research R12）。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` が通る。
- **SC-002**: E2E で、電波なしで開く・直す・つながって送る・QR で渡す・参加者の QR を読むが通る。
- **SC-003**: 実機での確かめ（research R15）を持ち主と運営の方が行う。
