# property-based テスト（fast-check）の学び

- 作成日：2026-11-22（match-005）
- 直した日：—（まだない）

kanaeru で初めて使う書き方なので、**このプロジェクトでの使い方に絞って**説明する（[文書の決まり](../rules/documents.md) 1）。テストの決まりの正本は [コードの書き方](../rules/coding.md) 4・6-5、使う場所の決めごとは [構成の決めごと](../../_bmad-output/architecture-kanaeru/architecture-kanaeru.md) AD-29（組み合わせの計算は property-based で試す）。

## 1. 何か

ふつうのテスト（例で試す）は「この入力なら、この答え」を1つずつ書く。property-based テストは「**どんな入力でも、いつも成り立つ性質**」を書き、道具がでたらめな入力を何十〜何百通り作って確かめる。破れる入力が見つかると、道具がその入力を**できるだけ小さく縮めて**（shrink）見せてくれる。

kanaeru は [fast-check](https://fast-check.dev/)（画面の `devDependencies`。Vitest の中で使う）を使う。

```ts
import fc from "fast-check";

it("どんなバイトも Base45 で行って戻る", () => {
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
      expect(decodeBase45(encodeBase45(bytes))).toEqual(bytes);
    }),
  );
});
```

- `fc.uint8Array`・`fc.string`・`fc.integer`・`fc.record`・`fc.constantFrom` など（arbitrary）で入力の作り方を決める。
- `fc.property(…, (入力) => { 確かめ })` が性質。`fc.assert` が既定で100回試す（`{ numRuns }` で変えられる）。
- 非同期の関数は `fc.asyncProperty` と `await fc.assert(…)`。

## 2. どんな性質を書くか（kanaeru の例）

| 型 | 例 | 場所 |
|---|---|---|
| 行って戻る（往復） | 符号にして戻すと同じ：Base45・試合表の QR の中身（つづきの QR に分けて順を入れかえても）・受付の QR | `apps/web/src/features/match/handoff.test.ts` |
| 範囲を出ない | 今の試合の見込みは、読んだときの今より前に戻らず、試合の数を超えず、終わった試合を指さない | `apps/web/src/features/match/view-estimate.test.ts` |
| 決まりを守る | 組み合わせ：同じ名簿と同じくじの種なら同じ表・1試合に同じ人が2回入らない・出た数の差が開かない | `apps/web/src/features/match/pairing.test.ts`（match-002） |

性質が思いつかないときは、「同じ入力なら同じ答え」「戻すと元に戻る」「どんな入力でも壊れた形を作らない（zod の形を通る）」から考える。

## 3. 失敗したときの読み方

```
Property failed after 44 tests
{ seed: 1790696919, path: "43:0:1:…", endOnFailure: true }
Counterexample: [{"version":1, …, "name":" ", …}]
```

- `Counterexample` が縮めたあとの入力。上の例は、名前の最後が空白のときに壊れた（読み取った文字の前後の空白を削っていた。Base45 は空白も文字に使う）。
- 同じ入力で試し直すには `fc.assert(…, { seed: 1790696919, path: "43:0:1:…" })`。直したら外す。

## 4. 気を付けること

- 例のテストを捨てない。仕様の例（RFC の例・画面の文言の例）は、ふつうのテストで書き、property-based は「すべての入力」の確かめに足す。
- 遅い性質（本物の QR の模様を作って読むなど）は `numRuns` を下げるか、例のテストにする。
- 入力の作り方に、実際にありうる形（日本語の呼び名・空白・絵文字・長さの上限）を入れる。英数字だけで作ると、文字の扱いの誤りを見逃す。
