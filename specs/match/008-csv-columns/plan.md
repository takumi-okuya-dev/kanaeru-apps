# Implementation Plan: 列の確かめ（match-008）

**Branch**: `feature/match-008-csv-columns` | **Spec**: [spec.md](./spec.md)

## Summary

名簿の取り込み（貼り付け・CSV）で、読んだ表をすぐ名簿に入れず、「列の確かめ」の枠を挟む。列の選び方とレベルの読み方は `roster-read.ts` に、枠は `ColumnCheckDialog.tsx` に置く。サーバー・DB・約束（contracts）は変えない。

## Technical Context

- 画面の中だけで読む（今と同じ。`lib/csv-read.ts` の `parseCsv`）。サーバーに送るのは呼び名とレベルだけ（今と同じ）
- 変えるファイル（match の領域だけ）：`apps/web/src/features/match/roster-read.ts`・`RosterPage.tsx`・新しい `ColumnCheckDialog.tsx`・試験
- 共通のファイルは変えない（`<select>` は `inputClassName` で形をそろえる。ほかの画面と同じやり方）

## 設計

- `detectColumns(parsed)`：氏名（見出しの決まり。列が1つならその列。なければ -1）・レベル（見出し → 選択肢の言葉で推しはかる → -1）・日時（見出し）
- `levelChoices(parsed, levelIndex)`：選択肢（重ねない値）と、その既定のレベル（`readLevel`。言葉を先に読む）
- `readRoster(parsed, selection?)`：選んだ列とレベルの対応で読む。`selection` がなければ `detectColumns` の答えで読む（今の呼び方を残す）。氏名の列がなければ人は空
- `timestampKey`：年・月・日・時・分・秒を取り出し、午後・PM は 12 時間足す（12 時の午前は 0 時）
- 枠：氏名・レベル・日時のプルダウン、レベルの対応の表、先頭の3人と人数、取り込むボタン（氏名の列がない・読めない選択肢が残るときは押せない）

## Constitution Check

- II（本人の情報を最小に）：読む列は今と同じ3つ。ほかの列は値を持たない。氏名はサーバーに送らない
- V（費用）：画面の中だけの変更
- 並行開発：match の領域のフォルダの中だけ。共通のファイルは変えない
