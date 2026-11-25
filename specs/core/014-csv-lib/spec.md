# Feature Specification: CSV を読む処理を画面の共通に移し、貼った表（タブ区切り）も読む（core-014）

**Feature Branch**: `feature/core-014-csv-lib`

**Created**: 2026-11-22

**Status**: Draft（主催者の不在中に AI が作った。【仮決め】は主催者の確かめを待つ）

**Input**: 構成の決めごと AD-29（CSV を読む処理は、match が使う前に小さな共通の PR で `apps/web/src/lib/` に移す）・AD-18（共通にしてよいのは業務を知らない技術の道具だけ）と、[PRD 試合表アプリ](../../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md) FR-M30（Google フォームの回答のスプレッドシートから表をコピーして貼るのを、名簿の主な入れ方にする。読み方は FR-M1〈CSV〉と同じ）。今は booking の画面（`apps/web/src/features/booking/csv-read.ts`）にある。共通のファイルを足すので、領域の PR に混ぜず、小さな共通の PR で先に入れる（[並行開発の決まり](../../../docs/rules/parallel-development.md) 3-3）。core-013 の上に重ねる。

## Clarifications

### Session 2026-11-22

主催者は不在。対話の clarify は飛ばし、AD-29 と FR-M30 に従った。決めていないところは、いちばん狭く安全な形を AI が選んだ（【仮決め】。理由は [research.md](./research.md)）。

- Q: 移す先と名前 → A: `apps/web/src/lib/csv-read.ts`（名前と出すもの〈`decodeCsv`・`parseCsv`・`splitPastedNames`・`ParsedCsv`〉は変えない）。画面だけの道具なので `packages/` には置かない（AD-18）（R1）
- Q: booking の読み方を変えるか → A: 変えない。区切りの既定はカンマのまま。booking のファイルの取り込みは今と同じ答えになる（R2）
- Q: タブ区切りの読み方 → A: `parseCsv(text, { delimiter: "auto" })` で、1行目の囲みの外にタブがあればタブ、なければカンマ。どちらもなければ（1列だけ）タブ【仮決め】（R3）
- Q: 囲み（`"`）の決まり → A: タブ区切りでも RFC 4180 と同じ（欄の頭の `"` から囲み・`""` で `"` 1つ・囲みの中の改行とタブと区切りは欄の中）。欄の途中の `"` はそのまま残す（R4）
- Q: 貼った表から列の意味（呼び名・レベル）を読むのは → A: 使う領域（match）。この PR では作らない（AD-29 の【仮決め】）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - booking の名簿の取り込みは今までどおり (Priority: P1)

主催者は、受付アプリの予約の名簿（booking）に、掲載サイトや Google フォームの CSV のファイルを取り込む。読む処理の置き場所が変わっても、読める文字コード・切り方・見出しの扱い・貼った名前の切り方は今と同じ。

**Independent Test**: 今の booking の読み方のテスト（文字コード・囲み・改行・見出し・貼った名前）が、期待の値を直さずに、移した先で通る。booking の画面のテストと E2E がそのまま通る。

**Acceptance Scenarios**:

1. **Given** UTF-8（BOM あり・なし）・Shift_JIS の CSV, **When** 取り込む, **Then** 今と同じ文字で読む
2. **Given** 囲み・`""`・囲みの中の改行・CRLF の CSV, **When** 読む, **Then** 今と同じ行と欄
3. **Given** タブを含む CSV, **When** booking が読む（区切りを決めない）, **Then** 今と同じくカンマだけで切る

---

### User Story 2 - スプレッドシートから貼った表を読める（試合表が使う） (Priority: P1)

試合表の運営は、Google フォームの回答のスプレッドシートで表を選んでコピーし、試合表の画面に貼る（FR-M30。画面は match の PR で作る）。画面はこの道具で、貼った文字をタブで切り、1行目を見出しにして読む。名前の中のカンマで欄が切れず、改行を含む欄（スプレッドシートが `"` で囲む）も1つの欄として読める。

**Independent Test**: Google スプレッドシートと Excel からコピーしたときの形の文字を `parseCsv(text, { delimiter: "auto" })` で読み、見出しと行と欄を確かめる。

**Acceptance Scenarios**:

1. **Given** タブ区切り（`山田, 花子` のようにカンマを含む欄がある）, **When** auto で読む, **Then** タブだけで切り、カンマは欄の中のまま
2. **Given** 改行・`"`・タブを含む欄が `"` で囲まれた表, **When** auto で読む, **Then** 囲みを外して1つの欄にする（`""` は `"` 1つ）
3. **Given** CRLF・最後に改行のある表（Excel）, **When** auto で読む, **Then** 空の行は飛ばし、行の番号は貼った文字の中の行
4. **Given** CSV の文字, **When** auto で読む, **Then** カンマで読んだときと同じ答え
5. **Given** 1列だけの表（`お名前` の下に名前が並ぶ）, **When** auto で読む, **Then** 名前の中のカンマで切らない

### Edge Cases

- 1行目の囲みの中のタブ・カンマ・改行：区切りを決めるときに数えない
- 先頭の空の行：飛ばして、最初の空でない行で決める
- 欄の途中の `"`（`右の"A"チーム`）：囲みにせず、そのまま残す
- 欄の頭の `"` で始まり、改行のない欄（`"A"チーム希望`）：RFC 4180 のとおり囲みとして読み、`Aチーム希望` になる（スプレッドシートの書き出し方によっては `"` が消える。research R4）
- 中身がない：見出しも行も空

## Requirements *(mandatory)*

- **FR-001**: CSV を読む処理を `apps/web/src/lib/csv-read.ts` に移し、booking はそこから読む。booking の中の写しは残さない
- **FR-002**: 区切りを決めないときの答えは、今と同じ（カンマ）
- **FR-003**: `parseCsv` の区切りに `","`・`"\t"`・`"auto"` を選べる。`detectDelimiter(text)` を出す
- **FR-004**: auto は、最初の空でない行の囲みの外にタブがあればタブ、なければカンマ、どちらもなければタブ
- **FR-005**: 囲みの決まりは、区切りがどちらでも同じ（RFC 4180。欄の頭の `"` だけが囲みを始める）
- **FR-006**: 業務（列の意味・名簿・レベル）を知らない（AD-18）
- **FR-007**: 今の形の文書（`docs/rules/coding.md` 6-2 の置き場所・`docs/apps/booking.md`・`docs/architecture.md`）を直す

## Success Criteria *(mandatory)*

- **SC-001**: 今の読み方のテストが、期待の値を直さずに通る（移したファイルで）
- **SC-002**: タブ区切り（Google スプレッドシート・Excel の形）と区切りの決め方のテストが通る
- **SC-003**: `git grep` で、CSV を切る処理（`splitRecords`）が `apps/web/src/lib/csv-read.ts` の1か所だけ
- **SC-004**: `pnpm check`（E2E・秘密の値・依存の脆弱性を含む）が通る

## 範囲の外

- 試合表の名簿の貼り付けの画面と、列の意味（呼び名・レベル）の読み方（match の PR）
- booking の画面に貼り付けの表を足すこと（今の「名前をまとめて貼る」は変えない）
- Google のアカウントとつなぐ形（FR-M30 のとおり、求められたら考える）
