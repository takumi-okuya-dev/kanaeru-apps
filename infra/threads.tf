# Threads の運用アプリ（threads-002。PRD B4・B9。docs/apps/threads.md）。var.threads_enabled が true のときだけ作る（本番は切で出す。coding.md 2）。
#
# - 秘密の値（AD-9）：
#   - TOKEN_ENCRYPTION_KEYS：Threads のトークンを包む鍵の束（{"1":"<32バイトの base64>"}）。Terraform は入れ物だけを作り、
#     値は手で版を足す（README の 9）。state に残さないため。鍵を替えるときは、版を足した JSON を新しい版として足し、
#     var.threads_token_key_version を上げる
#   - JOB_TRIGGER_SECRET：定期の仕事の合言葉。Cloud Scheduler の見出しに入れるので、Terraform が作り（random_password）、
#     state に残る（state のバケットは非公開。Cloud Scheduler の見出しは秘密の参照を使えないため）
#   - THREADS_APP_SECRET：Meta のアプリの秘密の値（threads-010。var.threads_app_id を入れたら入れ物を作る）。鍵の束と同じく
#     Terraform は入れ物だけを作り、値は手で版を足す（README の 9。state に残さないため）。アプリの ID は秘密でないので変数で渡す
# - 鍵の束と合言葉は、予約（booking.tf。var.booking_enabled）も使うので、どちらかが入なら作る（local.shared_secrets_enabled）。
#   資源の名前は Threads のときのまま（名前を変えると作り直しになり、手で足した鍵の版が消えるため）
# - 定期の仕事：5分おき・日本時間 8時〜23時台（DB の夜間の停止の外。AD-10）に POST /api/v1/threads/jobs/tick を呼ぶ。
#   Cloud Scheduler の仕事は、夜間の停止の2つと合わせて3つ（無料の枠の中。原則 V）

locals {
  # Threads と予約が共に使う秘密（鍵の束・合言葉）を作るか
  shared_secrets_enabled = var.threads_enabled || var.booking_enabled
}

resource "google_secret_manager_secret" "threads_token_keys" {
  count     = local.shared_secrets_enabled ? 1 : 0
  secret_id = "${local.name}-token-encryption-keys"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "random_password" "job_trigger" {
  count   = local.shared_secrets_enabled ? 1 : 0
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "job_trigger" {
  count     = local.shared_secrets_enabled ? 1 : 0
  secret_id = "${local.name}-job-trigger-secret"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "job_trigger" {
  count       = local.shared_secrets_enabled ? 1 : 0
  secret      = google_secret_manager_secret.job_trigger[0].id
  secret_data = random_password.job_trigger[0].result
}

resource "google_secret_manager_secret_iam_member" "runtime_threads_token_keys" {
  count     = local.shared_secrets_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.threads_token_keys[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_secret_manager_secret_iam_member" "runtime_job_trigger" {
  count     = local.shared_secrets_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.job_trigger[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_cloud_scheduler_job" "threads_tick" {
  count       = var.threads_enabled ? 1 : 0
  name        = "${local.name}-threads-tick"
  description = "5分おき（8時〜23時台）に Threads の定期の仕事（自動投稿・トークンの延長・反応の取りこみ）を呼ぶ"
  region      = var.region
  schedule    = "*/5 8-23 * * *"
  time_zone   = "Asia/Tokyo"

  # 1回の失敗は次の回が拾う（試みの行で二重にしない）ので、やり直さない
  retry_config {
    retry_count = 0
  }

  attempt_deadline = "120s"

  http_target {
    http_method = "POST"
    uri         = "${local.web_url}/api/v1/threads/jobs/tick"
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

# ---- OAuth の接続と Meta の Webhook（threads-010）
# 秘密の値の入れ物は、Threads を入にしていて Meta のアプリの ID を入れたら作り、OAuth の入・切とは別に残す
# （一時的に切っても、手で入れた秘密の値を消さない。入・切で変わるのは Cloud Run の設定だけ。cloud_run.tf）
locals {
  threads_app_provisioned = var.threads_enabled && var.threads_app_id != ""
  threads_oauth           = local.threads_app_provisioned && var.threads_oauth_enabled
}

resource "google_secret_manager_secret" "threads_app_secret" {
  count     = local.threads_app_provisioned ? 1 : 0
  secret_id = "${local.name}-threads-app-secret"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "runtime_threads_app_secret" {
  count     = local.threads_app_provisioned ? 1 : 0
  secret_id = google_secret_manager_secret.threads_app_secret[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}
