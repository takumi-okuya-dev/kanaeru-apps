# 環境ごとの身分と権限（core-002・core-018。AD-9）。要る役割だけを、できるだけ狭い資源に付ける。
#
# | 身分 | 使う所 | 役割 |
# |---|---|---|
# | <name>-run | この環境の Cloud Run のサービスと migrate の job | この環境の秘密を読む（DB へは内部の IP とパスワードでつなぐので、Cloud SQL の役割は要らない） |
# | <name>-deployer | GitHub Actions（WIF でなりすます。鍵は作らない） | この環境の置き場所にイメージを押し込む・この環境の Cloud Run のサービスと job だけを更新して動かす・<name>-run として動かす |
#
# ステージングのデプロイの身分は、本番の Cloud Run とイメージの置き場所を触れない（サービス・job・置き場所の単位で権限を付ける）。
# なりすませるのは、この環境のブランチ（github_ref）から入った GitHub Actions だけ（リポジトリは WIF のプロバイダの条件で絞る）。

# ---- Cloud Run が動くときの身分（既定の Compute Engine のサービスアカウントは権限が広いので使わない）
resource "google_service_account" "runtime" {
  account_id   = "${var.name}-run"
  display_name = "${var.name} の Cloud Run（サービスと migrate の job）"
}

resource "google_secret_manager_secret_iam_member" "runtime_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_secret_manager_secret_iam_member" "runtime_token_keys" {
  count     = local.shared_secrets_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.token_keys[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_secret_manager_secret_iam_member" "runtime_job_trigger" {
  count     = local.shared_secrets_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.job_trigger[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_secret_manager_secret_iam_member" "runtime_threads_app_secret" {
  count     = local.threads_app_provisioned ? 1 : 0
  secret_id = google_secret_manager_secret.threads_app_secret[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_secret_manager_secret_iam_member" "runtime_notify_allowlist" {
  count     = var.booking_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.notify_allowlist[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

# ---- GitHub Actions がデプロイするときの身分
# Cloud Run は WIF の直の権限（Direct WIF）に対応していないため、Cloud Run を触る身分を1つ置く（specs/core/002-infra/research.md R-2）
resource "google_service_account" "deployer" {
  account_id   = "${var.name}-deployer"
  display_name = "${var.name} のデプロイ（GitHub Actions）"
}

# イメージを押し込める（この環境の置き場所だけ。ほかの環境の置き場所には押し込めない）
resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer.member
}

# Cloud Run を読める（デプロイの途中の操作の進み具合を読むため。書く権限はサービスと job の単位で下に付ける）
resource "google_project_iam_member" "deployer_run_viewer" {
  project = var.project_id
  role    = "roles/run.viewer"
  member  = google_service_account.deployer.member
}

# この環境のサービスだけを更新できる
resource "google_cloud_run_v2_service_iam_member" "deployer_service" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.developer"
  member   = google_service_account.deployer.member
}

# この環境の DB の変更を当てる job だけを更新して動かし、待てる
resource "google_cloud_run_v2_job_iam_member" "deployer_migrate" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.migrate.name
  role     = "roles/run.developer"
  member   = google_service_account.deployer.member
}

# 新しい版を <name>-run の身分で動かせる（この1つのサービスアカウントだけ）
resource "google_service_account_iam_member" "deployer_act_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}

# この環境のブランチから入った GitHub Actions だけが、この環境のデプロイの身分になりすませる
resource "google_service_account_iam_member" "github_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${var.workload_identity_pool_name}/attribute.ref/${var.github_ref}"
}
