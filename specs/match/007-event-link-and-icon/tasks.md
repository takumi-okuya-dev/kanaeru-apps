# Tasks: 名簿を入れた受付の交流会を出す・ホーム画面のアイコン（match-007）

**Input**: [spec.md](./spec.md)・[plan.md](./plan.md)・[research.md](./research.md)

- [x] T001 この仕様（spec・plan・research・tasks）
- [x] T002 約束：`MatchReceptionSource`・`MatchReceptionEventLink`・中身の `receptionEvent`・一覧の `receptionEvent`
- [x] T003 API：`reception-link.ts`・`PUT` でつなぎ直す・見せ方を付ける・入れる窓口も同じ判定・`reception-link.test.ts`
- [x] T004 画面：写しを置く・貼り付けで置きかえると外す・題の下の一行・一覧の文・単体のテスト
- [x] T005 アイコン：SVG・PNG・`render-match-icons.ts`
- [x] T006 manifest・見出しのリンク（運営の画面だけ）・Service Worker に持たせる（`publicFiles`）・単体のテスト
- [x] T007 E2E：`match-reception.spec.ts`（題の下と一覧）・`match-home-screen.spec.ts`
- [x] T008 文書：`docs/apps/match.md`・`docs/architecture.md`
- [x] T009 `pnpm check`
- [ ] T010 iPhone の Safari・Android の Chrome の実機で、ホーム画面に置いて開く・電波なしで開く・アイコンの見え方を確かめる（R8）
- [ ] T011 主催者が仮決め（アイコンの絵・色・出す場所・貼り付けで外す）を確かめる
