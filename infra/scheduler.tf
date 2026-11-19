# 夜間（0時〜8時。日本時間）に Cloud SQL を止める（core-002。AD-10）。
# Cloud Scheduler が Cloud SQL Admin API に PATCH を送り、activationPolicy を NEVER（止める）・ALWAYS（動かす）にする。
# Google の API（*.googleapis.com）を呼ぶので、OIDC ではなく OAuth のトークンを使う。間に関数を挟まない。
# 交流会が0時を越える日は、主催者が `gcloud scheduler jobs pause kanaeru-db-stop --location=asia-northeast1` で止める。
# Terraform はその paused の差を無視する（次の apply で戻さない）。翌日に resume を忘れないこと（README の 7）。

locals {
  db_schedules = {
    stop  = { schedule = "0 0 * * *", policy = "NEVER", description = "毎日0時に kanaeru の DB を止める" }
    start = { schedule = "0 8 * * *", policy = "ALWAYS", description = "毎日8時に kanaeru の DB を動かす" }
  }
}

resource "google_cloud_scheduler_job" "db" {
  for_each = local.db_schedules

  name        = "${local.name}-db-${each.key}"
  description = each.value.description
  region      = var.region
  schedule    = each.value.schedule
  time_zone   = "Asia/Tokyo"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "60s"
  }

  http_target {
    http_method = "PATCH"
    uri         = "https://sqladmin.googleapis.com/v1/projects/${var.project_id}/instances/${google_sql_database_instance.main.name}"
    headers     = { "Content-Type" = "application/json" }
    # 本文は base64 にした文字で渡す
    body = base64encode(jsonencode({ settings = { activationPolicy = each.value.policy } }))

    oauth_token {
      service_account_email = google_service_account.db_scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  lifecycle {
    ignore_changes = [paused]
  }

  depends_on = [
    google_project_service.apis,
    google_project_iam_member.db_scheduler_sql_activation,
  ]
}
