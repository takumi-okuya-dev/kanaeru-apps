# Quickstart: 読書記録の本棚と取りこみ（reading-001）

作ったものが動くかを確かめる手順。窓口の形は [contracts/reading.md](./contracts/reading.md)、表は [data-model.md](./data-model.md)。

## 前の準備

- 共通の PR が `develop` に入っている：#167・#169（pr1 の前）、#176（pr2 の前）。人物メモの #168（DB の変更）も入っている。
- 作業場所の `.env` で、DB の名前と口の番号を分ける（[並行開発の決まり](../../../docs/rules/parallel-development.md)）。
- `pnpm install && pnpm local:setup`（DB の変更が当たる）。

## 自動の確かめ

```bash
pnpm db:check   # DB の変更の作り忘れ・順番
pnpm typecheck && pnpm lint
pnpm test       # 約束（鍵・貼り付け・GoodNotes の読み方）・窓口（本物の PostgreSQL）・画面
pnpm e2e        # 本棚・取りこみ・本の画面の流れと axe
```

確かめること（テストの名前の目安）：

1. 鍵：空白と改行の違いだけの文は同じ鍵、ページが違えば別の鍵（`marker-key.test.ts`）。
2. 取りこみ：同じ束を2回送ると `inserted` が0。直したコメント・付け外した `?`・消したマーカーは取りこみ直しで変わらない（`routes.test.ts`）。
3. 本文の上限：100KB を超える束は `413`。1束 501件は `422`。
4. 持ち主：ほかの使う人の本・マーカーの ID を道と本文に入れると `404`。まとめ先がほかの人の本でも `404`。
5. 書誌：`deps.fetch` を差しかえ、openBD・NDL の答え（見本の JSON と XML）から候補を作る。打ち切り・500・形の違う XML は `502 CATALOG_UNAVAILABLE`。書影の URL が `https://cover.openbd.jp/` でなければ `422`。
6. GoodNotes の読み方：架空の見本の PDF（半透明の太い線3本・HiraginoSans のテキストボックス1つ・柱つき）から、マーカー3つ・コメント1つ・章・ページが取れる（`goodnotes.test.ts`）。
7. 送る中身：取りこみの画面のテストで、送った本文に PDF のバイトとマーカーのない文が入っていない（SC-004）。
8. ログ：マーカーの文に決まった言葉を入れて取りこみ、エラーを起こしても、ログにその言葉が出ない（`logging.test.ts`）。
9. 退会：本とマーカーを持つ使う人を消すと、両方の表に行が残らない。

## 手で確かめること（持ち主の iPhone）

1. Safari で `/reading` を開き、書名で本を1冊足す（書影がない本は仮の表紙）。
2. GoodNotes で、持ち主の本を PDF に書き出して「ファイルに保存」し、`/reading/import` の「ファイルを選ぶ」で選ぶ。1分以内に確かめの画面が出て、マーカー80・コメント4・章が出る（SC-001・SC-002）。
3. 「入れる」を押し、本の画面に章ごとに並ぶ。「ここからあまり良く理解できない」が、7.2.5 の見出しの下のマーカーに付いている。
4. 同じ PDF をもう一度取りこみ、「新しいマーカー 0」と出る（SC-003）。
5. LINE の中のブラウザ（ミニアプリ）でも「ファイルを選ぶ」を試す。選べなければ、Safari で開く案内が出る（research R13・構成の Open Questions 14）。
6. 100MB 以上の PDF（書きこみの多い本）でも落ちないかを見る（Open Questions 15）。

本物の本の PDF と、取りこんだ持ち主のマーカーは、リポジトリにもステージングにも入れない。
