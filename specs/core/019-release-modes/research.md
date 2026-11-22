# Research: 本番に出す3つのモード（core-019）

## R1. 本番の前の確かめ：1回の流れの中で、ステージング → 承認 → 本番

- `main` のマージで、同じコミットをまずステージングに出し（`deploy-environment.yml` を `environment: staging` で呼ぶ）、成功したら `environment: production` で呼ぶ。GitHub の環境 `production` に承認者（Required reviewers）を置くと、その仕事は承認するまで始まらない（GitHub の Environments。公開のリポジトリで使える）。
- `hotfix/*` をそのままステージングに出す形（案A）は、WIF とデプロイの身分にブランチを足すことになり、ステージングが develop と違う中身になる時間も長い。案B は本番に出るのがいつも `main` の中身だけで、手順が1本。
- ステージングは `main` のマージのたびに `main` の中身になる。次の `develop` のマージ（`main` を `develop` に取り込み直したときを含む）で develop の中身に戻る。
- ステージングのデプロイの身分を `main` からも使えるよう、WIF のなりすましを `refs/heads/develop` と `refs/heads/main` の2つにした。本番の身分は `main` からだけのまま。
- 2つの流れ（`main` と `develop`）が同じ環境に同時に出ないよう、`deploy-environment.yml` の仕事は環境ごとに1つずつ（`concurrency: deploy-environment-<環境>`）。

## R2. 夜の緊急デプロイ：DB を一時的に起こして、必ず止め直す

- `wake_db` を入にして手で流すと、`wake-db` の仕事が `gcloud sql instances patch --activation-policy=ALWAYS` で起こし、`RUNNABLE` になるまで待つ（最大10分）。
- `stop-db` の仕事は `wake-db` だけを待ち、`keep_awake_minutes`（10〜60。既定40）たったら、成功・失敗・承認しなかったにかかわらず `--activation-policy=NEVER` で止め直す。本番の仕事（承認待ち）を待たないのは、承認されないと何日も待ち続け、そのあいだ DB が起きたままになるため。決めた時間を過ぎてから承認すると、本番の DB の変更は DB に届かず失敗する（DB の変更を当てる job が3分待って止まる）ので、新しい版は出ない（安全な側に止まる）。
- 使えるのは0時〜7時45分だけ。23時〜0時は0時の停止（Cloud Scheduler）と重なり、7時45分〜8時は8時の起動と重なるため。止め直す時刻が8時を過ぎていたら止めない（Cloud Scheduler が起こした昼の DB を止めないため）。
- 権限：DB を止める・動かすだけの自前の役割（`kanaeruSqlActivation`。夜間の停止の身分と同じ）を、両方の環境のデプロイの身分に付けた。ステージングの身分にも付くので、理屈の上では develop に入ったコードから昼に DB を止めることもできる（主催者が受け入れた。夜にステージングで確かめてから本番に出す流れを取るため）。
- 料金：db-f1-micro を40分起こしても1円未満。

## R3. 新しいアプリ：出す（デプロイ）と公開を分ける

- コードは週ごとのリリースで本番にも入れ、本番のアプリの台帳（AD-16）では「切」にしておく。ステージングで1週間試し、問題がなければ本番の台帳を公開に切り替える。デプロイは要らない。DB の変更は前の版のアプリでも壊れない形だけにする決まり（`docs/rules/coding.md` 3）があるので、先に入れても困らない。
