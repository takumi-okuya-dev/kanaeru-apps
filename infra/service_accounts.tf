# 共通の身分と権限（core-002・core-018。AD-9）。環境ごとの身分（Cloud Run の身分・デプロイの身分）は modules/environment/iam.tf。
#
# | 身分 | 使う所 | 役割 |
# |---|---|---|
# | suite-db-scheduler | Cloud Scheduler（夜間の停止と朝の起動） | Cloud SQL の台を読む・直す（自前の役割で2つの権限だけ） |
# | suite-db-waker | GitHub Actions の夜の緊急デプロイ（main からだけ。core-019） | 同じ役割。DB を一時的に起こし、決めた時間のあと止め直す |
#
# cloudsql.instances.update は止める・動かすのほかに、台の設定（ネットワーク・バックアップ・消す守り）も直せる。
# そのため、この役割を持つ身分は、Cloud Scheduler と、main からだけなりすませる suite-db-waker に限る（デプロイの身分には付けない）。

resource "google_service_account" "db_scheduler" {
  account_id   = "${local.name}-db-scheduler"
  display_name = "DB を止める・動かす（Cloud Scheduler）"
  depends_on   = [google_project_service.apis]
}

# roles/cloudsql.editor は広いので、止める・動かすのに要る2つの権限だけの役割を作る
resource "google_project_iam_custom_role" "sql_activation" {
  role_id     = "suiteSqlActivation"
  title       = "Cloud SQL を止める・動かす"
  description = "Cloud SQL の activationPolicy を直す（夜間の停止と朝の起動・夜の緊急デプロイ）ための役割（core-002・core-019）"
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

# 夜（DB を止めている間）に緊急で出すとき、GitHub Actions が DB を一時的に起こして止め直す身分（core-019）。
# なりすませるのは main のブランチから入った GitHub Actions だけ（develop に入ったコードからは、DB を止めたり設定を変えたりできない）
resource "google_service_account" "db_waker" {
  account_id   = "${local.name}-db-waker"
  display_name = "DB を夜の緊急デプロイで一時的に起こす（GitHub Actions・main だけ）"
  depends_on   = [google_project_service.apis]
}

resource "google_project_iam_member" "db_waker_sql_activation" {
  project = var.project_id
  role    = google_project_iam_custom_role.sql_activation.id
  member  = google_service_account.db_waker.member
}

resource "google_service_account_iam_member" "github_db_waker" {
  service_account_id = google_service_account.db_waker.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.ref/refs/heads/main"
}
