# UI デザインの既定（SmartHR Design System を土台にしたもの）

- 作成日：2026-11-18
- 種類：テンプレートの UI デザインの既定。プロダクトの見た目と振る舞いは、ここから始めて、プロダクトの `DESIGN.md`・`EXPERIENCE.md`（`/bmad-ux` が `_bmad-output/` に作る）で上書きする。

## 1. 何があるか

| 文書 | 何が書いてあるか |
|---|---|
| [DESIGN.md](./DESIGN.md) | 見た目：色・文字・余白・角・影・重なり・画面の幅の値（先頭にまとめた値）と、使い方 |
| [EXPERIENCE.md](./EXPERIENCE.md) | 振る舞い：原則・言葉づかい・部品と状態の型・操作・アクセシビリティの下限・画面の幅ごとの形 |

## 2. 使い方

1. プロダクトを始めたら、`/bmad-ux` に「`docs/design/` を土台にして」と頼む。プロダクトの `DESIGN.md`・`EXPERIENCE.md` は、ここの値と型を引き継ぎ、違うところだけを書く。
2. **プロダクトの色（`primary`）は必ず置きかえる**。ここの `#2F5BB7` は仮の値。置きかえても、白の上で 4.5:1 以上（文字に使うため）を保つ。
3. 画面のコードは、値を DESIGN.md から写した1か所（TypeScript なら `packages/ui` の値）だけから読む（[コードの書き方の決まり](../rules/coding.md) 1）。
4. ここを直したら、使っているプロダクトに取り込むかを決める（取り込みは手で）。

## 3. 出典とライセンス

- 土台：[SmartHR Design System](https://smarthr.design/)（SmartHR, Inc.）と、その部品集 [smarthr-ui](https://github.com/kufu/smarthr-ui)（v103.1.1 を 2026-11-18 に読んだ）。
- **値**（灰色の段・文字の大きさの段・余白・角・影・重なりの段）は、smarthr-ui のソース（`packages/smarthr-ui/src/themes/`）の値を使っている。smarthr-ui は MIT ライセンス（下の表示）。
- **考え方**（原則・言葉づかい・型）は、SmartHR Design System を読んで、このテンプレートの言葉で書き直したもの。SmartHR Design System のサイトの文章はオープンなライセンスではないので、**写さない・載せない**。詳しくは出典のページを読む。
- **使わないもの**：SmartHR のブランドの色（SmartHR Blue `#00c4cc` など。ブランドの色として使わないよう頼まれている）・プロダクトの主の色 `#0077c7`（SmartHR に見えるため、`primary` で置きかえた）・ロゴ・イラスト・SmartHR と見間違える見た目。
- 足した値（SmartHR にないもの）：`primary`・`primary-hover`・`border-input`（入力欄のふちを 3:1 以上にするため）・`danger-text`・`success`・`success-text`（灰色の地の上でも 4.5:1 以上にするため）。

smarthr-ui のライセンスの表示：

```text
The MIT License (MIT)

Copyright 2018 SmartHR

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## 4. 参考にする SmartHR のページ

| ページ | 何を読むか |
|---|---|
| [デザイン原則](https://smarthr.design/products/principles/) | 原則（EXPERIENCE.md 1） |
| [ライティングスタイル](https://smarthr.design/products/contents/writing-style/) | 言葉づかい（EXPERIENCE.md 2） |
| [デザインパターン](https://smarthr.design/products/design-patterns/) | フィードバック・値がないとき・ダイアログ・ページの形（EXPERIENCE.md 3・4） |
| [アクセシビリティのガイドライン](https://smarthr.design/accessibility/guidelines/) | 確かめの一覧（EXPERIENCE.md 6） |
| [利用規約](https://smarthr.design/terms/) | 使ってよいこと・頼まれていること |
