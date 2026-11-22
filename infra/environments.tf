# 本番とステージング（core-018。構成 B）。どちらも同じ部品（modules/environment）で作り、同じ Cloud SQL のサーバーの中の別の DB を使う。
#
# | 環境 | 名前 | 出る合図 | Cloud Run の台数 × DB の接続 |
# |---|---|---|---|
# | 本番 | kanaeru | main のマージ（ステージングで確かめ、承認のあと） | 2台 × 5本 ＝ 10本 |
# | ステージング | kanaeru-stg | develop のマージ・main のマージ（本番の前） | 1台 × 3本 ＝ 3本 |
#
# DB の接続の合計（13本と、DB の変更を当てる job の分）を、db-f1-micro の上限（25本）に収める。
# 別のプロジェクトに環境を移すとき（構成 C）は、移した先で共通の資源（network.tf・cloud_sql.tf・wif.tf）を作り、
# 同じ部品を呼ぶ（specs/core/018-staging-private-db/research.md R1）。

locals {
  # 環境ごとの部品に渡す、共通の資源
  environment_shared = {
    project_id                  = var.project_id
    project_number              = data.google_project.this.number
    region                      = var.region
    sql_instance_name           = google_sql_database_instance.main.name
    sql_private_ip              = google_sql_database_instance.main.private_ip_address
    vpc_network_id              = google_compute_network.main.id
    vpc_subnetwork_id           = google_compute_subnetwork.run.id
    workload_identity_pool_name = google_iam_workload_identity_pool.github.name
    web_dist_dir                = local.web_dist_dir
    placeholder_service_image   = local.placeholder_service_image
    placeholder_job_image       = local.placeholder_job_image
    sql_activation_role         = google_project_iam_custom_role.sql_activation.id
  }
}

module "production" {
  source = "./modules/environment"

  name          = local.name
  app_env       = "production"
  github_refs   = ["refs/heads/main"]
  max_instances = 2
  db_pool_max   = 5

  project_id                  = local.environment_shared.project_id
  project_number              = local.environment_shared.project_number
  region                      = local.environment_shared.region
  sql_instance_name           = local.environment_shared.sql_instance_name
  sql_private_ip              = local.environment_shared.sql_private_ip
  vpc_network_id              = local.environment_shared.vpc_network_id
  vpc_subnetwork_id           = local.environment_shared.vpc_subnetwork_id
  workload_identity_pool_name = local.environment_shared.workload_identity_pool_name
  web_dist_dir                = local.environment_shared.web_dist_dir
  placeholder_service_image   = local.environment_shared.placeholder_service_image
  placeholder_job_image       = local.environment_shared.placeholder_job_image
  sql_activation_role         = local.environment_shared.sql_activation_role

  deletion_protection       = var.production.deletion_protection
  web_url                   = var.production.web_url
  app_name                  = var.production.app_name
  line_channel_ids          = var.production.line_channel_ids
  organizer_line_user_id    = var.production.organizer_line_user_id
  open_chat_url             = var.production.open_chat_url
  db_password_version       = var.production.db_password_version
  threads_enabled           = var.production.threads_enabled
  threads_token_key_version = var.production.threads_token_key_version
  threads_oauth_enabled     = var.production.threads_oauth_enabled
  threads_app_id            = var.production.threads_app_id
  booking_enabled           = var.production.booking_enabled
  booking_notify_mode       = var.production.booking_notify_mode

  depends_on = [google_project_service.apis]
}

module "staging" {
  source = "./modules/environment"
  count  = var.staging == null ? 0 : 1

  name          = "${local.name}-stg"
  app_env       = "staging"
  github_refs   = ["refs/heads/develop", "refs/heads/main"]
  max_instances = 1
  db_pool_max   = 3

  project_id                  = local.environment_shared.project_id
  project_number              = local.environment_shared.project_number
  region                      = local.environment_shared.region
  sql_instance_name           = local.environment_shared.sql_instance_name
  sql_private_ip              = local.environment_shared.sql_private_ip
  vpc_network_id              = local.environment_shared.vpc_network_id
  vpc_subnetwork_id           = local.environment_shared.vpc_subnetwork_id
  workload_identity_pool_name = local.environment_shared.workload_identity_pool_name
  web_dist_dir                = local.environment_shared.web_dist_dir
  placeholder_service_image   = local.environment_shared.placeholder_service_image
  placeholder_job_image       = local.environment_shared.placeholder_job_image
  sql_activation_role         = local.environment_shared.sql_activation_role

  deletion_protection       = var.staging.deletion_protection
  web_url                   = var.staging.web_url
  app_name                  = var.staging.app_name
  line_channel_ids          = var.staging.line_channel_ids
  organizer_line_user_id    = var.staging.organizer_line_user_id
  open_chat_url             = var.staging.open_chat_url
  db_password_version       = var.staging.db_password_version
  threads_enabled           = var.staging.threads_enabled
  threads_token_key_version = var.staging.threads_token_key_version
  threads_oauth_enabled     = var.staging.threads_oauth_enabled
  threads_app_id            = var.staging.threads_app_id
  booking_enabled           = var.staging.booking_enabled
  booking_notify_mode       = var.staging.booking_notify_mode

  depends_on = [google_project_service.apis]
}
