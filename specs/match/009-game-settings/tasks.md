# Tasks: 試合の数を入れる・分け方を複数選ぶ・ミニゲームのチーム分け（match-009）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)・[data-model.md](./data-model.md)・[contracts/](./contracts/)

テストは先に書く（Constitution・coding.md のテストの決まり）。パスは `apps/web/src/features/match/` を `web/`、`packages/contracts/src/match/` を `contracts/` と略す。

## Phase 1: Setup

- [ ] T001 PRD 試合表アプリに、時刻の欄をやめて試合の数にする・分け方の組み合わせ・ミニゲーム（チーム分けだけ）を書き足す `_bmad-output/prd-kanaeru-match/prd-kanaeru-match.md`（research R9）

## Phase 2: Foundational（約束の形。どの話の前にも要る）

- [ ] T002 約束の試験を先に書く `contracts/table.test.ts`：新しい設定（`gameCount` 1〜60・`levels` は "four"|"three"|"two"|null・`ungrouped`・`courts` 1〜20|null）が通る／3つとも選ばないと「分け方を1つ以上選んでください」／前の形（`grouping`・`minutesPerGame`・`startTime`・`endTime`）が新しい形に直る（15分・12:30〜14:30 → 8、`none` → `levels: null, ungrouped: true`、0 試合 → 1）／`plan` の組は「levels の組 +（ungrouped なら）all」だけ／`mini.teams` は courts×2 のチーム・同じ人は1つのチームまで・名簿にいる人・courts がなければ持てない
- [ ] T003 `contracts/options.ts` に `MINI_COURTS_MAX = 20`・`LEVEL_POINTS`（上級4・中級3・初級2・入門1）・`MATCH_LEVEL_GROUPINGS`（four・three・two）と言葉を足す
- [ ] T004 `contracts/table.ts`：`MatchSettings` を新しい形にし、前の形を preprocess で直す。`MatchMini`（`teams: string[][]`）と `content.mini?`、`superRefine` の組の確かめを組の並びに広げ、ミニゲームの確かめを足す。`INITIAL_CONTENT` は `{ format: "doubles", gameCount: 8, levels: "four", ungrouped: false, courts: null }`。組の並びを返す `matchGroupsOf(settings)` を約束に置く（画面とサーバーで使う）
- [ ] T005 `contracts/public.ts`：`MatchView` から `minutesPerGame` を外し、`teams?: string[][]` を足す。試験 `contracts/public.test.ts`
- [ ] T006 端末の写しを読むときに直す `web/offline/store.ts`（試合表の写し・送っていない変更の中身を `MatchTableContent` で直す。直せないものは今と同じく扱う）。試験を先に書く（前の形の写しを入れて、読むと新しい形）

## Phase 3: User Story 1 - 試合の数を入れて組む (P1)

**Goal**: 時刻を入れずに試合の数だけで組む。**Independent Test**: 試合の数 10 で組むと、どの組も10行。

- [ ] T007 [US1] `web/plan.ts`：`gameCountFor` は `settings.gameCount`。`groupsOf` は `matchGroupsOf`。試験 `web/pairing.test.ts`・`web/day-of.test.ts`・`web/regroup.test.ts` の設定の作り方を新しい形に直す
- [ ] T008 [US1] `web/RosterPage.tsx` の設定の枠：「1試合（分）」「試合の始まり」「試合の終わり」を外し「試合の数」（1〜60・欄のそばに誤り）を置く。冒頭の説明の文を直す
- [ ] T009 [P] [US1] `web/BoardPage.tsx`・`web/PrintPage.tsx` の題の下の文から「1試合◯分」「試合 ◯〜◯」を外す（印刷は「N試合」）
- [ ] T010 [P] [US1] 見るだけのページの見込みをやめる：`web/view-estimate.ts`・`web/view-estimate.test.ts` を消し、`web/ViewPage.tsx` の見込みの文と計算を外す（最後に読んだ表の今の試合をそのまま出す）
- [ ] T011 [US1] サーバーの `apps/api/src/modules/match/share-repository.ts` の `readView`：`matchGroupsOf` の組の並び・`minutesPerGame` を外す。試験 `routes-share.test.ts`・`routes.test.ts` の中身を新しい形に（前の形の中身を DB に直に入れても読めることも確かめる）

## Phase 4: User Story 2 - レベル別と分けないの両方を作る (P1)

**Goal**: 分け方を組み合わせ、試合表で切り替えて見る。**Independent Test**: 両方を選んで組むと2つのタブ。

