# サービスアカウントと権限（core-002。AD-9）。要る役割だけを、できるだけ狭い資源に付ける。
#
# | 身分 | 使う所 | 役割 |
# |---|---|---|
# | kanaeru-run | Cloud Run のサービスと migrate の job | Cloud SQL につなぐ・DB の接続先の秘密を読む |
# | kanaeru-deployer | GitHub Actions（WIF でなりすます。鍵は作らない） | イメージを押し込む・Cloud Run を更新する・kanaeru-run として動かす |
# | kanaeru-db-scheduler | Cloud Scheduler（夜間の停止と朝の起動） | Cloud SQL の台を読む・直す（自前の役割で2つの権限だけ） |

# ---- Cloud Run が動くときの身分（既定の Compute Engine のサービスアカウントは権限が広いので使わない）
resource "google_service_account" "runtime" {
  account_id   = "${local.name}-run"
  display_name = "kanaeru の Cloud Run（サービスと migrate の job）"
  depends_on   = [google_project_service.apis]
}

# Cloud SQL の組み込みの接続に要る（Cloud SQL の役割はプロジェクトの単位でしか付けられない）
resource "google_project_iam_member" "runtime_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = google_service_account.runtime.member
}

# DB の接続先の秘密だけを読める
resource "google_secret_manager_secret_iam_member" "runtime_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

# ---- GitHub Actions がデプロイするときの身分（wif.tf の WIF からだけなりすませる）
# Cloud Run は WIF の直の権限（Direct WIF）に対応していないため、Cloud Run を触る身分を1つ置く（research.md R-2）
resource "google_service_account" "deployer" {
  account_id   = "${local.name}-deployer"
  display_name = "kanaeru のデプロイ（GitHub Actions）"
  depends_on   = [google_project_service.apis]
}

# イメージを押し込める（この置き場所だけ）
resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer.member
}

# Cloud Run のサービスと job を更新し、job を動かして待てる
resource "google_project_iam_member" "deployer_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = google_service_account.deployer.member
}

# 新しい版を kanaeru-run の身分で動かせる（この1つのサービスアカウントだけ）
resource "google_service_account_iam_member" "deployer_act_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}

# ---- 夜間に Cloud SQL を止める・朝に動かす身分
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
}

resource "google_project_iam_member" "db_scheduler_sql_activation" {
  project = var.project_id
  role    = google_project_iam_custom_role.sql_activation.id
  member  = google_service_account.db_scheduler.member
}
