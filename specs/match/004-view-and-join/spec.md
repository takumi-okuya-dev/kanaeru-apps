# Feature Specification: 見るだけのページ・入口の QR・QR で受け付ける（match-004）

**Feature Branch**: `feature/match-004-view-and-join`。`feature/match-003-day-of`（当日の組み直し）の上に積む

**Created**: 2026-11-22

**Status**: Draft（2026-11-22 手元で実装と確かめまで済み〈`pnpm check`・E2E〉。【仮決め】は持ち主と運営の方の確かめを待つ）

**Input**: [PRD 試合表アプリ](../../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md) の FR-M18・FR-M19（版の QR）・FR-M20・FR-M23（最後に読んだ表とその時刻）・FR-M25・FR-M29、7.1 の4番。作りは [構成の決めごと](../../../_bmad-output/architecture-kanaeru/architecture-kanaeru.md) の AD-26（見るだけのページ）・AD-30（受付のページ）と、[Constitution](../../../.specify/memory/constitution.md) 1.3.0 の例外（見るだけ・受付のページはログインなし）。画面は [主な画面の見本](../../../_bmad-output/ux-kanaeru-match/mockups/key-screens.html) の P1・M7・P2・P3・R1（版の隅の QR）・R2。範囲の外：ネットなしで開く・電波なしで渡す QR・P3 の「参加者の QR を運営のカメラで読む」（ネットなしの段。research R7）。**DB の変更はない**（match-001 の札の列と `match_join` を使う）。

## Clarifications

### Session 2026-11-22

答える人がいないため AI が決めた（【仮決め】。理由は [research.md](./research.md)）。

- Q: 札の期限は → A: 札を作るときに「試合の日と今日の遅いほう」の日本時間の終わり【R1】
- Q: 札は DB に SHA-256 だけ。QR をどこで出すか → A: 作った端末の localStorage に札を置く。ほかの端末で出すときは作り直す【R2】
- Q: 道の形を contracts/core に置くか → A: 今は試合表の領域の `paths.ts`【R3】
- Q: 受付の行をどう名簿に入れるか → A: 行は残し、名簿の人の ID を受付の ID から決めて二度入れない。担当の端末が開いたときに入れる【R4】
- Q: 回数の制限 → A: 受け付ける POST は組み立ての IP ごとの制限。読む GET は札の長さで守る【R6】
- Q: P3 の QR → A: ネットなしの段へ【R7】

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 参加者がログインなしで試合表を見る (Priority: P1)

運営は「見るだけのページ」でリンクを作り、QR を出す（印刷の版の右上と入口に貼る1枚にも入る）。参加者はスマホで QR を読み、ログインなしで、組のタブ・呼び名だけの表・今と次を見る。自分の名前を選ぶと印が付き、その端末に残る。つながっている間は30秒おきに版の番号を確かめて読み直し、読めないときは最後に読んだ表とその時刻を出す（FR-M18・FR-M20・FR-M23・FR-M25）。

**Acceptance Scenarios**:

1. **Given** 見るだけのリンク, **When** ログインなしで開く, **Then** 呼び名・組み合わせ・進み具合だけが出て、レベル・氏名は窓口の答えにもない。答えは `no-store`・`X-Robots-Tag: noindex`、ページに `noindex`
2. **Given** 運営がリンクを作り直した・試合の日の終わりを過ぎた, **When** 前のリンクを開く, **Then** 404「見つかりません」
3. **Given** 自分の名前を選ぶ, **When** 読み直す, **Then** 印が残る
4. **Given** 電波がなくなる, **When** ページを見ている, **Then** 「…に読んだ表を出しています」
5. **Given** ページの下, **Then** 「試合表は当日に参加者へ公開されます」と「kanaeru で作った試合表・自分のサークルでも使う」

### User Story 2 - QR で受け付ける (Priority: P1)

運営は M7 で「受付を始める」と QR とリンクが出る。参加者はログインなしで名前（1〜20文字）とレベルを答える。受け付けた人は一覧に出て（同じ名前の印）、担当の端末が名簿に入れる。運営は「受付を締める」「この名簿で試合表を作る」（FR-M29・AD-30）。

**Acceptance Scenarios**:

1. **Given** 受付の QR, **When** 名前とレベルを入れて受付する, **Then** 「受付できました」。運営の一覧に出て、名簿に入る
2. **Given** 名前が空・21文字・ほかの欄つき, **When** 送る, **Then** 400（画面は欄のそばに誤り）
3. **Given** 締めた・期限を過ぎた受付, **When** 開く・送る, **Then** 404「受付は締め切られました」
4. **Given** 100人受け付けた試合表, **When** 送る, **Then** 409
5. **Given** 同じ名前, **When** 一覧, **Then** 「同じ名前」の印（受付は止めない）
6. **Given** 受付の行を消す, **Then** 名簿からも消える（担当の端末）

## Requirements *(mandatory)*

- **FR-001**: 窓口（[contracts/match.md](./contracts/match.md)）：札を作り直す（見るだけ・受付）・受付を締める・受付の一覧・受付の行を消す（運営）／見るだけのページ・版の番号・受付のページ・受け付ける（ログインなし）。
- **FR-002**: 札は 192ビットの乱数・DB は SHA-256 だけ・期限は R1・作り直すと前の札は 404。
- **FR-003**: ログインなしの答えは `no-store`・`X-Robots-Tag: noindex, nofollow`。期限切れ・締めた・ない札は同じ 404。
- **FR-004**: 画面：見るだけのページ（P1）・受付のページ（P2・P3）・見るだけのリンクと QR・QR で受け付ける（M7）・印刷の版の QR と入口に貼る1枚（R1・R2）。
- **FR-005**: テスト：期限切れの札・締めた受付・上限・strict の本文・レベルと氏名が出ない・noindex と no-store。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` が通る（E2E は両方の幅で axe・横のスクロールなし・CSP の違反なし。ログインなしの別のブラウザで見る・受け付ける）。
- **SC-002**: 新しい依存を足さない（QR は event・suite が使う `uqr`）。
