# Quickstart: 定員・キャンセル待ち・繰り上げ（booking-004）

2026-11-20 作成。名前・アドレスはどれも架空のもの。手元（`APP_ENV=local`）では、どの設定でも偽の送り手を使い、本物の LINE とメールには送らない。

## 1. 手元で確かめる

1. `pnpm dev`。手元のログイン（`/dev/login`）で主催者 A としてログインし、交流会を作る。準備の画面の「使い方」で「自前で申込みを受ける」を選び、「申込みページ」で受付を開く。
2. 「定員とキャンセル待ち」の節で定員を2にして保存する。ログインしていないブラウザで申込みページを開くと「残り 2 席」が出る。
3. 参加者 B・C（手元のログイン）で申し込む。3人目の D で開くと「満員です（キャンセル待ち 0 人）」が出て、申し込むと「キャンセル待ちの1番目」になる。A の準備の画面に「満員です」が出る。
4. B で `/my-bookings` を開いて取り消す。D の `/my-bookings` に「打診中（返事の期限：…）」と「参加する」「辞退する」が出る（取り消しの要求の中で打診する）。「参加する」で確定になる。
5. 定期の仕事を手で呼ぶ：`.env` の `JOB_TRIGGER_SECRET` に架空の合言葉を入れて立ち上げ直し、`POST http://localhost:8817/api/v1/booking/jobs/tick` を、見出し `Authorization`（`Bearer` と合言葉）と本文 `{}` で送る（HTTP の道具で）。期限の来た打診を片付け、答えに数が出る（合言葉なし・違うときは 404）。
6. 名簿で行の「送った知らせ」を開くと、種類・手段・結果・時刻が出る（`NOTIFY_MODE` が `off` なら「止めている」）。`NOTIFY_MODE=on` で立ち上げれば、A でログインしたまま `GET /api/v1/booking/dev/notify-outbox` で偽の送り手の中身を見られる。
7. 交流会の日時を直す（event の直す画面）。準備の画面に「日時や場所が変わりました」の帯が出て、「変更を知らせる」で `changed` が送られる。「予約を中止する」で、申込みが取り消しになり、申込みページは「この会は中止になりました」になる。

## 2. 本番で出すときに要るインフラの変更（この仕様では `infra/` を直さない）

- **Cloud Scheduler の仕事を1つ足す**：`POST ${WEB_URL}/api/v1/booking/jobs/tick`・見出し `Content-Type: application/json` と `Authorization: Bearer <JOB_TRIGGER_SECRET>`・本文 `{}`・`schedule = "*/10 9-23 * * *"`・`time_zone = "Asia/Tokyo"`・やり直しなし（次の回が拾う）・`attempt_deadline = "120s"`・`lifecycle { ignore_changes = [paused] }`。形は `infra/threads.tf` の `threads-tick` と同じ。DB の夜間の停止（0時〜8時）の外で、8時台は DB の起動を待つために外す（AD-10・AD-24）。
- **合言葉 `JOB_TRIGGER_SECRET`**：今は `infra/threads.tf` で `var.threads_enabled` のときだけ作っている（`random_password.job_trigger`）。booking の仕事にも使うので、threads を切っていても作る形に移すか、booking の仕事を同じ条件にする（Terraform の変更。共通の変更の PR で）。Cloud Run の環境変数 `JOB_TRIGGER_SECRET` も同じ条件。
- **費用**：Cloud Scheduler の無料の枠は請求先アカウントごとに3つ（今は夜間の停止の2つと threads の1つ）。4つ目は月 0.1 米ドル（原則 V の範囲。予算の知らせは月2,000円のまま）。費用をゼロにしたいときは、仕事を足さずに、書く窓口と読む窓口の判定だけで動かせる（期限切れは次の申込み・返事・取り消し・主催者の操作か、ページを見たときの表示で拾う。繰り上げの知らせは遅れる）。
- 新しい秘密・設定・資源はほかにない。`NOTIFY_MODE` は本番では `off` のまま出す（booking-002）。`off` の間、打診・変更・中止の知らせは送らず記録だけ（返事は自分の申込み・札のページで受けられる）。

## 3. 確かめのテスト

```bash
pnpm check                                  # 全部（型・lint・単体と結合・E2E）
pnpm --filter api exec vitest run src/modules/booking
pnpm --filter web build && pnpm --filter e2e exec playwright test tests/booking-waitlist.spec.ts
```
