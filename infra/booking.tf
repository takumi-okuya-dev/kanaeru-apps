# 予約（booking-002〜004。PRD・AD-24。specs/booking）。var.booking_enabled が true のときだけ作る（本番は切で出す。coding.md 2）。
#
# - 鍵の束（TOKEN_ENCRYPTION_KEYS）と合言葉（JOB_TRIGGER_SECRET）は Threads と共に使う（threads.tf。local.shared_secrets_enabled）。
#   鍵の束は、組織・個人の LINE 公式アカウントのチャネルシークレットとアクセストークンを包む
# - 知らせの送り方 NOTIFY_MODE（var.booking_notify_mode。既定 off）は秘密でないので環境の値で渡す（cloud_run.tf）
# - 許可リスト NOTIFY_ALLOWLIST（自分たちの LINE のユーザー ID・メールアドレス）は秘密の値と同じく扱う（AD-24）。
#   Terraform は入れ物だけを作り、値は手で版を足す（README の 10。state とリポジトリに残さないため）。
#   Cloud Run が読むのは booking_notify_mode が allowlist のときだけ（on・off では要らない）
# - 定期の仕事：10分おき・日本時間 9時〜23時台に POST /api/v1/booking/jobs/tick を呼ぶ（期限切れの打診の片付け・繰り上げ・
#   当日の空き・変更の知らせ。booking-004 research R2）。打診の期限は夜なら翌9時にずらすので、9時から動かす（DB は8時から動く。AD-10）。
#   止まっても、書く窓口と読む窓口で期限は守られる。Cloud Scheduler の仕事は、夜間の停止の2つ・Threads と合わせて最大4つになり、
#   無料の枠（3つ）を超えた1つは月に $0.10 ほど（原則 V）

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

resource "google_cloud_scheduler_job" "booking_tick" {
  count       = var.booking_enabled ? 1 : 0
  name        = "${local.name}-booking-tick"
  description = "10分おき（9時〜23時台）に予約の定期の仕事（打診の期限切れ・繰り上げ・当日の空き・変更の知らせ）を呼ぶ"
  region      = var.region
  schedule    = "*/10 9-23 * * *"
  time_zone   = "Asia/Tokyo"

  # 1回の失敗は次の回が拾う（片付けは何度呼んでも同じ結果になる）ので、やり直さない
  retry_config {
    retry_count = 0
  }

  attempt_deadline = "120s"

  http_target {
    http_method = "POST"
    uri         = "${local.web_url}/api/v1/booking/jobs/tick"
    headers = {
      "Content-Type"  = "application/json"
      "Authorization" = "Bearer ${random_password.job_trigger[0].result}"
    }
    body = base64encode("{}")
  }

  lifecycle {
    ignore_changes = [paused]
  }

  depends_on = [google_project_service.apis]
}
