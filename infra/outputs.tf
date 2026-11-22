# apply のあとに出す値（core-002・core-018）。どれも秘密ではないが、プロジェクトの番号などを含むので文書には写さない。
# GitHub に写す値は、リポジトリの変数（github_repository_variables）と、環境ごとの変数（production・staging の
# github_environment_variables。イメージの置き場所 IMAGE_REPOSITORY も環境ごと）に分けた（README の 5）。

output "github_repository_variables" {
  description = "GitHub のリポジトリの変数（Settings → Secrets and variables → Actions → Variables）に入れる値（両方の環境で共に使う）"
  value = {
    GCP_PROJECT_ID   = var.project_id
    GCP_REGION       = var.region
    GCP_WIF_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    # 夜に緊急で出すとき、デプロイの流れが起こして止め直す Cloud SQL のサーバーの名前（core-019）
    SQL_INSTANCE = google_sql_database_instance.main.name
  }
}

output "production" {
  description = "本番の値（web_url は LINE のミニアプリのエンドポイント URL にも使う。github_environment_variables は GitHub の環境 production の変数に入れる）"
  value = {
    web_url                      = module.production.web_url
    service_urls                 = module.production.service_urls
    migrate_job_name             = module.production.migrate_job_name
    github_environment_variables = module.production.github_environment_variables
  }
}

output "staging" {
  description = "ステージングの値（作らないときは null。github_environment_variables は GitHub の環境 staging の変数に入れる）"
  value = var.staging == null ? null : {
    web_url                      = module.staging[0].web_url
    service_urls                 = module.staging[0].service_urls
    migrate_job_name             = module.staging[0].migrate_job_name
    github_environment_variables = module.staging[0].github_environment_variables
  }
}

output "sql_connection_name" {
  description = "Cloud SQL の接続の名前（PROJECT:REGION:INSTANCE。手で DB を見るときに使う）"
  value       = google_sql_database_instance.main.connection_name
}