- [ ] T012 [US2] 試験を先に書く `web/regroup.test.ts`・`web/plan` の試験：レベル別 + 分けないで組むと両方の組ができる／`all` はいつもレベルの差の上限を使う／分けないを足すだけならレベル別の組はそのまま、足した `all` は試合の数のまま（進んだ数は同じ分け方の中だけ。research R3）／レベル別を外して分けないを足すと、終わった試合は今と同じく移す
- [ ] T013 [US2] `web/plan.ts`：`planGroup` のレベルの差の上限を `group.key === "all"` で決める。進んだ試合の数を分け方ごとに数える（`setOf(key)`・`setElapsed`）
- [ ] T014 [US2] `web/regroup.ts` の `changeSettings`：組の並びを `matchGroupsOf` で比べ、進んだ数は「外す組 + 同じ分け方の組」で数える。`describeSettingsChange` の言葉を分け方に合わせる
- [ ] T015 [US2] `web/RosterPage.tsx` の設定の枠：「分け方」（チェック「レベル別」＋4つ・3つ・2つ／チェック「分けない」）。どれも外すと誤り。一覧に分けないの「全員」も出す
- [ ] T016 [P] [US2] `web/SetTabs.tsx`（新しい。分け方のタブ。role="tablist"・aria-label「分け方」・左右の矢印。`GroupTabs` と同じ作り）と、分け方の一覧を返す `web/plan.ts` の `setsOf(content)`
- [ ] T017 [US2] `web/BoardPage.tsx`：分け方が2つ以上なら `SetTabs`、レベル別の中で組のタブ。`web/DayOfDialogs.tsx` の「レベルの分け方」を「分け方と試合の形」にし、レベル別（なし・4つ・3つ・2つ）・分けない・ミニゲーム（コート数）・試合の形を選べるようにする
- [ ] T018 [P] [US2] `web/ViewPage.tsx`・`web/BigPage.tsx`：分け方のタブ
- [ ] T019 [P] [US2] `web/PrintPage.tsx`：刷る組の一覧に分けないの組も（今の `groupsOf` の並びのまま）
- [ ] T020 [US2] `web/handoff.ts`：`KM2.` を書く（1試合の長さを外し、チームの節を足す）・`KM1.` も読む。`viewFromHandoff` を新しい `MatchView` に。試験 `web/handoff.test.ts`（KM2 の行き来〈property-based〉・KM1 の前の QR を読める）・`web/view-import.test.ts`

## Phase 5: User Story 3 - ミニゲームのチームを分ける (P1)

**Goal**: コート数×2 のチームに、レベルを均して分ける。**Independent Test**: 18人・コート3 → 6チーム×3人、差が小さい。

- [ ] T021 [US3] 試験を先に書く `web/mini-game.test.ts`（fast-check）：チームの数は courts×2・人数の差は1まで・来る人でレベルのある人がみな1つのチームに・どの2人を入れかえても点の差の最大が小さくならない・同じ種なら同じ答え・人が足りないと組まない
- [ ] T022 [US3] `web/mini-game.ts`（新しい）：`planTeams({ players, courts, seed })`（くじで混ぜ → 点の順 → 蛇の順 → 入れかえ。research R4）・`teamsSummary`（チームの数と1チームの人数）・`buildMini(content, seed)`
- [ ] T023 [US3] `web/plan.ts` に `rebuild(content, seed)`（`plan` と `mini` を作る）。「試合表を作る」（`web/RosterPage.tsx`）・「別の組み合わせにする」（`web/BoardPage.tsx`）・分け方を変えたとき（`web/BoardPage.tsx`）を `rebuild` にする。`web/regroup.ts`：ミニゲームを外すとチームを消す・コート数が変われば組み直す
- [ ] T024 [US3] `web/RosterPage.tsx` の設定の枠：チェック「ミニゲーム」と「コート数」（1〜20）。一覧に「6チーム・1チーム2〜3人」・人が足りないときの理由
- [ ] T025 [P] [US3] `web/MiniTeams.tsx`（新しい）：コートごとのチーム（運営の画面はレベルの印・来る人でない人の印・チームに入っていない人）。`web/BoardPage.tsx` の「ミニゲーム」のタブで出す
- [ ] T026 [P] [US3] 見るだけ：`apps/api/src/modules/match/share-repository.ts` の `readView` に `teams`（呼び名だけ）。試験 `routes-share.test.ts`（レベルが出ない）。`web/ViewPage.tsx`・`web/BigPage.tsx` にミニゲームの表（大きく映すは大きな字）
- [ ] T027 [P] [US3] 印刷：`web/print-layout.ts` の `layoutTeamsSheet`（試験 `web/print-layout.test.ts`：紙に収まる）と `web/PrintPage.tsx` の刷るものにミニゲーム

## Phase 6: User Story 4 - 当日に人が変わってもチームを直せる (P2)

**Goal**: 当日の印でチームは変えず、やり直せる。**Independent Test**: 帰った人に印、やり直すと外れる。

- [ ] T028 [US4] 試験 `web/day-of.test.ts`：当日の印を変えても `mini` は変わらない
- [ ] T029 [US4] `web/MiniTeams.tsx`：来る人でない人の印・「チームに入っていない人」・「チーム分けをやり直す」（担当の端末・確かめの枠）。`web/BoardPage.tsx` から `buildMini` で直す

## Phase 7: Polish

- [ ] T030 E2E を直す・足す `e2e/tests/match.spec.ts`（設定の欄・試合の数・レベル別と分けないの両方を切り替える・ミニゲームの表・見るだけのページのミニゲーム）と、設定を作るほかの E2E（`match-offline.spec.ts`・`match-reception.spec.ts`）。両方の幅で axe・CSP
- [ ] T031 `docs/apps/match.md` を直す（中身の形・画面・組み方・テスト）
- [ ] T032 `pnpm check` を流し、コミットする

## Dependencies

- Phase 2 → どの話の前にも要る。US1 → US2（設定の枠を同じファイルで直す）→ US3（分け方のタブの上にミニゲームのタブ）→ US4
- [P] は別のファイルで、前の作業に頼らないもの

## Implementation Strategy

MVP は US1（試合の数）。US2・US3 は同じ PR で入れる（持ち主の頼みは一度に）。US4 は小さいので同じ PR。
