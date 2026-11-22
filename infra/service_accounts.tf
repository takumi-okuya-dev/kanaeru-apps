# 共通の身分と権限（core-002・core-018。AD-9）。環境ごとの身分（Cloud Run の身分・デプロイの身分）は modules/environment/iam.tf。
#
# | 身分 | 使う所 | 役割 |
# |---|---|---|
# | kanaeru-db-scheduler | Cloud Scheduler（夜間の停止と朝の起動） | Cloud SQL の台を読む・直す（自前の役割で2つの権限だけ） |

resource "google_service_account" "db_scheduler" {
  account_id   = "${local.name}-db-scheduler"
  display_name = "kanaeru の DB を止める・動かす（Cloud Scheduler）"
  depends_on   = [google_project_service.apis]
}

# roles/cloudsql.editor は広いので、止める・動かすのに要る2つの権限だけの役割を作る
resource "google_project_iam_custom_role" "sql_activation" {
  role_id     = "kanaeruSqlActivation"
  title       = "kanaeru の Cloud SQL を止める・動かす"
  description = "Cloud Scheduler が activationPolicy を直すためだけの役割（core-002）"
  permissions = [
    "cloudsql.instances.get",
    "cloudsql.instances.update",
  ]
  # 自前の役割は IAM の API（iam.googleapis.com）で作る。ほかの資源と違い何も参照しないので、有効にするのを待つよう書く
  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "db_scheduler_sql_activation" {
  project = var.project_id
  role    = google_project_iam_custom_role.sql_activation.id
  member  = google_service_account.db_scheduler.member
}
