# apply のあとに出す値（core-002）。どれも秘密ではないが、プロジェクトの番号などを含むので文書には写さない。
# GitHub のリポジトリの変数（Variables）に写す値は github_variables にまとめた（README の 5）。

output "web_url" {
  description = "画面の源（設定 WEB_URL）。LINE のミニアプリのエンドポイント URL にもこれを使う（ほかの URL から開くと、書く操作が源の確かめで 403 になる）"
  value       = local.web_url
}

output "service_urls" {
  description = "Cloud Run のサービスの URL（決まった形と、そうでない形の両方）"
  value       = google_cloud_run_v2_service.app.urls
}

output "image_repository" {
  description = "コンテナのイメージの置き場所（GitHub Actions が <この値>:<コミット> を押し込む）"
  value       = local.image_repository
}

output "sql_connection_name" {
  description = "Cloud SQL の接続の名前（PROJECT:REGION:INSTANCE）"
  value       = google_sql_database_instance.main.connection_name
}

output "migrate_job_name" {
  description = "DB の変更を当てる Cloud Run の job"
  value       = google_cloud_run_v2_job.migrate.name
}

output "github_variables" {
  description = "GitHub のリポジトリの変数（Settings → Secrets and variables → Actions → Variables）に入れる値。LIFF_ID は LINE の側の値を入れる"
  value = {
    GCP_PROJECT_ID   = var.project_id
    GCP_REGION       = var.region
    GCP_WIF_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOYER_SA  = google_service_account.deployer.email
    # 画面の題に埋める名前（既定の kanaeru のままなら、変数を入れなくてよい）
    APP_NAME = var.app_name
  }
}
