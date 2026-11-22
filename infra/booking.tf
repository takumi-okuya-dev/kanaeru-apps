# 予約（booking-002〜004。PRD・AD-24。specs/booking）。var.booking_enabled が true のときだけ作る（本番は切で出す。coding.md 2）。
#
# - 鍵の束（TOKEN_ENCRYPTION_KEYS）と合言葉（JOB_TRIGGER_SECRET）は Threads と共に使う（threads.tf。local.shared_secrets_enabled）。
#   鍵の束は、組織・個人の LINE 公式アカウントのチャネルシークレットとアクセストークンを包む
# - 知らせの送り方 NOTIFY_MODE（var.booking_notify_mode。既定 off）は秘密でないので環境の値で渡す（cloud_run.tf）
# - 許可リスト NOTIFY_ALLOWLIST（自分たちの LINE のユーザー ID・メールアドレス）は秘密の値と同じく扱う（AD-24）。
#   Terraform は入れ物だけを作り、値は手で版を足す（README の 10。state とリポジトリに残さないため）。
#   Cloud Run が読むのは booking_notify_mode が allowlist のときだけ（on・off では要らない）
# - 定期の仕事（期限切れの打診の片付け・繰り上げ・当日の空き・変更の知らせ）は、予約だけの Cloud Scheduler の仕事を持たない。
#   共通の定期の仕事（scheduler.tf の kanaeru-jobs-tick。core-017）が5分ごとに POST /api/v1/jobs/tick を呼び、booking の
#   scheduledJob（10分ごと・日本時間 9時〜23時台）をその回に動かす（booking-007）。止まっても、書く窓口と読む窓口で期限は守られる

resource "google_secret_manager_secret" "notify_allowlist" {
  count     = var.booking_enabled ? 1 : 0
  secret_id = "${local.name}-notify-allowlist"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "runtime_notify_allowlist" {
  count     = var.booking_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.notify_allowlist[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}
