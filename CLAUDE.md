# <プロダクト名> で作業する Claude Code へ

**AIが守る決まりは、この文書と、ここからリンクする`docs/rules/`だけに置く**。ほかの文書（仕様・今の形の説明・手順書）には決まりを書かない。決まりを変えたら、同じPRでここか`docs/rules/`を直す（AIのメモリーだけに書かない。ほかのセッションから読めないため）。

| 決まり | 本文 |
|---|---|
| 守る原則（ほかと食い違ったらこれが正） | [Constitution](.specify/memory/constitution.md) |
| ブランチ・PR・レビュー・CI・マージ・デプロイ | [docs/rules/development-flow.md](docs/rules/development-flow.md) |
| 仕様のフォルダと番号・仕様の役目・ブランチとコミットの名前 | [docs/rules/specs.md](docs/rules/specs.md) |
| コードの書き方・設定と環境・DBの変更・テスト | [docs/rules/coding.md](docs/rules/coding.md) |
| セッションを分けて同時に進める・ぶつからないための決まり | [docs/rules/parallel-development.md](docs/rules/parallel-development.md) |
| 文書の種類と置き場所・作らない文書・書き方 | [docs/rules/documents.md](docs/rules/documents.md) |
| スキルを使う順番（構想はBMAD、実装はspec-kit） | [docs/ai-skills.md](docs/ai-skills.md) |

どのセッションも、作業を始める前に読み、必ず守る。

## いちばん大事な決まり（要約）

### 作業の進め方

1. **ユーザーへの返事・報告・質問は日本語で書く**。
2. **最終の承認はユーザー**。確かめずにPRまで進めてよいが、コミット・push・PRのマージは、ユーザーに頼まれたときだけ行う（[development-flow.md](docs/rules/development-flow.md) 4）。
3. **CIは節約する**。`run-ci`は慎重なPRだけ。ほかは手元で全部のテストを流し、結果をPRに書く（[development-flow.md](docs/rules/development-flow.md) 3）。
4. **秘密の値・本物の利用者のデータ・個人の情報をコミットしない**（[coding.md](docs/rules/coding.md) 2）。
5. 見つけたバグが今のPRの目的と別なら、別のPRで直す。
6. **構想・計画はBMAD、実装はspec-kit**。同じ機能で2つを並行して使わない（[ai-skills.md](docs/ai-skills.md)）。

### 並行開発（[parallel-development.md](docs/rules/parallel-development.md) の要約）

1. **自分の領域のフォルダの中で作る**。ほかの領域のフォルダには触らない。
2. **共通のファイルで触ってよいのは「1行に1つ」の一覧だけ**（`.gitattributes`で`merge=union`にしたもの）。1行に1つだけ書き、ほかの中身を足さない。
3. **テストに領域（アプリ）の数や並びを書かない**。登録された数と比べる。
4. **それ以外の共通を直すときは、領域のPRに混ぜず、小さな共通のPRに分けて先に入れる**。作る前にユーザーに伝える。
5. **DBの変更のあるPRは小さく切り、先に入れる**。
6. **developを少なくとも1日1回、PRを出す前とマージの前に取り込む**。共通のファイルがぶつかって迷ったら、自分で決めずにユーザーに相談する。

<!--
  言語・フレームワークを決めたら、ここに足す：
  - よく使うコマンド（起動・テスト・lint・型チェック）
  - 領域のフォルダの具体的なパス（例：src/<領域>/）と、「1行に1つ」の一覧ファイルのパス
-->
