# Tasks: 列の確かめ（match-008）

- [X] T001 `roster-read.ts`：`detectColumns`（氏名がなければ -1・列が1つならその列・レベルを選択肢の言葉で推しはかる）・`levelChoices`・`readRoster` に選んだ列とレベルの対応を渡せるようにする。試験：SC-001・SC-002
- [X] T002 `roster-read.ts`：`readLevel` は言葉を数字より先に読む。試験：「1入門」は入門
- [X] T003 `roster-read.ts`：タイムスタンプの午前・午後・AM・PM を 24 時間に直して比べる。試験：SC-003
- [X] T004 `ColumnCheckDialog.tsx`：列の確かめの枠（プルダウン・レベルの対応・先頭の3人・押せない条件）。試験：氏名の列がないと押せない・選ぶと押せる・読めない選択肢が残ると押せない
- [X] T005 `RosterPage.tsx`：貼り付けと CSV の取り込みを、列の確かめの枠を通す形にする
- [X] T006 手元で全部の確かめ（型・lint・web の試験）〔2026-11-26：web 80 ファイル・454 件、e2e の match.spec・match-reception.spec 12 件が通過。ダミーの Google フォームで落とした本物の CSV の形〈全部の欄が引用符・「午後 GMT+9」・メールの見出しは「ユーザー名」〉を試験の見本に足した〕
