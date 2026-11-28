# テストの見本の PDF

`goodnotes-sample.pdf` は、`pdf.test.ts` が読む見本の PDF（約 4KB・2ページ）。GoodNotes から書き出した PDF の形を写し、文はどれも架空のもの（research R14）。本物の本の PDF や、使う人の PDF は置かない。

## 中身

| ページ | 柱 | マーカー | テキストボックス |
|---|---|---|---|
| 1 | 「1.2　見本の節」・ページ番号 13 | 1行目の頭・4行目の真ん中（半透明 0.5 の黄色・幅 12pt の線） | 4行目のマーカーの下に「あとで読み返したいところ」 |
| 2 | 「1.2　見本の節」・ページ番号 14 | 2行目の頭（座標を半分にし、CTM で2倍に描いた線。幅 6pt × 2） | なし |

- 1ページ目には、マーカーとみなさない線（不透明・幅 1pt の黒い線）も1本ある。
- 本文は `Ryumin-Light`、テキストボックスは `HiraginoSans-W3`（GoodNotes の既定）という名前の日本語の CID 書体。書体は埋めこまず、文字は決まった CMap（`UniJIS-UCS2-H`）で書くので、pdf.js は CMap を読まないと文字を取れない（CMap の読みこみも一緒に確かめられる）。

## 作り直す

`make-sample.ts` が PDF の文を手で組み立てて書き出す（依存は足さない）。中身を変えたら、`apps/web` で流して作り直し、`pdf.test.ts` の期待を合わせる。

```sh
pnpm exec node src/features/reading/import/__fixtures__/make-sample.ts
```
