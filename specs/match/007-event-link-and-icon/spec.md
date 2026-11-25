# Feature Specification: 名簿を入れた受付の交流会を出す・ホーム画面のアイコン（match-007）

**Feature Branch**: `feature/match-007-event-link-and-icon`。`feature/match-006-reception-import` の上に積む

**Created**: 2026-11-22

**Status**: Draft（主催者の不在中に AI が作った。【仮決め】は主催者の確かめを待つ）

**Input**: 主催者の2つの頼み（1. 試合表に、名簿をどの受付の交流会から入れたかを出す。2. 試合表アプリをホーム画面に置くためのアイコンを用意する）・[PRD 試合表アプリ](../../../_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md) FR-M4（受付の交流会とは任意でつなぐ）・構成の決めごと AD-25（交流会の ID は任意・交流会が消えたら null）・AD-26（見るだけのページにつないだ交流会を出さない）・AD-27（Service Worker は `/match/` だけ）・[match-006 research](../006-reception-import/research.md) R6（`event_id` はまだ書いていない）・[match-005 research](../005-offline/research.md) R3（`/match` と `/match/`・ホーム画面に置く画面）。

## Clarifications

### Session 2026-11-22

主催者は不在。対話の clarify は飛ばし、頼みと PRD・AD に従った。決めていないところは、いちばん狭く安全な形を AI が選んだ（【仮決め】。理由は [research.md](./research.md)）。

- Q: DB を変えるか → A: 変えない。`match_table.event_id`（0021。`event` を指す外部キー・`ON DELETE SET NULL`・索引つき）をそのまま使い、名前と日時の写しは試合表の中身（JSON）に持つ（R1）
- Q: いつ・だれがつなぐか → A: 担当の端末が「受付の交流会から」で入れたとき、中身に写しを置き、送ったときにサーバーが入れてよい交流会（match-006 の入れる窓口と同じ判定）のときだけ `event_id` につなぐ。入れてよくなければ外し、送りは止めない【仮決め】（R2）
- Q: どこに出すか → A: 運営の画面の、試合表の一覧（文だけ）と、名簿と設定・試合表の題の下（受付アプリで開けるときはリンク）。見るだけのページ・電波なしで渡す QR には出さない【仮決め】（R3）
- Q: 交流会が消えた・見られないとき → A: 写しの名前と日付を出し、「交流会は見られません」と添える（R3）
- Q: 入れ直したとき・貼り付けで置きかえたとき → A: 別の交流会から入れ直すと置きかわる。貼り付け・CSV で置きかえると外れ、貼り付けで足しただけなら残る【仮決め】（R4）
- Q: アイコンの絵 → A: 墨の地に白い表、名前の枠が4つずつの行のうち1行を墨にする（競技を選ばない・文字なし）【仮決め】（R5）
- Q: manifest とリンクをどこに付けるか → A: manifest とアイコンは `apps/web/public/match/`。見出しのリンクは試合表の運営の画面（`MatchGate`）を開いている間だけ付ける。Service Worker には組み立ての plugin の `publicFiles` で持たせる【仮決め】（R6・R7）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - どの交流会から入れた名簿かが分かる (Priority: P1)

運営が「受付の交流会から」で名簿を入れると、試合表の一覧と、名簿と設定・試合表の題の下に「受付：12/13(日) 練習会（2026/12/13(日)）から入れた」と出る。受付アプリで開けるときは、交流会の一覧画面へのリンクが出る。

**Acceptance Scenarios**:

1. **Given** 受付の交流会から入れて保存した, **Then** 一覧と題の下に交流会の名前と日付。題の下に「受付アプリで交流会を開く」（`/admin/events/{eventId}`）
2. **Given** 別の交流会から入れ直した, **Then** その交流会に置きかわる
3. **Given** フォームの貼り付けで名簿を置きかえた, **Then** 出なくなる（つながりも外れる）
4. **Given** 交流会があとで消えた・自分が主催者でも受付係でもない・受付アプリが見えない, **Then** 写しの名前と日付に「（交流会は見られません）」を添え、リンクは出さない
5. **Given** 見るだけのページ・電波なしで渡す QR, **Then** 交流会の名前も ID も出ない
6. **Given** 入れてよくない交流会の写し（ほかの持ち主の交流会など）を送った, **Then** 保存はできるが、試合表にはつながず、開けない

### User Story 2 - 試合表アプリをホーム画面に置く (Priority: P1)

運営が、ふつうのブラウザ（iPhone の Safari・Android の Chrome）で試合表をホーム画面に置くと、試合表のアイコンと「試合表」の名前で置かれ、開くと試合表の一覧（`/match/`）が開く。電波がなくても開ける。

**Acceptance Scenarios**:

1. **Given** 試合表の運営の画面, **Then** 見出しに manifest（`/match/manifest.webmanifest`）と iPhone のアイコン（`/match/apple-touch-icon.png`）のリンク
2. **Given** ほかのアプリの道（すべてのアプリ・受付アプリ・設定）・参加者が開く見るだけと受付のページ, **Then** リンクは付かない
3. **Given** Service Worker が入った, **Then** manifest とアイコンを持ち、電波がなくても返す
4. **Given** manifest, **Then** 名前「kanaeru 試合表」・短い名前「試合表」・始まり `/match/`・範囲 `/match`・standalone・色は tokens.css の値・アイコンは 192 と 512 の any と maskable

## Requirements *(mandatory)*

- **FR-001**: 約束：中身に `receptionEvent`（`MatchReceptionSource`：交流会の ID・名前・始まりの日時。任意）・一覧と試合表に `receptionEvent`（`MatchReceptionEventLink`：ID・名前・日時・`canOpen`）。
- **FR-002**: API：中身を直す `PUT` で、写しの交流会が変わったら、入れてよいときだけ `event_id` につなぐ（`reception-link.ts` の `canImportEvent`。match-006 の入れる窓口も同じ関数を使う）。一覧と読む・作る・直す・担当を受け取る答えに見せ方を付ける。交流会のことは event・suite の `index.ts` からだけ読む。
- **FR-003**: 画面：「受付の交流会から」で写しを置く・貼り付けで置きかえると外す（`roster-edit.ts`）・題の下の一行（`ReceptionEventNote.tsx`）・一覧の文。
- **FR-004**: アイコン：SVG（`icon.svg`・`icon-maskable.svg`）・PNG（180・192・512・maskable の 192・512）・作り直す手順（`e2e/scripts/render-match-icons.ts`）。
- **FR-005**: manifest（`manifest.webmanifest`）と見出しのリンク（`use-home-screen.ts`。運営の画面だけ）。Service Worker が持つ（`scoped-service-worker.ts` の `publicFiles`）。
- **FR-006**: テスト：結合（つなぐ・置きかわる・つながない・消えた・見る人ごと・見るだけのページ）・単体（写し・文・見え方・QR に入らない・manifest・PNG・リンク・plugin）・E2E（題の下と一覧・manifest とリンク・ほかの道に付かない・電波なし）。
- **FR-007**: 文書：`docs/apps/match.md`・`docs/architecture.md`。

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` が通る。
- **SC-002**: 見るだけのページ・電波なしで渡す QR・ほかのアプリの道に、交流会の名前と試合表の manifest が出ない（結合・単体・E2E）。
