# Feature Specification: 外部メディアの掲載文（threads-008）

**Feature Branch**: `feature/threads-001-core-port`（同じ作業場所で続けて作った。PR は分ける）

**Created**: 2026-11-20

**Status**: Draft（手元で実装と確かめまで済み。PR はまだ）

**Input**: 主催者の指示「めぐるの Threads をすべて移す」（2026-11-20）。範囲は [PRD](../../../_bmad-output/prd-threads/prd-threads.md) の FR-16。移す元はめぐるの specs/021-external-media・`packages/shared/src/media/`・`apps/api/src/apps/threads/external-media/`・画面の `external-media.tsx`・`external-media-listing.tsx`。

## Clarifications

### Session 2026-11-20

主催者が不在のため、AI が仮に決めた（【仮決め】）。

- Q: 媒体と決まり（欄・選択肢・行を外す決まり・ルールのチェック・作業の STEP・画像の決まり）→ A: めぐるのまま5つ（こくちーずプロ・Peatix・つなげーと・ジモティー・YOUTRUST）。決まった計算で作り、アプリは AI を呼ばない（AD-20）
- Q: めぐるの運営に固有の言葉（「港のグループ」など）→ A: 「主催のグループ」などの一般の言葉に直した。決まりの中身は変えていない【仮決め】
- Q: 言い回しを整える・画像 → A: めぐるのまま、外の AI に貼るプロンプトをコピーし、言い回しは答えを貼って欄に入れる（保存は利用者が押す）
- Q: 版 → A: kanaeru の約束に合わせ、まだ行がなければ版 0。POST/PUT に `version` を送る（めぐるの expectedVersion の代わり）【仮決め】
- Q: 掲載済みにしたときの、ほかの領域への出来事（めぐるの集金管理への知らせ）→ A: kanaeru にはないので送らない【仮決め】
- Q: 画面の場所 → A: ナビに「外部メディア」を足し、一覧（宣伝×媒体の状況・媒体の既定値）と、宣伝×媒体の掲載文の画面（入力・作業の手順・状況）に分ける【仮決め】
- Q: 選ぶ欄の見せ方 → A: 選択肢が6つまではチップ、多いもの（都道府県・ジャンルなど）は入力欄と同じ見た目の選ぶ欄【仮決め】

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 媒体の登録画面の順に、コピーして貼るだけで載せられる (Priority: P1)

**Acceptance Scenarios**:

1. **Given** イベントの情報のある宣伝, **When** 媒体の「掲載文を作る」, **Then** 媒体の登録画面と同じ区切りで欄が並び、必須・登録後は変更できない・文字数・コピーが出る。選ぶ欄は「このイベントでは〇〇を選びます（理由）」
2. **Given** 掲載文, **When** 「作業の手順」, **Then** 媒体の画面の順の STEP が並び、上からコピーできる。最後の STEP に公開後の案内と媒体ごとの決まり
3. **Given** 欄を直して保存, **Then** 掲載文は保存され、宣伝は変わらない

### User Story 2 - 媒体のルールに合わないところを先に直す (Priority: P1)

**Acceptance Scenarios**:

1. **Given** 本文に地図の URL・LINE の案内・メールアドレス, **When** 作る・保存する, **Then** その行は外れ、「自動で直した内容」に理由つきで残る
2. **Given** 掲載文, **Then** ルールのチェック（掲載できない・確かめる・参考）が出る

### User Story 3 - 画像と言い回しを外の AI で整える (Priority: P2)

### User Story 4 - どの媒体に載せたかを残す (Priority: P2)

状況（未着手・作成中・掲載済み・掲載停止）と掲載 URL を残し、一覧に出す。宣伝を直したら「作ったあとに宣伝が直された」と出す。

## Requirements *(mandatory)*

- **FR-1**: イベントの情報のない宣伝からは作らない（400）。
- **FR-2**: 欄は媒体の決まりの欄だけ・上限まで（ほかは 400）。保存のたびに行を外す決まりを通す。
- **FR-3**: 媒体の既定値は、既定値にできる欄だけ。
- **FR-4**: 持ち主だけが読める・書ける（ほかの人は 404）。作る・保存・既定値は操作の記録に残す。

## 残り

- PR を分けて出す。DB の変更（`0015_threads_media.sql`）は先に入れる。
- めぐるの画面の部品のテスト（`apps/web/test/external-media.test.tsx`）は写していない（計算は約束の単体テスト、窓口は結合のテスト、画面は通しのテスト）。
